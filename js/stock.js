// ==========================================================================
// stock.js: the full page you see when you tap a stock.
// Header with the live price, a big chart, then eight tabs. Each tab lives
// in its own file in js/tabs/. This file loads the data, works out the
// ratings, runs the AI when you ask, and switches between tabs.
// ==========================================================================

import * as api from './api.js';
import * as f from './format.js';
import { technicalSummary, riskStats, seasonality } from './indicators.js';
import { PriceChart } from './charts.js';
import { appScore, analystConsensus, piotroski, altmanZ, median } from './ratings.js';
import { dcf, dcfInputs, impliedGrowth } from './valuation.js';
import { findEngines, savedResearch, runResearch } from './ai.js';
import { scenarios, priceLevels, loadChecks, saveChecks } from './research.js';
import { dotsHTML, esc, pick } from './ui.js';
import { CONVICTION_WORDS } from './journal.js';
import { overviewTab } from './tabs/overview.js';
import { researchTab } from './tabs/research.js';
import { ratingsTab } from './tabs/ratings.js';
import { technicalsTab } from './tabs/technicals.js';
import { financialsTab } from './tabs/financials.js';
import { valuationTab, dcfResultHTML } from './tabs/valuation.js';
import { earningsTab } from './tabs/earnings.js';
import { investorsTab } from './tabs/investors.js';
import { newsTab } from './tabs/news.js';

const TABS = [
  ['overview', 'Overview', overviewTab],
  ['research', 'Research', researchTab],
  ['ratings', 'Ratings', ratingsTab],
  ['technicals', 'Technicals', technicalsTab],
  ['financials', 'Financials', financialsTab],
  ['valuation', 'Valuation', valuationTab],
  ['earnings', 'Earnings', earningsTab],
  ['investors', 'Investors', investorsTab],
  ['news', 'News', newsTab],
];
const RANGES = ['1D', '1W', '1M', '6M', 'YTD', '1Y', '5Y', 'Max'];
const RANGE_WORDS = { '1D': 'today', '1W': 'past week', '1M': 'past month', '6M': 'past 6 months', YTD: 'this year', '1Y': 'past year', '5Y': 'past 5 years', Max: 'all time' };
// The data the ratings wait for before they're final
const CORE = ['quote', 'daily', 'fundamentals', 'financials', 'news', 'peers', 'bench'];

let view = null; // everything about the page that's open right now

// ---------------------------------------------------------------------------
// Opening and closing
// ---------------------------------------------------------------------------

export function openStockPage(root, idea, { onEdit, onBack, onRated }) {
  closeStockPage();
  const saved = savedResearch(idea.ticker);
  view = {
    root, idea, onEdit, onBack, onRated,
    tab: 'overview',
    range: '1D',
    mode: 'area',
    overlays: { volume: true, sma50: false, sma200: false, bollinger: false },
    fin: { statement: 'income', basis: 'annual' },
    dcf: null,
    data: {},
    derived: {},
    ai: { state: saved ? 'done' : 'idle', entry: saved, error: null, engines: null, progress: '' },
    checks: loadChecks(idea.ticker),
    chart: null,
    timer: null,
  };
  root.innerHTML = shellHTML(idea);
  renderTabs();
  renderRanges();
  renderPanel();
  wire(root);
  if (window.LightweightCharts) {
    view.chart = new PriceChart(root.querySelector('#price-chart'), { onHover: showHover });
  }
  loadEverything();
  view.timer = setInterval(refreshQuote, 30_000);

  const v = view;
  findEngines().then((engines) => {
    if (view !== v) return;
    v.ai.engines = engines;
    if (!engines.length && v.ai.state === 'idle') v.ai.state = 'unavailable';
    renderPanel();
  });
}

export function closeStockPage() {
  if (!view) return;
  clearInterval(view.timer);
  view.aiControl?.abort();
  view.chart?.destroy();
  view.observer?.disconnect();
  view = null;
}

// Called after you edit the idea, so the page shows your new thesis/target
export function refreshIdea(idea) {
  if (!view || view.idea.id !== idea.id) return;
  view.idea = idea;
  view.root.querySelector('.st-ticker').textContent = idea.ticker;
  view.root.querySelector('#st-dots').outerHTML = dotsHTML(idea.conviction, 'st-dots');
  renderPanel();
}

// ---------------------------------------------------------------------------
// Loading data (each piece fills in the page as soon as it arrives)
// ---------------------------------------------------------------------------

function loadEverything() {
  const v = view;
  const symbol = v.idea.ticker;
  const done = (key, after) => (result) => {
    if (view !== v) return; // you already left this page
    v.data[key] = result;
    derive();
    after?.(result);
    renderNotice();
    renderPanel();
    if (!anyLoading()) reportRatings();
  };
  v.loaded = Promise.allSettled([
    api.getQuote(symbol).then(done('quote', renderHeader)),
    api.getDaily(symbol).then(done('daily', renderChart)),
    api.getIntraday(symbol).then(done('intraday', renderChart)),
    api.getFundamentals(symbol).then(done('fundamentals')),
    api.getFinancials(symbol).then(done('financials')),
    api.getNews(symbol).then(done('news')),
    api.getPeers(symbol).then(done('peers')),
    api.getBenchmark().then(done('bench')),
  ]);
}

async function refreshQuote() {
  if (!view || document.visibilityState !== 'visible' || view.data.quote?.status !== 'live') return;
  const v = view;
  const result = await api.getQuote(v.idea.ticker, { fresh: true });
  if (view !== v || result.status !== 'live') return;
  const before = v.data.quote.data.price;
  v.data.quote = result;
  renderHeader();
  const priceEl = v.root.querySelector('#st-price');
  if (result.data.price !== before) {
    priceEl.classList.remove('tick-up', 'tick-down');
    void priceEl.offsetWidth; // restart the flash animation
    priceEl.classList.add(result.data.price > before ? 'tick-up' : 'tick-down');
  }
}

const ok = (key) => {
  const r = view.data[key];
  return r && (r.status === 'live' || r.status === 'demo') ? r.data : null;
};
const failed = (key) => {
  const r = view.data[key];
  if (r?.status === 'error') return r.message;
  if (r?.status === 'locked') return 'Enter the passcode at the top of the page to see this.';
  return null;
};
const anyLoading = () => CORE.some((key) => !view.data[key]);

// Work out everything calculated from the raw data: technicals, risk,
// valuation inputs and the app score
function derive() {
  const d = view.derived;
  const daily = ok('daily')?.candles;
  const bench = ok('bench')?.candles;
  if (daily !== d.dailyRef || bench !== d.benchRef) {
    d.dailyRef = daily;
    d.benchRef = bench;
    d.tech = daily ? technicalSummary(daily) : null;
    d.risk = daily ? riskStats(daily, bench) : null;
    d.season = daily ? seasonality(daily) : null;
  }
  const fund = ok('fundamentals');
  const fin = ok('financials');
  const quote = ok('quote');
  d.consensus = analystConsensus(fund?.recommendations);
  d.val = fin ? dcfInputs({ financials: fin, metrics: fund?.metrics, quote }) : null;
  // Slider starting points follow the data until you move a slider yourself
  if (d.val && !view.dcfTouched) view.dcf = { growth: d.val.growth, discount: d.val.discount, terminal: d.val.terminal };
  d.dcfDefault = d.val ? dcf(d.val) : null;
  d.scenarios = scenarios({
    val: d.val,
    quote,
    metrics: fund?.metrics,
    peers: ok('peers')?.peers ?? [],
    peHistory: (fund?.metricSeries?.annual?.pe ?? []).map((p) => p?.v).filter((v) => v > 0),
  });
  d.levels = priceLevels({ quote, tech: d.tech, dcfValue: d.dcfDefault?.perShare });
  d.score = appScore({
    quote,
    metrics: fund?.metrics,
    financials: fin,
    tech: d.tech,
    risk: d.risk,
    earnings: fund?.earnings,
    recs: fund?.recommendations,
    insiders: view.data.fundamentals?.status === 'live' ? fund?.insiders : null,
    peers: ok('peers')?.peers ?? [],
    valuation: d.val ? { ...d.val, dcf: d.dcfDefault } : null,
  });
}

// What each tab gets to draw with
function ctx() {
  const d = view.derived;
  return {
    idea: view.idea,
    view,
    q: ok('quote'),
    fund: ok('fundamentals'),
    fin: ok('financials'),
    news: ok('news'),
    peers: ok('peers')?.peers ?? null,
    status: (key) => view.data[key]?.status,
    isLoading: (key) => !view.data[key],
    error: failed,
    anyLoading,
    tech: d.tech,
    risk: d.risk,
    season: d.season,
    consensus: d.consensus,
    val: d.val,
    dcfDefault: d.dcfDefault,
    scenarios: d.scenarios,
    levels: d.levels,
    score: d.score,
    ai: view.ai,
    checks: view.checks,
  };
}

// Save the three ratings on the idea, so the watchlist card can show them
function reportRatings() {
  const d = view.derived;
  const demo = Object.values(view.data).some((r) => r?.status === 'demo');
  view.onRated?.(view.idea.id, {
    wallStreet: d.consensus?.label ?? null,
    app: d.score?.overall != null ? { label: d.score.label, grade: d.score.grade, score: d.score.overall } : null,
    ai: view.ai.state === 'done' ? view.ai.entry.result.rating : null,
    demo,
    at: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// The AI analyst
// ---------------------------------------------------------------------------

async function runAI() {
  const v = view;
  if (!v || v.ai.state === 'running') return;
  v.ai.state = 'running';
  v.ai.error = null;
  v.ai.progress = anyLoading() ? 'Waiting for all the data to load…' : 'Reading every tab of data. This can take up to a minute.';
  v.aiControl = new AbortController();
  renderPanel();
  try {
    await v.loaded;
    if (view !== v) return;
    v.ai.progress = 'Reading every tab of data. This can take up to a minute.';
    updateAiProgress();
    const entry = await runResearch(v.idea.ticker, researchBundle(ctx()), {
      signal: v.aiControl.signal,
      onProgress: (chars) => {
        if (view !== v) return;
        v.ai.progress = `Writing the research note… ${chars.toLocaleString()} characters`;
        updateAiProgress();
      },
    });
    if (view !== v) return;
    v.ai.state = 'done';
    v.ai.entry = entry;
    reportRatings();
  } catch (err) {
    if (view !== v) return;
    if (err.code === 'cancelled' || err.name === 'AbortError') v.ai.state = v.ai.entry ? 'done' : 'idle';
    else if (err.code === 'no_engine') v.ai.state = 'unavailable';
    else { v.ai.state = 'error'; v.ai.error = err.message; }
  }
  renderPanel();
}

function updateAiProgress() {
  view?.root.querySelectorAll('[data-ai-progress]').forEach((el) => (el.textContent = view.ai.progress));
}

// Everything the AI reads, kept compact (numbers rounded to 4 digits)
function researchBundle(c) {
  const r = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(4)));
  const m = c.fund?.metrics ?? {};
  const a = c.fin?.annual;
  const q = c.fin?.quarterly;
  const t = c.tech;
  const last = (arr, n = 5) => arr?.slice(-n).map(r);
  const recs = c.fund?.recommendations ?? [];
  const older = recs.length >= 3 ? analystConsensus(recs.slice(0, recs.length - 2)) : null;
  const trades = view.data.fundamentals?.status === 'live' ? c.fund?.insiders ?? [] : null;
  const fscore = piotroski(a);
  const z = altmanZ(a, c.q?.marketCap);
  const implied = c.val && c.q?.price ? impliedGrowth(c.q.price, c.val) : null;
  const perf = (label) => r(t?.performance.find((p) => p.label === label)?.value);
  const value = (list) => list.reduce((s, x) => s + Math.abs(x.change) * (x.transactionPrice || 0), 0);

  return {
    dataMode: Object.values(view.data).some((x) => x?.status === 'demo') ? 'demo' : 'live',
    ticker: c.idea.ticker,
    company: c.q?.name || c.idea.company || null,
    industry: c.q?.industry ?? null,
    asOf: new Date().toISOString().slice(0, 10),
    price: { price: r(c.q?.price), changeTodayPct: r(c.q?.changePct), marketCap: r(c.q?.marketCap), high52w: r(pick(m, '52WeekHigh')), low52w: r(pick(m, '52WeekLow')) },
    keyStats: {
      peTTM: r(pick(m, 'peTTM', 'peExclExtraTTM')), psTTM: r(pick(m, 'psTTM')), pb: r(pick(m, 'pbQuarterly', 'pbAnnual')),
      epsTTM: r(pick(m, 'epsTTM')), grossMarginPct: r(pick(m, 'grossMarginTTM')), operatingMarginPct: r(pick(m, 'operatingMarginTTM')),
      netMarginPct: r(pick(m, 'netProfitMarginTTM')), roePct: r(pick(m, 'roeTTM')), revenueGrowthYoYPct: r(pick(m, 'revenueGrowthTTMYoy')),
      epsGrowthYoYPct: r(pick(m, 'epsGrowthTTMYoy')), revenueGrowth5yPct: r(pick(m, 'revenueGrowth5Y')),
      debtToEquity: r(pick(m, 'totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual')), currentRatio: r(pick(m, 'currentRatioQuarterly', 'currentRatioAnnual')),
      beta: r(pick(m, 'beta')), dividendYieldPct: r(pick(m, 'dividendYieldIndicatedAnnual')),
    },
    technicals: t ? {
      trend: t.trend.label, rsi14: r(t.rsi.value), rsiState: t.rsi.state, macd: t.macd.state,
      vs50DayAvgPct: r(t.averages[1].distance), vs200DayAvgPct: r(t.averages[2].distance),
      cross: t.cross ? `${t.cross.kind} cross ${t.cross.daysAgo} days ago` : null,
      returnsPct: { '1M': perf('1M'), '6M': perf('6M'), '1Y': perf('1Y'), '3Y': perf('3Y') },
      volatility30dPct: r(t.volatility30), fromHigh52wPct: r(t.range52.fromHigh),
    } : null,
    risk: c.risk ? { beta1y: r(c.risk.beta), sharpe1y: r(c.risk.sharpe), maxDrawdown5yPct: r(c.risk.maxDrawdown.value), return1yPct: r(c.risk.return1y), sp500Return1yPct: r(c.risk.benchReturn1y) } : null,
    annualFinancials: a?.periods.length ? {
      years: a.periods.slice(-5).map((p) => p.label),
      revenue: last(a.rows.revenue), netIncome: last(a.rows.netIncome), freeCashFlow: last(a.rows.freeCashFlow),
      operatingMarginPct: last(a.ratios.operatingMargin), roicPct: last(a.ratios.roic),
      cash: last(a.rows.cash), longTermDebt: last(a.rows.longTermDebt),
    } : null,
    latestQuarter: q?.periods.length ? { period: q.periods.at(-1).label, revenueYoYPct: r(q.growth.revenue.at(-1)), epsYoYPct: r(q.growth.eps.at(-1)) } : null,
    health: { piotroskiFScore: fscore ? `${fscore.score} of ${fscore.known}` : null, altmanZ: z ? `${z.z.toFixed(2)} (${z.zone})` : null },
    valuation: {
      dcfValuePerShare: r(c.dcfDefault?.perShare),
      dcfAssumptions: c.val ? `${c.val.growth}% growth for 5 years fading to 2.5%, 9% discount rate` : null,
      priceImpliesGrowthPct: implied && !implied.bound ? r(implied.value) : null,
      fcfYieldPct: c.val?.fcf != null && c.q?.marketCap ? r((c.val.fcf / c.q.marketCap) * 100) : null,
      peerMedianPE: r(median((c.peers ?? []).map((p) => (p.pe > 0 ? p.pe : null)))),
      peerMedianPS: r(median((c.peers ?? []).map((p) => p.ps))),
    },
    earnings: {
      lastFour: (c.fund?.earnings ?? []).slice(-4).map((e) => ({ period: e.period, actual: e.actual, estimate: e.estimate, surprisePct: r(e.surprisePercent) })),
      next: c.fund?.nextEarnings?.date ?? null,
    },
    analysts: recs.length ? {
      consensus: c.consensus?.label ?? null,
      latest: recs.at(-1),
      buySharePct: r(c.consensus?.buyShare),
      buySharePct2MonthsEarlier: r(older?.buyShare),
    } : null,
    insiders12m: trades ? {
      openMarketBuys: trades.filter((x) => x.transactionCode === 'P').length,
      openMarketSells: trades.filter((x) => x.transactionCode === 'S').length,
      valueBought: r(value(trades.filter((x) => x.transactionCode === 'P'))),
      valueSold: r(value(trades.filter((x) => x.transactionCode === 'S'))),
    } : 'not available',
    headlines: (c.news?.news ?? []).slice(0, 12).map((n) => ({ date: new Date(n.time).toISOString().slice(0, 10), source: n.source, headline: n.headline })),
    appScore: c.score?.overall != null ? {
      overall: c.score.overall,
      label: c.score.label,
      // Each factor with the measurements behind it and how each scored (0-100)
      factors: c.score.factors.map((x) => ({
        factor: x.name, grade: x.grade, score: x.score,
        inputs: x.inputs.map((i) => `${i.label}: ${i.value} (scored ${i.score})`),
      })),
    } : null,
    scenarios: c.scenarios ? {
      method: c.scenarios.method,
      cases: c.scenarios.cases.map((s) => ({ case: s.key, value: r(s.value), vsPricePct: r(s.changePct), assumptions: s.assumptions })),
    } : null,
    priceLevels: c.levels.map((l) => ({ level: l.label, price: r(l.price), vsPricePct: r(l.distancePct) })),
    investorThesis: {
      thesis: c.idea.thesis || null, bullCase: c.idea.bull || null, bearCase: c.idea.bear || null,
      targetPrice: c.idea.target, entryPrice: c.idea.entry, conviction: CONVICTION_WORDS[c.idea.conviction - 1],
    },
  };
}

// ---------------------------------------------------------------------------
// The top of the page
// ---------------------------------------------------------------------------

function shellHTML(idea) {
  return `
    <nav class="stock-nav" id="stock-nav">
      <button type="button" class="back-btn" data-action="back">
        <svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8"/></svg>Watchlist
      </button>
      <span class="nav-title">${esc(idea.ticker)}</span>
      <button type="button" class="text-btn" data-action="edit">Edit</button>
    </nav>

    <header class="quote-head" style="view-transition-name:${idea.id}">
      <div class="qh-row">
        <h1 class="st-ticker">${esc(idea.ticker)}</h1>
        ${dotsHTML(idea.conviction, 'st-dots')}
      </div>
      <p class="st-name" id="st-name">${esc(idea.company || '')}</p>
      <div class="st-price-row">
        <span class="st-price" id="st-price"><span class="skeleton-text">$000.00</span></span>
        <span class="st-change" id="st-change"></span>
      </div>
      <p class="st-sub" id="st-sub">Loading price…</p>
    </header>

    <div class="notice" id="notice" hidden></div>

    <section class="chart-card">
      <div class="range-tabs" id="ranges" role="tablist" aria-label="Chart range"></div>
      <div class="price-chart" id="price-chart"><p class="chart-msg" id="chart-msg">Loading chart…</p></div>
      <div class="chart-tools">
        <div class="segmented tiny" id="chart-mode" style="--n:2; --i:0" role="radiogroup" aria-label="Chart style">
          <span class="seg-thumb" aria-hidden="true"></span>
          <button type="button" data-mode="area" aria-checked="true" role="radio">Line</button>
          <button type="button" data-mode="candles" aria-checked="false" role="radio">Candles</button>
        </div>
        <div class="chips" id="overlays">
          <button type="button" class="chip on" data-overlay="volume">Volume</button>
          <button type="button" class="chip" data-overlay="sma50"><i class="swatch orange"></i>50-day</button>
          <button type="button" class="chip" data-overlay="sma200"><i class="swatch purple"></i>200-day</button>
          <button type="button" class="chip" data-overlay="bollinger"><i class="swatch gray"></i>Bands</button>
        </div>
      </div>
    </section>

    <nav class="tabs" id="tabs" role="tablist" aria-label="Sections"></nav>
    <div class="panel" id="panel" role="tabpanel"></div>

    <p class="credits">
      Prices from Twelve Data · Company data from Finnhub · Filings from SEC EDGAR ·
      Charts by <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a>
    </p>`;
}

function renderHeader() {
  const q = ok('quote');
  const root = view.root;
  if (!q) {
    if (failed('quote')) {
      root.querySelector('#st-price').textContent = f.DASH;
      root.querySelector('#st-sub').textContent = failed('quote');
    }
    return;
  }
  const name = [q.name || view.idea.company, q.industry, q.exchange].filter(Boolean);
  root.querySelector('#st-name').textContent = name.join(' · ');
  showHover(null);
}

// Shows the current price, or the price under your finger while you scrub the chart
function showHover(point) {
  if (!view) return;
  const q = ok('quote');
  const priceEl = view.root.querySelector('#st-price');
  const changeEl = view.root.querySelector('#st-change');
  const subEl = view.root.querySelector('#st-sub');
  if (!q) return;

  const candles = candlesFor(view.range);
  const base = view.range === '1D' ? q.prevClose : candles[0]?.c;

  if (point) {
    const change = base ? ((point.price - base) / base) * 100 : null;
    priceEl.textContent = f.price(point.price);
    changeEl.className = `st-change ${f.tone(change)}`;
    changeEl.textContent = f.pct(change, { digits: 2 });
    subEl.textContent = view.chart?.formatTime(point.time) ?? '';
    return;
  }

  priceEl.textContent = f.price(q.price);
  if (view.range === '1D' || !candles.length) {
    changeEl.className = `st-change ${f.tone(q.change)}`;
    changeEl.textContent = `${q.change >= 0 ? '+' : '−'}${Math.abs(q.change).toFixed(2)} (${f.pct(q.changePct, { digits: 2 })})`;
  } else {
    const change = ((q.price - base) / base) * 100;
    changeEl.className = `st-change ${f.tone(change)}`;
    changeEl.textContent = `${f.pct(change, { digits: 2 })} ${RANGE_WORDS[view.range]}`;
  }
  const demo = view.data.quote.status === 'demo';
  subEl.textContent = demo ? 'Demo price' : `As of ${sameDay(q.time) ? f.time(q.time) : f.dateLong(q.time)}`;
}

// The banner under the price: demo numbers, or the passcode box
function renderNotice() {
  const notice = view.root.querySelector('#notice');
  const results = Object.values(view.data);
  if (results.some((r) => r?.status === 'locked')) {
    notice.hidden = false;
    notice.className = 'notice lock';
    if (!notice.querySelector('form')) {
      notice.innerHTML = `
        <form class="lock-form" data-form="passcode">
          <label for="passcode-input"><strong>This app is locked.</strong> Enter your passcode to load data.</label>
          <div class="lock-row"><input id="passcode-input" type="password" autocomplete="current-password" placeholder="Passcode">
          <button type="submit" class="btn-primary">Unlock</button></div>
        </form>`;
    }
    return;
  }
  const demoParts = results.filter((r) => r?.status === 'demo');
  notice.hidden = demoParts.length === 0;
  notice.className = 'notice demo';
  if (demoParts.length) {
    const offline = demoParts.some((r) => r.reason === 'offline');
    notice.innerHTML = `<strong>Demo numbers.</strong> ${offline
      ? 'This preview has no live data connection. Real prices, financials and news turn on once the app is set up on Vercel.'
      : `Some keys aren't set up yet (${[...new Set(demoParts.map((r) => r.service).filter(Boolean))].join(', ')}), so those parts are made up.`}`;
  }
}

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

function candlesFor(range) {
  const daily = ok('daily')?.candles ?? [];
  const intraday = ok('intraday')?.candles ?? [];
  if (range === '1D' || range === '1W') {
    if (!intraday.length) return range === '1W' ? daily.slice(-5) : [];
    if (range === '1W') return intraday;
    const lastDay = nyDate(intraday.at(-1).t);
    return intraday.filter((b) => nyDate(b.t) === lastDay);
  }
  if (range === 'YTD') {
    const year = new Date(daily.at(-1)?.t * 1000).getUTCFullYear();
    return daily.filter((b) => new Date(b.t * 1000).getUTCFullYear() === year);
  }
  const count = { '1M': 22, '6M': 126, '1Y': 252, '5Y': 1260 }[range];
  return count ? daily.slice(-count) : daily;
}

function renderChart() {
  if (!view) return;
  const msg = view.root.querySelector('#chart-msg');
  const intraday = view.range === '1D' || (view.range === '1W' && ok('intraday'));
  const key = intraday ? 'intraday' : 'daily';

  if (!view.chart) {
    msg.hidden = false;
    msg.textContent = "The chart library didn't load. Check your connection and reopen this stock.";
    return;
  }
  if (!view.data[key]) {
    msg.hidden = false;
    msg.textContent = 'Loading chart…';
    return;
  }
  const candles = candlesFor(view.range);
  if (!candles.length) {
    msg.hidden = false;
    msg.textContent = failed(key) || 'No prices for this range yet.';
    return;
  }
  msg.hidden = true;
  view.chart.show({
    candles,
    history: intraday ? candles : ok('daily').candles,
    intraday,
    mode: view.mode,
    overlays: view.overlays,
    prevClose: view.range === '1D' ? ok('quote')?.prevClose ?? null : null,
  });
  showHover(null);
}

function renderRanges() {
  view.root.querySelector('#ranges').innerHTML = RANGES
    .map((r) => `<button type="button" role="tab" data-range="${r}" aria-selected="${r === view.range}">${r}</button>`)
    .join('');
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function renderTabs() {
  view.root.querySelector('#tabs').innerHTML = TABS
    .map(([key, label]) => `<button type="button" role="tab" data-tab="${key}" aria-selected="${key === view.tab}">${label}</button>`)
    .join('');
}

function renderPanel() {
  if (!view) return;
  const panel = view.root.querySelector('#panel');
  // On the same tab, keep what you had open or scrolled while data arrives
  const sameTab = view.renderedTab === view.tab;
  const scrollers = sameTab ? [...panel.querySelectorAll('.table-wrap')].map((el) => el.scrollLeft) : [];
  const open = sameTab ? [...panel.querySelectorAll('details')].map((el) => el.open) : [];
  const focusedSlider = document.activeElement?.dataset?.dcf;
  panel.innerHTML = TABS.find(([key]) => key === view.tab)[2](ctx());
  view.renderedTab = view.tab;
  // Statement tables start scrolled to the newest period (on the right)
  panel.querySelectorAll('.table-wrap').forEach((el, i) => {
    el.scrollLeft = scrollers[i] ?? (el.classList.contains('from-left') ? 0 : el.scrollWidth);
  });
  panel.querySelectorAll('details').forEach((el, i) => (el.open = open[i] ?? false));
  if (focusedSlider) panel.querySelector(`[data-dcf="${focusedSlider}"]`)?.focus({ preventScroll: true });
  updateAiProgress();
}

// ---------------------------------------------------------------------------
// Taps, clicks and sliders
// ---------------------------------------------------------------------------

function wire(root) {
  root.addEventListener('click', (event) => {
    const el = event.target.closest('button, [data-goto]');
    if (!el || !view) return;
    const action = el.dataset.action;

    if (action === 'back') return view.onBack();
    if (action === 'edit') return view.onEdit(view.idea);
    if (action === 'run-ai') return runAI();
    if (action === 'stop-ai') return view.aiControl?.abort();
    if (action === 'dcf-reset') {
      const val = view.derived.val;
      if (val) view.dcf = { growth: val.growth, discount: val.discount, terminal: val.terminal };
      view.dcfTouched = false;
      return renderPanel();
    }

    if (el.dataset.range) {
      view.range = el.dataset.range;
      renderRanges();
      renderChart();
      return;
    }
    if (el.dataset.mode) {
      view.mode = el.dataset.mode;
      const control = root.querySelector('#chart-mode');
      control.style.setProperty('--i', view.mode === 'area' ? 0 : 1);
      control.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === view.mode)));
      renderChart();
      return;
    }
    if (el.dataset.overlay) {
      const key = el.dataset.overlay;
      view.overlays[key] = !view.overlays[key];
      el.classList.toggle('on', view.overlays[key]);
      // Averages need daily bars, so switch away from the 1-day and 1-week views
      if (key !== 'volume' && view.overlays[key] && (view.range === '1D' || view.range === '1W')) {
        view.range = '1Y';
        renderRanges();
      }
      renderChart();
      return;
    }
    const tab = el.dataset.tab || el.dataset.goto;
    if (tab) {
      view.tab = tab;
      renderTabs();
      renderPanel();
      const panel = root.querySelector('#panel');
      panel.classList.remove('enter');
      void panel.offsetWidth;
      panel.classList.add('enter');
      const tabs = root.querySelector('#tabs');
      if (tabs.getBoundingClientRect().top < 0 || el.dataset.goto) {
        tabs.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      const tabButton = root.querySelector(`[data-tab="${tab}"]`);
      if (tabButton) tabs.scrollTo({ left: tabButton.offsetLeft - tabs.clientWidth / 2 + tabButton.clientWidth / 2, behavior: 'smooth' });
      return;
    }
    const control = el.closest('[data-control]');
    if (control && el.dataset.value) {
      view.fin[control.dataset.control] = el.dataset.value;
      renderPanel();
    }
  });

  // Ticking an item on the "before you buy" checklist
  root.addEventListener('change', (event) => {
    const item = event.target.dataset?.check;
    if (item == null || !view) return;
    if (event.target.checked) view.checks.add(item); else view.checks.delete(item);
    saveChecks(view.idea.ticker, view.checks);
    const done = view.root.querySelector('#checks-done');
    if (done) done.textContent = checksDoneText();
  });

  // Dragging a DCF slider updates the answer live
  root.addEventListener('input', (event) => {
    const key = event.target.dataset?.dcf;
    if (!key || !view?.dcf) return;
    view.dcf[key] = Number(event.target.value);
    view.dcfTouched = true;
    root.querySelector(`#dcf-${key}-out`).textContent = `${event.target.value}%`;
    root.querySelector('#dcf-out').innerHTML = dcfResultHTML(ctx());
  });

  // Passcode box
  root.addEventListener('submit', (event) => {
    if (event.target.dataset.form !== 'passcode') return;
    event.preventDefault();
    const code = root.querySelector('#passcode-input').value.trim();
    if (!code) return;
    api.savePasscode(code);
    view.data = {};
    view.derived = {};
    root.querySelector('#notice').innerHTML = '';
    loadEverything();
  });

  // Show the ticker in the top bar once the big header scrolls away
  view.observer = new IntersectionObserver(
    ([entry]) => root.querySelector('#stock-nav').classList.toggle('scrolled', !entry.isIntersecting),
    { rootMargin: '-52px 0px 0px 0px' },
  );
  view.observer.observe(root.querySelector('.st-ticker'));
}

function checksDoneText() {
  const items = view.ai.entry?.result.beforeYouBuy ?? [];
  const done = items.filter((x) => view.checks.has(x)).length;
  return `${done} of ${items.length} done`;
}

function nyDate(t) {
  return new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function sameDay(t) {
  return new Date(t).toDateString() === new Date().toDateString();
}
