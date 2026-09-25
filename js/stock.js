// ==========================================================================
// stock.js: the full page you see when you tap a stock.
// Header with the live price, a big chart, then six tabs:
// Overview · Technicals · Financials · Earnings · Investors · News
//
// Each piece of data loads on its own, so the page fills in as it arrives.
// ==========================================================================

import * as api from './api.js';
import * as f from './format.js';
import { technicalSummary } from './indicators.js';
import { PriceChart, barChart, lineChart, stackedBars, dotPlot, rangeBar } from './charts.js';
import { CONVICTION_WORDS } from './journal.js';

const TABS = [
  ['overview', 'Overview'],
  ['technicals', 'Technicals'],
  ['financials', 'Financials'],
  ['earnings', 'Earnings'],
  ['investors', 'Investors'],
  ['news', 'News'],
];
const RANGES = ['1D', '1W', '1M', '6M', 'YTD', '1Y', '5Y', 'Max'];
const RANGE_WORDS = { '1D': 'today', '1W': 'past week', '1M': 'past month', '6M': 'past 6 months', YTD: 'this year', '1Y': 'past year', '5Y': 'past 5 years', Max: 'all time' };

let view = null; // everything about the page that's open right now

// ---------------------------------------------------------------------------
// Opening and closing
// ---------------------------------------------------------------------------

export function openStockPage(root, idea, { onEdit, onBack }) {
  closeStockPage();
  view = {
    root, idea, onEdit, onBack,
    tab: 'overview',
    range: '1D',
    mode: 'area',
    overlays: { volume: true, sma50: false, sma200: false, bollinger: false },
    fin: { statement: 'income', basis: 'annual' },
    data: {},
    tech: null,
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
}

export function closeStockPage() {
  if (!view) return;
  clearInterval(view.timer);
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
  if (view.tab === 'overview') renderPanel();
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
    after?.(result);
    renderDemoNote();
    renderPanel();
  };

  api.getQuote(symbol).then(done('quote', renderHeader));
  api.getDaily(symbol).then(done('daily', (r) => {
    v.tech = r.status === 'error' ? null : technicalSummary(r.data.candles);
    renderChart();
  }));
  api.getIntraday(symbol).then(done('intraday', renderChart));
  api.getFundamentals(symbol).then(done('fundamentals'));
  api.getFinancials(symbol).then(done('financials'));
  api.getNews(symbol).then(done('news'));
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

const ok = (key) => view.data[key] && view.data[key].status !== 'error' ? view.data[key].data : null;
const failed = (key) => view.data[key]?.status === 'error' ? view.data[key].message : null;
const loading = (key) => !view.data[key];

// ---------------------------------------------------------------------------
// The top of the page
// ---------------------------------------------------------------------------

function shellHTML(idea) {
  return `
    <nav class="stock-nav" id="stock-nav">
      <button type="button" class="back-btn" data-action="back">
        <svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8"/></svg>Watchlist
      </button>
      <span class="nav-title">${f.esc(idea.ticker)}</span>
      <button type="button" class="text-btn" data-action="edit">Edit</button>
    </nav>

    <header class="quote-head" style="view-transition-name:${idea.id}">
      <div class="qh-row">
        <h1 class="st-ticker">${f.esc(idea.ticker)}</h1>
        ${dotsHTML(idea.conviction, 'st-dots')}
      </div>
      <p class="st-name" id="st-name">${f.esc(idea.company || '')}</p>
      <div class="st-price-row">
        <span class="st-price" id="st-price"><span class="skeleton-text">$000.00</span></span>
        <span class="st-change" id="st-change"></span>
      </div>
      <p class="st-sub" id="st-sub">Loading price…</p>
    </header>

    <p class="demo-note" id="demo-note" hidden></p>

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

function renderDemoNote() {
  const note = view.root.querySelector('#demo-note');
  const demoParts = Object.values(view.data).filter((r) => r?.status === 'demo');
  note.hidden = demoParts.length === 0;
  if (demoParts.length) {
    const offline = demoParts.some((r) => r.reason === 'offline');
    note.innerHTML = `<strong>Demo numbers.</strong> ${offline
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
  if (loading(key)) {
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
  const scrollers = [...panel.querySelectorAll('.table-wrap')].map((el) => el.scrollLeft);
  panel.innerHTML = {
    overview: overviewHTML,
    technicals: technicalsHTML,
    financials: financialsHTML,
    earnings: earningsHTML,
    investors: investorsHTML,
    news: newsHTML,
  }[view.tab]();
  // Tables start scrolled to the newest period (on the right)
  panel.querySelectorAll('.table-wrap').forEach((el, i) => (el.scrollLeft = scrollers[i] ?? el.scrollWidth));
}

// ----- Overview -----

function overviewHTML() {
  const q = ok('quote');
  const fund = ok('fundamentals');
  const m = fund?.metrics ?? {};
  const t = view.tech;
  const idea = view.idea;

  // Snapshot tiles that jump to other tabs
  const consensus = fund ? analystConsensus(fund.recommendations) : null;
  const next = fund?.nextEarnings;
  const revGrowth = pick(m, 'revenueGrowthTTMYoy', 'revenueGrowthQuarterlyYoy');
  const tiles = `
    <div class="tiles">
      ${tile('Trend', t ? t.trend.label : loadingText('daily'), t?.trend.tone, 'technicals')}
      ${tile('Analysts', consensus ? consensus.label : fund ? f.DASH : loadingText('fundamentals'), consensus?.tone, 'investors')}
      ${tile('Next earnings', next ? f.dateShort(next.date + 'T12:00:00Z') : fund ? f.DASH : loadingText('fundamentals'), '', 'earnings')}
      ${tile('Revenue growth', fund ? f.pct(revGrowth) : loadingText('fundamentals'), f.tone(revGrowth), 'financials')}
    </div>`;

  // Your thesis, with progress toward your target
  const price = q?.price;
  let progress = '';
  if (idea.target != null && price) {
    const upside = ((idea.target - price) / price) * 100;
    const from = idea.entry ?? Math.min(price, idea.target) * 0.9;
    const pos = Math.max(0, Math.min(100, ((price - from) / (idea.target - from)) * 100));
    progress = `
      <div class="target">
        <div class="target-row">
          <span>Target <strong>${f.price(idea.target)}</strong></span>
          <span class="${f.tone(upside)}">${upside >= 0 ? `${f.pct(upside, { sign: false })} to go` : `${f.pct(-upside, { sign: false })} past target`}</span>
        </div>
        <div class="target-track"><span style="width:${upside <= 0 ? 100 : pos}%"></span></div>
        <div class="target-row small">
          <span>${idea.entry != null ? `Added at ${f.price(idea.entry)}` : 'No entry price'}</span>
          <span>${idea.entry != null ? `${f.pct(((price - idea.entry) / idea.entry) * 100)} since added` : ''}</span>
        </div>
      </div>`;
  }
  const thesis = `
    <section class="block">
      <div class="block-head"><h2>Your thesis</h2><button type="button" class="text-btn small" data-action="edit">Edit</button></div>
      <div class="card-plain thesis-card">
        <p class="thesis big${idea.thesis ? '' : ' empty'}">${f.esc(idea.thesis || 'No thesis yet. What has to be true for this to work?')}</p>
        <p class="conviction-line">${dotsHTML(idea.conviction)} ${CONVICTION_WORDS[idea.conviction - 1]} conviction</p>
        ${progress}
        <div class="cases">
          <div><h3 class="case up">Bull case</h3><p>${f.esc(idea.bull) || '<span class="muted">Not written yet</span>'}</p></div>
          <div><h3 class="case down">Bear case</h3><p>${f.esc(idea.bear) || '<span class="muted">Not written yet</span>'}</p></div>
        </div>
      </div>
    </section>`;

  // Key stats
  const marketCap = q?.marketCap ?? (m.marketCapitalization ? m.marketCapitalization * 1e6 : null);
  const groups = [
    ['Valuation', [
      ['Market cap', f.money(marketCap), 'Share price × shares outstanding'],
      ['P/E (TTM)', f.times(pick(m, 'peTTM', 'peExclExtraTTM', 'peBasicExclExtraTTM')), 'Price ÷ earnings per share over the last 12 months'],
      ['P/S (TTM)', f.times(pick(m, 'psTTM')), 'Market cap ÷ revenue over the last 12 months'],
      ['P/B', f.times(pick(m, 'pbQuarterly', 'pbAnnual')), "Market cap ÷ the company's book value"],
      ['EV / FCF', f.times(pick(m, 'currentEv/freeCashFlowTTM')), 'Enterprise value ÷ free cash flow'],
      ['EPS (TTM)', f.price(pick(m, 'epsTTM', 'epsExclExtraItemsTTM', 'epsBasicExclExtraItemsTTM')), 'Profit per share over the last 12 months'],
    ]],
    ['Profitability', [
      ['Gross margin', f.pct(pick(m, 'grossMarginTTM'), { sign: false }), 'What is left of each sales dollar after the cost of making the product'],
      ['Operating margin', f.pct(pick(m, 'operatingMarginTTM'), { sign: false }), 'Profit from the core business per sales dollar'],
      ['Net margin', f.pct(pick(m, 'netProfitMarginTTM'), { sign: false }), 'Final profit per sales dollar'],
      ['Return on equity', f.pct(pick(m, 'roeTTM'), { sign: false }), "Profit ÷ shareholders' equity"],
      ['Return on assets', f.pct(pick(m, 'roaTTM'), { sign: false }), 'Profit ÷ total assets'],
      ['Return on investment', f.pct(pick(m, 'roiTTM'), { sign: false }), 'Profit ÷ invested capital'],
    ]],
    ['Growth', [
      ['Revenue (YoY)', f.pct(revGrowth), 'Last 12 months vs. the 12 months before'],
      ['EPS (YoY)', f.pct(pick(m, 'epsGrowthTTMYoy')), 'Last 12 months vs. the 12 months before'],
      ['Revenue (5Y / yr)', f.pct(pick(m, 'revenueGrowth5Y')), 'Average yearly growth over 5 years'],
      ['EPS (5Y / yr)', f.pct(pick(m, 'epsGrowth5Y')), 'Average yearly growth over 5 years'],
    ]],
    ['Financial health', [
      ['Debt / equity', f.num(pick(m, 'totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual')), 'Total debt ÷ equity. Lower is safer.'],
      ['Current ratio', f.num(pick(m, 'currentRatioQuarterly', 'currentRatioAnnual')), 'Short-term assets ÷ short-term bills. Above 1 is comfortable.'],
      ['Quick ratio', f.num(pick(m, 'quickRatioQuarterly', 'quickRatioAnnual')), 'Like current ratio, without inventory'],
      ['Beta', f.num(pick(m, 'beta')), 'How much it swings vs. the market. 1 = same as the market.'],
    ]],
    ['Trading', [
      ['Dividend yield', f.pct(pick(m, 'dividendYieldIndicatedAnnual', 'currentDividendYieldTTM'), { sign: false, digits: 2 }), 'Yearly dividend ÷ share price'],
      ['Avg volume (10D)', f.count(pick(m, '10DayAverageTradingVolume') * 1e6), 'Shares traded per day, 10-day average'],
      ['Day range', q ? `${f.price(q.low)} – ${f.price(q.high)}` : f.DASH, "Today's low and high"],
      ['Open', f.price(q?.open), "Today's first trade"],
    ]],
  ];
  const high52 = pick(m, '52WeekHigh') ?? t?.range52.high;
  const low52 = pick(m, '52WeekLow') ?? t?.range52.low;
  const stats = `
    <section class="block">
      <h2>Key stats</h2>
      ${fund || failed('fundamentals') ? '' : skeletonBlock(4)}
      ${failed('fundamentals') ? errorHTML(failed('fundamentals')) : ''}
      ${fund ? `
        <div class="card-plain">
          <p class="stat-label">52-week range</p>
          ${rangeBar({ low: low52, high: high52, value: price, lowLabel: f.price(low52), highLabel: f.price(high52) })}
        </div>
        <div class="stat-groups">
          ${groups.map(([title, rows]) => `
            <div class="card-plain stat-group">
              <h3>${title}</h3>
              <dl>${rows.map(([label, value, help]) => `<div title="${f.esc(help)}"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
            </div>`).join('')}
        </div>
        <details class="explain">
          <summary>What these mean</summary>
          <dl>${groups.flatMap(([, rows]) => rows).map(([label, , help]) => `<div><dt>${label}</dt><dd>${help}</dd></div>`).join('')}</dl>
        </details>` : ''}
    </section>`;

  // About the company
  const about = q ? `
    <section class="block">
      <h2>About</h2>
      <div class="card-plain">
        <dl class="rows">
          ${row('Company', f.esc(q.name || idea.company || f.DASH))}
          ${row('Industry', f.esc(q.industry || f.DASH))}
          ${row('Exchange', f.esc(q.exchange || f.DASH))}
          ${row('Country', f.esc(q.country || f.DASH))}
          ${row('Public since', q.ipo ? f.dateLong(q.ipo + 'T12:00:00Z') : f.DASH)}
          ${row('Shares outstanding', f.count(q.sharesOutstanding))}
          ${row('Website', q.website ? `<a href="${f.esc(q.website)}" target="_blank" rel="noopener">${f.esc(q.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : f.DASH)}
        </dl>
      </div>
    </section>` : '';

  return tiles + thesis + stats + about;
}

function tile(label, value, tone, tab) {
  return `<button type="button" class="tile" data-goto="${tab}">
    <span class="tile-label">${label}</span>
    <span class="tile-value ${tone || ''}">${value}</span>
  </button>`;
}

// ----- Technicals -----

function technicalsHTML() {
  if (loading('daily')) return skeletonBlock(6);
  if (failed('daily')) return errorHTML(failed('daily'));
  const t = view.tech;
  if (!t) return emptyHTML('Not enough price history', 'Technicals need at least 60 trading days of prices.');

  const rsiSeries = t.series.rsi.slice(-126);
  const macdLine = t.series.macd.line.slice(-126);
  const macdSignal = t.series.macd.signal.slice(-126);
  const macdHist = t.series.macd.hist.slice(-126);
  const crossText = t.cross
    ? `<p class="note">${t.cross.kind === 'golden' ? 'Golden cross' : 'Death cross'} ${t.cross.daysAgo === 0 ? 'today' : `${t.cross.daysAgo} trading days ago`}: the 50-day average moved ${t.cross.kind === 'golden' ? 'above' : 'below'} the 200-day.</p>`
    : '';

  return `
    <section class="block">
      <div class="card-plain signal">
        <span class="pill ${t.trend.tone}">${t.trend.label}</span>
        <p>${t.trend.line}</p>
        ${crossText}
      </div>
    </section>

    <section class="block">
      <h2>Momentum</h2>
      <div class="card-plain indicator">
        <div class="ind-head">
          <div><p class="ind-name">RSI (14)</p><p class="ind-value">${f.num(t.rsi.value, 1)}</p></div>
          <span class="pill ${t.rsi.tone}">${t.rsi.state}</span>
        </div>
        <p class="ind-line">${t.rsi.line}</p>
        ${lineChart({ series: [{ values: rsiSeries, cls: 'accent' }], min: 0, max: 100, band: [30, 70], refs: [30, 70], height: 110 })}
      </div>
      <div class="card-plain indicator">
        <div class="ind-head">
          <div><p class="ind-name">MACD (12, 26, 9)</p><p class="ind-value">${f.num(t.macd.value)} <span class="ind-sub">signal ${f.num(t.macd.signal)}</span></p></div>
          <span class="pill ${t.macd.tone}">${t.macd.state}</span>
        </div>
        <p class="ind-line">${t.macd.line}</p>
        ${lineChart({ series: [{ values: macdLine, cls: 'accent' }, { values: macdSignal, cls: 'orange' }], histogram: macdHist, height: 120, refs: [0], format: () => '0' })}
        <p class="legend"><span><i class="swatch accent"></i>MACD</span><span><i class="swatch orange"></i>Signal</span><span><i class="swatch hist"></i>Gap</span></p>
      </div>
    </section>

    <section class="block">
      <h2>Moving averages</h2>
      <div class="card-plain">
        <dl class="rows">
          ${t.averages.map((a) => row(a.label,
            a.value == null ? f.DASH : `${f.price(a.value)} <span class="pill small ${a.above ? 'up' : 'down'}">${a.above ? 'Above' : 'Below'} ${f.pct(Math.abs(a.distance), { sign: false })}</span>`)).join('')}
        </dl>
      </div>
    </section>

    <section class="block">
      <h2>Volatility & volume</h2>
      <div class="card-plain">
        <dl class="rows">
          ${row('Bollinger Bands', `<span class="pill small ${t.bollinger.tone}">${t.bollinger.state}</span>`, t.bollinger.line)}
          ${row('Typical daily move (ATR)', `${f.price(t.atr.value)} · ${f.pct(t.atr.pctOfPrice, { sign: false })}`, 'Average true range over 14 days')}
          ${row('Volatility (30-day)', f.pct(t.volatility30, { sign: false }), 'Yearly pace. The S&P 500 usually runs 12–20%.')}
          ${row('Volume vs. 50-day avg', t.volume.ratio ? `${t.volume.ratio.toFixed(2)}×` : f.DASH, `${f.count(t.volume.last)} today vs. ${f.count(t.volume.avg50)} average`)}
        </dl>
      </div>
    </section>

    <section class="block">
      <h2>Price levels</h2>
      <div class="card-plain">
        <p class="stat-label">52-week range</p>
        ${rangeBar({ low: t.range52.low, high: t.range52.high, value: t.last, lowLabel: f.price(t.range52.low), highLabel: f.price(t.range52.high) })}
        <dl class="rows">
          ${row('From 52-week high', `<span class="${f.tone(t.range52.fromHigh)}">${f.pct(t.range52.fromHigh)}</span>`)}
          ${row('From 52-week low', `<span class="${f.tone(t.range52.fromLow)}">${f.pct(t.range52.fromLow)}</span>`)}
          ${row('60-day high', f.price(t.range60.high), 'Recent resistance: where rallies stopped')}
          ${row('60-day low', f.price(t.range60.low), 'Recent support: where drops stopped')}
        </dl>
      </div>
    </section>

    <section class="block">
      <h2>Performance</h2>
      <div class="perf">
        ${t.performance.map((p) => `<div class="perf-cell"><span>${p.label}</span><strong class="${f.tone(p.value)}">${f.pct(p.value)}</strong></div>`).join('')}
      </div>
    </section>

    <p class="fineprint">Worked out from daily closing prices. Technicals describe how the price has moved; they don't predict where it goes next.</p>`;
}

// ----- Financials -----

const STATEMENTS = [['income', 'Income'], ['balance', 'Balance sheet'], ['cashflow', 'Cash flow']];

function financialsHTML() {
  const controls = `
    <div class="fin-controls">
      <div class="segmented" style="--n:3; --i:${STATEMENTS.findIndex(([k]) => k === view.fin.statement)}" data-control="statement">
        <span class="seg-thumb" aria-hidden="true"></span>
        ${STATEMENTS.map(([k, label]) => `<button type="button" data-value="${k}" aria-pressed="${k === view.fin.statement}">${label}</button>`).join('')}
      </div>
      <div class="segmented small-inline" style="--n:2; --i:${view.fin.basis === 'annual' ? 0 : 1}" data-control="basis">
        <span class="seg-thumb" aria-hidden="true"></span>
        <button type="button" data-value="annual" aria-pressed="${view.fin.basis === 'annual'}">Annual</button>
        <button type="button" data-value="quarterly" aria-pressed="${view.fin.basis === 'quarterly'}">Quarterly</button>
      </div>
    </div>`;

  if (loading('financials')) return controls + skeletonBlock(6);
  if (failed('financials')) return controls + errorHTML(failed('financials'));

  const fin = ok('financials');
  const data = fin[view.fin.basis];
  if (!data?.periods.length) return controls + emptyHTML('No statements found', 'This company has no 10-K or 10-Q data at the SEC.');

  const labels = data.periods.map((p) => p.label);
  const r = data.rows;
  const g = data.growth;
  const latestGrowth = (arr) => arr.findLast((v) => v != null);
  const growthWord = view.fin.basis === 'annual' ? 'vs. last year' : 'vs. same quarter last year';

  const chartCard = (title, values, { format = f.money, growth, tone = 'accent' } = {}) => {
    const latest = values.findLast((v) => v != null);
    return `
      <div class="card-plain chart-block">
        <div class="cb-head">
          <div><p class="stat-label">${title}</p><p class="cb-value">${format(latest)}</p></div>
          ${growth != null ? `<span class="pill ${f.tone(growth)}">${f.pct(growth)} <span class="pill-sub">${growthWord}</span></span>` : ''}
        </div>
        ${barChart({ labels, values, format, tone })}
      </div>`;
  };

  let charts = '';
  if (view.fin.statement === 'income') {
    charts = `
      ${chartCard('Revenue', r.revenue, { growth: latestGrowth(g.revenue) })}
      ${chartCard('Net income', r.netIncome, { growth: latestGrowth(g.netIncome) })}
      <div class="card-plain chart-block">
        <p class="stat-label">Margins</p>
        ${lineChart({ series: [
          { values: data.ratios.grossMargin, cls: 'accent' },
          { values: data.ratios.operatingMargin, cls: 'orange' },
          { values: data.ratios.netMargin, cls: 'purple' },
        ], labels, height: 140, refs: marginRefs(data.ratios), format: (v) => `${v.toFixed(0)}%` })}
        <p class="legend"><span><i class="swatch accent"></i>Gross ${f.pct(latestGrowth(data.ratios.grossMargin), { sign: false })}</span><span><i class="swatch orange"></i>Operating ${f.pct(latestGrowth(data.ratios.operatingMargin), { sign: false })}</span><span><i class="swatch purple"></i>Net ${f.pct(latestGrowth(data.ratios.netMargin), { sign: false })}</span></p>
      </div>
      ${chartCard('EPS (diluted)', r.eps, { format: f.price, growth: latestGrowth(g.eps) })}`;
  } else if (view.fin.statement === 'balance') {
    const cashAll = r.cash.map((c, i) => (c ?? 0) + (r.shortInvestments[i] ?? 0) || null);
    charts = `
      ${chartCard('Cash & short-term investments', cashAll)}
      ${chartCard('Long-term debt', r.longTermDebt, { tone: 'muted' })}
      ${chartCard("Shareholders' equity", r.equity)}`;
  } else {
    const returned = r.buybacks.map((b, i) => (b ?? 0) + (r.dividends[i] ?? 0) || null);
    charts = `
      ${chartCard('Free cash flow', r.freeCashFlow, { growth: latestGrowth(g.freeCashFlow) })}
      ${chartCard('Operating cash flow', r.operatingCashFlow)}
      ${chartCard('Returned to shareholders', returned, { tone: 'muted' })}`;
  }

  const lines = fin.lines[view.fin.statement];
  const table = `
    <div class="card-plain table-card">
      <div class="table-wrap">
        <table class="fin-table">
          <thead><tr><th scope="col">${view.fin.basis === 'annual' ? 'Fiscal year' : 'Quarter ending'}</th>${labels.map((l) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
          <tbody>
            ${lines.map((line) => {
              const values = r[line.key] ?? [];
              if (!values.some((v) => v != null)) return '';
              const fmt = line.format === 'eps' ? f.price : line.format === 'shares' ? f.count : f.money;
              let html = `<tr><th scope="row">${line.label}</th>${values.map((v) => `<td>${fmt(v)}</td>`).join('')}</tr>`;
              if (line.key === 'revenue') {
                html += `<tr class="sub"><th scope="row">Growth</th>${g.revenue.map((v) => `<td class="${f.tone(v)}">${f.pct(v)}</td>`).join('')}</tr>`;
              }
              return html;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  const source = view.data.financials.status === 'demo'
    ? 'Demo numbers.'
    : `From ${f.esc(fin.name)}'s SEC filings (10-K and 10-Q). Single quarters that aren't reported on their own, like Q4, are worked out from year-to-date totals.`;
  return `${controls}<div class="fin-charts">${charts}</div>${table}<p class="fineprint">${source}</p>`;
}

function marginRefs(ratios) {
  const all = [...ratios.grossMargin, ...ratios.netMargin].filter((v) => v != null);
  if (!all.length) return [];
  return all.some((v) => v < 0) ? [0] : [];
}

// ----- Earnings -----

function earningsHTML() {
  if (loading('fundamentals')) return skeletonBlock(5);
  if (failed('fundamentals')) return errorHTML(failed('fundamentals'));
  const fund = ok('fundamentals');
  const next = fund.nextEarnings;
  const hist = fund.earnings ?? [];

  const nextCard = next ? (() => {
    const date = new Date(next.date + 'T12:00:00Z');
    const days = Math.ceil((date - Date.now()) / 86_400_000);
    const when = { bmo: 'Before the market opens', amc: 'After the market closes', dmh: 'During market hours' }[next.hour] || 'Time not announced';
    return `
      <div class="card-plain next-earnings">
        <div>
          <p class="stat-label">Next report</p>
          <p class="cb-value">${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}</p>
          <p class="muted-line">${when} · ${days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}</p>
        </div>
        <dl class="rows compact">
          ${row('Expected EPS', f.price(next.epsEstimate))}
          ${row('Expected revenue', f.money(next.revenueEstimate))}
        </dl>
      </div>`;
  })() : `<div class="card-plain"><p class="muted-line">No earnings date announced yet.</p></div>`;

  const beats = hist.filter((e) => e.actual != null && e.estimate != null && e.actual >= e.estimate).length;
  const reported = hist.filter((e) => e.actual != null && e.estimate != null).length;
  const surprise = hist.length ? `
    <section class="block">
      <div class="block-head"><h2>Expected vs. reported EPS</h2>${reported ? `<span class="pill ${beats >= reported / 2 ? 'up' : 'down'}">Beat ${beats} of ${reported}</span>` : ''}</div>
      <div class="card-plain chart-block">
        ${dotPlot({ points: hist, labels: hist.map((e) => quarterLabel(e.period)), format: f.price })}
        <p class="legend"><span><i class="swatch ring"></i>Expected</span><span><i class="swatch up"></i>Beat</span><span><i class="swatch down"></i>Missed</span></p>
        <dl class="rows">
          ${hist.slice().reverse().map((e) => row(quarterLabel(e.period),
            `${f.price(e.actual)} <span class="muted">vs ${f.price(e.estimate)}</span> ${e.surprisePercent != null ? `<span class="pill small ${f.tone(e.surprisePercent)}">${f.pct(e.surprisePercent)}</span>` : ''}`)).join('')}
        </dl>
      </div>
    </section>` : '';

  const q = ok('financials')?.quarterly;
  const trend = q?.periods.length ? `
    <section class="block">
      <h2>Quarter by quarter</h2>
      <div class="card-plain chart-block">
        <div class="cb-head"><div><p class="stat-label">Revenue</p><p class="cb-value">${f.money(q.rows.revenue.findLast((v) => v != null))}</p></div>
          ${q.growth.revenue.at(-1) != null ? `<span class="pill ${f.tone(q.growth.revenue.at(-1))}">${f.pct(q.growth.revenue.at(-1))} <span class="pill-sub">vs. a year ago</span></span>` : ''}</div>
        ${barChart({ labels: q.periods.map((p) => p.label), values: q.rows.revenue, format: f.money })}
      </div>
      <div class="card-plain chart-block">
        <div class="cb-head"><div><p class="stat-label">EPS (diluted)</p><p class="cb-value">${f.price(q.rows.eps.findLast((v) => v != null))}</p></div></div>
        ${barChart({ labels: q.periods.map((p) => p.label), values: q.rows.eps, format: f.price })}
      </div>
    </section>` : loading('financials') ? skeletonBlock(3) : '';

  return `<section class="block"><h2>Upcoming</h2>${nextCard}</section>${surprise}${trend}`;
}

// ----- Investors -----

const INSIDER_CODES = {
  P: ['Bought', 'up'], S: ['Sold', 'down'], M: ['Exercised options', ''], X: ['Exercised options', ''],
  A: ['Stock award', ''], F: ['Shares withheld for tax', ''], G: ['Gift', ''], D: ['Returned to company', ''], C: ['Converted', ''],
};

function investorsHTML() {
  if (loading('fundamentals')) return skeletonBlock(5);
  if (failed('fundamentals')) return errorHTML(failed('fundamentals'));
  const fund = ok('fundamentals');
  const recs = fund.recommendations ?? [];
  const latest = recs.at(-1);
  const consensus = analystConsensus(recs);
  const keys = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'];
  const names = { strongBuy: 'Strong buy', buy: 'Buy', hold: 'Hold', sell: 'Sell', strongSell: 'Strong sell' };

  const analysts = latest ? `
    <section class="block">
      <h2>Wall Street analysts</h2>
      <div class="card-plain">
        <div class="consensus">
          <span class="pill ${consensus.tone}">${consensus.label}</span>
          <p class="muted-line">Consensus of ${consensus.total} analysts · ${monthLabel(latest.period)}</p>
        </div>
        <div class="dist">
          ${keys.map((k) => latest[k] ? `<span class="seg ${k}" style="flex:${latest[k]}" title="${names[k]}: ${latest[k]}"></span>` : '').join('')}
        </div>
        <dl class="dist-legend">
          ${keys.map((k) => `<div><dt><i class="swatch ${k}"></i>${names[k]}</dt><dd>${latest[k] ?? 0}</dd></div>`).join('')}
        </dl>
        <p class="stat-label spaced">Last ${recs.length} months</p>
        ${stackedBars({ columns: recs, keys, labels: recs.map((r) => monthLabel(r.period, true)) })}
      </div>
      <p class="fineprint">Price targets from analysts aren't in the free data feed.</p>
    </section>` : '';

  const trades = fund.insiders ?? [];
  let insiders;
  if (view.data.fundamentals.status === 'demo') {
    insiders = emptyHTML('Insider trades', 'Real insider buys and sells appear here once live data is connected. Demo mode never invents people.');
  } else if (!trades.length) {
    insiders = emptyHTML('No insider trades', 'No executives or directors reported trades in the last 12 months.');
  } else {
    const buys = trades.filter((t) => t.transactionCode === 'P');
    const sells = trades.filter((t) => t.transactionCode === 'S');
    const value = (list) => list.reduce((s, t) => s + Math.abs(t.change) * (t.transactionPrice || 0), 0);
    insiders = `
      <div class="card-plain">
        <div class="insider-summary">
          <div><p class="stat-label">Open-market buys</p><p class="cb-value up">${buys.length} <span class="muted small">· ${f.money(value(buys))}</span></p></div>
          <div><p class="stat-label">Open-market sells</p><p class="cb-value down">${sells.length} <span class="muted small">· ${f.money(value(sells))}</span></p></div>
        </div>
        <p class="muted-line">Buys with their own money are the stronger signal. Sales often happen for taxes or planned diversification.</p>
        <ul class="insider-list">
          ${trades.slice(0, 20).map((t) => {
            const [what, tone] = INSIDER_CODES[t.transactionCode] ?? [t.transactionCode || 'Other', ''];
            return `<li>
              <div><p class="insider-name">${f.esc(titleCase(t.name))}</p><p class="muted-line">${f.dateShort(t.transactionDate + 'T12:00:00Z')} · ${what}</p></div>
              <div class="insider-amt"><p class="${tone}">${t.change > 0 ? '+' : '−'}${f.count(Math.abs(t.change))} sh</p>
              <p class="muted-line">${t.transactionPrice ? `at ${f.price(t.transactionPrice)}` : ''}</p></div>
            </li>`;
          }).join('')}
        </ul>
      </div>`;
  }

  return `${analysts}
    <section class="block"><h2>Insider activity <span class="h-sub">last 12 months</span></h2>${insiders}</section>
    <section class="block">
      <h2>Big funds</h2>
      <div class="card-plain"><p class="muted-line">Hedge fund and institution holdings come from quarterly 13F filings. They aren't in the free data feeds yet. Activist and 5%+ stakes (13D/13G) show up under News → SEC filings.</p></div>
    </section>`;
}

// ----- News -----

function newsHTML() {
  if (loading('news')) return skeletonBlock(6);
  if (failed('news')) return errorHTML(failed('news'));
  const n = ok('news');

  let news;
  if (n.newsStatus === 'demo' || n.newsStatus === 'not_configured') {
    news = emptyHTML('Headlines', 'Live company news appears here once the Finnhub key is connected. Demo mode never invents headlines.');
  } else if (!n.news?.length) {
    news = emptyHTML('No news this month', 'No stories about this company in the last 30 days.');
  } else {
    news = `<div class="news-list">${n.news.map((item) => `
      <a class="news-item" href="${f.esc(item.url)}" target="_blank" rel="noopener">
        <p class="news-meta">${f.esc(item.source)} · ${f.ago(item.time)}</p>
        <h3>${f.esc(item.headline)}</h3>
        ${item.summary ? `<p class="news-sum">${f.esc(item.summary)}</p>` : ''}
      </a>`).join('')}</div>`;
  }

  const filings = n.filings?.length ? `
    <div class="card-plain">
      <ul class="filing-list">
        ${n.filings.map((fl) => `
          <li><a href="${f.esc(fl.url)}" target="_blank" rel="noopener">
            <span class="form-pill">${f.esc(fl.form)}</span>
            <span class="filing-text"><strong>${f.esc(fl.meaning)}</strong>${fl.description && !sameForm(fl.description, fl.form) ? `<span class="muted-line">${f.esc(fl.description)}</span>` : ''}</span>
            <span class="filing-date">${f.dateShort(fl.date + 'T12:00:00Z')}</span>
          </a></li>`).join('')}
      </ul>
    </div>` : emptyHTML('SEC filings', view.data.news.status === 'demo' ? 'Filings appear here once the app is connected.' : 'No recent filings found.');

  return `<section class="block"><h2>Headlines <span class="h-sub">last 30 days</span></h2>${news}</section>
    <section class="block"><h2>SEC filings</h2>${filings}</section>`;
}

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------

function analystConsensus(recs) {
  const r = recs?.at(-1);
  if (!r) return null;
  const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
  if (!total) return null;
  const score = (r.strongBuy * 1 + r.buy * 2 + r.hold * 3 + r.sell * 4 + r.strongSell * 5) / total;
  const [label, tone] = score <= 1.5 ? ['Strong buy', 'up'] : score <= 2.5 ? ['Buy', 'up'] : score <= 3.5 ? ['Hold', 'neutral'] : score <= 4.5 ? ['Sell', 'down'] : ['Strong sell', 'down'];
  return { label, tone, total, score };
}

function pick(metrics, ...keys) {
  for (const k of keys) {
    const v = metrics?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function row(label, value, help) {
  return `<div class="row-item"><dt>${label}${help ? `<span class="help">${help}</span>` : ''}</dt><dd>${value}</dd></div>`;
}

function dotsHTML(level, id) {
  const dots = [1, 2, 3, 4, 5].map((n) => `<span class="dot${n <= level ? ' on' : ''}"></span>`).join('');
  return `<span class="dots"${id ? ` id="${id}"` : ''} role="img" aria-label="Conviction ${level} of 5">${dots}</span>`;
}

function skeletonBlock(lines) {
  return `<div class="card-plain skeleton" aria-label="Loading">${'<span class="sk-line"></span>'.repeat(lines)}</div>`;
}
function loadingText(key) {
  return failed(key) ? f.DASH : '<span class="skeleton-text">Loading</span>';
}
function errorHTML(message) {
  return `<div class="card-plain error-card"><p>${f.esc(message)}</p></div>`;
}
function emptyHTML(title, text) {
  return `<div class="card-plain empty-card"><p class="empty-title">${title}</p><p class="muted-line">${text}</p></div>`;
}

function quarterLabel(period) {
  const d = new Date(period + 'T12:00:00Z');
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} '${String(d.getUTCFullYear()).slice(2)}`;
}
function monthLabel(period, short = false) {
  return new Date(period + 'T12:00:00Z').toLocaleString('en-US', { month: short ? 'short' : 'long', year: short ? undefined : 'numeric', timeZone: 'UTC' });
}
// "FORM 4" and "4" are the same thing, so don't repeat it
function sameForm(description, form) {
  return description.toUpperCase().replace(/^FORM\s*/, '') === form.toUpperCase();
}
function titleCase(name) {
  return String(name ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function nyDate(t) {
  return new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function sameDay(t) {
  return new Date(t).toDateString() === new Date().toDateString();
}

// ---------------------------------------------------------------------------
// Taps and clicks
// ---------------------------------------------------------------------------

function wire(root) {
  root.addEventListener('click', (event) => {
    const el = event.target.closest('button, [data-goto]');
    if (!el || !view) return;

    if (el.dataset.action === 'back') return view.onBack();
    if (el.dataset.action === 'edit') return view.onEdit(view.idea);

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
      // keep the tabs in view when you switch
      const tabs = root.querySelector('#tabs');
      if (tabs.getBoundingClientRect().top < 0 || el.dataset.goto) {
        tabs.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
      root.querySelector(`[data-tab="${tab}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
      return;
    }
    const control = el.closest('[data-control]');
    if (control && el.dataset.value) {
      view.fin[control.dataset.control] = el.dataset.value;
      renderPanel();
    }
  });

  // Show the ticker in the top bar once the big header scrolls away
  view.observer = new IntersectionObserver(
    ([entry]) => root.querySelector('#stock-nav').classList.toggle('scrolled', !entry.isIntersecting),
    { rootMargin: '-52px 0px 0px 0px' },
  );
  view.observer.observe(root.querySelector('.st-ticker'));
}
