// ==========================================================================
// stock.js: the full page you see when you tap a stock.
// Header with the live price, a big chart, then eight tabs. Each tab lives
// in its own file in js/tabs/. This file loads the data, works out the
// ratings, runs the AI when you ask, and switches between tabs.
// ==========================================================================

import * as api from './api.js';
import * as f from './format.js';
import { PriceChart } from './charts.js';
import { analyze, snapshot, researchBundle } from './analysis.js';
import { findEngines, savedResearch, runResearch, loadSharedNote, diagnoseLocalAI, productionUrl, warmUp, requestNote, jobStatus } from './ai.js';
import { loadChecks, saveChecks } from './research.js';
import { dotsHTML, esc } from './ui.js';
import { overviewTab } from './tabs/overview.js';
import { researchTab } from './tabs/research.js';
import { ratingsTab } from './tabs/ratings.js';
import { technicalsTab } from './tabs/technicals.js';
import { financialsTab } from './tabs/financials.js';
import { valuationTab, dcfResultHTML } from './tabs/valuation.js';
import { earningsTab } from './tabs/earnings.js';
import { investorsTab } from './tabs/investors.js';
import { newsTab } from './tabs/news.js';
import { journalTab } from './tabs/journal.js';
import { addNote, logTrade, closeIdea, reopenIdea, markReviewed, removeEntry, parsePrice, position, addAlert, removeAlert, checkAlerts } from './journal.js';
import { sizerOutputHTML, saveSizerPrefs, sizerPrefs } from './tabs/sizer.js';

const TABS = [
  ['overview', 'Overview', overviewTab],
  ['journal', 'Journal', journalTab],
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

export function openStockPage(root, idea, { onEdit, onBack, onRated, onChange, onAdd, onOpenTicker, onAlert, tab = 'overview' }) {
  closeStockPage();
  const saved = savedResearch(idea.ticker);
  view = {
    root, idea, onEdit, onBack, onRated, onChange, onAdd, onOpenTicker, onAlert,
    tab,
    journalOpen: null,
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
    listeners: new AbortController(),
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
  // A newer note written on another device (your Mac) wins
  loadSharedNote(idea.ticker).then((shared) => {
    if (view !== v || !shared || (v.ai.entry && v.ai.entry.at >= shared.at)) return;
    v.ai.entry = shared;
    if (v.ai.state !== 'running') v.ai.state = 'done';
    renderPanel();
    if (!anyLoading()) reportRatings();
  });
  findEngines().then((engines) => applyEngines(v, engines));
  warmUp();
}

// After looking for an AI: use it, or work out why the Mac's AI isn't connecting
function applyEngines(v, engines) {
  if (view !== v) return;
  v.ai.engines = engines;
  if (engines.length && v.ai.state === 'unavailable') v.ai.state = 'idle';
  if (!engines.length && v.ai.state === 'idle') v.ai.state = 'unavailable';
  renderPanel();
  if (!engines.length) {
    Promise.all([diagnoseLocalAI(), productionUrl()]).then(([diagnosis, url]) => {
      if (view !== v) return;
      v.ai.diagnosis = diagnosis;
      v.ai.productionUrl = url;
      renderPanel();
      if (diagnosis.status === 'not-computer') checkMacJobs(v);
    });
  }
}

async function recheckAI() {
  const v = view;
  v.ai.diagnosis = null;
  renderPanel();
  applyEngines(v, await findEngines({ fresh: true }));
  warmUp();
}

export function closeStockPage() {
  if (!view) return;
  clearInterval(view.timer);
  clearInterval(view.pollTimer);
  view.aiControl?.abort();
  view.chart?.destroy();
  view.observer?.disconnect();
  view.listeners.abort();
  view = null;
}

// Called after you edit the idea, so the page shows your new thesis/target
export function refreshIdea(idea) {
  if (!view || view.idea.id !== idea.id) return;
  view.idea = idea;
  view.root.querySelector('.st-ticker').textContent = idea.ticker;
  view.root.querySelector('#nav-action').outerHTML = navAction(idea);
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
    api.getQuote(symbol).then(done('quote', (r) => { renderHeader(); watchAlerts(r); })),
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
  watchAlerts(result);
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
// valuation inputs and the app score (see analysis.js)
function derive() {
  const d = analyze({
    quote: ok('quote'),
    daily: ok('daily'),
    bench: ok('bench'),
    fund: ok('fundamentals'),
    fin: ok('financials'),
    peers: ok('peers')?.peers ?? [],
    insidersLive: view.data.fundamentals?.status === 'live',
  }, view.derived);
  // Slider starting points follow the data until you move a slider yourself
  if (d.val && !view.dcfTouched) view.dcf = { growth: d.val.growth, discount: d.val.discount, terminal: d.val.terminal };
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
    bench: ok('bench')?.candles ?? null,
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

// Save the ratings and a few key numbers on the idea, for the watchlist card and Compare
function reportRatings() {
  if (view.idea.transient) return;
  const demo = Object.values(view.data).some((r) => r?.status === 'demo');
  view.onRated?.(view.idea.id, snapshot(view.derived, {
    quote: ok('quote'),
    fund: ok('fundamentals'),
    aiRating: view.ai.state === 'done' ? view.ai.entry.result.rating : null,
    demo,
  }));
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
    const entry = await runResearch(v.idea.ticker, researchBundle({
      ...ctx(),
      insidersLive: v.data.fundamentals?.status === 'live',
      demo: Object.values(v.data).some((x) => x?.status === 'demo'),
    }), {
      signal: v.aiControl.signal,
      onProgress: (chars) => {
        if (view !== v) return;
        // A full note is roughly 7,000 characters
        const pct = Math.min(99, Math.round((chars / 7000) * 100));
        v.ai.progress = `Writing the research note… ${pct}%`;
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
      ${navAction(idea)}
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

function navAction(idea) {
  return idea.transient
    ? '<button type="button" class="text-btn strong" data-action="add-to-list" id="nav-action">Add</button>'
    : '<button type="button" class="text-btn" data-action="edit" id="nav-action">Edit</button>';
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
  // Journal forms: keep what you've typed while new data redraws the tab
  const kept = sameTab ? [...panel.querySelectorAll('[data-keep]')].map((el) => [el.dataset.keep, el.type === 'radio' ? el.checked : el.value]) : [];
  const focusedKeep = document.activeElement?.dataset?.keep;
  panel.innerHTML = TABS.find(([key]) => key === view.tab)[2](ctx());
  view.renderedTab = view.tab;
  // Statement tables start scrolled to the newest period (on the right)
  panel.querySelectorAll('.table-wrap').forEach((el, i) => {
    el.scrollLeft = scrollers[i] ?? (el.classList.contains('from-left') ? 0 : el.scrollWidth);
  });
  panel.querySelectorAll('details').forEach((el, i) => { if (!el.dataset.openKey) el.open = open[i] ?? false; });
  if (focusedSlider) panel.querySelector(`[data-dcf="${focusedSlider}"]`)?.focus({ preventScroll: true });
  for (const [key, value] of kept) {
    const el = panel.querySelector(`[data-keep="${key}"]`);
    if (!el) continue;
    if (el.type === 'radio') el.checked = value; else el.value = value;
  }
  if (focusedKeep) panel.querySelector(`[data-keep="${focusedKeep}"]`)?.focus({ preventScroll: true });
  // The sizer's answer follows whatever is in its boxes after the redraw
  panel.querySelectorAll('[data-sizer]').forEach((form) => {
    form.querySelector('[data-sizer-out]').innerHTML = sizerOutputHTML(Object.fromEntries(new FormData(form)));
  });
  updateAiProgress();
}

// ---------------------------------------------------------------------------
// Taps, clicks and sliders
// ---------------------------------------------------------------------------

function wire(root) {
  // Listeners are removed when the page closes (the same element is reused for the next stock)
  const signal = view.listeners.signal;
  root.addEventListener('click', (event) => {
    const peer = event.target.closest('tr[data-ticker]');
    if (peer && view) return view.onOpenTicker?.(peer.dataset.ticker, peer.dataset.name);
    const el = event.target.closest('button, [data-goto]');
    if (!el || !view) return;
    const action = el.dataset.action;

    if (action === 'back') return view.onBack();
    if (action === 'edit') return view.onEdit(view.idea);
    if (action === 'add-to-list') return view.onAdd?.(view.idea);
    if (action === 'reviewed') return commit(markReviewed(view.idea));
    if (action === 'reopen') return commit(reopenIdea(view.idea));
    if (action === 'delete-entry') return commit(removeEntry(view.idea, el.dataset.id));
    if (action === 'delete-alert') return commit(removeAlert(view.idea, el.dataset.id));
    if (action === 'alert-quick') {
      askForNotifications();
      return commit(addAlert(view.idea, { dir: el.dataset.dir, price: Number(el.dataset.price), label: el.dataset.label }));
    }
    if (action === 'show-close') {
      view.journalOpen = 'close';
      renderPanel();
      view.root.querySelector('[data-open-key="close"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (action === 'run-ai') return runAI();
    if (action === 'ask-mac') return askMac();
    if (action === 'stop-ai') return view.aiControl?.abort();
    if (action === 'recheck-ai') return recheckAI();
    if (action === 'copy') {
      const text = el.dataset.copy;
      navigator.clipboard?.writeText(text).then(
        () => { el.textContent = 'Copied'; setTimeout(() => (el.textContent = 'Copy'), 1500); },
        () => { el.textContent = 'Select and copy'; },
      );
      return;
    }
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
  }, { signal });

  // Ticking an item on the "before you buy" checklist
  root.addEventListener('change', (event) => {
    const item = event.target.dataset?.check;
    if (item == null || !view) return;
    if (event.target.checked) view.checks.add(item); else view.checks.delete(item);
    saveChecks(view.idea.ticker, view.checks);
    const done = view.root.querySelector('#checks-done');
    if (done) done.textContent = checksDoneText();
  }, { signal });

  // Dragging a DCF slider updates the answer live
  root.addEventListener('input', (event) => {
    const sizer = event.target.closest('[data-sizer]');
    if (sizer) {
      const values = Object.fromEntries(new FormData(sizer));
      sizer.querySelector('[data-sizer-out]').innerHTML = sizerOutputHTML(values);
      // Account size and risk % are remembered on this device
      if (event.target.name === 'account' || event.target.name === 'riskPct') {
        saveSizerPrefs({ ...sizerPrefs(), account: values.account, riskPct: values.riskPct });
      }
      return;
    }
    const key = event.target.dataset?.dcf;
    if (!key || !view?.dcf) return;
    view.dcf[key] = Number(event.target.value);
    view.dcfTouched = true;
    root.querySelector(`#dcf-${key}-out`).textContent = `${event.target.value}%`;
    root.querySelector('#dcf-out').innerHTML = dcfResultHTML(ctx());
  }, { signal });

  // Remember which journal drawer is open, so redraws keep it open
  root.addEventListener('toggle', (event) => {
    const key = event.target.dataset?.openKey;
    if (!key || !view) return;
    if (event.target.open) view.journalOpen = key;
    else if (view.journalOpen === key) view.journalOpen = null;
  }, { capture: true, signal });

  // Journal forms: note, trade, close
  root.addEventListener('submit', (event) => {
    if (event.target.matches('[data-sizer]')) return event.preventDefault();
    const kind = event.target.dataset.form;
    if (!view || !['note', 'trade', 'close', 'alert'].includes(kind)) return;
    event.preventDefault();
    journalSubmit(kind, new FormData(event.target), event.target);
  }, { signal });

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
  }, { signal });

  // Show the ticker in the top bar once the big header scrolls away
  view.observer = new IntersectionObserver(
    ([entry]) => root.querySelector('#stock-nav').classList.toggle('scrolled', !entry.isIntersecting),
    { rootMargin: '-52px 0px 0px 0px' },
  );
  view.observer.observe(root.querySelector('.st-ticker'));
}

// On a computer, alerts can also pop up as notifications (asked once, when you set your first alert)
function askForNotifications() {
  try {
    if ('Notification' in window && Notification.permission === 'default' && navigator.maxTouchPoints === 0) Notification.requestPermission().catch(() => {});
  } catch { /* not supported */ }
}

// ---------------------------------------------------------------------------
// On the phone: ask the Mac to write the note, then wait for it
// ---------------------------------------------------------------------------

// Is a note for this stock already waiting on the Mac? And when did the Mac last write one?
async function checkMacJobs(v) {
  const status = await jobStatus();
  if (view !== v || !status) return;
  v.ai.macStatus = status;
  const waiting = status.requests?.find((r) => r.ticker === v.idea.ticker);
  if (waiting && !v.ai.job) {
    v.ai.job = { state: 'queued', at: waiting.at };
    waitForNote(v);
  }
  renderPanel();
}

async function askMac() {
  const v = view;
  v.ai.job = { state: 'sending' };
  renderPanel();
  const result = await requestNote([v.idea.ticker]);
  if (view !== v) return;
  v.ai.job = result.ok ? { state: 'queued', at: Date.now() } : { state: 'error', message: result.message };
  renderPanel();
  if (result.ok) waitForNote(v);
}

// Check for the new note every 30 seconds while this page is open (up to 45 minutes)
function waitForNote(v) {
  clearInterval(v.pollTimer);
  const started = Date.now();
  v.pollTimer = setInterval(async () => {
    if (view !== v || Date.now() - started > 45 * 60_000) return clearInterval(v.pollTimer);
    if (document.visibilityState !== 'visible') return;
    const shared = await loadSharedNote(v.idea.ticker);
    if (view !== v || !shared || shared.at < (v.ai.job?.at ?? 0)) return;
    clearInterval(v.pollTimer);
    v.ai.entry = shared;
    v.ai.state = 'done';
    v.ai.job = null;
    v.ai.macStatus = { ...v.ai.macStatus, lastNoteAt: shared.at, lastNoteTicker: v.idea.ticker };
    renderPanel();
    reportRatings();
  }, 30_000);
}

// Did the price just cross one of your alerts? (real prices only)
function watchAlerts(result) {
  if (!view || view.idea.transient || result?.status !== 'live') return;
  const { idea, fired } = checkAlerts(view.idea, result.data.price);
  if (!fired.length) return;
  commit(idea);
  view.onAlert?.(idea, fired);
}

// Save a changed idea (the watchlist keeps it and syncs it) and redraw
function commit(idea) {
  view.idea = idea;
  view.onChange?.(idea);
  renderPanel();
}

// Switch tab by number (keyboard shortcuts 1-9 on a computer)
export function selectTab(n) {
  const tab = TABS[n - 1];
  if (!view || !tab) return;
  view.root.querySelector(`[data-tab="${tab[0]}"]`)?.click();
}

function journalSubmit(kind, form, el) {
  const price = ok('quote')?.price ?? null;
  const showError = (message) => {
    const box = el.querySelector(`[data-error="${kind}"]`);
    if (box) { box.hidden = !message; box.textContent = message; }
    return null;
  };
  // Typed prices fall back to today's price
  const priceField = (name) => {
    const text = String(form.get(name) ?? '').trim();
    return text ? parsePrice(text) : price;
  };

  if (kind === 'note') {
    const text = String(form.get('text') ?? '').trim();
    if (!text) return;
    el.reset();
    return commit(addNote(view.idea, text, price));
  }
  if (kind === 'trade') {
    const side = form.get('side');
    const shares = parsePrice(form.get('shares'));
    const tradePrice = priceField('price');
    const date = String(form.get('date') || '');
    if (!shares || shares <= 0) return showError('Shares should be a number, like 10.');
    if (tradePrice == null || tradePrice <= 0) return showError('Price should be a number, like 172.10.');
    const held = position(view.idea)?.shares ?? 0;
    if (side === 'sell' && shares > held + 1e-9) return showError(`You've only logged ${held} shares.`);
    const today = new Date().toISOString().slice(0, 10);
    const at = date && date !== today ? `${date}T16:00:00.000Z` : new Date().toISOString();
    el.reset();
    view.journalOpen = null;
    const next = logTrade(view.idea, { side, shares, price: tradePrice, at });
    commit(next);
    // Sold everything? Offer to close it with a verdict
    if (side === 'sell' && position(next)?.shares === 0) {
      view.journalOpen = 'close';
      renderPanel();
    }
    return;
  }
  if (kind === 'alert') {
    const target = parsePrice(form.get('price'));
    if (target == null || target <= 0) return showError('Price should be a number, like 150.');
    el.reset();
    askForNotifications();
    return commit(addAlert(view.idea, { dir: form.get('dir'), price: target }));
  }
  if (kind === 'close') {
    const exit = priceField('exit');
    if (exit == null) return showError('Exit price should be a number, like 172.10.');
    view.journalOpen = null;
    const start = parsePrice(form.get('start'));
    const base = start != null && view.idea.entry == null ? { ...view.idea, entry: start } : view.idea;
    return commit(closeIdea(base, { verdict: form.get('verdict'), lesson: String(form.get('lesson') ?? ''), exit }));
  }
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
