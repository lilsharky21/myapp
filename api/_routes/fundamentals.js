// GET /api/fundamentals?symbol=AAPL
// Key stats (valuation, margins, growth), analyst ratings, earnings history,
// the next earnings date, and insider trades. All from Finnhub.

import { ok, fail, guard, symbolFrom, HOUR, DAY } from '../../lib/http.js';
import { finnhub, isoDay } from '../../lib/finnhub.js';

export async function GET(request) {
  try {
    guard(request);
    const symbol = symbolFrom(request);
    const today = new Date();
    const inDays = (n) => isoDay(new Date(today.getTime() + n * DAY));

    // Ask for everything at once. If one part fails, the rest still shows.
    const [metrics, recs, earnings, calendar, insiders] = await Promise.allSettled([
      finnhub('/stock/metric', { symbol, metric: 'all' }, 6 * HOUR),
      finnhub('/stock/recommendation', { symbol }, 6 * HOUR),
      finnhub('/stock/earnings', { symbol }, 6 * HOUR),
      finnhub('/calendar/earnings', { symbol, from: inDays(-1), to: inDays(120) }, HOUR),
      finnhub('/stock/insider-transactions', { symbol, from: inDays(-365) }, 6 * HOUR),
    ]);

    // If the key itself is missing, every part fails the same way
    if (metrics.status === 'rejected' && metrics.reason?.code === 'not_configured') throw metrics.reason;

    const value = (r) => (r.status === 'fulfilled' ? r.value : null);
    const next = value(calendar)?.earningsCalendar
      ?.filter((e) => e.date >= isoDay(today))
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    return ok({
      symbol,
      metrics: value(metrics)?.metric ?? null,
      // Short history of some metrics by quarter/year (P/E over time, margins, etc.)
      metricSeries: value(metrics)?.series ?? null,
      recommendations: (value(recs) ?? []).slice(0, 6).reverse(),
      earnings: (value(earnings) ?? []).slice(0, 8).reverse(),
      nextEarnings: next
        ? { date: next.date, hour: next.hour, epsEstimate: next.epsEstimate, revenueEstimate: next.revenueEstimate, quarter: next.quarter, year: next.year }
        : null,
      insiders: (value(insiders)?.data ?? []).slice(0, 60),
      missing: ['metrics', 'recommendations', 'earnings', 'calendar', 'insiders']
        .filter((_, i) => [metrics, recs, earnings, calendar, insiders][i].status === 'rejected'),
    }, { maxAge: 1800, swr: 3600 });
  } catch (err) {
    return fail(err);
  }
}
