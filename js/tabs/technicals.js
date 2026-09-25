// Technicals tab: trend, momentum, averages, volatility, levels,
// performance, vs. the S&P 500, risk, drawdowns and seasonality.

import { f, row, ratingStrip, skeletonBlock, errorHTML, emptyHTML, MONTHS } from '../ui.js';
import { lineChart, barChart, rangeBar } from '../charts.js';

export function technicalsTab(ctx) {
  const strip = ratingStrip(ctx, { factors: ['momentum'], ai: 'momentum' });
  if (ctx.isLoading('daily')) return strip + skeletonBlock(6);
  if (ctx.error('daily')) return strip + errorHTML(ctx.error('daily'));
  const t = ctx.tech;
  if (!t) return strip + emptyHTML('Not enough price history', 'Technicals need at least 60 trading days of prices.');

  const crossText = t.cross
    ? `<p class="note">${t.cross.kind === 'golden' ? 'Golden cross' : 'Death cross'} ${t.cross.daysAgo === 0 ? 'today' : `${t.cross.daysAgo} trading days ago`}: the 50-day average moved ${t.cross.kind === 'golden' ? 'above' : 'below'} the 200-day.</p>`
    : '';

  return `${strip}
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
        ${lineChart({ series: [{ values: t.series.rsi.slice(-126), cls: 'accent' }], min: 0, max: 100, band: [30, 70], refs: [30, 70], height: 110 })}
      </div>
      <div class="card-plain indicator">
        <div class="ind-head">
          <div><p class="ind-name">MACD (12, 26, 9)</p><p class="ind-value">${f.num(t.macd.value)} <span class="ind-sub">signal ${f.num(t.macd.signal)}</span></p></div>
          <span class="pill ${t.macd.tone}">${t.macd.state}</span>
        </div>
        <p class="ind-line">${t.macd.line}</p>
        ${lineChart({ series: [{ values: t.series.macd.line.slice(-126), cls: 'accent' }, { values: t.series.macd.signal.slice(-126), cls: 'orange' }], histogram: t.series.macd.hist.slice(-126), height: 120, refs: [0], format: () => '0' })}
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

    ${marketSection(ctx)}
    ${riskSection(ctx)}

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

    ${seasonSection(ctx)}

    <p class="fineprint">Worked out from daily closing prices. Technicals describe how the price has moved; they don't predict where it goes next.</p>`;
}

// vs. the S&P 500 over the past year
function marketSection(ctx) {
  const r = ctx.risk;
  if (!r?.relative) return ctx.isLoading('bench') ? `<section class="block"><h2>vs. the S&P 500</h2>${skeletonBlock(3)}</section>` : '';
  const labels = r.relative.times.map((t) => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }));
  return `
    <section class="block">
      <h2>vs. the S&P 500 <span class="h-sub">past year</span></h2>
      <div class="card-plain chart-block">
        <div class="versus">
          <div><p class="stat-label">${ctx.idea.ticker}</p><p class="cb-value ${f.tone(r.return1y)}">${f.pct(r.return1y)}</p></div>
          <div><p class="stat-label">S&P 500</p><p class="cb-value ${f.tone(r.benchReturn1y)}">${f.pct(r.benchReturn1y)}</p></div>
          <div><p class="stat-label">Difference</p><p class="cb-value ${f.tone(r.relative1y)}">${f.pct(r.relative1y)}</p></div>
        </div>
        ${lineChart({ series: [{ values: r.relative.stock, cls: 'accent' }, { values: r.relative.bench, cls: 'muted' }], labels: thin(labels), height: 150, refs: [100], format: () => 'start' })}
        <p class="legend"><span><i class="swatch accent"></i>${ctx.idea.ticker}</span><span><i class="swatch gray"></i>S&P 500 (SPY)</span></p>
      </div>
    </section>`;
}

function riskSection(ctx) {
  const r = ctx.risk;
  if (!r) return '';
  const dd = r.drawdown;
  const ddLabels = r.drawdownTimes.map((t) => String(new Date(t * 1000).getUTCFullYear()));
  return `
    <section class="block">
      <h2>Risk</h2>
      <div class="card-plain">
        <dl class="rows">
          ${row('Beta (1 year)', f.num(r.beta), 'How much it moves when the market moves 1%. Above 1 swings harder than the market.')}
          ${row('Correlation with S&P 500', f.num(r.correlation), '1 = moves in lockstep, 0 = unrelated')}
          ${row('Sharpe ratio (1 year)', f.num(r.sharpe), 'Return per unit of risk, above a 4% cash rate. Above 1 is good.')}
          ${row('Sortino ratio (1 year)', f.num(r.sortino), 'Like Sharpe, but only counts downside swings')}
          ${row('Best day (1 year)', `<span class="up">${f.pct(r.bestDay.value)}</span> <span class="muted">${f.dateShort(r.bestDay.t * 1000)}</span>`)}
          ${row('Worst day (1 year)', `<span class="down">${f.pct(r.worstDay.value)}</span> <span class="muted">${f.dateShort(r.worstDay.t * 1000)}</span>`)}
          ${row('Up days (1 year)', f.pct(r.upDays, { sign: false, digits: 0 }))}
        </dl>
      </div>
      <div class="card-plain chart-block">
        <div class="cb-head">
          <div><p class="stat-label">Drawdown</p><p class="cb-value down">${f.pct(r.maxDrawdown.value)}</p>
          <p class="muted-line">Worst drop from a peak (5 years): ${f.dateShort(r.maxDrawdown.peakT * 1000)}, ${new Date(r.maxDrawdown.peakT * 1000).getUTCFullYear()} to ${f.dateShort(r.maxDrawdown.troughT * 1000)}, ${new Date(r.maxDrawdown.troughT * 1000).getUTCFullYear()}</p></div>
          <span class="pill ${r.fromAllTimeHigh > -5 ? 'up' : 'down'}">${f.pct(r.fromAllTimeHigh)} from high</span>
        </div>
        ${lineChart({ series: [{ values: dd, cls: 'down', dot: false }], labels: thin(ddLabels, true), height: 120, max: 0, refs: [0], format: () => '0%', area: true })}
      </div>
    </section>`;
}

function seasonSection(ctx) {
  const s = ctx.season;
  if (!s) return '';
  const now = new Date().getUTCMonth();
  const current = s[now];
  return `
    <section class="block">
      <h2>Seasonality</h2>
      <div class="card-plain chart-block">
        <p class="muted-line">Average return in each calendar month over the history we have.${current.count ? ` ${MONTHS[now]} was positive in ${current.positive} of ${current.count} years.` : ''}</p>
        ${barChart({ labels: MONTHS.map((m) => m[0]), values: s.map((x) => x.avg), format: (v) => f.pct(v), tone: 'accent', highlight: now })}
      </div>
    </section>`;
}

// Show only the first label of each month/year so the axis stays readable
function thin(labels, onlyChanges = false) {
  return labels.map((l, i) => (i === 0 || l !== labels[i - 1] ? l : onlyChanges ? '' : ''));
}
