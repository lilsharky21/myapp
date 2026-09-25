// GET /api/screen?set=0   (sets 0-3)
// Key numbers for a built-in list of ~90 well-known US stocks across all
// 11 sectors, for the Discover screener. One Finnhub call per stock, in
// sets of about 23, and cached for 12 hours, so screening stays well inside
// the free limit (60 requests a minute).

import { ok, fail, guard, HOUR } from '../lib/http.js';
import { finnhub } from '../lib/finnhub.js';
import { UNIVERSE } from '../js/universe.js';
export const SET_SIZE = 23;
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
    // 8 at a time: Finnhub also limits bursts (30 a second)
    for (let i = 0; i < list.length; i += 8) {
      const chunk = await Promise.allSettled(list.slice(i, i + 8).map(([symbol]) => finnhub('/stock/metric', { symbol, metric: 'all' }, 12 * HOUR)));
      if (i === 0 && chunk[0].status === 'rejected' && ['not_configured', 'locked'].includes(chunk[0].reason?.code)) throw chunk[0].reason;
      chunk.forEach((r, k) => {
        const [symbol, name, sector] = list[i + k];
        const m = r.status === 'fulfilled' ? r.value?.metric ?? {} : null;
        if (!m) return;
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
          high52: num(m['52WeekHigh']),
          low52: num(m['52WeekLow']),
        });
      });
    }
    return ok({ set, sets: SET_COUNT, stocks, at: Date.now() }, { maxAge: 12 * 3600, swr: 24 * 3600 });
  } catch (err) {
    return fail(err);
  }
}
