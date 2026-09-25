// GET /api/search?q=apple
// Find a stock by name or ticker (Finnhub symbol search).

import { ok, fail, guard, DAY } from '../lib/http.js';
import { finnhub } from '../lib/finnhub.js';

export async function GET(request) {
  try {
    guard(request);
    const q = (new URL(request.url).searchParams.get('q') || '').trim();
    if (!q || q.length > 40 || !/^[\p{L}\p{N} .&'^=:\/-]+$/u.test(q)) {
      return Response.json({ error: 'bad_request', message: 'Type a company name or ticker.' }, { status: 400 });
    }
    const data = await finnhub('/search', { q }, DAY);
    const results = (data?.result ?? [])
      .filter((r) => r.symbol && r.description)
      .map((r) => ({ symbol: r.symbol, name: titleCase(r.description), type: r.type || '' }));
    // US listings first (no ".XX" exchange suffix), exact ticker match on top
    const upper = q.toUpperCase();
    const rank = (r) => (r.symbol === upper ? 0 : r.symbol.includes('.') ? 2 : 1);
    results.sort((a, b) => rank(a) - rank(b));
    return ok({ q, results: results.slice(0, 8) }, { maxAge: 86400, swr: 86400 });
  } catch (err) {
    return fail(err);
  }
}

// "NVIDIA CORP" -> "Nvidia Corp"
function titleCase(name) {
  return name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
