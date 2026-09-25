// ==========================================================================
// tests/run.js: checks the math and the backend without using the internet.
//   npm test
// The backend tests replace fetch() with sample answers shaped like the real
// services' documented responses, so no API keys or quota are needed.
// ==========================================================================

import assert from 'node:assert/strict';
import { sma, ema, rsi, macd, bollinger, technicalSummary, performance, riskStats, seasonality } from '../js/indicators.js';
import { buildStatements } from '../lib/statements.js';
import { dcf, impliedGrowth, graham, dcfInputs } from '../js/valuation.js';
import { scale, grade, appScore, analystConsensus, piotroski, altmanZ, FACTORS } from '../js/ratings.js';
import { normalize, buildPrompt } from '../js/ai.js';
import { scenarios, priceLevels } from '../js/research.js';
import { demoData } from '../js/demo.js';

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

await test('Risk stats: beta of a stock that moves 2x the market is about 2', () => {
  const bench = [];
  const stock = [];
  let b = 100;
  let s = 100;
  for (let i = 0; i < 400; i++) {
    const r = Math.sin(i * 1.7) * 0.01;
    b *= 1 + r;
    s *= 1 + 2 * r;
    bench.push({ t: i * 86400, c: b });
    stock.push({ t: i * 86400, c: s, h: s, l: s, o: s, v: 1 });
  }
  const risk = riskStats(stock, bench);
  close(risk.beta, 2, 0.05);
  close(risk.correlation, 1, 0.01);
  assert.ok(risk.maxDrawdown.value <= 0);
  assert.equal(risk.relative.stock.length, 253);
});

await test('Seasonality averages each calendar month', () => {
  const candles = [];
  for (let d = 0; d < 800; d++) candles.push({ t: Date.UTC(2023, 0, 1) / 1000 + d * 86400, c: 100 + d });
  const s = seasonality(candles);
  assert.equal(s.length, 12);
  assert.ok(s.every((m) => m.avg == null || m.avg > 0));
});

// ---------------------------------------------------------------------------
console.log('\nValuation');

await test('DCF with no growth equals cash flow ÷ discount rate', () => {
  // A flat $100 forever at 10% is worth $1,000
  close(dcf({ fcf: 100, growth: 0, discount: 10, terminal: 0, shares: 1 }).perShare, 1000, 1e-6);
  close(dcf({ fcf: 100, growth: 0, discount: 10, terminal: 0, shares: 2, netCash: 200 }).perShare, 600, 1e-6);
});

await test('DCF refuses nonsense inputs', () => {
  assert.equal(dcf({ fcf: -5, growth: 5, discount: 9, terminal: 2, shares: 1 }), null);
  assert.equal(dcf({ fcf: 100, growth: 5, discount: 3, terminal: 3, shares: 1 }), null);
});

await test('Reverse DCF finds the growth the price assumes', () => {
  const inputs = { fcf: 100, discount: 10, terminal: 0, shares: 1, netCash: 0 };
  close(impliedGrowth(1000, inputs).value, 0, 0.01);
  const at12 = dcf({ ...inputs, growth: 12 }).perShare;
  close(impliedGrowth(at12, inputs).value, 12, 0.01);
});

await test('Graham number', () => {
  close(graham(4, 25), Math.sqrt(22.5 * 100));
  assert.equal(graham(-1, 25), null);
});

await test('Scenarios: bear < base < bull, and base equals the default DCF', () => {
  const val = { fcf: 100, shares: 10, netCash: 0, growth: 10, discount: 9, terminal: 2.5 };
  const s = scenarios({ val, quote: { price: 150 } });
  assert.equal(s.method, 'DCF');
  const [bear, base, bull] = s.cases.map((c) => c.value);
  assert.ok(bear < base && base < bull);
  close(base, dcf(val).perShare);
  close(s.cases[1].changePct, (base / 150 - 1) * 100);
});

await test('Scenarios fall back to P/E when cash flow is negative', () => {
  const s = scenarios({ val: { fcf: -5 }, quote: { price: 50 }, metrics: { epsTTM: 2, peTTM: 25, epsGrowth5Y: 10 } });
  assert.equal(s.method, 'P/E');
  close(s.cases[1].value, 25 * 2.2);
  assert.equal(scenarios({ val: null, quote: { price: 50 }, metrics: { epsTTM: -1, peTTM: null } }), null);
});

await test('Price levels are sorted high to low and include today', () => {
  const candles = Array.from({ length: 300 }, (_, i) => ({ t: i * 86400, o: 100 + i / 10, h: 101 + i / 10, l: 99 + i / 10, c: 100 + i / 10, v: 1 }));
  const tech = technicalSummary(candles);
  const levels = priceLevels({ quote: { price: 125 }, tech, dcfValue: 140 });
  assert.ok(levels.every((l, i) => i === 0 || levels[i - 1].price >= l.price));
  assert.ok(levels.some((l) => l.kind === 'current' && l.price === 125));
  assert.ok(levels.some((l) => l.kind === 'value' && l.distancePct > 0));
});

// ---------------------------------------------------------------------------
console.log('\nRatings');

await test('Scores draw straight lines between points and stay in range', () => {
  const pts = [[10, 100], [20, 50], [30, 0]];
  assert.equal(scale(5, pts), 100);
  assert.equal(scale(15, pts), 75);
  assert.equal(scale(40, pts), 0);
  assert.equal(scale(null, pts), null);
});

await test('Letter grades', () => {
  assert.equal(grade(95), 'A+');
  assert.equal(grade(78), 'A−');
  assert.equal(grade(66), 'B');
  assert.equal(grade(20), 'F');
});

await test('Analyst consensus from rating counts', () => {
  const c = analystConsensus([{ strongBuy: 10, buy: 10, hold: 0, sell: 0, strongSell: 0, period: '2026-09-01' }]);
  assert.equal(c.label, 'Strong Buy');
  close(c.score, 1.5);
  assert.equal(analystConsensus([{ strongBuy: 0, buy: 0, hold: 10, sell: 0, strongSell: 0 }]).label, 'Hold');
});

await test('App score covers all seven factors on full data', () => {
  const d = demoData('TEST');
  const tech = technicalSummary(d.daily);
  const risk = riskStats(d.daily, demoData('SPY').daily);
  const val = dcfInputs({ financials: d.financials, metrics: d.fundamentals.metrics, quote: d.quote });
  const score = appScore({
    quote: d.quote, metrics: d.fundamentals.metrics, financials: d.financials, tech, risk,
    earnings: d.fundamentals.earnings, recs: d.fundamentals.recommendations, peers: d.peers.peers,
    valuation: { ...val, dcf: dcf(val) },
  });
  assert.equal(score.factors.length, FACTORS.length);
  assert.equal(score.coverage, 7); // sentiment still scores from analysts when demo has no insiders
  assert.ok(score.factors.find((x) => x.key === 'sentiment').score != null);
  assert.ok(score.overall >= 0 && score.overall <= 100);
  assert.ok(['Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'].includes(score.label));
  for (const factor of score.factors) for (const input of factor.inputs) assert.ok(input.score >= 0 && input.score <= 100, input.label);
});

await test('App score waits for at least 4 factors', () => {
  const score = appScore({ metrics: { peTTM: 20 } });
  assert.equal(score.overall, null);
  assert.equal(score.label, 'Not enough data');
});

await test('Piotroski and Altman scores from demo statements', () => {
  const d = demoData('TEST');
  const p = piotroski(d.financials.annual);
  assert.ok(p.score >= 0 && p.score <= 9);
  assert.equal(p.checks.length, 9);
  const z = altmanZ(d.financials.annual, d.quote.marketCap);
  assert.ok(Number.isFinite(z.z));
  assert.ok(['Safe', 'Grey zone', 'Distress'].includes(z.zone));
});

// ---------------------------------------------------------------------------
console.log('\nAI');

await test('AI answers are cleaned up into the expected shape', () => {
  const r = normalize({ rating: 'buy', confidence: '140', sections: { growth: { view: 'positive', line: 'Fast.' } }, bull: ['a', 'b', 3], thesis: { status: 'weird' } });
  assert.equal(r.rating, 'Buy');
  assert.equal(r.confidence, 100);
  assert.equal(r.sections.growth.view, 'Positive');
  assert.equal(r.sections.valuation, null);
  assert.deepEqual(r.bull, ['a', 'b']);
  assert.equal(r.thesis.status, 'No thesis');
  assert.equal(normalize({ rating: 'To the moon' }).rating, 'Hold');
});

await test('New note fields are kept, cleaned and limited', () => {
  const r = normalize({
    riskLevel: 'high', bottomLine: 'Buy slowly.', scenarios: { bear: { odds: '30', story: 'Slows.' }, base: { odds: 50 }, bull: null },
    beforeYouBuy: ['Read the 10-K', '', 'Check debt'], glossary: [{ term: 'P/E', plain: 'Price vs. profit' }, { term: '', plain: 'x' }],
    thesis: { status: 'intact', suggestions: ['Add a target date'] },
  });
  assert.equal(r.version, 2);
  assert.equal(r.riskLevel, 'High');
  assert.equal(r.scenarios.bear.odds, 30);
  assert.equal(r.scenarios.bull, null);
  assert.deepEqual(r.beforeYouBuy, ['Read the 10-K', 'Check debt']);
  assert.equal(r.glossary.length, 1);
  assert.equal(r.thesis.status, 'Intact');
  assert.deepEqual(r.thesis.suggestions, ['Add a target date']);
  assert.equal(normalize({}).riskLevel, 'Medium');
});

await test('The AI prompt carries the data and flags demo numbers', () => {
  const prompt = buildPrompt({ dataMode: 'demo', ticker: 'XYZ' });
  assert.match(prompt, /DEMO numbers/);
  assert.match(prompt, /"ticker":"XYZ"/);
  assert.match(prompt, /beginner/);
  assert.match(prompt, /Do not invent other prices/);
  assert.doesNotMatch(buildPrompt({ dataMode: 'live' }), /DEMO numbers/);
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

await test('EBITDA and returns are calculated when the pieces exist', () => {
  const a = statements.annual;
  assert.equal(a.rows.ebitda[1], null); // no D&A reported in this sample
  assert.ok(a.ratios.roe[1] > 0);
  assert.ok(a.ratios.roic[1] == null); // no operating income in this sample
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
  'finnhub.io/api/v1/calendar/earnings': { earningsCalendar: [{ symbol: 'AAPL', date: '2099-10-30', hour: 'amc', epsEstimate: 1.7, revenueEstimate: 1e11, quarter: 4, year: 2099 }] },
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
  'finnhub.io/api/v1/stock/peers': ['AAPL', 'MSFT', 'GOOGL'],
  'generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent': { candidates: [{ content: { parts: [{ text: '{"rating":"Buy"}' }] } }] },
  'generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash': { name: 'models/gemini-2.5-flash' },
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
const call = async (file, query, { method = 'GET', body, headers = {} } = {}) => {
  const handlers = await import(`../api/${file}.js`);
  const res = await handlers[method](new Request(`http://localhost/api/${file}?${query}`, { method, body, headers }));
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

await test('/api/peers lists similar companies, not the stock itself', async () => {
  const res = await call('peers', 'symbol=AAPL');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.peers.map((p) => p.symbol), ['MSFT', 'GOOGL']);
  assert.equal(res.body.peers[0].pe, 30.1);
});

await test('/api/ai reports setup and passes the prompt to Gemini', async () => {
  delete process.env.GEMINI_API_KEY;
  assert.equal((await call('ai', '')).body.configured, false);
  const missing = await call('ai', '', { method: 'POST', body: JSON.stringify({ prompt: 'hi' }) });
  assert.equal(missing.status, 503);
  process.env.GEMINI_API_KEY = 'test-key';
  assert.equal((await call('ai', '')).body.configured, true);
  const res = await call('ai', '', { method: 'POST', body: JSON.stringify({ prompt: 'Rate this' }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.text, '{"rating":"Buy"}');
  const g = requested.findLast((r) => r.url.host === 'generativelanguage.googleapis.com');
  assert.equal(g.headers['x-goog-api-key'], 'test-key');
  const bad = await call('ai', '', { method: 'POST', body: JSON.stringify({ prompt: '' }) });
  assert.equal(bad.status, 400);
});

await test('Passcode lock: blocked without it, allowed with it', async () => {
  process.env.APP_PASSCODE = 'open-sesame';
  const blocked = await call('quote', 'symbol=AAPL');
  assert.equal(blocked.status, 401);
  assert.equal(blocked.body.error, 'locked');
  const wrong = await call('quote', 'symbol=AAPL', { headers: { 'x-passcode': 'nope' } });
  assert.equal(wrong.status, 401);
  const allowed = await call('quote', 'symbol=AAPL', { headers: { 'x-passcode': 'open-sesame' } });
  assert.equal(allowed.status, 200);
  delete process.env.APP_PASSCODE;
});

await test('/api/status reports each connection', async () => {
  const res = await call('status', '');
  assert.equal(res.status, 200);
  assert.equal(res.body.finnhub.status, 'ok');
  assert.equal(res.body.twelvedata.status, 'ok');
  assert.equal(res.body.sec.status, 'ok');
  assert.equal(res.body.gemini.status, 'ok');
  assert.equal(res.body.passcode.status, 'optional');
  assert.equal(res.cache, 'no-store');
});

await test('/api/status spots missing and refused keys', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => (String(url).includes('finnhub.io') ? new Response('no', { status: 401 }) : realFetch(url, opts));
  const saved = process.env.TWELVEDATA_API_KEY;
  delete process.env.TWELVEDATA_API_KEY;
  try {
    const res = await call('status', '');
    assert.equal(res.body.finnhub.status, 'rejected');
    assert.equal(res.body.twelvedata.status, 'missing');
    assert.match(res.body.twelvedata.message, /TWELVEDATA_API_KEY/);
  } finally {
    globalThis.fetch = realFetch;
    process.env.TWELVEDATA_API_KEY = saved;
  }
});

await test('/api/notes saves a note and reads it back (private, overwritten)', async () => {
  const { useStorageForTests } = await import('../api/notes.js');
  const files = new Map();
  const calls = [];
  useStorageForTests({
    put: async (path, body, opts) => { calls.push(opts); files.set(path, body); return { pathname: path }; },
    get: async (path) => (files.has(path) ? { statusCode: 200, stream: new Response(files.get(path)).body } : null),
  });
  const entry = { result: { rating: 'Buy' }, engine: 'Your Mac · qwen3:14b', at: 1790000000000 };

  delete process.env.BLOB_READ_WRITE_TOKEN;
  assert.equal((await call('notes', '')).body.configured, false);
  assert.equal((await call('notes', '', { method: 'POST', body: JSON.stringify({ ticker: 'nvda', entry }) })).status, 503);

  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  assert.equal((await call('notes', 'symbol=NVDA')).status, 404);
  const saved = await call('notes', '', { method: 'POST', body: JSON.stringify({ ticker: 'nvda', entry }) });
  assert.equal(saved.status, 200);
  assert.equal(calls[0].access, 'private');
  assert.equal(calls[0].allowOverwrite, true);
  const got = await call('notes', 'symbol=nvda');
  assert.equal(got.status, 200);
  assert.deepEqual(got.body.entry, entry);

  assert.equal((await call('notes', '', { method: 'POST', body: JSON.stringify({ ticker: '../x', entry }) })).status, 400);
  assert.equal((await call('notes', '', { method: 'POST', body: '{broken' })).status, 400);
  assert.equal((await call('notes', '', { method: 'POST', body: JSON.stringify({ ticker: 'NVDA', entry: { result: {}, at: 1, pad: 'x'.repeat(300000) } }) })).status, 413);

  process.env.APP_PASSCODE = 'secret';
  assert.equal((await call('notes', 'symbol=NVDA')).status, 401);
  delete process.env.APP_PASSCODE;
});

await test('/api/status: note sync checked, Gemini optional when missing', async () => {
  delete process.env.GEMINI_API_KEY;
  const res = await call('status', '');
  assert.equal(res.body.notes.status, 'ok');
  assert.equal(res.body.gemini.status, 'optional');
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const off = await call('status', '');
  assert.equal(off.body.notes.status, 'missing');
  assert.match(off.body.notes.message, /Blob/);
});

await test('Mac AI diagnosis tells the problems apart', async () => {
  const { diagnoseLocalAI } = await import('../js/ai.js');
  const realFetch = globalThis.fetch;
  const run = async (impl) => { globalThis.fetch = impl; try { return await diagnoseLocalAI(); } finally { globalThis.fetch = realFetch; } };
  assert.deepEqual(await run(async () => Response.json({ models: [{ name: 'qwen3:14b' }] })), { status: 'ok', models: ['qwen3:14b'] });
  assert.equal((await run(async () => Response.json({ models: [] }))).status, 'no-model');
  assert.equal((await run(async () => new Response('', { status: 403 }))).status, 'origin');
  // Browser blocks the normal request (address refused), but a no-cors one gets through
  assert.equal((await run(async (url, opts) => { if (opts?.mode === 'no-cors') return new Response(null); throw new TypeError('Failed to fetch'); })).status, 'origin');
  assert.equal((await run(async () => { throw new TypeError('Failed to fetch'); })).status, 'unreachable');
});

await test('/api/ai and /api/status share the permanent app address', async () => {
  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'myapp-abc.vercel.app';
  assert.equal((await call('ai', '')).body.productionUrl, 'myapp-abc.vercel.app');
  assert.equal((await call('status', '')).body.productionUrl, 'myapp-abc.vercel.app');
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});

await test('Mac setup command: valid bash, both addresses, file copy matches', async () => {
  const { SCRIPT_BODY, macSetupCommand } = await import('../js/mac-setup.js');
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const cmd = macSetupCommand(['https://myapp-abc.vercel.app/', 'https://myapp-xyz-team.vercel.app', null, 'https://myapp-abc.vercel.app']);
  assert.match(cmd, /^bash -s -- 'https:\/\/myapp-abc\.vercel\.app' 'https:\/\/myapp-xyz-team\.vercel\.app' <<'THESIS_SETUP'/);
  assert.equal(cmd.split('\nTHESIS_SETUP\n').length, 2); // the end marker appears exactly once
  writeFileSync('/tmp/thesis-setup-test.sh', SCRIPT_BODY);
  execFileSync('bash', ['-n', '/tmp/thesis-setup-test.sh']); // throws on a syntax error
  assert.equal(readFileSync(new URL('../setup/mac.sh', import.meta.url), 'utf8'), '#!/bin/bash\n' + SCRIPT_BODY);
});

// ---------------------------------------------------------------------------
console.log('\nJournal');

const J = await import('../js/journal.js');
const idea = (fields) => J.normalizeIdea({ id: 'i-a', ticker: 'NVDA', company: '', thesis: '', conviction: 3, status: 'watching', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...fields });

await test('Old saves get the new journal fields', () => {
  const i = idea({});
  assert.deepEqual([i.notes, i.trades, i.thesisHistory, i.reviews], [[], [], [], []]);
  assert.equal(i.reviewBy, '2026-04-01'); // 90 days after it was added
  assert.equal(i.closed, null);
});

await test('Position uses average cost; selling locks in profit', () => {
  let i = idea({});
  i = J.logTrade(i, { side: 'buy', shares: 10, price: 100, at: '2026-02-01T16:00:00.000Z' });
  assert.equal(i.status, 'own'); // buying something you watched marks it owned
  assert.equal(i.entry, 100);
  i = J.logTrade(i, { side: 'buy', shares: 10, price: 200, at: '2026-03-01T16:00:00.000Z' });
  i = J.logTrade(i, { side: 'sell', shares: 5, price: 300, at: '2026-04-01T16:00:00.000Z' });
  const p = J.position(i, 250);
  close(p.shares, 15);
  close(p.avgCost, 150);
  close(p.realized, 5 * (300 - 150));
  close(p.unrealized, 15 * (250 - 150));
  close(p.unrealizedPct, (100 / 150) * 100);
  assert.equal(J.position(idea({}), 10), null);
});

await test('Notes, thesis history, review, close and reopen', () => {
  let i = idea({ thesis: 'Old view', target: 100, sample: true });
  i = J.addNote(i, '  Earnings beat  ', 123.45);
  assert.equal(i.notes[0].text, 'Earnings beat');
  assert.equal(i.notes[0].price, 123.45);
  assert.equal(i.sample, false); // your own now
  i = J.applyEdit(i, { thesis: 'New view', target: 150 });
  assert.deepEqual([i.thesisHistory[0].thesis, i.thesisHistory[0].target], ['Old view', 100]);
  const same = J.applyEdit(i, { thesis: 'New view', target: 150, bull: 'x' });
  assert.equal(same.thesisHistory.length, 1); // only thesis/target changes are kept
  i = J.markReviewed(i);
  assert.ok(!J.needsReview(i));
  assert.ok(J.needsReview(idea({}), Date.parse('2026-06-01')));
  i = J.closeIdea(i, { verdict: 'right', lesson: ' Patience ', exit: 150 });
  assert.equal(i.status, 'closed');
  assert.equal(i.closed.lesson, 'Patience');
  assert.ok(!J.needsReview(i, Date.parse('2030-01-01')));
  close(J.ideaReturn({ ...i, entry: 100 }, 999), 50); // closed ideas use the exit price
  assert.deepEqual(J.timeline(i).map((e) => e.kind).sort(), ['closed', 'created', 'note', 'review', 'thesis']);
  assert.equal(J.reopenIdea(i).status, 'watching');
});

await test('Sync merge: newest edit wins, deletions stick, samples appear once', () => {
  const a = idea({ id: 'i-1', thesis: 'phone', updatedAt: '2026-02-01T00:00:00.000Z' });
  const b = idea({ id: 'i-1', thesis: 'mac', updatedAt: '2026-03-01T00:00:00.000Z' });
  const gone = idea({ id: 'i-2', ticker: 'AMD' });
  const merged = J.mergeJournals(
    { ideas: [a, gone, idea({ id: 'i-s1', ticker: 'COST', sample: true })], deleted: {} },
    { ideas: [b, idea({ id: 'i-s0', ticker: 'COST', sample: true })], deleted: { 'i-2': '2026-05-01T00:00:00.000Z' } },
  );
  assert.equal(merged.ideas.find((i) => i.id === 'i-1').thesis, 'mac');
  assert.ok(!merged.ideas.some((i) => i.id === 'i-2'));
  assert.deepEqual(merged.ideas.filter((i) => i.ticker === 'COST').map((i) => i.id), ['i-s0']);
  // Merging is stable: doing it again changes nothing
  assert.equal(J.journalKey(J.mergeJournals(merged, merged)), J.journalKey(merged));
  // A sample is dropped once you have your own idea for that ticker
  const own = J.mergeJournals({ ideas: [idea({ id: 'i-9', ticker: 'COST' })], deleted: {} }, merged);
  assert.deepEqual(own.ideas.filter((i) => i.ticker === 'COST').map((i) => i.id), ['i-9']);
  // Same edit time: fresher ratings win
  const r1 = { ...b, ratings: { at: 5 } };
  const r2 = { ...b, ratings: { at: 9 } };
  assert.equal(J.mergeJournals({ ideas: [r1], deleted: {} }, { ideas: [r2], deleted: {} }).ideas[0].ratings.at, 9);
});

await test('Backup export reads back; junk files are refused', () => {
  const journal = { ideas: [idea({})], deleted: { x: '2026-01-01' } };
  const back = J.parseBackup(J.exportJournal(journal));
  assert.equal(back.ideas[0].ticker, 'NVDA');
  assert.deepEqual(back.deleted, journal.deleted);
  assert.throws(() => J.parseBackup('{"hello":1}'), /backup/);
  assert.throws(() => J.parseBackup('not json'), /backup/);
});

await test('Compare sorts by app score, missing numbers last', async () => {
  const { sortIdeas } = await import('../js/compare.js');
  const list = [
    idea({ id: 'a', ticker: 'A', ratings: { app: { score: 40 } } }),
    idea({ id: 'b', ticker: 'B' }),
    idea({ id: 'c', ticker: 'C', ratings: { app: { score: 80 } } }),
  ];
  assert.deepEqual(sortIdeas(list, new Map(), 'app').map((i) => i.ticker), ['C', 'A', 'B']);
  assert.deepEqual(sortIdeas(list, new Map(), 'app', 1).map((i) => i.ticker), ['A', 'C', 'B']);
  const quotes = new Map([['A', { price: 10, changePct: -2 }], ['B', { price: 10, changePct: 5 }]]);
  assert.deepEqual(sortIdeas(list, quotes, 'day').map((i) => i.ticker), ['B', 'A', 'C']);
});

await test('Closed idea vs the S&P 500 over the same dates', async () => {
  const { benchReturn } = await import('../js/tabs/journal.js');
  const day = (d, c) => ({ t: Date.parse(d) / 1000, c });
  const spy = [day('2026-01-02', 100), day('2026-02-02', 105), day('2026-03-02', 110)];
  close(benchReturn(spy, '2026-01-05T00:00:00Z', '2026-03-10T00:00:00Z'), 10);
  assert.equal(benchReturn(null, '2026-01-01', '2026-02-01'), null);
});

await test('Analysis snapshot has what cards and Compare show', async () => {
  const { analyze, snapshot } = await import('../js/analysis.js');
  const d = demoData('NVDA');
  const derived = analyze({ quote: d.quote, daily: { candles: d.daily }, bench: { candles: d.daily }, fund: d.fundamentals, fin: d.financials, peers: d.peers.peers, insidersLive: false });
  const snap = snapshot(derived, { quote: d.quote, fund: d.fundamentals, demo: true });
  assert.ok(snap.app.score >= 0 && snap.app.score <= 100);
  assert.ok(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'].includes(snap.app.grade));
  assert.equal(snap.demo, true);
  assert.equal(typeof snap.at, 'number');
});

// ---------------------------------------------------------------------------
console.log('\nNew endpoints');

await test('/api/journal saves privately and reads back; bad input refused', async () => {
  const { useStorageForTests } = await import('../api/notes.js');
  const files = new Map();
  const calls = [];
  useStorageForTests({
    put: async (path, body, opts) => { calls.push([path, opts]); files.set(path, body); return { pathname: path }; },
    get: async (path) => (files.has(path) ? { statusCode: 200, stream: new Response(files.get(path)).body } : null),
  });
  delete process.env.BLOB_READ_WRITE_TOKEN;
  assert.equal((await call('journal', '')).status, 503);
  process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  assert.equal((await call('journal', '')).body.journal, null);
  const body = JSON.stringify({ ideas: [{ id: 'i-1', ticker: 'NVDA' }], deleted: { 'i-2': '2026-01-01' } });
  assert.equal((await call('journal', '', { method: 'PUT', body })).status, 200);
  assert.deepEqual([calls[0][0], calls[0][1].access, calls[0][1].addRandomSuffix], ['journal/ideas.json', 'private', false]);
  const got = await call('journal', '');
  assert.equal(got.body.journal.ideas[0].ticker, 'NVDA');
  assert.equal(got.cache, 'no-store');
  assert.equal((await call('journal', '', { method: 'PUT', body: '{"ideas":"no"}' })).status, 400);
  assert.equal((await call('journal', '', { method: 'PUT', body: '{oops' })).status, 400);
  process.env.APP_PASSCODE = 'secret';
  assert.equal((await call('journal', '')).status, 401);
  delete process.env.APP_PASSCODE;
});

await test('/api/search finds stocks, US listings first', async () => {
  samples['finnhub.io/api/v1/search'] = { count: 3, result: [
    { description: 'APPLE INC', displaySymbol: 'AAPL.MX', symbol: 'AAPL.MX', type: 'Common Stock' },
    { description: 'APPLE HOSPITALITY REIT', displaySymbol: 'APLE', symbol: 'APLE', type: 'REIT' },
    { description: 'APPLE INC', displaySymbol: 'AAPL', symbol: 'AAPL', type: 'Common Stock' },
  ] };
  const res = await call('search', 'q=aapl');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results.map((r) => r.symbol), ['AAPL', 'APLE', 'AAPL.MX']);
  assert.equal(res.body.results[0].name, 'Apple Inc');
  assert.equal((await call('search', 'q=')).status, 400);
  assert.equal((await call('search', 'q=%3Cscript%3E')).status, 400);
});

await test('/api/market: markets, sectors, your earnings and headlines in one answer', async () => {
  samples['finnhub.io/api/v1/news'] = [{ headline: 'Stocks rise', source: 'CNBC', url: 'https://example.com/n', datetime: 1790000000 }];
  const res = await call('market', 'symbols=aapl,NVDA,bad!');
  assert.equal(res.status, 200);
  assert.equal(res.body.markets.length, 10);
  assert.equal(res.body.sectors.length, 11);
  assert.equal(res.body.markets[0].label, 'S&P 500');
  assert.deepEqual(res.body.earnings.map((e) => e.symbol), ['AAPL']); // only your stocks
  assert.equal(res.body.news[0].time, 1790000000000);
  assert.match(res.cache, /s-maxage=120/);
  delete process.env.FINNHUB_API_KEY;
  assert.equal((await call('market', 'symbols=AAPL')).status, 503);
  process.env.FINNHUB_API_KEY = 'test-key';
});

await test('Sync works with either Blob setting Vercel adds (token or store id)', async () => {
  const { useStorageForTests } = await import('../api/notes.js');
  const files = new Map();
  useStorageForTests({
    put: async (path, body) => { files.set(path, body); return { pathname: path }; },
    get: async (path) => (files.has(path) ? { statusCode: 200, stream: new Response(files.get(path)).body } : null),
  });
  delete process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_STORE_ID = 'store_abc123';
  assert.equal((await call('notes', '')).body.configured, true);
  assert.equal((await call('journal', '')).status, 200);
  assert.equal((await call('status', '')).body.notes.status, 'ok');
  // Storage that refuses: a clear message instead of a vague error
  useStorageForTests({ put: async () => { throw new Error('Vercel Blob: Access denied, please provide a valid token for this resource.'); }, get: async () => null });
  const bad = (await call('status', '')).body.notes;
  assert.equal(bad.status, 'error');
  assert.match(bad.message, /Access denied/);
  assert.match(bad.message, /Private/);
  delete process.env.BLOB_STORE_ID;
  assert.equal((await call('status', '')).body.notes.status, 'missing');
});

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
