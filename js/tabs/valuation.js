// Valuation tab: what the business might be worth (a DCF you can adjust),
// what today's price assumes, other yardsticks, peers, and P/E over time.

import { f, esc, row, ratingStrip, skeletonBlock, errorHTML, emptyHTML, pick } from '../ui.js';
import { barChart, lineChart } from '../charts.js';
import { dcf, impliedGrowth, graham } from '../valuation.js';
import { median } from '../ratings.js';

export function valuationTab(ctx) {
  const strip = ratingStrip(ctx, { factors: ['valuation'], ai: 'valuation' });
  if (ctx.isLoading('financials') || ctx.isLoading('quote')) return strip + skeletonBlock(6);
  return strip + dcfBlock(ctx) + yardsticks(ctx) + peersBlock(ctx) + peHistory(ctx)
    + '<p class="fineprint">Valuation models are only as good as their inputs. Small changes in growth or discount rate move the answer a lot, so treat it as a range, not a number.</p>';
}

// ----- DCF -----

function dcfBlock(ctx) {
  if (ctx.error('financials')) return `<section class="block"><h2>Fair value (DCF)</h2>${errorHTML(ctx.error('financials'))}</section>`;
  const val = ctx.val;
  if (!val?.fcf || val.fcf <= 0 || !val.shares) {
    return `<section class="block"><h2>Fair value (DCF)</h2>${emptyHTML('A DCF needs positive free cash flow',
      val?.fcf != null ? `Free cash flow is ${f.money(val.fcf)}, so a cash-flow model doesn't work here. The yardsticks below still do.` : 'Free cash flow data isn\'t available for this company.')}</section>`;
  }
  const d = ctx.view.dcf;
  const slider = (key, label, min, max, step, value) => `
    <label class="slider" for="dcf-${key}">
      <span class="slider-top"><span>${label}</span><output id="dcf-${key}-out">${value}%</output></span>
      <input type="range" id="dcf-${key}" data-dcf="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
    </label>`;
  return `
    <section class="block">
      <div class="block-head"><h2>Fair value (DCF)</h2><button type="button" class="text-btn small" data-action="dcf-reset">Reset</button></div>
      <div class="card-plain dcf">
        <div id="dcf-out">${dcfResultHTML(ctx)}</div>
        <div class="sliders">
          ${slider('growth', 'Cash flow growth, years 1–5', -10, 40, 0.5, d.growth)}
          ${slider('discount', 'Discount rate (your required return)', 6, 15, 0.5, d.discount)}
          ${slider('terminal', 'Growth after year 10', 0, 4, 0.25, d.terminal)}
        </div>
        <p class="muted-line">Starts from free cash flow of <strong>${f.money(val.fcf)}</strong> (${esc(val.fcfSource)}), adds cash of ${f.money(val.cash)} and subtracts debt of ${f.money(val.debt)}, over ${f.count(val.shares)} shares. Growth fades from your year 1–5 rate to the long-run rate by year 10.</p>
      </div>
    </section>`;
}

// Also used to update just this part while you drag a slider
export function dcfResultHTML(ctx) {
  const val = ctx.val;
  const d = ctx.view.dcf;
  const price = ctx.q?.price;
  const inputs = { fcf: val.fcf, netCash: val.netCash, shares: val.shares, discount: d.discount, terminal: d.terminal };
  const result = dcf({ ...inputs, growth: d.growth });
  if (!result) return '<p class="error-text">The discount rate has to be higher than the long-run growth rate.</p>';
  const upside = price ? (result.perShare / price - 1) * 100 : null;
  const implied = price ? impliedGrowth(price, inputs) : null;
  const lo = Math.min(price, result.perShare) * 0.8;
  const hi = Math.max(price, result.perShare) * 1.15;
  const pos = (x) => ((x - lo) / (hi - lo)) * 100;
  return `
    <div class="dcf-top">
      <div><p class="stat-label">Estimated value</p><p class="dcf-value">${f.price(result.perShare)}</p><p class="muted-line">per share · price ${f.price(price)}</p></div>
      ${upside != null ? `<span class="pill ${f.tone(upside)}">${upside >= 0 ? `${f.pct(upside, { sign: false })} below value` : `${f.pct(-upside, { sign: false })} above value`}</span>` : ''}
    </div>
    <div class="dcf-scale">
      <span class="dcf-fill ${upside >= 0 ? 'up' : 'down'}" style="left:${Math.min(pos(price), pos(result.perShare))}%; width:${Math.abs(pos(result.perShare) - pos(price))}%"></span>
      <span class="dcf-mark price" style="left:${pos(price)}%"><em>Price</em></span>
      <span class="dcf-mark value" style="left:${pos(result.perShare)}%"><em>Value</em></span>
    </div>
    <p class="dcf-implied">${implied
      ? implied.bound === 'above' ? 'Today\'s price assumes more than 80% yearly cash-flow growth. That\'s a lot to live up to.'
        : implied.bound === 'below' ? 'Today\'s price assumes cash flow shrinks by 30% a year or more.'
          : `Today's price already assumes about <strong>${f.pct(implied.value, { sign: false })}</strong> yearly cash-flow growth for 5 years, at your discount rate.`
      : ''}</p>
    <p class="muted-line">${result.terminalShare.toFixed(0)}% of the value comes from after year 10, which is the least certain part.</p>`;
}

// ----- Other yardsticks -----

function yardsticks(ctx) {
  const m = ctx.fund?.metrics ?? {};
  const q = ctx.q;
  const val = ctx.val;
  const price = q?.price;
  const annual = ctx.fin?.annual;
  const quarterly = ctx.fin?.quarterly;
  const latest = (arr) => arr?.findLast((x) => x != null) ?? null;

  const eps = pick(m, 'epsTTM', 'epsExclExtraItemsTTM');
  const equity = latest(annual?.rows.equity);
  const shares = val?.shares;
  const bookPerShare = equity && shares ? equity / shares : null;
  const g = graham(eps, bookPerShare);
  const pe = pick(m, 'peTTM', 'peExclExtraTTM');
  const epsGrowth = pick(m, 'epsGrowth5Y', 'epsGrowthTTMYoy');
  const marketCap = q?.marketCap;
  const ev = marketCap != null && val ? marketCap + (val.debt ?? 0) - (val.cash ?? 0) : null;
  const lastFour = quarterly?.rows.ebitda?.slice(-4) ?? [];
  const ebitda = lastFour.length === 4 && lastFour.every((x) => x != null) ? lastFour.reduce((s, x) => s + x, 0) : latest(annual?.rows.ebitda);
  const lastRev = quarterly?.rows.revenue?.slice(-4) ?? [];
  const sales = lastRev.length === 4 && lastRev.every((x) => x != null) ? lastRev.reduce((s, x) => s + x, 0) : latest(annual?.rows.revenue);

  return `
    <section class="block">
      <h2>Other yardsticks</h2>
      <div class="card-plain">
        <dl class="rows">
          ${row('Graham number', g ? `${f.price(g)} <span class="pill small ${g >= price ? 'up' : 'down'}">${f.pct((g / price - 1) * 100)}</span>` : f.DASH, 'Benjamin Graham\'s ceiling for a careful investor: √(22.5 × EPS × book value per share)')}
          ${row('Earnings yield', pe > 0 ? f.pct(100 / pe, { sign: false }) : f.DASH, 'Earnings ÷ price, the flip side of P/E. Compare it with bond yields.')}
          ${row('Free cash flow yield', val?.fcf != null && marketCap ? f.pct((val.fcf / marketCap) * 100, { sign: false }) : f.DASH, 'Free cash flow ÷ market cap. The cash return if the company paid it all out.')}
          ${row('PEG ratio', pe > 0 && epsGrowth > 0 ? f.num(pe / epsGrowth) : f.DASH, 'P/E ÷ earnings growth rate. Around 1 is often called fair.')}
          ${row('EV / EBITDA', ev && ebitda > 0 ? f.times(ev / ebitda) : f.DASH, 'Enterprise value (market cap + debt − cash) ÷ operating profit before depreciation')}
          ${row('EV / Sales', ev && sales > 0 ? f.times(ev / sales) : f.DASH, 'Enterprise value ÷ revenue over the last 12 months')}
          ${row('Enterprise value', f.money(ev))}
        </dl>
      </div>
    </section>`;
}

// ----- Peers -----

function peersBlock(ctx) {
  if (ctx.isLoading('peers')) return `<section class="block"><h2>vs. peers</h2>${skeletonBlock(4)}</section>`;
  if (ctx.error('peers')) return `<section class="block"><h2>vs. peers</h2>${errorHTML(ctx.error('peers'))}</section>`;
  const peers = ctx.peers ?? [];
  if (!peers.length) return '';
  const m = ctx.fund?.metrics ?? {};
  const self = {
    symbol: ctx.idea.ticker,
    marketCap: ctx.q?.marketCap,
    pe: pick(m, 'peTTM', 'peExclExtraTTM'),
    ps: pick(m, 'psTTM'),
    revenueGrowth: pick(m, 'revenueGrowthTTMYoy'),
    grossMargin: pick(m, 'grossMarginTTM'),
    netMargin: pick(m, 'netProfitMarginTTM'),
    self: true,
  };
  const all = [self, ...peers];
  const med = (key) => median(peers.map((p) => p[key]));
  const cols = [
    ['Mkt cap', 'marketCap', f.money],
    ['P/E', 'pe', (x) => f.times(x)],
    ['P/S', 'ps', (x) => f.times(x)],
    ['Rev growth', 'revenueGrowth', (x) => f.pct(x)],
    ['Gross mgn', 'grossMargin', (x) => f.pct(x, { sign: false })],
    ['Net mgn', 'netMargin', (x) => f.pct(x, { sign: false })],
  ];
  const peChart = all.filter((p) => p.pe > 0);
  return `
    <section class="block">
      <h2>vs. peers</h2>
      <div class="card-plain table-card">
        <div class="table-wrap from-left">
          <table class="fin-table peers-table">
            <thead><tr><th scope="col">Company</th>${cols.map(([l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
            <tbody>
              ${all.map((p) => `<tr class="${p.self ? 'self' : ''}"><th scope="row">${esc(p.symbol)}${p.name && !p.self ? `<span class="help">${esc(p.name)}</span>` : ''}</th>${cols.map(([, k, fmt]) => `<td>${fmt(p[k])}</td>`).join('')}</tr>`).join('')}
              <tr class="median"><th scope="row">Peer median</th>${cols.map(([, k, fmt]) => `<td>${fmt(med(k))}</td>`).join('')}</tr>
            </tbody>
          </table>
        </div>
      </div>
      ${peChart.length > 1 ? `
        <div class="card-plain chart-block">
          <p class="stat-label">P/E compared</p>
          ${barChart({ labels: peChart.map((p) => p.symbol.replace('PEER ', '')), values: peChart.map((p) => p.pe), format: (x) => f.times(x), highlight: 0 })}
        </div>` : ''}
    </section>`;
}

// ----- P/E over time -----

function peHistory(ctx) {
  const series = ctx.fund?.metricSeries?.annual?.pe;
  if (!Array.isArray(series) || series.length < 3) return '';
  const points = series.filter((p) => p?.v > 0 && p.period).sort((a, b) => a.period.localeCompare(b.period)).slice(-10);
  if (points.length < 3) return '';
  const avg = points.reduce((s, p) => s + p.v, 0) / points.length;
  const now = pick(ctx.fund.metrics, 'peTTM', 'peExclExtraTTM');
  return `
    <section class="block">
      <h2>P/E over time</h2>
      <div class="card-plain chart-block">
        <div class="cb-head">
          <div><p class="stat-label">Now</p><p class="cb-value">${f.times(now)}</p></div>
          <div><p class="stat-label">${points.length}-year average</p><p class="cb-value">${f.times(avg)}</p></div>
        </div>
        ${lineChart({ series: [{ values: points.map((p) => p.v), cls: 'accent' }], labels: points.map((p) => `'${p.period.slice(2, 4)}`), height: 120, refs: [avg], format: (x) => `${x.toFixed(0)}×` })}
        <p class="muted-line">${now && avg ? (now > avg * 1.15 ? 'Pricier than its usual level.' : now < avg * 0.85 ? 'Cheaper than its usual level.' : 'Close to its usual level.') : ''} Year-end P/E from company filings.</p>
      </div>
    </section>`;
}
