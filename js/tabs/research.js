// Research tab: the AI analyst's full note, written for a beginner.
// Bottom line first, then what it could be worth, prices to watch, each
// section in plain English, a checklist, and what to research next.

import { f, esc, pill, viewTone, ratingTone, gradeHTML } from '../ui.js';
import { SECTIONS, readingMinutes } from '../ai.js';
import { setupBoxHTML, askMacHTML } from '../ai-setup.js';
import { sizerHTML } from './sizer.js';

const RISK_TONE = { Low: 'up', Medium: 'neutral', High: 'down', 'Very high': 'down' };
const THESIS_TONE = { Intact: 'up', Weakening: 'neutral', Broken: 'down' };

export function researchTab(ctx) {
  const ai = ctx.ai;
  if (ai.state !== 'done') return startCard(ctx);
  const r = ai.entry.result;
  return [
    r.version !== 2 ? '<p class="notice demo old-note">This note was written in the older, shorter format. Tap <strong>Run again</strong> for the full version.</p>' : '',
    bottomLine(ctx, r),
    brief(r),
    worth(ctx, r),
    levels(ctx, r),
    sections(ctx, r),
    checklist(ctx, r),
    changeView(r),
    forAndAgainst(r),
    approach(r),
    thesis(r),
    researchNext(r),
    glossary(r),
    `<p class="fineprint">Written by ${esc(ai.entry.engine)} ${f.ago(ai.entry.at)} from the data in this app${ai.entry.demo ? ' (demo numbers)' : ''}. Scenario values and price levels are calculated by the app; the stories, odds and opinions are the AI's. AI can misread numbers or miss context, so check anything important before acting. This is research, not personal financial advice.</p>`,
  ].join('');
}

// ----- Before the note exists -----

function startCard(ctx) {
  const ai = ctx.ai;
  let action;
  if (ai.state === 'running') {
    action = `<p class="big-rating muted"><span class="spinner"></span>Researching</p>
      <p class="muted-line" data-ai-progress>${esc(ai.progress)}</p>
      <button type="button" class="text-btn small" data-action="stop-ai">Stop</button>`;
  } else if (ai.state === 'unavailable') {
    action = setupBoxHTML(ai);
  } else {
    action = `
      ${ai.state === 'error' ? `<p class="error-text">${esc(ai.error)}</p>` : ''}
      <button type="button" class="btn-primary" data-action="run-ai" ${ctx.anyLoading() ? 'disabled' : ''}>${ctx.anyLoading() ? 'Waiting for data…' : ai.state === 'error' ? 'Try again' : 'Write my research note'}</button>
      ${ai.engines?.length ? `<p class="muted-line">Uses ${esc(ai.engines[0].label)}. Takes about a minute.</p>` : ''}`;
  }
  return `
    <section class="block">
      <div class="card-plain research-start">
        <p class="stat-label">AI research note</p>
        <h2 class="research-title">A full note on ${esc(ctx.idea.ticker)}, written for you</h2>
        <ul class="what-you-get">
          <li><strong>The bottom line:</strong> a clear rating, how risky it is, and why</li>
          <li><strong>What it could be worth</strong> in a bad, normal and great outcome</li>
          <li><strong>Prices to watch</strong> and what each one means</li>
          <li><strong>Every section in plain English</strong>, with what it means for you</li>
          <li><strong>A before-you-buy checklist</strong> and what would change the view</li>
          <li><strong>A check of your thesis</strong> and what to research next</li>
        </ul>
        ${action}
      </div>
    </section>`;
}

// ----- 1. Bottom line -----

function bottomLine(ctx, r) {
  const e = ctx.ai.entry;
  return `
    <section class="block">
      <div class="card-plain bottom-line">
        <div class="bl-top">
          <div>
            <p class="stat-label">AI rating</p>
            <p class="big-rating ${ratingTone(r.rating)}">${r.rating}</p>
          </div>
          <div class="bl-pills">
            <span class="pill ${RISK_TONE[r.riskLevel]}">${r.riskLevel} risk</span>
            <span class="confidence" title="How sure the AI is">
              <span class="conf-bar"><span style="width:${r.confidence}%"></span></span>${r.confidence}% confident
            </span>
          </div>
        </div>
        ${r.headline ? `<p class="bl-headline">${esc(r.headline)}</p>` : ''}
        <p class="bl-text">${esc(r.bottomLine || r.summary)}</p>
        ${r.riskWhy ? `<p class="muted-line"><strong>Why ${r.riskLevel.toLowerCase()} risk:</strong> ${esc(r.riskWhy)}</p>` : ''}
        <div class="bl-compare">
          ${compare('Wall Street', ctx.consensus?.label)}
          ${compare('App score', ctx.score?.overall != null ? `${ctx.score.label}` : null, ctx.score?.grade)}
          ${compare('AI', r.rating)}
        </div>
        <div class="bl-meta">
          <span>${readingMinutes(r)} min read · ${esc(e.engine)} · ${f.ago(e.at)}</span>
          ${ctx.ai.engines?.length === 0 ? (onPhone(ctx) ? '' : '<span>New notes are written on your Mac</span>') : '<button type="button" class="text-btn small" data-action="run-ai">Run again</button>'}
        </div>
        ${onPhone(ctx) ? askMacHTML(ctx.ai, { fresh: true }) : ''}
      </div>
    </section>`;
}

const onPhone = (ctx) => ctx.ai.diagnosis?.status === 'not-computer';

function compare(who, label, grade) {
  return `<div><span class="rc-label">${who}</span><span class="bl-val"><span class="${label ? ratingTone(label) : 'muted'}">${label ?? '—'}</span>${grade ? gradeHTML(grade) : ''}</span></div>`;
}

// ----- 2. The business in brief -----

function brief(r) {
  const text = r.snapshot;
  if (!text) return '';
  return `<section class="block"><h2>The business in brief</h2><div class="card-plain"><p class="prose">${esc(text)}</p></div></section>`;
}

// ----- 3. What it could be worth -----

function worth(ctx, r) {
  const s = ctx.scenarios;
  if (!s) return '';
  const price = ctx.q?.price;
  const odds = s.cases.map((c) => r.scenarios?.[c.key]?.odds ?? null);
  const oddsSum = odds.reduce((a, b) => a + (b ?? 0), 0);
  const weighted = oddsSum > 0 && odds.every((o) => o != null)
    ? s.cases.reduce((sum, c, i) => sum + c.value * (odds[i] / oddsSum), 0)
    : null;
  return `
    <section class="block">
      <h2>What it could be worth</h2>
      <div class="scenarios">
        ${s.cases.map((c, i) => {
          const story = r.scenarios?.[c.key]?.story;
          return `
            <div class="card-plain scenario ${c.key}">
              <p class="stat-label">${c.label}</p>
              <p class="sc-value">${f.price(c.value)}</p>
              <p class="sc-change ${f.tone(c.changePct)}">${f.pct(c.changePct)} vs. today</p>
              ${odds[i] != null ? `<div class="sc-odds"><span class="conf-bar"><span style="width:${odds[i]}%"></span></span>AI's odds ${odds[i]}%</div>` : ''}
              ${story ? `<p class="sc-story">${esc(story)}</p>` : ''}
              <p class="sc-assume">${esc(c.assumptions)}</p>
            </div>`;
        }).join('')}
      </div>
      ${weighted != null ? `<p class="weighted">Weighted by the AI's odds: <strong>${f.price(weighted)}</strong> <span class="${f.tone(weighted / price - 1)}">(${f.pct((weighted / price - 1) * 100)} vs. today's ${f.price(price)})</span></p>` : ''}
      <p class="fineprint">Values come from the app's ${s.method === 'DCF' ? 'cash-flow (DCF) model' : 'P/E model'} with the assumptions shown. They estimate what the business may be worth, not where the price will be on a date. <button type="button" class="link-btn" data-goto="valuation">Adjust the model</button></p>
    </section>`;
}

// ----- 4. Prices to watch -----

function levels(ctx, r) {
  const list = ctx.levels ?? [];
  if (!list.length) return '';
  return `
    <section class="block">
      <h2>Prices to watch</h2>
      <div class="card-plain">
        <ul class="ladder">
          ${list.map((l) => `
            <li class="${l.kind}">
              <span class="lad-dot"></span>
              <span class="lad-label">${l.label}</span>
              <span class="lad-price">${f.price(l.price)}</span>
              <span class="lad-dist ${l.kind === 'current' ? '' : f.tone(l.distancePct)}">${l.kind === 'current' ? '' : f.pct(l.distancePct)}</span>
            </li>`).join('')}
        </ul>
        ${r.levelsNote ? `<p class="prose small">${esc(r.levelsNote)}</p>` : ''}
        <p class="legend"><span><i class="swatch down"></i>Resistance (where rallies stalled)</span><span><i class="swatch up"></i>Support (where drops stopped)</span><span><i class="swatch accent"></i>Fair value</span><span><i class="swatch purple"></i>Moving average</span></p>
      </div>
      ${sizerHTML(ctx, { open: ctx.view.journalOpen === 'size' })}
    </section>`;
}

// ----- 5. Section by section -----

const FACTOR_FOR = { valuation: 'valuation', growth: 'growth', profitability: 'profitability', health: 'health', momentum: 'momentum', earnings: 'earnings', sentiment: 'sentiment' };
const TAB_FOR = { valuation: 'valuation', growth: 'financials', profitability: 'financials', health: 'financials', momentum: 'technicals', earnings: 'earnings', sentiment: 'investors', news: 'news' };

function sections(ctx, r) {
  const rows = SECTIONS.map(([key, name]) => {
    const s = r.sections[key];
    if (!s) return '';
    const factor = ctx.score?.factors.find((x) => x.key === FACTOR_FOR[key]);
    return `
      <div class="sec">
        <div class="sec-head">
          <button type="button" class="sec-name" data-goto="${TAB_FOR[key]}">${name}</button>
          <span class="sec-ratings">${factor ? gradeHTML(factor.grade) : ''}${pill(s.view, viewTone(s.view), true)}</span>
        </div>
        <p class="sec-line">${esc(s.line)}</p>
        ${s.meaning ? `<p class="sec-meaning"><span>What it means for you</span>${esc(s.meaning)}</p>` : ''}
      </div>`;
  }).join('');
  return `<section class="block"><h2>Section by section</h2><div class="card-plain sec-list">${rows}</div>
    <p class="fineprint">Letter = the app's grade. Pill = the AI's view. Tap a name to open that tab.</p></section>`;
}

// ----- 6. Before you buy -----

function checklist(ctx, r) {
  if (!r.beforeYouBuy.length) return '';
  const done = r.beforeYouBuy.filter((x) => ctx.checks.has(x)).length;
  return `
    <section class="block">
      <div class="block-head"><h2>Before you buy</h2><span class="muted-line" id="checks-done">${done} of ${r.beforeYouBuy.length} done</span></div>
      <div class="card-plain">
        <ul class="checks">
          ${r.beforeYouBuy.map((item, i) => `
            <li><label for="chk-${i}">
              <input type="checkbox" id="chk-${i}" data-check="${esc(item)}" ${ctx.checks.has(item) ? 'checked' : ''}>
              <span>${esc(item)}</span>
            </label></li>`).join('')}
        </ul>
        <p class="muted-line">Your ticks are saved on this device.</p>
      </div>
    </section>`;
}

// ----- 7. What would change the view -----

function changeView(r) {
  if (!r.upgradeIf.length && !r.downgradeIf.length) return '';
  const col = (title, items, tone) => `<div class="cv-col"><h3 class="case ${tone}">${title}</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  return `
    <section class="block">
      <h2>What would change the view</h2>
      <div class="card-plain change-view">
        ${col('More positive if', r.upgradeIf, 'up')}
        ${col('More negative if', r.downgradeIf, 'down')}
      </div>
    </section>`;
}

// ----- 8. The case for and against -----

function forAndAgainst(r) {
  const list = (title, items, cls = '') => (items.length ? `<div class="ai-list ${cls}"><h3>${title}</h3><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
  return `
    <section class="block">
      <h2>The case for and against</h2>
      <div class="card-plain">
        <div class="ai-lists">
          ${list('Bull case', r.bull, 'up')}
          ${list('Bear case', r.bear, 'down')}
          ${list('Risks', r.risks)}
          ${list('Catalysts', r.catalysts)}
          ${list('Numbers to track', r.watch)}
        </div>
      </div>
    </section>`;
}

// ----- 9. How investors often approach it -----

function approach(r) {
  if (!r.approach) return '';
  return `<section class="block"><h2>How investors often approach this</h2><div class="card-plain"><p class="prose">${esc(r.approach)}</p><p class="muted-line">General education, not a recommendation for you.</p></div></section>`;
}

// ----- 10. Your thesis -----

function thesis(r) {
  const t = r.thesis;
  return `
    <section class="block">
      <div class="block-head"><h2>Your thesis</h2><button type="button" class="text-btn small" data-action="edit">Edit thesis</button></div>
      <div class="card-plain">
        <span class="pill ${THESIS_TONE[t.status] ?? 'neutral'}">${t.status === 'No thesis' ? 'No thesis written yet' : `Thesis ${t.status.toLowerCase()}`}</span>
        ${t.line ? `<p class="prose">${esc(t.line)}</p>` : ''}
        ${t.suggestions.length ? `<p class="stat-label spaced">Make it sharper</p><ul class="plain-list">${t.suggestions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </div>
    </section>`;
}

// ----- 11. Research next -----

function researchNext(r) {
  if (!r.questions.length) return '';
  return `
    <section class="block">
      <h2>Research next</h2>
      <div class="card-plain">
        <p class="muted-line">Questions the numbers here can't answer, and where to look.</p>
        <ul class="plain-list">${r.questions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <p class="muted-line">The company's 10-K and 10-Q are linked under News → SEC filings.</p>
      </div>
    </section>`;
}

// ----- 12. Terms used -----

function glossary(r) {
  if (!r.glossary.length) return '';
  return `
    <details class="explain glossary">
      <summary>Terms used in this note</summary>
      <dl>${r.glossary.map((g) => `<div><dt>${esc(g.term)}</dt><dd>${esc(g.plain)}</dd></div>`).join('')}</dl>
    </details>`;
}
