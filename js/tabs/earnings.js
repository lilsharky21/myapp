// Earnings tab: next report, expected vs. reported EPS, quarter-by-quarter
// trends, and whether profits are backed by real cash.

import { f, row, ratingStrip, skeletonBlock, errorHTML, quarterLabel } from '../ui.js';
import { barChart, lineChart, dotPlot } from '../charts.js';

export function earningsTab(ctx) {
  const strip = ratingStrip(ctx, { factors: ['earnings'], ai: 'earnings' });
  if (ctx.isLoading('fundamentals')) return strip + skeletonBlock(5);
  if (ctx.error('fundamentals')) return strip + errorHTML(ctx.error('fundamentals'));
  const fund = ctx.fund;
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
  })() : '<div class="card-plain"><p class="muted-line">No earnings date announced yet.</p></div>';

  const reported = hist.filter((e) => e.actual != null && e.estimate != null);
  const beats = reported.filter((e) => e.actual >= e.estimate).length;
  const surprise = hist.length ? `
    <section class="block">
      <div class="block-head"><h2>Expected vs. reported EPS</h2>${reported.length ? `<span class="pill ${beats >= reported.length / 2 ? 'up' : 'down'}">Beat ${beats} of ${reported.length}</span>` : ''}</div>
      <div class="card-plain chart-block">
        ${dotPlot({ points: hist, labels: hist.map((e) => quarterLabel(e.period)), format: f.price })}
        <p class="legend"><span><i class="swatch ring"></i>Expected</span><span><i class="swatch up"></i>Beat</span><span><i class="swatch down"></i>Missed</span></p>
        <dl class="rows">
          ${hist.slice().reverse().map((e) => row(quarterLabel(e.period),
            `${f.price(e.actual)} <span class="muted">vs ${f.price(e.estimate)}</span> ${e.surprisePercent != null ? `<span class="pill small ${f.tone(e.surprisePercent)}">${f.pct(e.surprisePercent)}</span>` : ''}`)).join('')}
        </dl>
      </div>
    </section>` : '';

  const q = ctx.fin?.quarterly;
  const trend = q?.periods.length ? `
    <section class="block">
      <h2>Quarter by quarter</h2>
      <div class="card-plain chart-block">
        <div class="cb-head"><div><p class="stat-label">Revenue</p><p class="cb-value">${f.money(q.rows.revenue.findLast((v) => v != null))}</p></div>
          ${q.growth.revenue.at(-1) != null ? `<span class="pill ${f.tone(q.growth.revenue.at(-1))}">${f.pct(q.growth.revenue.at(-1))} <span class="pill-sub">vs. a year ago</span></span>` : ''}</div>
        ${barChart({ labels: q.periods.map((p) => p.label), values: q.rows.revenue, format: f.money })}
      </div>
      <div class="card-plain chart-block">
        <div class="cb-head"><div><p class="stat-label">EPS (diluted)</p><p class="cb-value">${f.price(q.rows.eps.findLast((v) => v != null))}</p></div>
          ${q.growth.eps.at(-1) != null ? `<span class="pill ${f.tone(q.growth.eps.at(-1))}">${f.pct(q.growth.eps.at(-1))} <span class="pill-sub">vs. a year ago</span></span>` : ''}</div>
        ${barChart({ labels: q.periods.map((p) => p.label), values: q.rows.eps, format: f.price })}
      </div>
    </section>` : ctx.isLoading('financials') ? skeletonBlock(3) : '';

  const a = ctx.fin?.annual;
  const conv = a?.ratios.cashConversion;
  const quality = conv?.some((v) => v != null) ? `
    <section class="block">
      <h2>Earnings quality</h2>
      <div class="card-plain chart-block">
        <div class="cb-head"><div><p class="stat-label">Operating cash flow ÷ net income</p><p class="cb-value">${f.num(conv.findLast((v) => v != null))}×</p></div></div>
        ${lineChart({ series: [{ values: conv, cls: 'accent' }], labels: a.periods.map((p) => p.label), height: 110, refs: [1], format: () => '1×' })}
        <p class="muted-line">Above 1× means profits come with real cash. Consistently below 1× can mean profits rely on accounting choices.</p>
      </div>
    </section>` : '';

  return `${strip}<section class="block"><h2>Upcoming</h2>${nextCard}</section>${surprise}${trend}${quality}`;
}
