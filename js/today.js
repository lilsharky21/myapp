// ==========================================================================
// today.js: the "Today" card at the top of the watchlist.
// The big markets, the 11 sectors, what needs your attention (earnings
// coming up, ideas due for a review, big moves), and top headlines.
// ==========================================================================

import { passcodeHeaders } from './api.js';
import * as f from './format.js';
import { needsReview } from './journal.js';

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

// market: the loadMarket result. ideas: your ideas. quotes: Map ticker -> live quote
export function todayHTML(market, { ideas, quotes }) {
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
  rows.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
  return `<div class="today-sub"><h3>For you</h3><div class="fy-list">${rows.map((r) => r[2]).join('')}</div></div>`;
}

function headlines(news) {
  if (!news?.length) return '';
  return `<div class="today-sub"><h3>Market headlines</h3><ul class="hl-list">${news.slice(0, 5).map((n) => `
    <li><a href="${esc(n.url)}" target="_blank" rel="noopener"><span class="hl-text">${esc(n.headline)}</span>
    <span class="hl-meta">${esc(n.source)} · ${f.ago(n.time)}</span></a></li>`).join('')}</ul></div>`;
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
