// GET /api/screen?set=0
// Key numbers for ~200 well-known US stocks (js/universe.js), for the Discover
// screener: business numbers (valuation, growth, margins, debt) for long-term
// screens, and price momentum (returns, strength vs. the S&P 500, distance from
// the 52-week high, volume) for swing and short-term screens.
// Two Finnhub calls per stock (key stats + price), in sets of 25, cached for
// hours, so screening stays inside the free limit (60 requests a minute).

import { ok, fail, guard, HOUR, MINUTE } from '../../lib/http.js';
import { finnhub } from '../../lib/finnhub.js';
import { UNIVERSE } from '../../js/universe.js';
export const SET_SIZE = 25;
export const SET_COUNT = Math.ceil(UNIVERSE.length / SET_SIZE);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function GET(request) {
  try {
    guard(request);
    const set = Number(new URL(request.url).searchParams.get('set') ?? 0);
    if (!Number.isInteger(set) || set < 0 || set >= SET_COUNT) {
      return Response.json({ error: 'bad_request', message: `set should be 0 to ${SET_COUNT - 1}.` }, { status: 400 });
    }
    const list = UNIVERSE.slice(set * SET_SIZE, (set + 1) * SET_SIZE);
    const stocks = [];
    // 5 stocks (10 calls) at a time: Finnhub also limits bursts (30 a second)
    for (let i = 0; i < list.length; i += 5) {
      const slice = list.slice(i, i + 5);
      const [metrics, quotes] = await Promise.all([
        Promise.allSettled(slice.map(([symbol]) => finnhub('/stock/metric', { symbol, metric: 'all' }, 24 * HOUR))),
        Promise.allSettled(slice.map(([symbol]) => finnhub('/quote', { symbol }, 30 * MINUTE))),
      ]);
      if (i === 0 && metrics[0].status === 'rejected' && ['not_configured', 'locked'].includes(metrics[0].reason?.code)) throw metrics[0].reason;
      metrics.forEach((r, k) => {
        const [symbol, name, sector] = slice[k];
        const m = r.status === 'fulfilled' ? r.value?.metric ?? {} : null;
        if (!m) return;
        const q = quotes[k].status === 'fulfilled' ? quotes[k].value ?? {} : {};
        const price = num(q.c) || null;
        const high52 = num(m['52WeekHigh']);
        const low52 = num(m['52WeekLow']);
        stocks.push({
          symbol, name, sector,
          marketCap: num(m.marketCapitalization) != null ? m.marketCapitalization * 1e6 : null,
          pe: num(m.peTTM) ?? num(m.peExclExtraTTM),
          ps: num(m.psTTM),
          revenueGrowth: num(m.revenueGrowthTTMYoy),
          epsGrowth: num(m.epsGrowthTTMYoy),
          revenueGrowth5y: num(m.revenueGrowth5Y),
          grossMargin: num(m.grossMarginTTM),
          operatingMargin: num(m.operatingMarginTTM),
          netMargin: num(m.netProfitMarginTTM),
          roe: num(m.roeTTM),
          debtToEquity: num(m['totalDebt/totalEquityQuarterly']) ?? num(m['totalDebt/totalEquityAnnual']),
          currentRatio: num(m.currentRatioQuarterly) ?? num(m.currentRatioAnnual),
          beta: num(m.beta),
          dividendYield: num(m.dividendYieldIndicatedAnnual),
          return6m: num(m['26WeekPriceReturnDaily']),
          return1y: num(m['52WeekPriceReturnDaily']),
          high52,
          low52,
          // Price and momentum, for swing and short-term screens
          price,
          changePct: num(q.dp),
          fromHigh: price && high52 ? ((price - high52) / high52) * 100 : null,
          fromLow: price && low52 ? ((price - low52) / low52) * 100 : null,
          return5d: num(m['5DayPriceReturnDaily']),
          return13w: num(m['13WeekPriceReturnDaily']),
          vsSpx4w: num(m['priceRelativeToS&P5004Week']),
          vsSpx13w: num(m['priceRelativeToS&P50013Week']),
          vsSpx26w: num(m['priceRelativeToS&P50026Week']),
          volumeRatio: num(m['10DayAverageTradingVolume']) && num(m['3MonthAverageTradingVolume'])
            ? m['10DayAverageTradingVolume'] / m['3MonthAverageTradingVolume'] : null,
          // Growth details, for medium-term screens
          epsGrowth5y: num(m.epsGrowth5Y),
          revenueGrowthQ: num(m.revenueGrowthQuarterlyYoy),
          epsGrowthQ: num(m.epsGrowthQuarterlyYoy),
          dividendGrowth5y: num(m.dividendGrowthRate5Y),
        });
      });
    }
    return ok({ set, sets: SET_COUNT, stocks, at: Date.now() }, { maxAge: 6 * 3600, swr: 24 * 3600 });
  } catch (err) {
    return fail(err);
  }
}
