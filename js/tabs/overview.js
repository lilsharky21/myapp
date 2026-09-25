// Overview tab: the three ratings side by side, quick tiles, your thesis,
// key stats and company basics.

import { f, esc, row, pick, gradeHTML, ratingTone, dotsHTML, skeletonBlock, errorHTML } from '../ui.js';
import { rangeBar } from '../charts.js';
import { CONVICTION_WORDS } from '../journal.js';

export function overviewTab(ctx) {
  return ratingsCard(ctx) + tiles(ctx) + thesisCard(ctx) + keyStats(ctx) + about(ctx);
}

function ratingsCard(ctx) {
  const c = ctx.consensus;
  const s = ctx.score;
  const ai = ctx.ai;
  const aiBody = ai.state === 'done'
    ? `<span class="rc-value ${ratingTone(ai.entry.result.rating)}">${ai.entry.result.rating}</span><span class="rc-sub">${ai.entry.result.confidence}% confident</span>`
    : ai.state === 'running'
      ? '<span class="rc-value muted"><span class="spinner"></span>Thinking</span><span class="rc-sub">Reading the data…</span>'
      : ai.state === 'unavailable' && ai.diagnosis?.status === 'not-computer'
        ? (ai.job?.state === 'queued'
          ? '<span class="rc-value muted"><span class="spinner"></span>Asked</span><span class="rc-sub">Your Mac is on it</span>'
          : '<span class="rc-value muted">Not written</span><span class="rc-sub"><button type="button" class="rs-run" data-action="ask-mac">Ask my Mac</button></span>')
      : ai.state === 'unavailable'
        ? '<span class="rc-value muted">Not set up</span><span class="rc-sub">See Ratings tab</span>'
        : `<span class="rc-value muted">Not run</span><span class="rc-sub"><button type="button" class="rs-run" data-action="run-ai">${ai.state === 'error' ? 'Retry' : 'Run AI'}</button></span>`;
  return `
    <section class="block">
      <div class="block-head"><h2>Ratings</h2><button type="button" class="text-btn small" data-goto="ratings">Details</button></div>
      <div class="ratings-card">
        <button type="button" class="rc" data-goto="investors">
          <span class="rc-label">Wall Street</span>
          ${c ? `<span class="rc-value ${c.tone}">${c.label}</span><span class="rc-sub">${c.total} analysts</span>`
            : `<span class="rc-value muted">${ctx.isLoading('fundamentals') ? '…' : 'No coverage'}</span><span class="rc-sub">&nbsp;</span>`}
        </button>
        <button type="button" class="rc" data-goto="ratings">
          <span class="rc-label">App score</span>
          ${s?.overall != null ? `<span class="rc-value ${s.tone}">${s.label}</span><span class="rc-sub">${s.overall}/100 · ${gradeHTML(s.grade)}</span>`
            : `<span class="rc-value muted">${ctx.anyLoading() ? '…' : 'Not enough data'}</span><span class="rc-sub">&nbsp;</span>`}
        </button>
        <div class="rc">
          <span class="rc-label">AI analyst</span>
          ${aiBody}
        </div>
      </div>
      ${ai.state === 'done' ? bottomLineCard(ai.entry.result) : ''}
    </section>`;
}

// The AI's bottom line, with a way into the full note
function bottomLineCard(r) {
  const riskTone = { Low: 'up', Medium: 'neutral', High: 'down', 'Very high': 'down' }[r.riskLevel] ?? 'neutral';
  return `
    <button type="button" class="card-plain note-link overview-bl" data-goto="research">
      <span class="bl-row"><span class="ai-badge">AI</span><span class="stat-label">Bottom line</span>${r.riskLevel ? `<span class="pill small ${riskTone}">${r.riskLevel} risk</span>` : ''}</span>
      <span class="note-link-text">${esc(r.bottomLine || r.headline || r.summary)}</span>
      <span class="note-link-cta">Read the full research note →</span>
    </button>`;
}

function tiles(ctx) {
  const m = ctx.fund?.metrics ?? {};
  const t = ctx.tech;
  const next = ctx.fund?.nextEarnings;
  const revGrowth = pick(m, 'revenueGrowthTTMYoy', 'revenueGrowthQuarterlyYoy');
  const fair = ctx.dcfDefault && ctx.q ? (ctx.dcfDefault.perShare / ctx.q.price - 1) * 100 : null;
  const load = (key) => (ctx.error(key) ? f.DASH : '<span class="skeleton-text">Loading</span>');
  const tile = (label, value, tone, tab) => `<button type="button" class="tile" data-goto="${tab}">
      <span class="tile-label">${label}</span><span class="tile-value ${tone || ''}">${value}</span></button>`;
  return `
    <div class="tiles">
      ${tile('Trend', t ? t.trend.label : load('daily'), t?.trend.tone, 'technicals')}
      ${tile('DCF fair value', fair != null ? `${f.pct(fair)} ${fair >= 0 ? 'upside' : 'downside'}` : ctx.fin ? f.DASH : load('financials'), f.tone(fair), 'valuation')}
      ${tile('Next earnings', next ? f.dateShort(next.date + 'T12:00:00Z') : ctx.fund ? f.DASH : load('fundamentals'), '', 'earnings')}
      ${tile('Revenue growth', ctx.fund ? f.pct(revGrowth) : load('fundamentals'), f.tone(revGrowth), 'financials')}
    </div>`;
}

function thesisCard(ctx) {
  const idea = ctx.idea;
  const price = ctx.q?.price;
  let progress = '';
  if (idea.target != null && price) {
    const upside = ((idea.target - price) / price) * 100;
    const from = idea.entry ?? Math.min(price, idea.target) * 0.9;
    const pos = Math.max(0, Math.min(100, ((price - from) / (idea.target - from)) * 100));
    progress = `
      <div class="target">
        <div class="target-row">
          <span>Target <strong>${f.price(idea.target)}</strong></span>
          <span class="${f.tone(upside)}">${upside >= 0 ? `${f.pct(upside, { sign: false })} to go` : `${f.pct(-upside, { sign: false })} past target`}</span>
        </div>
        <div class="target-track"><span style="width:${upside <= 0 ? 100 : pos}%"></span></div>
        <div class="target-row small">
          <span>${idea.entry != null ? `Added at ${f.price(idea.entry)}` : 'No entry price'}</span>
          <span>${idea.entry != null ? `${f.pct(((price - idea.entry) / idea.entry) * 100)} since added` : ''}</span>
        </div>
      </div>`;
  }
  const check = ctx.ai.state === 'done' ? ctx.ai.entry.result.thesis : null;
  const checkTone = { Intact: 'up', Weakening: 'neutral', Broken: 'down' }[check?.status] ?? 'neutral';
  return `
    <section class="block">
      <div class="block-head"><h2>Your thesis</h2><button type="button" class="text-btn small" data-action="edit">Edit</button></div>
      <div class="card-plain thesis-card">
        <p class="thesis big${idea.thesis ? '' : ' empty'}">${esc(idea.thesis || 'No thesis yet. What has to be true for this to work?')}</p>
        <p class="conviction-line">${dotsHTML(idea.conviction)} ${CONVICTION_WORDS[idea.conviction - 1]} conviction</p>
        ${progress}
        ${check && check.status !== 'No thesis' ? `<div class="thesis-check"><span class="pill ${checkTone}">AI: thesis ${check.status.toLowerCase()}</span><p>${esc(check.line)}</p></div>` : ''}
        <div class="cases">
          <div><h3 class="case up">Bull case</h3><p>${esc(idea.bull) || '<span class="muted">Not written yet</span>'}</p></div>
          <div><h3 class="case down">Bear case</h3><p>${esc(idea.bear) || '<span class="muted">Not written yet</span>'}</p></div>
        </div>
      </div>
    </section>`;
}

function keyStats(ctx) {
  const fund = ctx.fund;
  const q = ctx.q;
  const m = fund?.metrics ?? {};
  const t = ctx.tech;
  const price = q?.price;
  if (!fund) {
    return `<section class="block"><h2>Key stats</h2>${ctx.error('fundamentals') ? errorHTML(ctx.error('fundamentals')) : skeletonBlock(4)}</section>`;
  }
  const marketCap = q?.marketCap ?? (m.marketCapitalization ? m.marketCapitalization * 1e6 : null);
  const avgVol = pick(m, '10DayAverageTradingVolume');
  const groups = [
    ['Valuation', [
      ['Market cap', f.money(marketCap), 'Share price × shares outstanding'],
      ['P/E (TTM)', f.times(pick(m, 'peTTM', 'peExclExtraTTM', 'peBasicExclExtraTTM')), 'Price ÷ earnings per share over the last 12 months'],
      ['P/S (TTM)', f.times(pick(m, 'psTTM')), 'Market cap ÷ revenue over the last 12 months'],
      ['P/B', f.times(pick(m, 'pbQuarterly', 'pbAnnual')), "Market cap ÷ the company's book value"],
      ['EV / FCF', f.times(pick(m, 'currentEv/freeCashFlowTTM')), 'Enterprise value ÷ free cash flow'],
      ['EPS (TTM)', f.price(pick(m, 'epsTTM', 'epsExclExtraItemsTTM', 'epsBasicExclExtraItemsTTM')), 'Profit per share over the last 12 months'],
    ]],
    ['Profitability', [
      ['Gross margin', f.pct(pick(m, 'grossMarginTTM'), { sign: false }), 'What is left of each sales dollar after the cost of making the product'],
      ['Operating margin', f.pct(pick(m, 'operatingMarginTTM'), { sign: false }), 'Profit from the core business per sales dollar'],
      ['Net margin', f.pct(pick(m, 'netProfitMarginTTM'), { sign: false }), 'Final profit per sales dollar'],
      ['Return on equity', f.pct(pick(m, 'roeTTM'), { sign: false }), "Profit ÷ shareholders' equity"],
      ['Return on assets', f.pct(pick(m, 'roaTTM'), { sign: false }), 'Profit ÷ total assets'],
      ['Return on investment', f.pct(pick(m, 'roiTTM'), { sign: false }), 'Profit ÷ invested capital'],
    ]],
    ['Growth', [
      ['Revenue (YoY)', f.pct(pick(m, 'revenueGrowthTTMYoy', 'revenueGrowthQuarterlyYoy')), 'Last 12 months vs. the 12 months before'],
      ['EPS (YoY)', f.pct(pick(m, 'epsGrowthTTMYoy')), 'Last 12 months vs. the 12 months before'],
      ['Revenue (5Y / yr)', f.pct(pick(m, 'revenueGrowth5Y')), 'Average yearly growth over 5 years'],
      ['EPS (5Y / yr)', f.pct(pick(m, 'epsGrowth5Y')), 'Average yearly growth over 5 years'],
    ]],
    ['Financial health', [
      ['Debt / equity', f.num(pick(m, 'totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual')), 'Total debt ÷ equity. Lower is safer.'],
      ['Current ratio', f.num(pick(m, 'currentRatioQuarterly', 'currentRatioAnnual')), 'Short-term assets ÷ short-term bills. Above 1 is comfortable.'],
      ['Quick ratio', f.num(pick(m, 'quickRatioQuarterly', 'quickRatioAnnual')), 'Like current ratio, without inventory'],
      ['Beta', f.num(pick(m, 'beta')), 'How much it swings vs. the market. 1 = same as the market.'],
    ]],
    ['Trading', [
      ['Dividend yield', f.pct(pick(m, 'dividendYieldIndicatedAnnual', 'currentDividendYieldTTM'), { sign: false, digits: 2 }), 'Yearly dividend ÷ share price'],
      ['Avg volume (10D)', avgVol != null ? f.count(avgVol * 1e6) : f.DASH, 'Shares traded per day, 10-day average'],
      ['Day range', q ? `${f.price(q.low)} – ${f.price(q.high)}` : f.DASH, "Today's low and high"],
      ['Open', f.price(q?.open), "Today's first trade"],
    ]],
  ];
  const high52 = pick(m, '52WeekHigh') ?? t?.range52.high;
  const low52 = pick(m, '52WeekLow') ?? t?.range52.low;
  return `
    <section class="block">
      <h2>Key stats</h2>
      <div class="card-plain">
        <p class="stat-label">52-week range</p>
        ${rangeBar({ low: low52, high: high52, value: price, lowLabel: f.price(low52), highLabel: f.price(high52) })}
      </div>
      <div class="stat-groups">
        ${groups.map(([title, rows]) => `
          <div class="card-plain stat-group">
            <h3>${title}</h3>
            <dl>${rows.map(([label, value, help]) => `<div title="${esc(help)}"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
          </div>`).join('')}
      </div>
      <details class="explain">
        <summary>What these mean</summary>
        <dl>${groups.flatMap(([, rows]) => rows).map(([label, , help]) => `<div><dt>${label}</dt><dd>${help}</dd></div>`).join('')}</dl>
      </details>
    </section>`;
}

function about(ctx) {
  const q = ctx.q;
  if (!q) return '';
  return `
    <section class="block">
      <h2>About</h2>
      <div class="card-plain">
        <dl class="rows">
          ${row('Company', esc(q.name || ctx.idea.company || f.DASH))}
          ${row('Industry', esc(q.industry || f.DASH))}
          ${row('Exchange', esc(q.exchange || f.DASH))}
          ${row('Country', esc(q.country || f.DASH))}
          ${row('Public since', q.ipo ? f.dateLong(q.ipo + 'T12:00:00Z') : f.DASH)}
          ${row('Shares outstanding', f.count(q.sharesOutstanding))}
          ${row('Website', q.website ? `<a href="${esc(q.website)}" target="_blank" rel="noopener">${esc(q.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : f.DASH)}
        </dl>
      </div>
    </section>`;
}
