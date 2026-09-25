// ==========================================================================
// record.js: "Your record", the top of the Closed tab.
// How good your calls have been: how often you called it, how your ideas
// did against the S&P 500 over the same dates, whether your high-conviction
// ideas really do better, and every lesson you wrote down.
// ==========================================================================

import * as f from './format.js';
import { VERDICTS, CONVICTION_WORDS } from './journal.js';

const esc = f.esc;

// r: trackRecord(...) from journal.js
export function recordHTML(r) {
  if (!r.count) return '';
  const stat = (label, value, tone = '', sub = '') => `<div class="rec-stat"><span class="stat-label">${label}</span>
    <span class="rec-value ${tone}">${value}</span>${sub ? `<span class="rec-sub">${sub}</span>` : ''}</div>`;
  const verdictBar = VERDICTS.map(([key, label]) => {
    const n = r.verdicts[key];
    return n ? `<span class="vb vb-${key}" style="flex:${n}" title="${label}: ${n}"></span>` : '';
  }).join('');
  const verdictLegend = VERDICTS.filter(([key]) => r.verdicts[key]).map(([key, label]) => `<span><i class="vb-dot vb-${key}"></i>${label} ${r.verdicts[key]}</span>`).join('');
  const maxAbs = Math.max(1, ...r.byConviction.map((c) => Math.abs(c.avgReturn ?? 0)));
  const conviction = r.byConviction.length > 1 ? `
    <div class="rec-block"><p class="stat-label">By conviction</p>
      ${r.byConviction.map((c) => `<div class="conv-row">
        <span class="conv-name">${CONVICTION_WORDS[c.level - 1]} <span class="muted">(${c.count})</span></span>
        <span class="conv-bar"><span class="${(c.avgReturn ?? 0) >= 0 ? 'pos' : 'neg'}" style="width:${Math.max(2, (Math.abs(c.avgReturn ?? 0) / maxAbs) * 100)}%"></span></span>
        <span class="conv-val ${f.tone(c.avgReturn)}">${f.pct(c.avgReturn)}</span></div>`).join('')}
      <p class="muted-line">${convictionTakeaway(r.byConviction)}</p>
    </div>` : '';
  const lessons = r.lessons.length ? `
    <details class="rec-block rec-lessons"${r.lessons.length <= 3 ? ' open' : ''}><summary class="stat-label">Your lessons (${r.lessons.length})</summary>
      <ul>${r.lessons.map((l) => `<li><span class="lesson-meta">${esc(l.ticker)} · ${f.dateShort(l.at)}</span>${esc(l.lesson)}</li>`).join('')}</ul>
    </details>` : '';
  return `
    <section class="record card-plain">
      <div class="block-head"><h2>Your record</h2><span class="muted-line">${r.count} closed idea${r.count === 1 ? '' : 's'}</span></div>
      <div class="rec-grid">
        ${stat('Called it', r.calledRate != null ? f.pct(r.calledRate, { sign: false, digits: 0 }) : f.DASH, '', 'of your closed ideas')}
        ${stat('Made money', r.winRate != null ? f.pct(r.winRate, { sign: false, digits: 0 }) : f.DASH, '', 'ended higher than they started')}
        ${stat('Average return', f.pct(r.avgReturn), f.tone(r.avgReturn))}
        ${stat('vs. S&P 500', r.avgVsMarket != null ? `${f.pct(r.avgVsMarket)}` : f.DASH, f.tone(r.avgVsMarket), r.beatMarket != null ? `beat it ${f.pct(r.beatMarket, { sign: false, digits: 0 })} of the time` : 'same dates')}
      </div>
      <div class="verdict-bar">${verdictBar}</div>
      <p class="legend">${verdictLegend}</p>
      <div class="rec-grid two">
        ${r.best ? stat('Best call', `${esc(r.best.idea.ticker)} <small class="${f.tone(r.best.ret)}">${f.pct(r.best.ret)}</small>`) : ''}
        ${r.worst ? stat('Worst call', `${esc(r.worst.idea.ticker)} <small class="${f.tone(r.worst.ret)}">${f.pct(r.worst.ret)}</small>`) : ''}
        ${r.avgDays != null ? stat('Average hold', `${Math.round(r.avgDays)} days`) : ''}
      </div>
      ${conviction}
      ${lessons}
    </section>`;
}

function convictionTakeaway(groups) {
  const sorted = [...groups].filter((g) => g.avgReturn != null).sort((a, b) => a.level - b.level);
  if (sorted.length < 2) return '';
  const low = sorted[0];
  const high = sorted.at(-1);
  if (high.avgReturn > low.avgReturn + 2) return 'Your high-conviction ideas have done better. Your confidence has been worth listening to.';
  if (high.avgReturn < low.avgReturn - 2) return 'Your high-conviction ideas have done worse so far. Worth asking what made you so sure.';
  return "So far, how sure you felt hasn't made much difference to how ideas turned out.";
}
