// ==========================================================================
// today.js: the "Today" card at the top of the watchlist.
// The big markets, the 11 sectors, what needs your attention (earnings
// coming up, ideas due for a review, big moves), and top headlines.
// ==========================================================================

import { passcodeHeaders } from './api.js';
import * as f from './format.js';
import { needsReview, recentAlerts } from './journal.js';
import { lineChart } from './charts.js';

const esc = f.esc;

// Returns { status: 'live' | 'demo' | 'locked' | 'error', data }
export async function loadMarket(symbols) {
  let res;
  try {
    res = await fetch(`/api/market?symbols=${encodeURIComponent(symbols.join(','))}`, { headers: { Accept: 'application/json', ...passcodeHeaders() } });
  } catch {
    return { status: 'demo', data: demoMarket(symbols) };
  }
  if (!(res.headers.get('content-type') || '').includes('json')) return { status: 'demo', data: demoMarket(symbols) };
  const body = await res.json().catch(() => ({}));
  if (res.status === 503) return { status: 'demo', data: demoMarket(symbols) };
  if (res.status === 401) return { status: 'locked' };
  if (!res.ok) return { status: 'error', message: body.message || "Couldn't load the markets." };
  return { status: 'live', data: body };
}

// US Treasury yields (api/rates.js). Returns the numbers, or null if unavailable.
export async function loadRates() {
  try {
    const res = await fetch('/api/rates', { headers: { Accept: 'application/json', ...passcodeHeaders() } });
    if (!(res.headers.get('content-type') || '').includes('json')) return demoRates();
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return demoRates();
  }
}

// market: the loadMarket result. ideas: your ideas. quotes: Map ticker -> live quote. rates: loadRates result
export function todayHTML(market, { ideas, quotes, rates, extra = '' }) {
  if (!market) {
    return '<div class="today-body"><div class="market-strip">' + '<div class="mk skeleton"><span class="sk-line"></span><span class="sk-line"></span></div>'.repeat(4) + '</div></div>';
  }
  if (market.status === 'locked') return '<p class="muted-line">Open any stock and enter your passcode to see the markets.</p>';
  if (market.status === 'error') return `<p class="muted-line">${esc(market.message)}</p>`;
  const d = market.data;
  return `<div class="today-body">
    ${market.status === 'demo' ? '<p class="muted-line demo-line">Demo numbers until the app is on Vercel with keys.</p>' : ''}
    <div class="market-strip" role="list">${d.markets.map(marketTile).join('')}</div>
    ${forYou(d, ideas, quotes)}
    ${extra}
    ${ratesHTML(rates)}
    ${sectorsHTML(d.sectors)}
    ${headlines(d.news)}
  </div>`;
}

function marketTile(m) {
  return `<div class="mk" role="listitem"${m.hint ? ` title="${esc(m.hint)}"` : ''}>
    <span class="mk-label">${esc(m.label)}</span>
    <span class="mk-price">${m.price >= 1000 ? f.count(m.price) : f.price(m.price)}</span>
    <span class="mk-chg ${f.tone(m.changePct)}">${f.pct(m.changePct, { digits: 2 })}</span>
  </div>`;
}

function sectorsHTML(sectors) {
  if (!sectors?.length) return '';
  const sorted = [...sectors].sort((a, b) => b.changePct - a.changePct);
  const cell = (s) => {
    // Stronger color for bigger moves (capped at ±2%)
    const strength = Math.min(1, Math.abs(s.changePct) / 2);
    return `<div class="sector ${s.changePct >= 0 ? 'pos' : 'neg'}" style="--s:${(0.12 + strength * 0.5).toFixed(2)}" title="${esc(s.symbol)}">
      <span class="sector-name">${esc(s.label)}</span><span class="sector-chg">${f.pct(s.changePct, { digits: 2 })}</span></div>`;
  };
  return `<div class="today-sub"><h3>Sectors today</h3>
    <div class="sectors">${sorted.map(cell).join('')}</div>
    <p class="fineprint">Money moving into or out of each part of the market. Leaders on top.</p></div>`;
}

function forYou(d, ideas, quotes) {
  const open = ideas.filter((i) => i.status !== 'closed');
  const rows = [];
  const byTicker = new Map(open.map((i) => [i.ticker, i]));
  for (const e of d.earnings ?? []) {
    const idea = byTicker.get(e.symbol);
    if (!idea) continue;
    const when = e.hour === 'bmo' ? 'before the open' : e.hour === 'amc' ? 'after the close' : '';
    const day = new Date(e.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    rows.push([0, e.date, `<button type="button" class="fy" data-open="${esc(idea.id)}"><span class="fy-icon cal" aria-hidden="true">◷</span>
      <span class="fy-text"><strong>${esc(e.symbol)}</strong> reports earnings ${day}${when ? `, ${when}` : ''}</span></button>`]);
  }
  for (const idea of ideas) {
    for (const a of recentAlerts(idea)) {
      rows.push([-1, a.firedAt, `<button type="button" class="fy" data-open="${esc(idea.id)}" data-tab="journal"><span class="fy-icon alert" aria-hidden="true">!</span>
        <span class="fy-text"><strong>${esc(idea.ticker)}</strong> went ${a.dir} ${f.price(a.price)}${a.label ? ` (${esc(a.label)})` : ''}, now ${f.price(quotes.get(idea.ticker)?.price ?? a.firedPrice)}. <span class="muted">${f.ago(Date.parse(a.firedAt))}</span></span></button>`]);
    }
  }
  for (const idea of open.filter((i) => needsReview(i))) {
    rows.push([1, idea.reviewBy, `<button type="button" class="fy" data-open="${esc(idea.id)}" data-tab="journal"><span class="fy-icon rev" aria-hidden="true">↻</span>
      <span class="fy-text"><strong>${esc(idea.ticker)}</strong> is due for a review. Does your thesis still hold?</span></button>`]);
  }
  for (const idea of open) {
    const q = quotes.get(idea.ticker);
    if (!q || Math.abs(q.changePct) < 3) continue;
    rows.push([2, String(-Math.abs(q.changePct)), `<button type="button" class="fy" data-open="${esc(idea.id)}" data-tab="news"><span class="fy-icon ${q.changePct > 0 ? 'up-bg' : 'down-bg'}" aria-hidden="true">${q.changePct > 0 ? '↑' : '↓'}</span>
      <span class="fy-text"><strong>${esc(idea.ticker)}</strong> is <span class="${f.tone(q.changePct)}">${f.pct(q.changePct)}</span> today. Check the news for why.</span></button>`]);
  }
  if (!rows.length) return '<div class="today-sub"><h3>For you</h3><p class="muted-line">Nothing needs you today: no earnings in the next two weeks, no reviews due, no big moves.</p></div>';
  rows.sort((a, b) => a[0] - b[0] || (a[0] === -1 ? b[1].localeCompare(a[1]) : a[1].localeCompare(b[1])));
  return `<div class="today-sub"><h3>For you</h3><div class="fy-list">${rows.map((r) => r[2]).join('')}</div></div>`;
}

// Interest rates: key yields, the change over a month, and the yield curve
function ratesHTML(r) {
  if (!r?.key?.length) return '';
  const tiles = r.key.map((k) => `
    <div class="rate">
      <span class="mk-label">${k.label === '3M' ? '3-month' : k.label === '2Y' ? '2-year' : k.label === '10Y' ? '10-year' : '30-year'}</span>
      <span class="mk-price">${k.yield.toFixed(2)}%</span>
      <span class="mk-chg rate-chg">${k.change == null ? '' : `${k.change > 0 ? '+' : k.change < 0 ? '−' : ''}${Math.abs(k.change).toFixed(2)} in a month`}</span>
    </div>`).join('');
  const curve = lineChart({
    series: [
      ...(r.monthAgo ? [{ values: alignCurve(r.curve, r.monthAgo.curve), cls: 'muted', dot: false }] : []),
      { values: r.curve.map((p) => p.yield), cls: 'accent' },
    ],
    labels: r.curve.map((p) => p.label),
    height: 110,
    format: (v) => `${v.toFixed(1)}%`,
  });
  const note = r.inverted
    ? `<p class="muted-line"><span class="pill small down">Inverted</span> The 2-year pays more than the 10-year. Historically that has often come before recessions (though not always, and timing varies a lot).</p>`
    : `<p class="muted-line">The 10-year pays ${Math.abs(r.spread2s10s ?? 0).toFixed(2)} points ${r.spread2s10s >= 0 ? 'more' : 'less'} than the 2-year. Rising rates usually weigh on stock prices, fast-growing companies most.</p>`;
  return `<div class="today-sub"><h3>Interest rates <span class="h-sub">US Treasury · ${f.dateShort(r.date + 'T12:00:00Z')}</span></h3>
    <div class="rates">${tiles}</div>
    <div class="curve"><p class="stat-label">Yield curve${r.monthAgo ? ' <span class="legend-inline"><i class="swatch accent"></i>Now <i class="swatch gray"></i>A month ago</span>' : ''}</p>${curve}</div>
    ${note}</div>`;
}

// Line up last month's curve with today's maturities
function alignCurve(now, before) {
  return now.map((p) => before.find((b) => b.label === p.label)?.yield ?? null);
}

function headlines(news) {
  if (!news?.length) return '';
  return `<div class="today-sub"><h3>Market headlines</h3><ul class="hl-list">${news.slice(0, 5).map((n) => `
    <li><a href="${esc(n.url)}" target="_blank" rel="noopener"><span class="hl-text">${esc(n.headline)}</span>
    <span class="hl-meta">${esc(n.source)} · ${f.ago(n.time)}</span></a></li>`).join('')}</ul></div>`;
}

function demoRates() {
  const curve = [['1M', 4.35], ['3M', 4.3], ['6M', 4.18], ['1Y', 4.02], ['2Y', 3.88], ['5Y', 3.92], ['10Y', 4.21], ['20Y', 4.6], ['30Y', 4.55]]
    .map(([label, y]) => ({ label, yield: y }));
  const monthAgo = curve.map((p) => ({ ...p, yield: p.yield + 0.12 }));
  return {
    date: new Date().toISOString().slice(0, 10), curve, monthAgo: { curve: monthAgo },
    key: ['3M', '2Y', '10Y', '30Y'].map((label) => ({ label, yield: curve.find((p) => p.label === label).yield, change: -0.12 })),
    spread2s10s: 0.33, inverted: false, demo: true,
  };
}

// Made-up but steady numbers for the preview
function demoMarket(symbols) {
  const wobble = (seed) => {
    let h = 0;
    for (const ch of seed + new Date().toDateString()) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return ((h % 1000) / 1000) * 3 - 1.2;
  };
  const markets = [['SPY', 'S&P 500', 598], ['QQQ', 'Nasdaq 100', 521], ['DIA', 'Dow', 431], ['IWM', 'Small caps', 224],
    ['VIXY', 'Fear gauge', 41], ['TLT', 'Long bonds', 91], ['GLD', 'Gold', 262], ['USO', 'Oil', 76], ['UUP', 'US dollar', 28.4],
    ['BINANCE:BTCUSDT', 'Bitcoin', 97250]].map(([symbol, label, price]) => ({ symbol, label, hint: '', price, changePct: wobble(symbol) }));
  const sectors = [['XLK', 'Tech'], ['XLC', 'Communication'], ['XLY', 'Consumer disc.'], ['XLP', 'Staples'], ['XLF', 'Financials'],
    ['XLV', 'Health care'], ['XLI', 'Industrials'], ['XLE', 'Energy'], ['XLB', 'Materials'], ['XLU', 'Utilities'], ['XLRE', 'Real estate']]
    .map(([symbol, label]) => ({ symbol, label, price: 100, changePct: wobble(symbol) }));
  const soon = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  return {
    markets,
    sectors,
    earnings: symbols.slice(0, 1).map((symbol) => ({ symbol, date: soon, hour: 'amc', epsEstimate: null })),
    news: [
      { headline: 'Stocks edge higher as investors weigh the next interest-rate decision', source: 'Demo', url: '#', time: Date.now() - 3_600_000 },
      { headline: 'Chipmakers lead gains after strong data-center demand', source: 'Demo', url: '#', time: Date.now() - 7_200_000 },
    ],
    at: Date.now(),
  };
}
