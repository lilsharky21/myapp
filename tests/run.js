// ==========================================================================
// tests/run.js: checks the math and the backend without using the internet.
//   npm test
// The backend tests replace fetch() with sample answers shaped like the real
// services' documented responses, so no API keys or quota are needed.
// ==========================================================================

import assert from 'node:assert/strict';
import { sma, ema, rsi, macd, bollinger, technicalSummary, performance } from '../js/indicators.js';
import { buildStatements } from '../lib/statements.js';

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}
const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);

// ---------------------------------------------------------------------------
console.log('\nIndicators');

await test('SMA averages the last n values', () => {
  assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
});

await test('EMA starts at the SMA and weights recent values more', () => {
  const out = ema([1, 2, 3, 4, 5], 3);
  close(out[2], 2);
  close(out[3], 3); // 4*0.5 + 2*0.5
  close(out[4], 4); // 5*0.5 + 3*0.5
});

await test('RSI is 100 when prices only rise, 0 when they only fall', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  close(rsi(up).at(-1), 100);
  close(rsi(down).at(-1), 0);
  assert.equal(rsi(up)[13], null);
});

await test('RSI matches a hand-worked example', () => {
  // 14 changes of +1 and -1 alternating, then one more +1: average gain 7/14 then smoothed
  const closes = [10];
  for (let i = 0; i < 14; i++) closes.push(closes.at(-1) + (i % 2 === 0 ? 1 : -1));
  const r = rsi(closes);
  close(r[14], 50); // equal gains and losses
});

await test('MACD of a flat price is zero', () => {
  const flat = new Array(60).fill(50);
  const m = macd(flat);
  close(m.line.at(-1), 0);
  close(m.signal.at(-1), 0);
  close(m.hist.at(-1), 0);
});

await test('Bollinger bands collapse on a flat price and widen with movement', () => {
  const flat = bollinger(new Array(25).fill(10));
  close(flat.upper.at(-1), 10);
  const moving = bollinger(Array.from({ length: 25 }, (_, i) => 10 + (i % 2)));
  assert.ok(moving.upper.at(-1) > moving.mid.at(-1));
});

await test('Technical summary spots an uptrend and a recent golden cross', () => {
  const candles = [];
  let p = 100;
  for (let i = 0; i < 400; i++) {
    p *= i < 250 ? 0.999 : 1.004; // falls for a while, then climbs
    candles.push({ t: 1_600_000_000 + i * 86400, o: p, h: p * 1.01, l: p * 0.99, c: p, v: 1e6 });
  }
  const t = technicalSummary(candles);
  assert.equal(t.trend.label, 'Uptrend');
  assert.equal(t.cross?.kind, 'golden');
  assert.ok(t.rsi.value > 50);
  assert.equal(t.performance.length, 8);
});

await test('Performance returns are measured from the right day', () => {
  const candles = Array.from({ length: 300 }, (_, i) => ({ t: Date.UTC(2025, 0, 1) / 1000 + i * 86400, c: 100 + i }));
  const perf = performance(candles);
  close(perf.find((p) => p.label === '1W').value, ((399 - 394) / 394) * 100);
  assert.equal(perf.find((p) => p.label === '5Y').value, null);
});

// ---------------------------------------------------------------------------
console.log('\nSEC statements');

// A fake company whose fiscal year runs Jan-Dec 2024, reporting like real 10-Qs do:
// Q1 on its own, then 6-month and 9-month year-to-date totals, then the full year.
function fact(start, end, val, form = '10-Q', filed = '2025-02-01') {
  return { start, end, val, form, filed, fy: 2024, fp: 'Q' };
}
const companyFacts = {
  facts: {
    'us-gaap': {
      Revenues: { units: { USD: [
        fact('2024-01-01', '2024-03-31', 100),
        fact('2024-04-01', '2024-06-30', 110),              // Q2 reported on its own
        fact('2024-01-01', '2024-06-30', 210),
        fact('2024-01-01', '2024-09-30', 330),              // 9 months -> Q3 = 120
        fact('2024-01-01', '2024-12-31', 460, '10-K'),       // full year -> Q4 = 130
        fact('2023-01-01', '2023-12-31', 400, '10-K'),
      ] } },
      NetIncomeLoss: { units: { USD: [
        fact('2024-01-01', '2024-03-31', 10),
        fact('2024-01-01', '2024-06-30', 22),
        fact('2024-01-01', '2024-09-30', 36),
        fact('2024-01-01', '2024-12-31', 52, '10-K'),
        fact('2024-01-01', '2024-12-31', 50, '10-K', '2024-01-15'), // older, superseded filing
        fact('2023-01-01', '2023-12-31', 40, '10-K'),
      ] } },
      NetCashProvidedByUsedInOperatingActivities: { units: { USD: [
        fact('2024-01-01', '2024-12-31', 70, '10-K'),
        fact('2023-01-01', '2023-12-31', 60, '10-K'),
      ] } },
      PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: [
        fact('2024-01-01', '2024-12-31', 20, '10-K'),
        fact('2023-01-01', '2023-12-31', 15, '10-K'),
      ] } },
      EarningsPerShareDiluted: { units: { 'USD/shares': [
        fact('2024-01-01', '2024-12-31', 5.2, '10-K'),
        fact('2024-01-01', '2024-06-30', 2.2),               // year-to-date EPS must NOT be subtracted
        fact('2024-01-01', '2024-03-31', 1.0),
      ] } },
      StockholdersEquity: { units: { USD: [
        { end: '2024-12-31', val: 300, form: '10-K', filed: '2025-02-01' },
        { end: '2023-12-31', val: 250, form: '10-K', filed: '2025-02-01' },
      ] } },
      LiabilitiesAndStockholdersEquity: { units: { USD: [
        { end: '2024-12-31', val: 800, form: '10-K', filed: '2025-02-01' },
      ] } },
    },
  },
};
const statements = buildStatements(companyFacts);

await test('Annual revenue and growth', () => {
  const a = statements.annual;
  assert.deepEqual(a.periods.map((p) => p.label), ['FY2023', 'FY2024']);
  assert.deepEqual(a.rows.revenue, [400, 460]);
  close(a.growth.revenue[1], 15);
});

await test('Restated numbers from the newest filing win', () => {
  assert.equal(statements.annual.rows.netIncome[1], 52);
});

await test('Quarters are worked out from year-to-date totals (incl. Q4)', () => {
  const q = statements.quarterly;
  assert.deepEqual(q.periods.map((p) => p.end), ['2024-03-31', '2024-06-30', '2024-09-30', '2024-12-31']);
  assert.deepEqual(q.rows.revenue, [100, 110, 120, 130]);
  assert.deepEqual(q.rows.netIncome, [10, 12, 14, 16]);
});

await test('Per-share numbers are never subtracted', () => {
  const q = statements.quarterly;
  assert.equal(q.rows.eps[0], 1.0);
  assert.equal(q.rows.eps[1], null); // only a 6-month EPS exists, so Q2 stays blank
});

await test('Free cash flow and total liabilities are calculated', () => {
  const a = statements.annual;
  assert.deepEqual(a.rows.freeCashFlow, [45, 50]);
  assert.equal(a.rows.totalLiabilities[1], 500); // 800 total - 300 equity
  close(a.ratios.netMargin[1], (52 / 460) * 100);
});

// ---------------------------------------------------------------------------
console.log('\nBackend (with sample answers instead of the internet)');

const samples = {
  'finnhub.io/api/v1/quote': { c: 182.5, d: 2.5, dp: 1.39, h: 183, l: 179.1, o: 180, pc: 180, t: 1790000000 },
  'finnhub.io/api/v1/stock/profile2': { name: 'Apple Inc', exchange: 'NASDAQ NMS - GLOBAL MARKET', finnhubIndustry: 'Technology', country: 'US', currency: 'USD', marketCapitalization: 2800000, shareOutstanding: 15000, ipo: '1980-12-12', weburl: 'https://www.apple.com/' },
  'finnhub.io/api/v1/stock/metric': { metric: { peTTM: 30.1, grossMarginTTM: 46.2, '52WeekHigh': 200, '52WeekLow': 150 }, series: { annual: {} } },
  'finnhub.io/api/v1/stock/recommendation': [
    { period: '2026-09-01', strongBuy: 12, buy: 20, hold: 8, sell: 1, strongSell: 0 },
    { period: '2026-08-01', strongBuy: 11, buy: 20, hold: 9, sell: 1, strongSell: 0 },
  ],
  'finnhub.io/api/v1/stock/earnings': [
    { period: '2026-06-30', actual: 1.6, estimate: 1.5, surprisePercent: 6.7 },
    { period: '2026-03-31', actual: 1.5, estimate: 1.52, surprisePercent: -1.3 },
  ],
  'finnhub.io/api/v1/calendar/earnings': { earningsCalendar: [{ date: '2099-10-30', hour: 'amc', epsEstimate: 1.7, revenueEstimate: 1e11, quarter: 4, year: 2099 }] },
  'finnhub.io/api/v1/stock/insider-transactions': { data: [{ name: 'DOE JANE', change: -1000, transactionCode: 'S', transactionPrice: 181, transactionDate: '2026-09-01' }] },
  'finnhub.io/api/v1/company-news': [
    { headline: 'Apple does a thing', summary: 'More detail', source: 'Reuters', url: 'https://example.com/a', datetime: 1790000000 },
    { headline: 'Apple does a thing', summary: 'Same story elsewhere', source: 'Other', url: 'https://example.com/b', datetime: 1789990000 },
  ],
  'api.twelvedata.com/time_series': {
    status: 'ok',
    meta: { symbol: 'AAPL' },
    values: [
      { datetime: '2026-09-23', open: '180', high: '182', low: '179', close: '181', volume: '1000' },
      { datetime: '2026-09-24', open: '181', high: '184', low: '180', close: '183', volume: '1200' },
    ],
  },
  'www.sec.gov/files/company_tickers.json': { 0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' }, 1: { cik_str: 1067983, ticker: 'BRK-B', title: 'Berkshire Hathaway' } },
  'data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json': companyFacts,
  'data.sec.gov/submissions/CIK0000320193.json': {
    cik: '320193',
    filings: { recent: {
      form: ['8-K', '4', 'SD', '10-Q'],
      accessionNumber: ['0000320193-26-000090', '0000320193-26-000089', '0000320193-26-000088', '0000320193-26-000087'],
      filingDate: ['2026-09-10', '2026-09-05', '2026-09-01', '2026-08-01'],
      primaryDocument: ['a8k.htm', 'form4.xml', 'sd.htm', 'a10q.htm'],
      primaryDocDescription: ['8-K', 'FORM 4', 'SD', '10-Q'],
    } },
  },
};

const requested = [];
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  requested.push({ url: u, headers: options.headers ?? {} });
  const body = samples[u.host + u.pathname];
  if (!body) return new Response('not found', { status: 404 });
  return Response.json(body);
};
const call = async (file, query) => {
  const { GET } = await import(`../api/${file}.js`);
  const res = await GET(new Request(`http://localhost/api/${file}?${query}`));
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
};

await test('Missing key -> "not_configured" so the app shows demo data', async () => {
  delete process.env.FINNHUB_API_KEY;
  const res = await call('quote', 'symbol=AAPL');
  assert.equal(res.status, 503);
  assert.equal(res.body.error, 'not_configured');
});

process.env.FINNHUB_API_KEY = 'test-key';
process.env.TWELVEDATA_API_KEY = 'test-key';
process.env.SEC_USER_AGENT = 'Thesis Journal test@example.com';

await test('Bad ticker -> 400', async () => {
  const res = await call('quote', 'symbol=<script>');
  assert.equal(res.status, 400);
});

await test('/api/quote combines price and company profile', async () => {
  const res = await call('quote', 'symbol=aapl');
  assert.equal(res.status, 200);
  assert.equal(res.body.symbol, 'AAPL');
  assert.equal(res.body.price, 182.5);
  assert.equal(res.body.marketCap, 2.8e12);
  assert.match(res.cache, /s-maxage=15/);
});

await test('/api/history turns Twelve Data bars into numbers, oldest first', async () => {
  const res = await call('history', 'symbol=AAPL&span=daily');
  assert.equal(res.body.candles.length, 2);
  assert.deepEqual(res.body.candles[1], { t: Date.UTC(2026, 8, 24) / 1000, o: 181, h: 184, l: 180, c: 183, v: 1200 });
  const td = requested.find((r) => r.url.host === 'api.twelvedata.com');
  assert.equal(td.url.searchParams.get('interval'), '1day');
});

await test('/api/fundamentals gathers stats, ratings, earnings, next date and insiders', async () => {
  const res = await call('fundamentals', 'symbol=AAPL');
  assert.equal(res.status, 200);
  assert.equal(res.body.metrics.peTTM, 30.1);
  assert.equal(res.body.recommendations.at(-1).period, '2026-09-01'); // oldest -> newest
  assert.equal(res.body.nextEarnings.date, '2099-10-30');
  assert.equal(res.body.insiders.length, 1);
  assert.deepEqual(res.body.missing, []);
});

await test('/api/financials looks up the CIK and builds statements (sends SEC user agent)', async () => {
  const res = await call('financials', 'symbol=AAPL');
  assert.equal(res.status, 200);
  assert.equal(res.body.cik, '0000320193');
  assert.deepEqual(res.body.annual.rows.revenue, [400, 460]);
  const sec = requested.find((r) => r.url.host === 'data.sec.gov');
  assert.equal(sec.headers['User-Agent'], 'Thesis Journal test@example.com');
});

await test('/api/financials -> 404 with a clear message for non-SEC tickers', async () => {
  const res = await call('financials', 'symbol=ZZZZ');
  assert.equal(res.status, 404);
  assert.match(res.body.message, /SEC/);
});

await test('/api/news removes duplicate headlines and explains filings', async () => {
  const res = await call('news', 'symbol=AAPL');
  assert.equal(res.body.news.length, 1);
  assert.equal(res.body.newsStatus, 'live');
  assert.deepEqual(res.body.filings.map((x) => x.form), ['8-K', '4', '10-Q']); // "SD" isn't one we list
  assert.equal(res.body.filings[0].url, 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000090/a8k.htm');
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
