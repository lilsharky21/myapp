// GET /api/peers?symbol=AAPL
// Similar companies (Finnhub's peer list) with their price, size,
// valuation, growth and margins, for side-by-side comparison.

import { ok, fail, guard, symbolFrom, MINUTE, HOUR, DAY } from '../../lib/http.js';
import { finnhub } from '../../lib/finnhub.js';

const MAX_PEERS = 6;

export async function GET(request) {
  try {
    guard(request);
    const symbol = symbolFrom(request);
    const list = await finnhub('/stock/peers', { symbol }, DAY);
    const tickers = (Array.isArray(list) ? list : []).filter((t) => t && t !== symbol).slice(0, MAX_PEERS);

    const peers = await Promise.all(tickers.map(async (peer) => {
      const [quote, metrics, profile] = await Promise.allSettled([
        finnhub('/quote', { symbol: peer }, 5 * MINUTE),
        finnhub('/stock/metric', { symbol: peer, metric: 'all' }, 6 * HOUR),
        finnhub('/stock/profile2', { symbol: peer }, DAY),
      ]);
      const q = quote.status === 'fulfilled' ? quote.value : {};
      const m = metrics.status === 'fulfilled' ? metrics.value?.metric ?? {} : {};
      const p = profile.status === 'fulfilled' ? profile.value ?? {} : {};
      return {
        symbol: peer,
        name: p.name || null,
        price: q.c || null,
        changePct: q.dp ?? null,
        marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : m.marketCapitalization ? m.marketCapitalization * 1e6 : null,
        pe: m.peTTM ?? m.peExclExtraTTM ?? null,
        ps: m.psTTM ?? null,
        pb: m.pbQuarterly ?? m.pbAnnual ?? null,
        revenueGrowth: m.revenueGrowthTTMYoy ?? null,
        grossMargin: m.grossMarginTTM ?? null,
        netMargin: m.netProfitMarginTTM ?? null,
        roe: m.roeTTM ?? null,
      };
    }));

    return ok({ symbol, peers: peers.filter((p) => p.price) }, { maxAge: 6 * 3600, swr: 12 * 3600 });
  } catch (err) {
    return fail(err);
  }
}
