// ==========================================================================
// ui.js: small building blocks the stock page tabs share
// (rows, pills, grades, loading placeholders, the ratings strip).
// Each returns a piece of HTML as text.
// ==========================================================================

import * as f from './format.js';
import { FACTORS } from './ratings.js';

export const esc = f.esc;

export function row(label, value, help) {
  return `<div class="row-item"><dt>${label}${help ? `<span class="help">${help}</span>` : ''}</dt><dd>${value}</dd></div>`;
}

export function pill(text, tone = '', small = false) {
  return `<span class="pill${small ? ' small' : ''} ${tone || ''}">${text}</span>`;
}

// "A-" -> a colored letter grade
export function gradeHTML(letter, big = false) {
  const band = letter?.[0] === 'A' ? 'a' : letter?.[0] === 'B' ? 'b' : letter?.[0] === 'C' ? 'c' : letter === '—' ? 'none' : 'd';
  return `<span class="grade g-${band}${big ? ' big' : ''}">${letter ?? '—'}</span>`;
}

export const viewTone = (view) => (view === 'Positive' ? 'up' : view === 'Negative' ? 'down' : 'neutral');
export const ratingTone = (label) => (/buy/i.test(label) ? 'up' : /sell/i.test(label) ? 'down' : 'neutral');

export function skeletonBlock(lines) {
  return `<div class="card-plain skeleton" aria-label="Loading">${'<span class="sk-line"></span>'.repeat(lines)}</div>`;
}
export function errorHTML(message) {
  return `<div class="card-plain error-card"><p>${esc(message)}</p></div>`;
}
export function emptyHTML(title, text) {
  return `<div class="card-plain empty-card"><p class="empty-title">${title}</p><p class="muted-line">${text}</p></div>`;
}

export function dotsHTML(level, id) {
  const dots = [1, 2, 3, 4, 5].map((n) => `<span class="dot${n <= level ? ' on' : ''}"></span>`).join('');
  return `<span class="dots"${id ? ` id="${id}"` : ''} role="img" aria-label="Conviction ${level} of 5">${dots}</span>`;
}

export function pick(metrics, ...keys) {
  for (const k of keys) {
    const v = metrics?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export function quarterLabel(period) {
  const d = new Date(period + 'T12:00:00Z');
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} '${String(d.getUTCFullYear()).slice(2)}`;
}
export function monthLabel(period, short = false) {
  return new Date(period + 'T12:00:00Z').toLocaleString('en-US', { month: short ? 'short' : 'long', year: short ? undefined : 'numeric', timeZone: 'UTC' });
}
export function titleCase(name) {
  return String(name ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// A score from 0-100 drawn as a thin bar
export function scoreBar(score) {
  if (score == null) return '';
  const tone = score >= 65 ? 'up' : score >= 45 ? 'neutral' : 'down';
  return `<span class="score-bar ${tone}"><span style="width:${Math.max(3, score)}%"></span></span>`;
}

// ---------------------------------------------------------------------------
// The ratings strip at the top of each tab:
//   Wall Street · App (this tab's factor grades) · AI (this tab's view)
// ---------------------------------------------------------------------------

export function ratingStrip(ctx, { factors = [], ai = null }) {
  const c = ctx.consensus;
  const wallStreet = c
    ? `<span class="rs-value ${c.tone}">${c.label}</span>`
    : `<span class="rs-value muted">${ctx.isLoading('fundamentals') ? '…' : 'None'}</span>`;

  const grades = factors.map((key) => {
    const factor = ctx.score?.factors.find((x) => x.key === key);
    const name = FACTORS.find((x) => x.key === key)?.name ?? key;
    return `<span class="rs-grade">${factors.length > 1 ? `<span class="rs-sub">${name.replace('Financial health', 'Health')}</span>` : ''}${gradeHTML(factor?.grade ?? '—')}</span>`;
  }).join('');
  const appLabel = factors.length === 1 ? 'App grade' : 'App grades';

  let aiValue;
  const state = ctx.ai.state;
  const section = ai && ctx.ai.entry?.result.sections?.[ai];
  if (state === 'done' && ai === 'overall') {
    const r = ctx.ai.entry.result.rating;
    aiValue = `<span class="rs-value ${ratingTone(r)}">${r}</span>`;
  } else if (state === 'done' && section) {
    aiValue = `<span class="rs-value ${viewTone(section.view)}">${section.view}</span>`;
  } else if (state === 'running') {
    aiValue = '<span class="rs-value muted"><span class="spinner"></span>Thinking</span>';
  } else if (state === 'unavailable') {
    aiValue = '<button type="button" class="rs-run" data-goto="ratings">Set up</button>';
  } else {
    aiValue = `<button type="button" class="rs-run" data-action="run-ai">${state === 'error' ? 'Retry' : 'Run AI'}</button>`;
  }
  const aiName = ai && ai !== 'overall' ? 'AI view' : 'AI rating';

  const line = state === 'done' && section?.line
    ? `<p class="rs-line"><span class="ai-badge">AI</span>${esc(section.line)}</p>`
    : '';

  return `
    <div class="rating-strip">
      <button type="button" class="rs" data-goto="investors"><span class="rs-label">Wall Street</span>${wallStreet}</button>
      <button type="button" class="rs" data-goto="ratings"><span class="rs-label">${appLabel}</span><span class="rs-grades">${grades}</span></button>
      <div class="rs"><span class="rs-label">${aiName}</span>${aiValue}</div>
    </div>
    ${line}`;
}

// Words for the chart of the months
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export { f };
