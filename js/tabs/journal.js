// Journal tab: your own record for this stock. Dated notes (stamped with the
// price at that moment), trades you made, your position, thesis changes,
// reviews, and closing the idea with a verdict and a lesson.

import { f, esc, pill } from '../ui.js';
import { position, timeline, needsReview, ideaReturn, startPrice, isoDay, VERDICTS } from '../journal.js';

export function journalTab(ctx) {
  const idea = ctx.idea;
  if (idea.transient) {
    return `
      <section class="block">
        <div class="card-plain empty-card">
          <p class="empty-title">${esc(idea.ticker)} isn't on your watchlist</p>
          <p class="muted-line">Add it to keep dated notes, log trades and track how your call works out.</p>
          <button type="button" class="btn-primary" data-action="add-to-list">Add to Watchlist</button>
        </div>
      </section>`;
  }
  return reviewCard(ctx) + positionCard(ctx) + closedCard(ctx) + writeBlock(ctx) + timelineBlock(ctx);
}

function reviewCard(ctx) {
  const idea = ctx.idea;
  if (idea.status === 'closed') return '';
  const due = needsReview(idea);
  const when = f.dateLong(idea.reviewBy + 'T12:00:00Z');
  if (!due) {
    return `<p class="muted-line review-line">Next check-in: ${when}. <button type="button" class="text-btn small" data-action="reviewed">Reviewed now</button></p>`;
  }
  return `
    <section class="block">
      <div class="card-plain review-due">
        <p class="stat-label">Time to review</p>
        <p class="review-text">Re-read your thesis. Is it still true? Did anything in the news, earnings or price change your mind?</p>
        <div class="btn-row">
          <button type="button" class="btn-primary" data-action="reviewed">Still holds</button>
          <button type="button" class="text-btn" data-action="edit">Update thesis</button>
          <button type="button" class="text-btn" data-action="show-close">Close idea</button>
        </div>
      </div>
    </section>`;
}

function positionCard(ctx) {
  const pos = position(ctx.idea, ctx.q?.price ?? null);
  if (!pos) return '';
  const tile = (label, value, tone = '') => `<div class="pos-cell"><span class="stat-label">${label}</span><span class="pos-value ${tone}">${value}</span></div>`;
  return `
    <section class="block">
      <div class="block-head"><h2>Your position</h2></div>
      <div class="card-plain pos-grid">
        ${tile('Shares', f.num(pos.shares, pos.shares % 1 ? 3 : 0))}
        ${tile('Avg cost', pos.avgCost != null ? f.price(pos.avgCost) : f.DASH)}
        ${tile('Value', pos.value != null ? f.price(pos.value) : f.DASH)}
        ${tile('Unrealized', pos.unrealized != null ? `${signMoney(pos.unrealized)} <small>${f.pct(pos.unrealizedPct)}</small>` : f.DASH, f.tone(pos.unrealized))}
        ${tile('Realized', signMoney(pos.realized), f.tone(pos.realized))}
        ${tile('Total P/L', signMoney(pos.total), f.tone(pos.total))}
      </div>
    </section>`;
}

function closedCard(ctx) {
  const idea = ctx.idea;
  if (!idea.closed) return '';
  const c = idea.closed;
  const verdict = VERDICTS.find(([key]) => key === c.verdict);
  const ret = ideaReturn(idea, ctx.q?.price);
  const spy = benchReturn(ctx.bench, idea.createdAt, c.at);
  const tone = c.verdict === 'right' ? 'up' : c.verdict === 'wrong' ? 'down' : 'neutral';
  return `
    <section class="block">
      <div class="block-head"><h2>Closed</h2><button type="button" class="text-btn small" data-action="reopen">Reopen</button></div>
      <div class="card-plain">
        <div class="closed-head">${pill(verdict?.[1] ?? 'Closed', tone)}<span class="muted-line">${f.dateLong(c.at)}${c.exit != null ? ` at ${f.price(c.exit)}` : ''}</span></div>
        ${c.lesson ? `<p class="lesson"><span class="stat-label">Lesson</span>${esc(c.lesson)}</p>` : ''}
        <div class="closed-nums">
          <span>Your idea <strong class="${f.tone(ret)}">${f.pct(ret)}</strong></span>
          <span>S&amp;P 500, same dates <strong class="${f.tone(spy)}">${f.pct(spy)}</strong></span>
          ${ret != null && spy != null ? `<span>${ret >= spy ? 'Beat' : 'Lagged'} the market by <strong>${f.pct(Math.abs(ret - spy), { sign: false })}</strong></span>` : ''}
        </div>
      </div>
    </section>`;
}

function writeBlock(ctx) {
  const idea = ctx.idea;
  const price = ctx.q?.price;
  const priceHint = price ? price.toFixed(2) : '0.00';
  const closed = idea.status === 'closed';
  const verdicts = VERDICTS.map(([key, label, help], i) => `
    <label class="choice"><input type="radio" name="verdict" value="${key}"${i === 0 ? ' checked' : ''} data-keep="verdict-${key}">
      <span><strong>${label}</strong><small>${help}</small></span></label>`).join('');
  return `
    <section class="block">
      <div class="block-head"><h2>Journal</h2></div>
      <form class="card-plain journal-form" data-form="note">
        <textarea name="text" rows="3" data-keep="note" placeholder="What did you notice today? What changed your mind, or didn't?"></textarea>
        <div class="form-foot"><span class="muted-line">${price ? `Stamped with today's price, ${f.price(price)}` : 'Stamped with the date'}</span>
          <button type="submit" class="btn-primary small">Add Note</button></div>
      </form>

      ${closed ? '' : `
      <details class="card-plain journal-more"${ctx.view.journalOpen === 'trade' ? ' open' : ''} data-open-key="trade">
        <summary>Log a trade</summary>
        <form class="trade-form" data-form="trade">
          <div class="segmented tiny side-pick"><label><input type="radio" name="side" value="buy" checked data-keep="side-buy"><span>Bought</span></label><label><input type="radio" name="side" value="sell" data-keep="side-sell"><span>Sold</span></label></div>
          <div class="trade-fields">
            <label><span class="stat-label">Shares</span><input name="shares" inputmode="decimal" placeholder="10" autocomplete="off" data-keep="shares"></label>
            <label><span class="stat-label">Price</span><input name="price" inputmode="decimal" placeholder="${priceHint}" autocomplete="off" data-keep="price"></label>
            <label><span class="stat-label">Date</span><input name="date" type="date" value="${isoDay(Date.now())}" max="${isoDay(Date.now())}" data-keep="date"></label>
          </div>
          <p class="form-error" data-error="trade" hidden></p>
          <button type="submit" class="btn-primary small">Log Trade</button>
          <p class="muted-line">Just a record for you. The app never touches a real brokerage account.</p>
        </form>
      </details>

      <details class="card-plain journal-more"${ctx.view.journalOpen === 'close' ? ' open' : ''} data-open-key="close">
        <summary>Close this idea</summary>
        <form class="close-form" data-form="close">
          <p class="muted-line">How did it turn out? Being honest here is how you get better at picking.</p>
          <div class="choices">${verdicts}</div>
          <label class="field"><span class="stat-label">Lesson learned</span>
            <textarea name="lesson" rows="2" data-keep="lesson" placeholder="What would you do differently next time?"></textarea></label>
          <label class="field"><span class="stat-label">Exit price</span>
            <input name="exit" inputmode="decimal" placeholder="${priceHint}" autocomplete="off" data-keep="exit"></label>
          <p class="form-error" data-error="close" hidden></p>
          <button type="submit" class="btn-primary small">Close Idea</button>
        </form>
      </details>`}
    </section>`;
}

function timelineBlock(ctx) {
  const idea = ctx.idea;
  const price = ctx.q?.price;
  const since = (then) => (then > 0 && price && Math.abs(price - then) / then >= 0.0005 ? `<span class="since ${f.tone(price - then)}">${f.pct(((price - then) / then) * 100)} since</span>` : '');
  const del = (id) => `<button type="button" class="tl-del" data-action="delete-entry" data-id="${id}" aria-label="Delete">×</button>`;
  const items = timeline(idea).map((e) => {
    let body;
    let icon;
    if (e.kind === 'note') {
      icon = '✎';
      body = `<p class="tl-text">${esc(e.text).replace(/\n/g, '<br>')}</p>
        <p class="tl-meta">${e.price ? `at ${f.price(e.price)}` : ''} ${since(e.price)}</p>${del(e.id)}`;
    } else if (e.kind === 'trade') {
      icon = e.side === 'buy' ? '+' : '−';
      body = `<p class="tl-text"><strong>${e.side === 'buy' ? 'Bought' : 'Sold'} ${f.num(e.shares, e.shares % 1 ? 3 : 0)} shares</strong> at ${f.price(e.price)} <span class="muted">(${f.price(e.shares * e.price)})</span></p>
        <p class="tl-meta">${since(e.price)}</p>${del(e.id)}`;
    } else if (e.kind === 'thesis') {
      icon = '↺';
      body = `<p class="tl-text"><strong>Changed the thesis.</strong> Before:</p>
        <p class="tl-quote">${esc(e.thesis || '(none)')}${e.target != null ? ` · Target ${f.price(e.target)}` : ''}</p>`;
    } else if (e.kind === 'review') {
      icon = '✓';
      body = '<p class="tl-text">Reviewed. The thesis still holds.</p>';
    } else if (e.kind === 'closed') {
      icon = '■';
      const v = VERDICTS.find(([key]) => key === e.verdict);
      body = `<p class="tl-text"><strong>Closed: ${v?.[1] ?? ''}</strong>${e.exit != null ? ` at ${f.price(e.exit)}` : ''}</p>`;
    } else {
      icon = '★';
      const start = e.price ?? startPrice(idea);
      body = `<p class="tl-text">Started watching${e.price != null ? ` at ${f.price(e.price)}` : ''}.</p><p class="tl-meta">${since(start)}</p>`;
    }
    return `<li class="tl-item tl-${e.kind}"><span class="tl-icon" aria-hidden="true">${icon}</span>
      <div class="tl-body"><p class="tl-date">${f.dateLong(e.at)}</p>${body}</div></li>`;
  });
  return `
    <section class="block">
      <div class="block-head"><h2>Timeline</h2></div>
      <ol class="timeline card-plain">${items.join('')}</ol>
    </section>`;
}

function signMoney(v) {
  if (v == null) return f.DASH;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${f.price(Math.abs(v))}`;
}

// The S&P 500 (SPY) return between two dates, from daily prices
export function benchReturn(candles, fromIso, toIso) {
  if (!candles?.length) return null;
  const at = (iso) => {
    const t = Date.parse(iso) / 1000;
    let found = null;
    for (const c of candles) { if (c.t <= t) found = c; else break; }
    return found;
  };
  const a = at(fromIso);
  const b = at(toIso);
  return a && b && a !== b ? ((b.c - a.c) / a.c) * 100 : a && b ? 0 : null;
}
