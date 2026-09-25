// ==========================================================================
// lib/http.js: small helpers every backend function uses.
// Code in lib/ runs on the server (Vercel), never in your browser,
// so it's safe for it to read secret API keys.
// ==========================================================================

// Fetch a URL and read the JSON. Gives up after `timeoutMs`.
export async function fetchJSON(url, { headers = {}, timeoutMs = 12000 } = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const err = new Error(`${new URL(url).host} answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Send data back to the app. `maxAge` (seconds) lets Vercel's CDN reuse the
// answer for everyone, which keeps us inside the free data limits.
export function ok(data, { maxAge = 60, swr = 300 } = {}) {
  return Response.json(data, {
    headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${swr}` },
  });
}

// Turn an error into an answer the app understands.
export function fail(err) {
  if (err.code === 'not_configured') {
    return Response.json({ error: 'not_configured', service: err.service }, { status: 503, headers: noStore });
  }
  if (err.code === 'bad_request') {
    return Response.json({ error: 'bad_request', message: err.message }, { status: 400, headers: noStore });
  }
  const status = err.status === 429 ? 429 : err.status === 404 ? 404 : 502;
  const message = err.status === 429
    ? 'The free data limit was hit. Try again in a minute.'
    : `Couldn't reach the data service (${err.message}).`;
  return Response.json({ error: 'upstream', message }, { status, headers: noStore });
}
const noStore = { 'Cache-Control': 'no-store' };

// Read an API key from the server's environment variables.
// If it's missing, the app shows demo data for that part instead of breaking.
export function needKey(name, service) {
  const value = process.env[name];
  if (!value) throw Object.assign(new Error(`${name} is not set`), { code: 'not_configured', service });
  return value;
}

// Read ?symbol=... from the request and make sure it looks like a ticker.
export function symbolFrom(request) {
  const raw = new URL(request.url).searchParams.get('symbol') || '';
  const symbol = raw.trim().toUpperCase();
  if (!/^[A-Z0-9.\-:^=/]{1,15}$/.test(symbol)) {
    throw Object.assign(new Error('Add a ticker, like ?symbol=AAPL'), { code: 'bad_request' });
  }
  return symbol;
}

// Remember answers for a while inside a running server, so repeated
// requests don't spend the free quota. Stores the promise, so two requests
// at the same moment share one fetch.
const memory = new Map();
export function cached(key, ttlMs, load) {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;
  const promise = load();
  memory.set(key, { promise, expires: Date.now() + ttlMs });
  promise.catch(() => memory.delete(key)); // never remember failures
  if (memory.size > 200) memory.delete(memory.keys().next().value); // forget the oldest
  return promise;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
