// ==========================================================================
// lib/finnhub.js: talks to Finnhub (quotes, company info, key metrics,
// analyst ratings, earnings, insider trades, news). Free key at finnhub.io.
// ==========================================================================

import { fetchJSON, needKey, cached } from './http.js';

const BASE = 'https://finnhub.io/api/v1';

// finnhub('/quote', { symbol: 'AAPL' }, 30_000) -> the JSON Finnhub sends back
export function finnhub(path, params = {}, ttlMs = 60_000) {
  const token = needKey('FINNHUB_API_KEY', 'Finnhub');
  const query = new URLSearchParams(params).toString();
  return cached(`finnhub:${path}?${query}`, ttlMs, () =>
    fetchJSON(`${BASE}${path}?${query}&token=${encodeURIComponent(token)}`),
  );
}

// "2026-09-25" for a Date
export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}
