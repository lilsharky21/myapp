// Financials tab: income statement, balance sheet and cash flow from SEC
// filings, with charts, health checks (Piotroski, Altman) and returns.

import { f, esc, ratingStrip, skeletonBlock, errorHTML, emptyHTML, gradeHTML } from '../ui.js';
import { barChart, lineChart } from '../charts.js';
import { piotroski, altmanZ } from '../ratings.js';

const STATEMENTS = [['income', 'Income'], ['balance', 'Balance sheet'], ['cashflow', 'Cash flow']];

export function financialsTab(ctx) {
  const v = ctx.view.fin;
  const strip = ratingStrip(ctx, { factors: ['growth', 'profitability', 'health'], ai: v.statement === 'balance' ? 'health' : v.statement === 'cashflow' ? 'profitability' : 'growth' });
  const controls = `
    <div class="fin-controls">
      <div class="segmented" style="--n:3; --i:${STATEMENTS.findIndex(([k]) => k === v.statement)}" data-control="statement">
        <span class="seg-thumb" aria-hidden="true"></span>
        ${STATEMENTS.map(([k, label]) => `<button type="button" data-value="${k}" aria-pressed="${k === v.statement}">${label}</button>`).join('')}
      </div>
      <div class="segmented" style="--n:2; --i:${v.basis === 'annual' ? 0 : 1}" data-control="basis">
        <span class="seg-thumb" aria-hidden="true"></span>
        <button type="button" data-value="annual" aria-pressed="${v.basis === 'annual'}">Annual</button>
        <button type="button" data-value="quarterly" aria-pressed="${v.basis === 'quarterly'}">Quarterly</button>
      </div>
    </div>`;

  if (ctx.isLoading('financials')) return strip + controls + skeletonBlock(6);
  if (ctx.error('financials')) return strip + controls + errorHTML(ctx.error('financials'));

  const fin = ctx.fin;
  const data = fin[v.basis];
  if (!data?.periods.length) return strip + controls + emptyHTML('No statements found', 'This company has no 10-K or 10-Q data at the SEC.');

  const labels = data.periods.map((p) => p.label);
  const r = data.rows;
  const g = data.growth;
  const latest = (arr) => arr?.findLast((x) => x != null) ?? null;
  const growthWord = v.basis === 'annual' ? 'vs. last year' : 'vs. same quarter last year';

  const chartCard = (title, values, { format = f.money, growth, tone = 'accent' } = {}) => {
    if (!values?.some((x) => x != null)) return '';
    return `
      <div class="card-plain chart-block">
        <div class="cb-head">
          <div><p class="stat-label">${title}</p><p class="cb-value">${format(latest(values))}</p></div>
          ${growth != null ? `<span class="pill ${f.tone(growth)}">${f.pct(growth)} <span class="pill-sub">${growthWord}</span></span>` : ''}
        </div>
        ${barChart({ labels, values, format, tone })}
      </div>`;
  };
  const pctFmt = (x) => `${x.toFixed(0)}%`;

  let charts = '';
  if (v.statement === 'income') {
    charts = `
      ${chartCard('Revenue', r.revenue, { growth: latest(g.revenue) })}
      ${chartCard('Net income', r.netIncome, { growth: latest(g.netIncome) })}
      <div class="card-plain chart-block">
        <p class="stat-label">Margins</p>
        ${lineChart({ series: [
          { values: data.ratios.grossMargin, cls: 'accent' },
          { values: data.ratios.operatingMargin, cls: 'orange' },
          { values: data.ratios.netMargin, cls: 'purple' },
        ], labels, height: 140, refs: [0], format: pctFmt })}
        <p class="legend"><span><i class="swatch accent"></i>Gross ${f.pct(latest(data.ratios.grossMargin), { sign: false })}</span><span><i class="swatch orange"></i>Operating ${f.pct(latest(data.ratios.operatingMargin), { sign: false })}</span><span><i class="swatch purple"></i>Net ${f.pct(latest(data.ratios.netMargin), { sign: false })}</span></p>
      </div>
      ${chartCard('EPS (diluted)', r.eps, { format: f.price, growth: latest(g.eps) })}
      ${chartCard('EBITDA', r.ebitda)}`;
  } else if (v.statement === 'balance') {
    const cashAll = r.cash.map((c, i) => (c ?? 0) + (r.shortInvestments[i] ?? 0) || null);
    charts = `
      ${chartCard('Cash & short-term investments', cashAll)}
      ${chartCard('Long-term debt', r.longTermDebt, { tone: 'muted' })}
      ${chartCard("Shareholders' equity", r.equity)}
      <div class="card-plain chart-block">
        <p class="stat-label">Debt / equity</p>
        ${lineChart({ series: [{ values: data.ratios.debtToEquity, cls: 'accent' }], labels, height: 120, format: (x) => x.toFixed(1) })}
        <p class="muted-line">Latest ${f.num(latest(data.ratios.debtToEquity))}. Current ratio ${f.num(latest(data.ratios.currentRatio))}.</p>
      </div>`;
  } else {
    const returned = r.buybacks.map((b, i) => (b ?? 0) + (r.dividends[i] ?? 0) || null);
    charts = `
      ${chartCard('Free cash flow', r.freeCashFlow, { growth: latest(g.freeCashFlow) })}
      ${chartCard('Operating cash flow', r.operatingCashFlow)}
      ${chartCard('Returned to shareholders', returned, { tone: 'muted' })}
      ${chartCard('Stock-based compensation', r.sbc, { tone: 'muted' })}`;
  }

  const lines = fin.lines[v.statement];
  const table = `
    <div class="card-plain table-card">
      <div class="table-wrap">
        <table class="fin-table">
          <thead><tr><th scope="col">${v.basis === 'annual' ? 'Fiscal year' : 'Quarter ending'}</th>${labels.map((l) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
          <tbody>
            ${lines.map((line) => {
              const values = r[line.key] ?? [];
              if (!values.some((x) => x != null)) return '';
              const fmt = line.format === 'eps' ? f.price : line.format === 'shares' ? f.count : f.money;
              let html = `<tr><th scope="row">${line.label}</th>${values.map((x) => `<td>${fmt(x)}</td>`).join('')}</tr>`;
              if (line.key === 'revenue') {
                html += `<tr class="sub"><th scope="row">Growth</th>${g.revenue.map((x) => `<td class="${f.tone(x)}">${f.pct(x)}</td>`).join('')}</tr>`;
              }
              return html;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  const source = ctx.status('financials') === 'demo'
    ? 'Demo numbers.'
    : `From ${esc(fin.name)}'s SEC filings (10-K and 10-Q). Single quarters that aren't reported on their own, like Q4, are worked out from year-to-date totals.`;

  return `${strip}${controls}
    <div class="fin-charts">${charts}</div>
    ${table}
    ${returnsBlock(ctx, fin.annual)}
    ${healthBlock(ctx, fin.annual)}
    <p class="fineprint">${source}</p>`;
}

function returnsBlock(ctx, annual) {
  if (!annual?.periods.length) return '';
  const labels = annual.periods.map((p) => p.label);
  const latest = (arr) => arr?.findLast((x) => x != null) ?? null;
  if (!annual.ratios.roe.some((x) => x != null)) return '';
  return `
    <section class="block">
      <h2>Returns on capital <span class="h-sub">yearly</span></h2>
      <div class="card-plain chart-block">
        ${lineChart({ series: [{ values: annual.ratios.roe, cls: 'accent' }, { values: annual.ratios.roic, cls: 'orange' }], labels, height: 130, refs: [0], format: (x) => `${x.toFixed(0)}%` })}
        <p class="legend"><span><i class="swatch accent"></i>Return on equity ${f.pct(latest(annual.ratios.roe), { sign: false })}</span><span><i class="swatch orange"></i>Return on invested capital ${f.pct(latest(annual.ratios.roic), { sign: false })}</span></p>
        <p class="muted-line">ROIC above about 10% for years usually means a real competitive advantage.</p>
      </div>
    </section>`;
}

function healthBlock(ctx, annual) {
  const fscore = piotroski(annual);
  const z = altmanZ(annual, ctx.q?.marketCap);
  if (!fscore && !z) return '';
  const fGrade = fscore ? (fscore.scaled >= 7 ? ['Strong', 'up'] : fscore.scaled >= 4 ? ['Average', 'neutral'] : ['Weak', 'down']) : null;
  return `
    <section class="block">
      <h2>Health checks</h2>
      <div class="health-grid">
        ${fscore ? `
          <div class="card-plain">
            <div class="cb-head"><div><p class="stat-label">Piotroski F-Score · ${fscore.year}</p><p class="cb-value">${fscore.score}<span class="muted small"> / ${fscore.known}</span></p></div><span class="pill ${fGrade[1]}">${fGrade[0]}</span></div>
            <ul class="checklist">
              ${fscore.checks.map((c) => `<li class="${c.pass === null ? 'na' : c.pass ? 'pass' : 'fail'}">${c.pass === null ? '–' : c.pass ? '✓' : '✗'}<span>${c.label}</span></li>`).join('')}
            </ul>
            <p class="muted-line">Nine yes/no checks on profits, debt and efficiency vs. the year before. 7–9 is strong.</p>
          </div>` : ''}
        ${z ? `
          <div class="card-plain">
            <div class="cb-head"><div><p class="stat-label">Altman Z-Score · ${z.year}</p><p class="cb-value">${z.z.toFixed(2)}</p></div><span class="pill ${z.tone}">${z.zone}</span></div>
            <div class="z-scale"><span class="z-mark" style="left:${Math.min(100, Math.max(0, (z.z / 6) * 100))}%"></span></div>
            <div class="range-labels"><span>Distress &lt; 1.8</span><span>Safe &gt; 3.0</span></div>
            <p class="muted-line">A bankruptcy early-warning score from working capital, retained earnings, operating profit, market value and sales. Built for industrial companies, so read it loosely for banks and software.</p>
          </div>` : ''}
      </div>
      ${ctx.score ? `<p class="muted-line spaced-line">These feed the app's Financial health grade: ${gradeHTML(ctx.score.factors.find((x) => x.key === 'health')?.grade)}</p>` : ''}
    </section>`;
}
