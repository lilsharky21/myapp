// News tab: headlines from the last 30 days and recent SEC filings.

import { f, esc, ratingStrip, skeletonBlock, errorHTML, emptyHTML } from '../ui.js';

export function newsTab(ctx) {
  const strip = ratingStrip(ctx, { factors: ['sentiment'], ai: 'news' });
  if (ctx.isLoading('news')) return strip + skeletonBlock(6);
  if (ctx.error('news')) return strip + errorHTML(ctx.error('news'));
  const n = ctx.news;

  let news;
  if (n.newsStatus === 'demo' || n.newsStatus === 'not_configured') {
    news = emptyHTML('Headlines', 'Live company news appears here once the Finnhub key is connected. Demo mode never invents headlines.');
  } else if (!n.news?.length) {
    news = emptyHTML('No news this month', 'No stories about this company in the last 30 days.');
  } else {
    news = `<div class="news-list">${n.news.map((item) => `
      <a class="news-item" href="${esc(item.url)}" target="_blank" rel="noopener">
        <p class="news-meta">${esc(item.source)} · ${f.ago(item.time)}</p>
        <h3>${esc(item.headline)}</h3>
        ${item.summary ? `<p class="news-sum">${esc(item.summary)}</p>` : ''}
      </a>`).join('')}</div>`;
  }

  const filings = n.filings?.length ? `
    <div class="card-plain">
      <ul class="filing-list">
        ${n.filings.map((fl) => `
          <li><a href="${esc(fl.url)}" target="_blank" rel="noopener">
            <span class="form-pill">${esc(fl.form)}</span>
            <span class="filing-text"><strong>${esc(fl.meaning)}</strong>${fl.description && !sameForm(fl.description, fl.form) ? `<span class="muted-line">${esc(fl.description)}</span>` : ''}</span>
            <span class="filing-date">${f.dateShort(fl.date + 'T12:00:00Z')}</span>
          </a></li>`).join('')}
      </ul>
    </div>` : emptyHTML('SEC filings', ctx.status('news') === 'demo' ? 'Filings appear here once the app is connected.' : 'No recent filings found.');

  return `${strip}
    <section class="block"><h2>Headlines <span class="h-sub">last 30 days</span></h2>${news}</section>
    <section class="block"><h2>SEC filings</h2>${filings}</section>`;
}

// "FORM 4" and "4" are the same thing, so don't repeat it
function sameForm(description, form) {
  return description.toUpperCase().replace(/^FORM\s*/, '') === form.toUpperCase();
}
