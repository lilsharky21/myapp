// GET /api/quote?symbol=AAPL
// The live price plus the basics about the company.

import { ok, fail, symbolFrom, MINUTE, DAY } from '../lib/http.js';
import { finnhub } from '../lib/finnhub.js';

export async function GET(request) {
  try {
    const symbol = symbolFrom(request);
    const [quote, profile] = await Promise.all([
      finnhub('/quote', { symbol }, 20_000),
      finnhub('/stock/profile2', { symbol }, DAY).catch(() => ({})),
    ]);
    // Finnhub answers an unknown ticker with all zeros
    if (!quote || (!quote.c && !quote.pc)) {
      return Response.json({ error: 'not_found', message: `No price found for ${symbol}.` }, { status: 404 });
    }
    return ok({
      symbol,
      price: quote.c,
      change: quote.d,
      changePct: quote.dp,
      open: quote.o,
      high: quote.h,
      low: quote.l,
      prevClose: quote.pc,
      time: quote.t ? quote.t * 1000 : Date.now(),
      name: profile.name || null,
      exchange: profile.exchange || null,
      industry: profile.finnhubIndustry || null,
      country: profile.country || null,
      currency: profile.currency || 'USD',
      marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : null,
      sharesOutstanding: profile.shareOutstanding ? profile.shareOutstanding * 1e6 : null,
      ipo: profile.ipo || null,
      website: profile.weburl || null,
      logo: profile.logo || null,
    }, { maxAge: 15, swr: MINUTE / 1000 });
  } catch (err) {
    return fail(err);
  }
}
