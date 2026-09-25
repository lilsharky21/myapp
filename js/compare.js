// ==========================================================================
// compare.js: every idea in one table, so you can pick between them.
// Ranked by the app score by default; tap a column name to sort by it.
// The numbers are the ones saved the last time each stock was analyzed.
// Stocks that were never analyzed, or not in the last 12 hours, get
// analyzed in the background, one at a time (to stay inside free limits).
// ==========================================================================

import * as f from './format.js';
import { loadAndAnalyze, snapshot } from './analysis.js';
import { savedResearch } from './ai.js';
import { gradeHTML, ratingTone } from './ui.js';

const esc = f.esc;
const STALE_MS = 12 * 3_600_000;
const RATING_ORDER = { 'Strong Buy': 5, Buy: 4, Hold: 3, Sell: 2, 'Strong Sell': 1 };

export const COLUMNS = [
  ['ticker', 'Stock'],
  ['price', 'Price'],
  ['day', 'Today'],
  ['app', 'App score'],
  ['street', 'Street'],
  ['ai', 'AI'],
  ['pe', 'P/E'],
  ['growth', 'Rev. growth'],
  ['dcf', 'DCF value'],
  ['target', 'To target'],
  ['earnings', 'Earnings'],
  ['conviction', 'Conviction'],
];

// The number each column sorts by (null sorts last)
function sortValue(key, idea, q) {
  const r = idea.ratings ?? {};
  switch (key) {
    case 'ticker': return idea.ticker;
    case 'price': return q?.price ?? null;
    case 'day': return q?.changePct ?? null;
    case 'app': return r.app?.score ?? null;
    case 'street': return RATING_ORDER[r.wallStreet] ?? null;
    case 'ai': return RATING_ORDER[aiRating(idea)] ?? null;
    case 'pe': return r.pe > 0 ? -r.pe : null; // cheaper first
    case 'growth': return r.revenueGrowth ?? null;
    case 'dcf': return r.dcfUpside ?? null;
    case 'target': return targetUpside(idea, q);
    case 'earnings': return r.nextEarnings ? -Date.parse(r.nextEarnings) : null; // soonest first
    case 'conviction': return idea.conviction;
    default: return null;
  }
}

const aiRating = (idea) => savedResearch(idea.ticker)?.result.rating ?? idea.ratings?.ai ?? null;
const targetUpside = (idea, q) => (idea.target != null && q?.price ? ((idea.target - q.price) / q.price) * 100 : null);

export function sortIdeas(ideas, quotes, key, dir = -1) {
  return [...ideas].sort((a, b) => {
    const x = sortValue(key, a, quotes.get(a.ticker));
    const y = sortValue(key, b, quotes.get(b.ticker));
    if (x == null && y == null) return a.ticker.localeCompare(b.ticker);
    if (x == null) return 1;
    if (y == null) return -1;
    if (typeof x === 'string') return x.localeCompare(y) * (dir === -1 ? 1 : -1);
    return (y - x) * (dir === -1 ? 1 : -1);
  });
}

export function compareHTML(ideas, quotes, { key = 'app', dir = -1, busy = null } = {}) {
  if (!ideas.length) return '';
  const sorted = sortIdeas(ideas, quotes, key, dir);
  const head = COLUMNS.map(([k, label]) => `<th scope="col"${k === 'ticker' ? ' class="sticky"' : ''}>
    <button type="button" data-sort="${k}" aria-sort="${k === key ? (dir === -1 ? 'descending' : 'ascending') : 'none'}">${label}${k === key ? `<span class="sort-arrow">${dir === -1 ? '↓' : '↑'}</span>` : ''}</button></th>`).join('');
  const rows = sorted.map((idea) => {
    const q = quotes.get(idea.ticker);
    const r = idea.ratings ?? {};
    const ai = aiRating(idea);
    const up = targetUpside(idea, q);
    const cell = (html, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${html}</td>`;
    return `<tr data-id="${esc(idea.id)}" tabindex="0">
      <th scope="row" class="sticky"><span class="cmp-ticker">${esc(idea.ticker)}</span>${busy === idea.ticker ? '<span class="spinner"></span>' : ''}</th>
      ${cell(q ? f.price(q.price) : f.DASH)}
      ${cell(q ? f.pct(q.changePct) : f.DASH, f.tone(q?.changePct))}
      ${cell(r.app ? `${gradeHTML(r.app.grade)} <span class="cmp-sub">${r.app.score}</span>` : f.DASH)}
      ${cell(r.wallStreet ? `<span class="${ratingTone(r.wallStreet)}">${r.wallStreet}</span>` : f.DASH)}
      ${cell(ai ? `<span class="${ratingTone(ai)}">${ai}</span>` : f.DASH)}
      ${cell(f.times(r.pe))}
      ${cell(f.pct(r.revenueGrowth), f.tone(r.revenueGrowth))}
      ${cell(r.dcfUpside != null ? f.pct(r.dcfUpside) : f.DASH, f.tone(r.dcfUpside))}
      ${cell(up != null ? f.pct(up) : f.DASH, f.tone(up))}
      ${cell(r.nextEarnings ? f.dateShort(r.nextEarnings + 'T12:00:00Z') : f.DASH)}
      ${cell('●'.repeat(idea.conviction) + '<span class="dim">' + '●'.repeat(5 - idea.conviction) + '</span>', 'cmp-dots')}
    </tr>`;
  }).join('');
  return `
    <div class="card-plain table-card compare-card">
      <div class="table-wrap from-left"><table class="fin-table compare-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    </div>
    <p class="fineprint">DCF value: how far the price is from what the company's cash flows are worth (Valuation tab). To target: from today's price to your target. Tap a stock to open it.</p>`;
}

// Analyze stocks whose numbers are missing or old, one at a time.
// onStart(ticker) / onDone(idea, snapshot) keep the table up to date.
export async function refreshStale(ideas, { onStart, onDone, signal }) {
  const stale = ideas.filter((i) => !i.ratings?.app || i.ratings.demo || Date.now() - (i.ratings.at ?? 0) > STALE_MS);
  for (const [n, idea] of stale.entries()) {
    if (signal.aborted) return;
    onStart(idea.ticker);
    try {
      const { data, derived, demo } = await loadAndAnalyze(idea.ticker);
      if (signal.aborted) return;
      onDone(idea, snapshot(derived, { quote: data.quote, fund: data.fund, aiRating: aiRating(idea), demo }));
      // Real data: pause between stocks so the free Finnhub limit (60 a minute) isn't hit
      if (!demo && n < stale.length - 1) await wait(20_000, signal);
    } catch (err) {
      if (err.code === 'locked') return;
    }
  }
  onStart(null);
}

function wait(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}
