// ==========================================================================
// api.js: gets data from our backend (the api/ folder).
// If there's no backend yet (like in the preview link) or a key isn't set up,
// it quietly switches to demo numbers and says so, instead of breaking.
//
// Every function returns { status, data } where status is:
//   'live'  -> real data
//   'demo'  -> made-up numbers (shown with a Demo label)
//   'error' -> something went wrong (with a message to show)
// ==========================================================================

import { demoData } from './demo.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const remembered = new Map();

async function request(path) {
  let res;
  try {
    res = await fetch(path, { headers: { Accept: 'application/json' } });
  } catch {
    return { status: 'offline' };
  }
  // No JSON back means there's no backend at this address (for example the preview link)
  if (!(res.headers.get('content-type') || '').includes('json')) return { status: 'offline' };
  const body = await res.json().catch(() => ({}));
  if (res.status === 503 && body.error === 'not_configured') return { status: 'not_configured', service: body.service };
  if (!res.ok) return { status: 'error', message: body.message || 'Something went wrong loading this.' };
  return { status: 'live', data: body };
}

function load(kind, symbol, { ttl, extra = '', fresh = false, demo }) {
  const key = `${kind}:${symbol}${extra}`;
  const hit = remembered.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttl) return hit.promise;

  const promise = request(`/api/${kind}?symbol=${encodeURIComponent(symbol)}${extra}`).then((result) => {
    if (result.status === 'offline' || result.status === 'not_configured') {
      return { status: 'demo', reason: result.status, service: result.service, data: demo(demoData(symbol)) };
    }
    return result;
  });
  remembered.set(key, { at: Date.now(), promise });
  promise.then((r) => r.status === 'error' && remembered.delete(key)); // retry errors next time
  return promise;
}

export const getQuote = (symbol, { fresh = false } = {}) =>
  load('quote', symbol, { ttl: 15 * SECOND, fresh, demo: (d) => d.quote });

export const getDaily = (symbol) =>
  load('history', symbol, { ttl: HOUR, extra: '&span=daily', demo: (d) => ({ candles: d.daily }) });

export const getIntraday = (symbol) =>
  load('history', symbol, { ttl: MINUTE, extra: '&span=intraday', demo: (d) => ({ candles: d.intraday }) });

export const getFundamentals = (symbol) =>
  load('fundamentals', symbol, { ttl: 30 * MINUTE, demo: (d) => d.fundamentals });

export const getFinancials = (symbol) =>
  load('financials', symbol, { ttl: 12 * HOUR, demo: (d) => d.financials });

export const getNews = (symbol) =>
  load('news', symbol, { ttl: 5 * MINUTE, demo: (d) => d.news });
