// Investors tab: what Wall Street analysts say (and how that's changing),
// and what company insiders are doing with their own shares.

import { f, esc, ratingStrip, skeletonBlock, errorHTML, emptyHTML, monthLabel, titleCase } from '../ui.js';
import { stackedBars, lineChart } from '../charts.js';

const INSIDER_CODES = {
  P: ['Bought', 'up'], S: ['Sold', 'down'], M: ['Exercised options', ''], X: ['Exercised options', ''],
  A: ['Stock award', ''], F: ['Shares withheld for tax', ''], G: ['Gift', ''], D: ['Returned to company', ''], C: ['Converted', ''],
};
const KEYS = ['strongBuy', 'buy', 'hold', 'sell', 'strongSell'];
const NAMES = { strongBuy: 'Strong buy', buy: 'Buy', hold: 'Hold', sell: 'Sell', strongSell: 'Strong sell' };

export function investorsTab(ctx) {
  const strip = ratingStrip(ctx, { factors: ['sentiment'], ai: 'sentiment' });
  if (ctx.isLoading('fundamentals')) return strip + skeletonBlock(5);
  if (ctx.error('fundamentals')) return strip + errorHTML(ctx.error('fundamentals'));
  return strip + analysts(ctx) + insiders(ctx) + funds();
}

function analysts(ctx) {
  const recs = ctx.fund.recommendations ?? [];
  const latest = recs.at(-1);
  const c = ctx.consensus;
  if (!latest || !c) return `<section class="block"><h2>Wall Street analysts</h2>${emptyHTML('No analyst coverage', 'No analysts publish ratings on this stock in the free data.')}</section>`;
  const buyShare = recs.map((r) => {
    const total = KEYS.reduce((s, k) => s + (r[k] || 0), 0);
    return total ? ((r.strongBuy + r.buy) / total) * 100 : null;
  });
  return `
    <section class="block">
      <h2>Wall Street analysts</h2>
      <div class="card-plain">
        <div class="consensus">
          <span class="pill ${c.tone}">${c.label}</span>
          <p class="muted-line">Consensus of ${c.total} analysts · ${monthLabel(latest.period)}</p>
        </div>
        <div class="dist">
          ${KEYS.map((k) => (latest[k] ? `<span class="seg ${k}" style="flex:${latest[k]}" title="${NAMES[k]}: ${latest[k]}"></span>` : '')).join('')}
        </div>
        <dl class="dist-legend">
          ${KEYS.map((k) => `<div><dt><i class="swatch ${k}"></i>${NAMES[k]}</dt><dd>${latest[k] ?? 0}</dd></div>`).join('')}
        </dl>
        <p class="stat-label spaced">Last ${recs.length} months</p>
        ${stackedBars({ columns: recs, keys: KEYS, labels: recs.map((r) => monthLabel(r.period, true)) })}
      </div>
      <div class="card-plain chart-block">
        <div class="cb-head"><div><p class="stat-label">Share rating it a buy</p><p class="cb-value">${f.pct(buyShare.at(-1), { sign: false, digits: 0 })}</p></div>
          ${buyShare.length > 1 ? `<span class="pill ${f.tone(buyShare.at(-1) - buyShare[0])}">${f.pct(buyShare.at(-1) - buyShare[0], { digits: 0 })} pts <span class="pill-sub">in ${recs.length} months</span></span>` : ''}</div>
        ${lineChart({ series: [{ values: buyShare, cls: 'accent' }], labels: recs.map((r) => monthLabel(r.period, true)), height: 100, min: 0, max: 100, refs: [50], format: () => '50%' })}
      </div>
      <p class="fineprint">Analyst price targets aren't in the free data feed.</p>
    </section>`;
}

function insiders(ctx) {
  const trades = ctx.fund.insiders ?? [];
  let body;
  if (ctx.status('fundamentals') === 'demo') {
    body = emptyHTML('Insider trades', 'Real insider buys and sells appear here once live data is connected. Demo mode never invents people.');
  } else if (!trades.length) {
    body = emptyHTML('No insider trades', 'No executives or directors reported trades in the last 12 months.');
  } else {
    const buys = trades.filter((t) => t.transactionCode === 'P');
    const sells = trades.filter((t) => t.transactionCode === 'S');
    const value = (list) => list.reduce((s, t) => s + Math.abs(t.change) * (t.transactionPrice || 0), 0);
    body = `
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
              <div><p class="insider-name">${esc(titleCase(t.name))}</p><p class="muted-line">${f.dateShort(t.transactionDate + 'T12:00:00Z')} · ${what}</p></div>
              <div class="insider-amt"><p class="${tone}">${t.change > 0 ? '+' : '−'}${f.count(Math.abs(t.change))} sh</p>
              <p class="muted-line">${t.transactionPrice ? `at ${f.price(t.transactionPrice)}` : ''}</p></div>
            </li>`;
          }).join('')}
        </ul>
      </div>`;
  }
  return `<section class="block"><h2>Insider activity <span class="h-sub">last 12 months</span></h2>${body}</section>`;
}

function funds() {
  return `
    <section class="block">
      <h2>Big funds</h2>
      <div class="card-plain"><p class="muted-line">Hedge fund and institution holdings come from quarterly 13F filings, which aren't in the free data feeds yet. Activist and 5%+ stakes (13D/13G) show up under News → SEC filings.</p></div>
    </section>`;
}
