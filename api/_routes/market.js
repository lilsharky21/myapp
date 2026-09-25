// GET /api/market?symbols=NVDA,COST
// The "Today" dashboard in one request: the big markets (stocks, bonds,
// gold, oil, dollar, bitcoin), the 11 sectors, upcoming earnings for your
// watchlist, and top market headlines. All from Finnhub.

import { ok, fail, guard, MINUTE, HOUR, DAY } from '../../lib/http.js';
import { finnhub, isoDay } from '../../lib/finnhub.js';

// Funds that track each market (Finnhub's free plan has funds, not raw indexes)
export const MARKETS = [
  ['SPY', 'S&P 500', 'The 500 biggest US companies'],
  ['QQQ', 'Nasdaq 100', 'Big tech-heavy companies'],
  ['DIA', 'Dow', '30 large US companies'],
  ['IWM', 'Small caps', '2,000 smaller US companies'],
  ['VIXY', 'Fear gauge', 'Rises when investors expect big swings'],
  ['TLT', 'Long bonds', 'Falls when interest rates rise'],
  ['GLD', 'Gold', ''],
  ['USO', 'Oil', ''],
  ['UUP', 'US dollar', 'The dollar vs other currencies'],
  ['BINANCE:BTCUSDT', 'Bitcoin', ''],
];
export const SECTORS = [
  ['XLK', 'Tech'], ['XLC', 'Communication'], ['XLY', 'Consumer disc.'], ['XLP', 'Staples'],
  ['XLF', 'Financials'], ['XLV', 'Health care'], ['XLI', 'Industrials'], ['XLE', 'Energy'],
  ['XLB', 'Materials'], ['XLU', 'Utilities'], ['XLRE', 'Real estate'],
];

export async function GET(request) {
  try {
    guard(request);
    const raw = new URL(request.url).searchParams.get('symbols') || '';
    const watch = [...new Set(raw.toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9.\-]{1,12}$/.test(s)))].slice(0, 40);

    const quote = async ([symbol, label, hint]) => {
      const q = await finnhub('/quote', { symbol }, 2 * MINUTE);
      return q?.c ? { symbol, label, hint: hint ?? '', price: q.c, change: q.d, changePct: q.dp } : null;
    };
    const today = new Date();
    const [markets, sectors, calendar, news] = await Promise.all([
      Promise.allSettled(MARKETS.map(quote)),
      Promise.allSettled(SECTORS.map(quote)),
      watch.length
        ? finnhub('/calendar/earnings', { from: isoDay(today), to: isoDay(new Date(today.getTime() + 14 * DAY)) }, HOUR).catch(() => null)
        : null,
      finnhub('/news', { category: 'general' }, 10 * MINUTE).catch(() => null),
    ]);
    const settled = (list) => list.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
    // A missing key fails every quote the same way: let the app show demo data
    const firstError = markets.find((r) => r.status === 'rejected')?.reason;
    if (firstError?.code === 'not_configured' || firstError?.code === 'locked') throw firstError;

    const mine = new Set(watch);
    return ok({
      markets: settled(markets),
      sectors: settled(sectors),
      earnings: (calendar?.earningsCalendar ?? [])
        .filter((e) => mine.has(e.symbol))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => ({ symbol: e.symbol, date: e.date, hour: e.hour || '', epsEstimate: e.epsEstimate ?? null })),
      news: (Array.isArray(news) ? news : []).slice(0, 8).map((n) => ({
        headline: n.headline, source: n.source, url: n.url, time: n.datetime * 1000,
      })),
      at: Date.now(),
    }, { maxAge: 120, swr: 300 });
  } catch (err) {
    return fail(err);
  }
}
