// GET /api/news?symbol=AAPL
// Company news from the last 30 days (Finnhub) and recent SEC filings (EDGAR).

import { ok, fail, guard, symbolFrom, MINUTE, DAY } from '../lib/http.js';
import { finnhub, isoDay } from '../lib/finnhub.js';
import { lookupCompany, submissions, recentFilings } from '../lib/sec.js';

export async function GET(request) {
  try {
    guard(request);
    const symbol = symbolFrom(request);
    const now = Date.now();

    const [news, filings] = await Promise.allSettled([
      finnhub('/company-news', { symbol, from: isoDay(new Date(now - 30 * DAY)), to: isoDay(new Date(now)) }, 10 * MINUTE),
      lookupCompany(symbol).then((c) => (c ? submissions(c.cik).then((s) => recentFilings(s)) : [])),
    ]);

    const newsNotConfigured = news.status === 'rejected' && news.reason?.code === 'not_configured';
    return ok({
      symbol,
      news: news.status === 'fulfilled'
        ? dedupe(news.value).slice(0, 40).map((n) => ({
            headline: n.headline,
            summary: n.summary,
            source: n.source,
            url: n.url,
            time: n.datetime * 1000,
            image: n.image || null,
          }))
        : null,
      newsStatus: news.status === 'fulfilled' ? 'live' : newsNotConfigured ? 'not_configured' : 'error',
      filings: filings.status === 'fulfilled' ? filings.value : null,
    }, { maxAge: 300, swr: 600 });
  } catch (err) {
    return fail(err);
  }
}

// The same story often shows up from several outlets with the same headline
function dedupe(items) {
  const seen = new Set();
  return items
    .sort((a, b) => b.datetime - a.datetime)
    .filter((n) => {
      const key = n.headline?.toLowerCase().slice(0, 80);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
