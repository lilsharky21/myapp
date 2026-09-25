// ==========================================================================
// screen.js: Discover, the stock screener.
// Looks through ~90 well-known US stocks (js/universe.js), gives each a
// Quick score from its key numbers, and offers ready-made screens that a
// beginner can understand ("Fast growers", "Quality at a fair price"...).
// Tap any result to open its full research page.
// ==========================================================================

import { passcodeHeaders } from './api.js';
import { UNIVERSE } from './universe.js';
import { scale, grade } from './ratings.js';
import * as f from './format.js';
import { gradeHTML } from './ui.js';

const esc = f.esc;
const CACHE = 'thesis-journal/screen';
const CACHE_MS = 12 * 3_600_000;

// ---------------------------------------------------------------------------
// The Quick score: the same scoring rules as the app score's matching
// factors (js/ratings.js), using only the key numbers (no chart or DCF).
// ---------------------------------------------------------------------------

const avg = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export const QUICK_FACTORS = [
  ['value', 'Value', 25],
  ['growth', 'Growth', 25],
  ['quality', 'Quality', 20],
  ['health', 'Health', 15],
  ['momentum', 'Momentum', 15],
];

export function quickScore(s) {
  const parts = {
    value: avg([
      s.pe > 0 ? scale(s.pe, [[8, 100], [15, 85], [20, 72], [30, 52], [45, 32], [70, 12], [100, 5]]) : s.pe != null ? 10 : null,
      scale(s.ps, [[1, 100], [3, 78], [6, 58], [10, 38], [20, 15], [40, 5]]),
    ]),
    growth: avg([
      scale(s.revenueGrowth, [[-15, 5], [-5, 20], [0, 35], [5, 50], [10, 65], [20, 85], [35, 100]]),
      scale(s.epsGrowth, [[-30, 5], [-10, 22], [0, 38], [10, 58], [20, 75], [40, 95]]),
      scale(s.revenueGrowth5y, [[-5, 10], [0, 28], [5, 48], [10, 66], [15, 80], [25, 97]]),
    ]),
    quality: avg([
      scale(s.grossMargin, [[5, 10], [20, 35], [35, 58], [50, 78], [65, 95]]),
      scale(s.operatingMargin, [[-10, 5], [0, 22], [8, 45], [15, 65], [25, 85], [35, 97]]),
      scale(s.netMargin, [[-10, 5], [0, 25], [5, 45], [12, 65], [20, 82], [30, 97]]),
      scale(s.roe, [[-10, 5], [0, 20], [8, 42], [15, 65], [25, 85], [40, 97]]),
    ]),
    health: avg([
      s.debtToEquity != null && s.debtToEquity >= 0 ? scale(s.debtToEquity, [[0, 100], [0.3, 88], [0.7, 72], [1.2, 52], [2, 32], [4, 10]]) : null,
      scale(s.currentRatio, [[0.5, 15], [0.8, 35], [1, 52], [1.5, 72], [2.5, 92]]),
    ]),
    momentum: avg([
      scale(s.return6m, [[-30, 5], [-15, 22], [0, 45], [10, 62], [25, 82], [50, 97]]),
      scale(s.return1y, [[-30, 5], [0, 40], [15, 62], [30, 80], [60, 95]]),
    ]),
  };
  let total = 0;
  let weight = 0;
  for (const [key, , w] of QUICK_FACTORS) {
    if (parts[key] == null) continue;
    total += parts[key] * w;
    weight += w;
  }
  const overall = weight >= 50 ? Math.round(total / weight) : null;
  return { ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v == null ? null : Math.round(v)])), overall, grade: grade(overall) };
}

// ---------------------------------------------------------------------------
// Ready-made screens
// ---------------------------------------------------------------------------

export const PRESETS = [
  {
    key: 'top', name: 'Top rated',
    about: 'The highest Quick scores: good value, growth, quality, health and momentum all together.',
    test: () => true,
    sort: (a, b) => (b.q.overall ?? -1) - (a.q.overall ?? -1),
  },
  {
    key: 'quality', name: 'Quality at a fair price',
    about: 'Very profitable businesses (high margins and returns) whose P/E isn’t extreme. A classic long-term approach.',
    test: (s) => s.q.quality >= 65 && s.pe > 0 && s.pe <= 35,
    sort: (a, b) => (b.q.quality ?? 0) + (b.q.value ?? 0) - ((a.q.quality ?? 0) + (a.q.value ?? 0)),
  },
  {
    key: 'growth', name: 'Fast growers',
    about: 'Sales growing 15% a year or more. Growth can drive big gains, but these often cost more and swing harder.',
    test: (s) => s.revenueGrowth >= 15,
    sort: (a, b) => b.revenueGrowth - a.revenueGrowth,
  },
  {
    key: 'cheap', name: 'Cheap vs. profits',
    about: 'Profitable companies with a P/E under 18: the price is low compared with what they earn. Check why it’s cheap before buying.',
    test: (s) => s.pe > 0 && s.pe < 18 && s.netMargin > 5,
    sort: (a, b) => a.pe - b.pe,
  },
  {
    key: 'strong', name: 'Strong balance sheet',
    about: 'Little debt and plenty of short-term cash to pay bills. These tend to survive recessions better.',
    test: (s) => s.debtToEquity != null && s.debtToEquity < 0.6 && s.currentRatio >= 1.3 && s.netMargin > 0,
    sort: (a, b) => (b.q.health ?? 0) - (a.q.health ?? 0),
  },
  {
    key: 'beaten', name: 'Beaten down, still profitable',
    about: 'Down 10% or more over a year but still solidly profitable. Sometimes a bargain, sometimes falling for a good reason: read the news first.',
    test: (s) => s.return1y <= -10 && s.q.quality >= 55,
    sort: (a, b) => a.return1y - b.return1y,
  },
  {
    key: 'dividend', name: 'Dividend payers',
    about: 'Pay out 2.5% a year or more in cash dividends and are profitable. Steadier, slower-growing businesses.',
    test: (s) => s.dividendYield >= 2.5 && s.netMargin > 0,
    sort: (a, b) => b.dividendYield - a.dividendYield,
  },
];

export const SECTORS = [...new Set(UNIVERSE.map((u) => u[2]))];

// Apply a preset and the filters; returns the matching stocks, best first
export function runScreen(stocks, { preset = 'top', sector = '', maxPe = null } = {}) {
  const p = PRESETS.find((x) => x.key === preset) ?? PRESETS[0];
  return stocks
    .map((s) => (s.q ? s : { ...s, q: quickScore(s) }))
    .filter((s) => (!sector || s.sector === sector) && (maxPe == null || (s.pe > 0 && s.pe <= maxPe)))
    .filter((s) => { try { return p.test(s); } catch { return false; } })
    .sort(p.sort);
}

// ---------------------------------------------------------------------------
// Loading: one set of ~23 stocks at a time, pausing between fresh sets so
// the free Finnhub limit isn't hit. Saved on this device for 12 hours.
// ---------------------------------------------------------------------------

export function savedScreen() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE));
    return saved && Date.now() - saved.at < CACHE_MS && saved.complete ? saved : null;
  } catch {
    return null;
  }
}

// onUpdate({ stocks, loaded, total, waiting, demo, error })
export async function loadScreen({ onUpdate, signal }) {
  const saved = savedScreen();
  if (saved) return onUpdate({ stocks: saved.stocks, loaded: saved.stocks.length, total: UNIVERSE.length, demo: saved.demo });
  const stocks = [];
  for (let set = 0; ; set++) {
    if (signal.aborted) return;
    const started = Date.now();
    let res;
    try {
      res = await fetch(`/api/screen?set=${set}`, { headers: { Accept: 'application/json', ...passcodeHeaders() }, signal });
    } catch (err) {
      if (err.name === 'AbortError') return;
      res = null;
    }
    const isJson = res && (res.headers.get('content-type') || '').includes('json');
    if (!isJson || res.status === 503) {
      // No backend or no key: made-up numbers so the screen can be tried
      const demo = demoStocks();
      remember(demo, true);
      return onUpdate({ stocks: demo, loaded: demo.length, total: demo.length, demo: true });
    }
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) return onUpdate({ stocks, error: 'Open any stock and enter your passcode first.' });
    if (!res.ok) return onUpdate({ stocks, error: body.message || "Couldn't load the screener. Try again in a minute." });
    stocks.push(...body.stocks);
    const done = set + 1 >= body.sets;
    // A slow answer means it came fresh from Finnhub (not the cache): pause before the next batch
    const pause = !done && Date.now() - started > 1500 ? 30_000 : 0;
    onUpdate({ stocks: [...stocks], loaded: stocks.length, total: UNIVERSE.length, waiting: pause ? Math.round(pause / 1000) : 0 });
    if (done) { remember(stocks, false); return; }
    if (pause) await new Promise((resolve) => { const t = setTimeout(resolve, pause); signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true }); });
  }
}

function remember(stocks, demo) {
  try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), stocks, demo, complete: true })); } catch { /* storage full */ }
}

export function forgetScreen() {
  try { localStorage.removeItem(CACHE); } catch { /* blocked */ }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// view: { preset, sector, maxPe, stocks, loaded, total, waiting, demo, error }; onList: Set of tickers you have
export function discoverHTML(view, onList) {
  const p = PRESETS.find((x) => x.key === view.preset) ?? PRESETS[0];
  const results = view.stocks ? runScreen(view.stocks, view) : [];
  const chips = PRESETS.map((x) => `<button type="button" class="chip${x.key === p.key ? ' on' : ''}" data-preset="${x.key}">${x.name}</button>`).join('');
  const sectors = ['<option value="">All sectors</option>', ...SECTORS.map((s) => `<option value="${esc(s)}"${s === view.sector ? ' selected' : ''}>${esc(s)}</option>`)].join('');
  const loading = view.total && view.loaded < view.total
    ? `<p class="muted-line"><span class="spinner"></span>Loaded ${view.loaded} of ${view.total} stocks${view.waiting ? ` · next batch in ${view.waiting}s (keeps you inside the free data limit)` : '…'}</p>`
    : !view.stocks && !view.error ? '<p class="muted-line"><span class="spinner"></span>Loading stocks…</p>' : '';
  const LIMIT = 25;
  const shown = view.showAll ? results : results.slice(0, LIMIT);
  const rows = shown.map((s) => {
    const q = s.q;
    const g = (key) => `<td>${q[key] != null ? gradeHTML(grade(q[key])) : f.DASH}</td>`;
    return `<tr data-ticker="${esc(s.symbol)}" data-name="${esc(s.name)}" tabindex="0">
      <th scope="row" class="sticky"><span class="cmp-ticker">${esc(s.symbol)}</span>${onList.has(s.symbol) ? '<span class="on-list" title="On your list">★</span>' : ''}<span class="help">${esc(s.name)}</span></th>
      <td>${q.overall != null ? `${gradeHTML(q.grade)} <span class="cmp-sub">${q.overall}</span>` : f.DASH}</td>
      ${g('value')}${g('growth')}${g('quality')}${g('health')}${g('momentum')}
      <td>${f.times(s.pe)}</td>
      <td class="${f.tone(s.revenueGrowth)}">${f.pct(s.revenueGrowth)}</td>
      <td>${f.pct(s.netMargin, { sign: false })}</td>
      <td class="${f.tone(s.return1y)}">${f.pct(s.return1y)}</td>
      <td>${s.dividendYield ? f.pct(s.dividendYield, { sign: false, digits: 1 }) : f.DASH}</td>
      <td class="muted-cell">${esc(s.sector)}</td>
    </tr>`;
  }).join('');
  const heads = ['Stock', 'Quick score', 'Value', 'Growth', 'Quality', 'Health', 'Momentum', 'P/E', 'Rev. growth', 'Net margin', '1 year', 'Dividend', 'Sector'];
  return `
    <nav class="stock-nav scrolled" id="discover-nav">
      <button type="button" class="back-btn" data-action="back"><svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8"/></svg>Watchlist</button>
      <span class="nav-title">Discover</span>
      <button type="button" class="text-btn" data-action="refresh-screen">Refresh</button>
    </nav>
    <header class="discover-head">
      <h1>Discover</h1>
      <p class="muted-line">Ready-made screens across ${UNIVERSE.length} well-known US companies. Tap one to research it fully, then add it if you like it.</p>
    </header>
    ${view.demo ? '<div class="notice demo"><strong>Demo numbers.</strong> Real numbers appear once the app is on Vercel with your Finnhub key.</div>' : ''}
    <div class="preset-chips" role="tablist" aria-label="Screens">${chips}</div>
    <div class="card-plain preset-about"><p class="stat-label">${esc(p.name)}</p><p>${esc(p.about)}</p></div>
    <div class="screen-filters">
      <label class="sort-pick"><span>Sector</span><select data-filter="sector">${sectors}</select></label>
      <label class="sort-pick"><span>Max P/E</span><input data-filter="maxPe" inputmode="decimal" placeholder="Any" value="${view.maxPe ?? ''}" size="4"></label>
    </div>
    ${loading}
    ${view.error ? `<div class="card-plain error-card"><p>${esc(view.error)}</p></div>` : ''}
    ${view.stocks ? (results.length ? `
      <p class="muted-line result-count">${results.length} match${results.length === 1 ? '' : 'es'}${results.length > LIMIT && !view.showAll ? `, best ${LIMIT} shown` : ''}</p>
      <div class="card-plain table-card compare-card">
        <div class="table-wrap from-left"><table class="fin-table compare-table screen-table">
          <thead><tr>${heads.map((h, i) => `<th scope="col"${i === 0 ? ' class="sticky"' : ''}>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
      ${results.length > LIMIT && !view.showAll ? `<button type="button" class="text-btn show-all" data-action="show-all">Show all ${results.length}</button>` : ''}` : '<div class="card-plain empty-card"><p class="empty-title">No matches</p><p class="muted-line">Try another screen, or clear the sector and P/E filters.</p></div>') : ''}
    <p class="fineprint">Quick score uses each company's key numbers with the same rules as the app score (valuation, growth, profitability, health, momentum), but without the chart, DCF and analyst parts, so it can differ from the full score on the stock's page. A screen is a starting point for research, not a buy list.</p>`;
}

// Made-up but steady numbers for the preview
function demoStocks() {
  const rand = (seed, i) => {
    let h = 2166136261;
    for (const ch of seed + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return ((h >>> 0) % 10000) / 10000;
  };
  return UNIVERSE.map(([symbol, name, sector]) => {
    const r = (i, lo, hi) => lo + rand(symbol, i) * (hi - lo);
    return {
      symbol, name, sector,
      marketCap: r(1, 5e10, 3e12),
      pe: r(2, 8, 60), ps: r(3, 1, 20),
      revenueGrowth: r(4, -8, 40), epsGrowth: r(5, -20, 60), revenueGrowth5y: r(6, -2, 30),
      grossMargin: r(7, 20, 80), operatingMargin: r(8, 2, 45), netMargin: r(9, -2, 35), roe: r(10, 2, 60),
      debtToEquity: r(11, 0, 2.5), currentRatio: r(12, 0.7, 3), beta: r(13, 0.5, 1.8),
      dividendYield: rand(symbol, 14) > 0.55 ? r(15, 0.5, 5) : null,
      return6m: r(16, -30, 45), return1y: r(17, -35, 80),
    };
  });
}
