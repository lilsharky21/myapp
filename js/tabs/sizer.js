// "How much should I buy?" A position size calculator.
// You pick how much of your account you're willing to lose if you're wrong
// (1% is a common rule), and the price where you'd admit you're wrong (your
// stop). It works out how many shares keeps that loss to your limit.

import { f } from '../ui.js';
import { sizePosition } from '../journal.js';

const KEY = 'thesis-journal/sizer';

export function sizerPrefs() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}
export function saveSizerPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* blocked */ }
}

// The nearest support below today's price (60-day low, 52-week low or an average)
export function defaultStop(levels, price) {
  const below = (levels ?? []).filter((l) => l.kind !== 'current' && l.kind !== 'value' && l.price < price * 0.99);
  return below.length ? below.reduce((a, b) => (b.price > a.price ? b : a)) : null;
}

export function sizerHTML(ctx, { open = false } = {}) {
  const price = ctx.q?.price;
  const prefs = sizerPrefs();
  const stop = price ? defaultStop(ctx.levels, price) : null;
  const values = {
    account: prefs.account ?? '',
    riskPct: prefs.riskPct ?? 1,
    entry: price ? price.toFixed(2) : '',
    stop: stop ? stop.price.toFixed(2) : price ? (price * 0.9).toFixed(2) : '',
  };
  return `
    <details class="card-plain journal-more sizer"${open ? ' open' : ''} data-open-key="size">
      <summary>How much should I buy?</summary>
      <form class="sizer-form" data-sizer>
        <p class="muted-line">Decide the most you'd lose if you're wrong, and the price where you'd admit it (your <strong>stop</strong>). The app works out how many shares keeps the loss to that. Many investors risk about 1% of their account on one idea.</p>
        <div class="trade-fields">
          <label><span class="stat-label">Account size</span><input name="account" inputmode="decimal" placeholder="$5,000" value="${values.account}" data-keep="sz-account"></label>
          <label><span class="stat-label">Risk %</span><input name="riskPct" inputmode="decimal" value="${values.riskPct}" data-keep="sz-risk"></label>
          <label><span class="stat-label">Buy at</span><input name="entry" inputmode="decimal" value="${values.entry}" data-keep="sz-entry"></label>
          <label><span class="stat-label">Stop</span><input name="stop" inputmode="decimal" value="${values.stop}" data-keep="sz-stop"></label>
        </div>
        ${stop ? `<p class="muted-line">Stop starts at the ${stop.label.toLowerCase()} (${f.price(stop.price)}), the nearest level where drops have stopped before.</p>` : ''}
        <div class="sizer-out" data-sizer-out>${sizerOutputHTML(values)}</div>
      </form>
    </details>`;
}

export function sizerOutputHTML(v) {
  const n = (x) => Number(String(x ?? '').replace(/[$,\s%]/g, ''));
  const r = sizePosition({ account: n(v.account), riskPct: n(v.riskPct), entry: n(v.entry), stop: n(v.stop) });
  if (!n(v.account)) return '<p class="muted-line">Type your account size to see the answer.</p>';
  if (!r) return '<p class="muted-line">The stop needs to be below the buy price.</p>';
  if (r.shares < 1) return `<p class="muted-line">With a stop ${f.pct(r.stopPct, { sign: false })} below, even 1 share would risk more than ${f.price(r.riskMoney)}. Try a closer stop or a smaller risk.</p>`;
  const warn = r.pctOfAccount > 25
    ? `<p class="muted-line warn-line">That's ${f.pct(r.pctOfAccount, { sign: false, digits: 0 })} of your account in one stock. Many investors cap a single stock at 10–20%, however tight the stop.</p>`
    : '';
  return `
    <div class="sizer-grid">
      <div><span class="stat-label">Buy</span><span class="pos-value">${r.shares} share${r.shares === 1 ? '' : 's'}</span></div>
      <div><span class="stat-label">Costs</span><span class="pos-value">${f.price(r.cost)}</span></div>
      <div><span class="stat-label">Of account</span><span class="pos-value">${f.pct(r.pctOfAccount, { sign: false })}</span></div>
      <div><span class="stat-label">Loss if stopped</span><span class="pos-value down">${f.price(r.lossAtStop)}</span></div>
    </div>
    <p class="muted-line">If it falls to your stop (${f.pct(r.stopPct, { sign: false })} down) and you sell, you lose about ${f.price(r.lossAtStop)}, within your ${f.price(r.riskMoney)} limit.</p>
    ${warn}`;
}
