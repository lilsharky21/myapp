// ==========================================================================
// demo.js: made-up numbers so the app has something to show before
// real data is connected. Everything here is labeled "Demo" on screen.
// The same ticker always gets the same demo numbers (they're "seeded").
// It never invents people or news: insider trades and headlines stay empty.
// ==========================================================================

// A tiny random number generator that gives the same sequence for the same seed
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (lo, hi) => lo + next() * (hi - lo);
  const normal = () => Math.sqrt(-2 * Math.log(next() || 1e-9)) * Math.cos(2 * Math.PI * next());
  return { next, between, normal };
}

const DAY = 86400;
const cache = new Map();

export function demoData(symbol) {
  if (!cache.has(symbol)) cache.set(symbol, build(symbol));
  return cache.get(symbol);
}

function build(symbol) {
  const rnd = seeded(symbol);

  // ---- ~5 years of daily prices (a random walk with a slight upward drift) ----
  const days = [];
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  while (days.length < 1300) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.unshift(d.getTime() / 1000);
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const drift = rnd.between(0.04, 0.22) / 252;
  const sigma = rnd.between(0.22, 0.42) / Math.sqrt(252);
  let close = rnd.between(40, 260);
  const baseVolume = rnd.between(8, 60) * 1e6;
  const daily = days.map((t) => {
    const open = close * (1 + rnd.normal() * 0.004);
    close = open * Math.exp(drift + sigma * rnd.normal());
    const high = Math.max(open, close) * (1 + Math.abs(rnd.normal()) * 0.007);
    const low = Math.min(open, close) * (1 - Math.abs(rnd.normal()) * 0.007);
    return { t, o: open, h: high, l: low, c: close, v: Math.round(baseVolume * (0.6 + Math.abs(rnd.normal()) * 0.6)) };
  });

  // ---- The last 5 days in 5-minute steps (9:30am-4pm New York = 13:30-20:00 UTC) ----
  const intraday = [];
  for (const day of daily.slice(-5)) {
    let p = day.o;
    for (let k = 0; k < 78; k++) {
      const t = day.t + 13.5 * 3600 + k * 300;
      const remaining = 78 - k;
      const o = p;
      p = p + (day.c - p) / remaining + p * 0.0018 * rnd.normal(); // wander, then land on the close
      if (k === 77) p = day.c;
      intraday.push({ t, o, h: Math.max(o, p) * 1.0006, l: Math.min(o, p) * 0.9994, c: p, v: Math.round(day.v / 78) });
    }
  }

  const last = daily.at(-1);
  const prev = daily.at(-2);
  const shares = rnd.between(0.4, 8) * 1e9;
  const year = daily.slice(-252);

  const quote = {
    symbol,
    price: last.c,
    change: last.c - prev.c,
    changePct: ((last.c - prev.c) / prev.c) * 100,
    open: last.o,
    high: last.h,
    low: last.l,
    prevClose: prev.c,
    time: Date.now(),
    name: null,
    exchange: 'Demo exchange',
    industry: 'Demo industry',
    country: 'US',
    currency: 'USD',
    marketCap: last.c * shares,
    sharesOutstanding: shares,
    ipo: null,
    website: null,
  };

  // ---- Key stats, using the same names Finnhub uses ----
  const pe = rnd.between(16, 52);
  const grossM = rnd.between(38, 74);
  const opM = grossM * rnd.between(0.35, 0.6);
  const netM = opM * rnd.between(0.7, 0.85);
  const revGrowth = rnd.between(4, 28);
  const metrics = {
    marketCapitalization: quote.marketCap / 1e6,
    peTTM: pe,
    psTTM: pe * netM / 100,
    pbAnnual: rnd.between(3, 18),
    epsTTM: last.c / pe,
    grossMarginTTM: grossM,
    operatingMarginTTM: opM,
    netProfitMarginTTM: netM,
    roeTTM: rnd.between(12, 45),
    roaTTM: rnd.between(6, 20),
    revenueGrowthTTMYoy: revGrowth,
    epsGrowthTTMYoy: revGrowth * rnd.between(0.8, 1.6),
    revenueGrowth5Y: rnd.between(6, 24),
    epsGrowth5Y: rnd.between(6, 30),
    'totalDebt/totalEquityAnnual': rnd.between(0.1, 1.4),
    currentRatioAnnual: rnd.between(0.9, 3),
    beta: rnd.between(0.8, 1.6),
    dividendYieldIndicatedAnnual: rnd.next() < 0.5 ? 0 : rnd.between(0.3, 2.2),
    '52WeekHigh': Math.max(...year.map((c) => c.h)),
    '52WeekLow': Math.min(...year.map((c) => c.l)),
    '10DayAverageTradingVolume': baseVolume / 1e6,
  };

  // ---- Analyst ratings for the last 6 months ----
  const recommendations = [];
  let buy = Math.round(rnd.between(10, 30));
  for (let k = 5; k >= 0; k--) {
    const m = new Date();
    m.setUTCDate(1);
    m.setUTCMonth(m.getUTCMonth() - k);
    buy = Math.max(3, buy + Math.round(rnd.normal() * 1.5));
    recommendations.push({
      period: m.toISOString().slice(0, 10),
      strongBuy: Math.round(buy * 0.45),
      buy,
      hold: Math.round(rnd.between(4, 14)),
      sell: Math.round(rnd.between(0, 3)),
      strongSell: Math.round(rnd.between(0, 1.4)),
    });
  }

  // ---- Earnings: estimate vs actual for the last 4 quarters ----
  const quarterEnds = lastQuarterEnds(8);
  const earnings = quarterEnds.slice(-4).map((end, k) => {
    const estimate = (metrics.epsTTM / 4) * (0.85 + k * 0.05);
    const actual = estimate * (1 + rnd.normal() * 0.06 + 0.03);
    return {
      period: end,
      estimate: round(estimate),
      actual: round(actual),
      surprise: round(actual - estimate),
      surprisePercent: ((actual - estimate) / Math.abs(estimate)) * 100,
    };
  });
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 20 + Math.floor(rnd.next() * 30));
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next.setUTCDate(next.getUTCDate() + 1);

  const fundamentals = {
    symbol,
    metrics,
    recommendations,
    earnings,
    nextEarnings: {
      date: next.toISOString().slice(0, 10),
      hour: 'amc',
      epsEstimate: round(earnings.at(-1).estimate * 1.05),
      revenueEstimate: null,
    },
    insiders: [],
    missing: [],
  };

  // ---- Financial statements ----
  const annualRevenue = (quote.marketCap / metrics.psTTM);
  const annual = statements(rnd, lastYearEnds(10), annualRevenue, revGrowth / 100, { grossM, opM, netM, shares }, 1);
  const quarterly = statements(rnd, quarterEnds.slice(-12), annualRevenue / 4, revGrowth / 100 / 4, { grossM, opM, netM, shares }, 4);

  return {
    quote,
    daily,
    intraday,
    fundamentals,
    financials: { symbol, source: 'Demo numbers', lines: DEMO_LINES, annual, quarterly },
    news: { symbol, news: [], newsStatus: 'demo', filings: [] },
  };
}

// Builds statement rows working backwards from the latest period
function statements(rnd, ends, latestRevenue, growthPerPeriod, m, lag) {
  const n = ends.length;
  const revenue = new Array(n);
  revenue[n - 1] = latestRevenue;
  for (let k = n - 2; k >= 0; k--) revenue[k] = revenue[k + 1] / (1 + growthPerPeriod + rnd.normal() * 0.03);

  const wobble = () => 1 + rnd.normal() * 0.04;
  const rows = {};
  rows.revenue = revenue;
  rows.grossProfit = revenue.map((r) => (r * m.grossM / 100) * wobble());
  rows.costOfRevenue = revenue.map((r, i) => r - rows.grossProfit[i]);
  rows.rnd = revenue.map((r) => r * 0.12 * wobble());
  rows.operatingIncome = revenue.map((r) => (r * m.opM / 100) * wobble());
  rows.sga = rows.grossProfit.map((g, i) => g - rows.operatingIncome[i] - rows.rnd[i]);
  rows.netIncome = revenue.map((r) => (r * m.netM / 100) * wobble());
  rows.shares = revenue.map((_, i) => m.shares * (1 + (n - 1 - i) * 0.006));
  rows.eps = rows.netIncome.map((ni, i) => round(ni / rows.shares[i]));
  rows.cash = revenue.map((r) => r * lag * 0.25 * wobble());
  rows.shortInvestments = revenue.map((r) => r * lag * 0.15 * wobble());
  rows.currentAssets = revenue.map((r, i) => (rows.cash[i] + rows.shortInvestments[i]) * 1.8);
  rows.totalAssets = rows.currentAssets.map((c) => c * 2.4);
  rows.currentLiabilities = rows.currentAssets.map((c) => c * 0.55);
  rows.longTermDebt = rows.totalAssets.map((a) => a * 0.18 * wobble());
  rows.totalLiabilities = rows.totalAssets.map((a) => a * 0.48);
  rows.equity = rows.totalAssets.map((a, i) => a - rows.totalLiabilities[i]);
  rows.operatingCashFlow = rows.netIncome.map((ni) => ni * 1.25 * wobble());
  rows.capex = revenue.map((r) => r * 0.06 * wobble());
  rows.freeCashFlow = rows.operatingCashFlow.map((o, i) => o - rows.capex[i]);
  rows.sbc = revenue.map((r) => r * 0.04 * wobble());
  rows.buybacks = rows.freeCashFlow.map((f) => f * 0.5 * wobble());
  rows.dividends = rows.netIncome.map((ni) => ni * 0.15);

  const pct = (a, b) => (a != null && b ? (a / b) * 100 : null);
  const growth = (arr) => arr.map((v, i) => (i >= lag && arr[i - lag] ? ((v - arr[i - lag]) / Math.abs(arr[i - lag])) * 100 : null));
  const quarterly = lag === 4;
  return {
    periods: ends.map((end) => ({ end, label: quarterly ? quarterLabel(end) : `FY${end.slice(0, 4)}` })),
    rows,
    ratios: {
      grossMargin: ends.map((_, i) => pct(rows.grossProfit[i], revenue[i])),
      operatingMargin: ends.map((_, i) => pct(rows.operatingIncome[i], revenue[i])),
      netMargin: ends.map((_, i) => pct(rows.netIncome[i], revenue[i])),
      fcfMargin: ends.map((_, i) => pct(rows.freeCashFlow[i], revenue[i])),
    },
    growth: {
      revenue: growth(revenue),
      netIncome: growth(rows.netIncome),
      eps: growth(rows.eps),
      freeCashFlow: growth(rows.freeCashFlow),
    },
  };
}

const DEMO_LINES = {
  income: [
    ['revenue', 'Revenue'], ['costOfRevenue', 'Cost of revenue'], ['grossProfit', 'Gross profit'],
    ['rnd', 'Research & development'], ['sga', 'Selling, general & admin'], ['operatingIncome', 'Operating income'],
    ['netIncome', 'Net income'], ['eps', 'EPS (diluted)', 'eps'], ['shares', 'Diluted shares', 'shares'],
  ],
  balance: [
    ['cash', 'Cash & equivalents'], ['shortInvestments', 'Short-term investments'], ['currentAssets', 'Current assets'],
    ['totalAssets', 'Total assets'], ['currentLiabilities', 'Current liabilities'], ['longTermDebt', 'Long-term debt'],
    ['totalLiabilities', 'Total liabilities'], ['equity', "Shareholders' equity"],
  ],
  cashflow: [
    ['operatingCashFlow', 'Operating cash flow'], ['capex', 'Capital expenditures'], ['freeCashFlow', 'Free cash flow'],
    ['sbc', 'Stock-based compensation'], ['buybacks', 'Share buybacks'], ['dividends', 'Dividends paid'],
  ],
};
for (const k of Object.keys(DEMO_LINES)) {
  DEMO_LINES[k] = DEMO_LINES[k].map(([key, label, format = 'money']) => ({ key, label, format }));
}

function lastQuarterEnds(count) {
  const out = [];
  const d = new Date();
  // step back to the most recent finished calendar quarter
  let y = d.getUTCFullYear();
  let q = Math.floor(d.getUTCMonth() / 3); // current quarter index 0-3; previous one is finished
  for (let k = 0; k < count; k++) {
    q -= 1;
    if (q < 0) { q = 3; y -= 1; }
    const end = new Date(Date.UTC(y, q * 3 + 3, 0));
    out.unshift(end.toISOString().slice(0, 10));
  }
  return out;
}

function lastYearEnds(count) {
  const y = new Date().getUTCFullYear() - 1;
  return Array.from({ length: count }, (_, k) => `${y - count + 1 + k}-12-31`);
}

function quarterLabel(end) {
  const d = new Date(end + 'T00:00:00Z');
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} '${String(d.getUTCFullYear()).slice(2)}`;
}

const round = (v) => Math.round(v * 100) / 100;
