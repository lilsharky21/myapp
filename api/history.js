// GET /api/history?symbol=AAPL&span=daily     -> up to ~20 years of daily prices
// GET /api/history?symbol=AAPL&span=intraday  -> the last 5 days in 5-minute steps
// Prices come from Twelve Data (free key at twelvedata.com).

import { ok, fail, symbolFrom, needKey, fetchJSON, cached, MINUTE, HOUR } from '../lib/http.js';

export async function GET(request) {
  try {
    const symbol = symbolFrom(request);
    const intraday = new URL(request.url).searchParams.get('span') === 'intraday';
    const key = needKey('TWELVEDATA_API_KEY', 'Twelve Data');

    // Twelve Data writes crypto and currencies as BTC/USD, not BTC-USD
    const tdSymbol = /^[A-Z]{2,6}-[A-Z]{3}$/.test(symbol) ? symbol.replace('-', '/') : symbol;
    const params = new URLSearchParams({
      symbol: tdSymbol,
      interval: intraday ? '5min' : '1day',
      outputsize: intraday ? '400' : '5000',
      timezone: 'UTC',
      order: 'ASC',
      apikey: key,
    });

    const data = await cached(`td:${tdSymbol}:${intraday}`, intraday ? MINUTE : HOUR, () =>
      fetchJSON(`https://api.twelvedata.com/time_series?${params}`));

    if (data.status !== 'ok') {
      const limit = data.code === 429;
      return Response.json(
        { error: limit ? 'upstream' : 'not_found', message: limit ? 'The free chart limit was hit. Try again in a minute.' : `No price history for ${symbol}.` },
        { status: limit ? 429 : 404, headers: { 'Cache-Control': 'no-store' } });
    }

    // Each bar: t = time (seconds), o/h/l/c = open/high/low/close, v = volume
    const candles = data.values.map((bar) => ({
      t: Math.floor(Date.parse(bar.datetime.replace(' ', 'T') + 'Z') / 1000),
      o: Number(bar.open),
      h: Number(bar.high),
      l: Number(bar.low),
      c: Number(bar.close),
      v: Number(bar.volume ?? 0),
    }));
    return ok({ symbol, span: intraday ? 'intraday' : 'daily', candles },
      intraday ? { maxAge: 60, swr: 120 } : { maxAge: 3600, swr: 7200 });
  } catch (err) {
    return fail(err);
  }
}
