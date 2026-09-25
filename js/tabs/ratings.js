// Ratings tab: Wall Street vs. the app's score vs. the AI analyst,
// every factor side by side, and the AI's full research note.

import { f, esc, gradeHTML, scoreBar, viewTone, ratingTone, pill } from '../ui.js';
import { FACTORS, RATING_ORDER } from '../ratings.js';
import { SECTIONS } from '../ai.js';

const AI_FOR_FACTOR = { valuation: 'valuation', growth: 'growth', profitability: 'profitability', health: 'health', momentum: 'momentum', earnings: 'earnings', sentiment: 'sentiment' };

export function ratingsTab(ctx) {
  return bigThree(ctx) + agreement(ctx) + factorTable(ctx) + aiReport(ctx) + method();
}

function bigThree(ctx) {
  const c = ctx.consensus;
  const s = ctx.score;
  const ai = ctx.ai;

  const wallStreet = c ? `
      <p class="big-rating ${c.tone}">${c.label}</p>
      <p class="muted-line">${c.total} analysts · average ${c.score.toFixed(2)} on a 1 (strong buy) to 5 (strong sell) scale</p>`
    : `<p class="big-rating muted">${ctx.isLoading('fundamentals') ? 'Loading…' : 'No coverage'}</p>`;

  const ring = s?.overall != null ? `
      <div class="score-ring ${s.tone}" style="--p:${s.overall}">
        <span class="ring-num">${s.overall}</span><span class="ring-of">/100</span>
      </div>` : '';
  const app = s?.overall != null ? `
      <div class="app-score">${ring}<div><p class="big-rating ${s.tone}">${s.label}</p><p class="muted-line">Grade ${gradeHTML(s.grade)} · ${s.coverage} of 7 factors scored</p></div></div>`
    : `<p class="big-rating muted">${ctx.anyLoading() ? 'Scoring…' : 'Not enough data'}</p>`;

  let aiBody;
  if (ai.state === 'done') {
    const r = ai.entry.result;
    aiBody = `
      <p class="big-rating ${ratingTone(r.rating)}">${r.rating}</p>
      <p class="muted-line">${r.confidence}% confident · ${esc(ai.entry.engine)} · ${f.ago(ai.entry.at)}</p>
      <button type="button" class="text-btn small" data-action="run-ai">Run again</button>`;
  } else if (ai.state === 'running') {
    aiBody = `<p class="big-rating muted"><span class="spinner"></span>Thinking</p><p class="muted-line" data-ai-progress>${esc(ai.progress || 'Reading every tab of data. This can take up to a minute.')}</p>
      <button type="button" class="text-btn small" data-action="stop-ai">Stop</button>`;
  } else if (ai.state === 'unavailable') {
    aiBody = `<p class="big-rating muted">Not set up</p>${setupHelp()}`;
  } else {
    aiBody = `
      ${ai.state === 'error' ? `<p class="error-text">${esc(ai.error)}</p>` : '<p class="muted-line">An AI analyst reads all the data on this page and gives its own rating, section by section.</p>'}
      <button type="button" class="btn-primary" data-action="run-ai" ${ctx.anyLoading() ? 'disabled' : ''}>${ctx.anyLoading() ? 'Waiting for data…' : ai.state === 'error' ? 'Try again' : 'Run AI research'}</button>
      ${ai.engines?.length ? `<p class="muted-line">Uses ${esc(ai.engines[0].label)}</p>` : ''}`;
  }

  return `
    <section class="block">
      <div class="three">
        <div class="card-plain rating-col"><p class="stat-label">Wall Street</p>${wallStreet}</div>
        <div class="card-plain rating-col"><p class="stat-label">App score</p>${app}</div>
        <div class="card-plain rating-col"><p class="stat-label">AI analyst</p>${aiBody}</div>
      </div>
    </section>`;
}

function setupHelp() {
  // Only this app's own address is allowed to talk to Ollama, not every website
  const origin = location.protocol.startsWith('http') && !location.hostname.endsWith('claude.ai') ? location.origin : 'https://YOUR-APP.vercel.app';
  return `<div class="setup-help">
    <p class="muted-line"><strong>On your Mac:</strong> install Ollama from ollama.com, then in Terminal run <code>ollama pull qwen3:14b</code>. Let this app talk to it with <code>launchctl setenv OLLAMA_ORIGINS "${esc(origin)}"</code> and restart Ollama.</p>
    <p class="muted-line"><strong>On your phone:</strong> add a free <code>GEMINI_API_KEY</code> from aistudio.google.com in Vercel's settings.</p>
  </div>`;
}

// One line on whether the three agree
function agreement(ctx) {
  const labels = [
    ['Wall Street', ctx.consensus?.label],
    ['the app', ctx.score?.overall != null ? ctx.score.label : null],
    ['the AI', ctx.ai.state === 'done' ? ctx.ai.entry.result.rating : null],
  ].filter(([, l]) => l && RATING_ORDER.includes(l));
  if (labels.length < 2) return '';
  const leans = labels.map(([who, l]) => [who, RATING_ORDER.indexOf(l) >= 3 ? 'bullish' : RATING_ORDER.indexOf(l) <= 1 ? 'bearish' : 'neutral']);
  const same = leans.every(([, lean]) => lean === leans[0][1]);
  const text = same
    ? `${labels.length === 3 ? 'All three' : 'Both'} lean ${leans[0][1]}.`
    : labels.map(([who, l]) => `${who[0].toUpperCase() + who.slice(1)} says ${l}`).join(', ') + '. They disagree, which is worth digging into.';
  return `<p class="agree ${same ? 'same' : 'split'}">${text}</p>`;
}

function factorTable(ctx) {
  const s = ctx.score;
  if (!s) return '';
  const aiDone = ctx.ai.state === 'done';
  return `
    <section class="block">
      <h2>Factor by factor</h2>
      <div class="card-plain factor-card">
        <div class="factor-head"><span></span><span>App</span><span>AI</span></div>
        ${s.factors.map((factor) => {
          const section = aiDone ? ctx.ai.entry.result.sections[AI_FOR_FACTOR[factor.key]] : null;
          return `
            <details class="factor">
              <summary>
                <span class="factor-name">${factor.name}<span class="factor-weight">${factor.weight}%</span></span>
                <span class="factor-app">${gradeHTML(factor.grade)}${scoreBar(factor.score)}</span>
                <span class="factor-ai">${section ? pill(section.view, viewTone(section.view), true) : '<span class="muted">—</span>'}</span>
              </summary>
              <div class="factor-body">
                <p class="muted-line">${factor.about}</p>
                ${factor.inputs.length ? `<dl class="inputs">${factor.inputs.map((x) => `
                  <div><dt>${x.label}${x.note ? `<span class="help">${x.note}</span>` : ''}</dt><dd>${x.value}</dd><dd class="in-score">${scoreBar(x.score)}<span>${x.score}</span></dd></div>`).join('')}</dl>`
                  : '<p class="muted-line">No data for this factor yet.</p>'}
                ${section?.line ? `<p class="rs-line"><span class="ai-badge">AI</span>${esc(section.line)}</p>` : ''}
              </div>
            </details>`;
        }).join('')}
      </div>
    </section>`;
}

function aiReport(ctx) {
  if (ctx.ai.state !== 'done') return '';
  const r = ctx.ai.entry.result;
  return `
    <section class="block">
      <button type="button" class="card-plain note-link" data-goto="research">
        <span class="stat-label">AI research note</span>
        <span class="note-link-text">${esc(r.headline || r.bottomLine || r.summary)}</span>
        <span class="note-link-cta">Read the full note →</span>
      </button>
    </section>`;
}

function method() {
  return `
    <details class="explain">
      <summary>How the app score works</summary>
      <p class="muted-line">Each factor is scored 0–100 from several measurements, using fixed rules you can see above (tap a factor). The overall score weights them: ${FACTORS.map((x) => `${x.name} ${x.weight}%`).join(', ')}. 75+ is Strong Buy, 62+ Buy, 45+ Hold, 33+ Sell, below that Strong Sell. At least 4 factors need data before there's an overall score. It's a consistent checklist, not a prediction.</p>
    </details>`;
}

export { SECTIONS };
