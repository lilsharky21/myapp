// ==========================================================================
// ratings.js: the app's own rating, worked out from the numbers.
//
// Seven factors, each scored 0-100 from several measurements:
//   Valuation 20% · Growth 20% · Profitability 15% · Financial health 15%
//   Momentum 15% · Earnings 10% · Sentiment 5%
// Every measurement is turned into a score with simple, visible rules
// (for example "P/E of 15 scores 85, P/E of 30 scores 52"), so you can
// always see exactly why a stock got its grade. No black box.
// ==========================================================================

import * as f from './format.js';

export const FACTORS = [
  { key: 'valuation', name: 'Valuation', weight: 20, about: 'Is the price reasonable for the profits and cash it produces?' },
  { key: 'growth', name: 'Growth', weight: 20, about: 'How fast are sales, profits and cash growing?' },
  { key: 'profitability', name: 'Profitability', weight: 15, about: 'How much of each sales dollar turns into profit, and how well is capital used?' },
  { key: 'health', name: 'Financial health', weight: 15, about: 'Could the company handle a bad year? Debt, cash and warning scores.' },
  { key: 'momentum', name: 'Momentum', weight: 15, about: 'Is the price trend working for or against you?' },
  { key: 'earnings', name: 'Earnings', weight: 10, about: 'Does it beat expectations, and are profits backed by real cash?' },
  { key: 'sentiment', name: 'Sentiment', weight: 5, about: 'What analysts and company insiders are doing.' },
];

// Turns a value into a 0-100 score by drawing straight lines between points.
// points: [[value, score], ...] from low value to high value
export function scale(value, points) {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, s1] = points[i];
    if (value <= x1) {
      const [x0, s0] = points[i - 1];
      return s0 + ((value - x0) / (x1 - x0)) * (s1 - s0);
    }
  }
  return points.at(-1)[1];
}

export function grade(score) {
  if (score == null) return '—';
  const bands = [[90, 'A+'], [83, 'A'], [77, 'A−'], [71, 'B+'], [65, 'B'], [59, 'B−'], [53, 'C+'], [47, 'C'], [41, 'C−'], [33, 'D']];
  for (const [min, letter] of bands) if (score >= min) return letter;
  return 'F';
}

// Same five labels Wall Street uses, so the ratings line up
export function ratingFor(score) {
  if (score == null) return { label: 'Not enough data', tone: 'neutral' };
  if (score >= 75) return { label: 'Strong Buy', tone: 'up' };
  if (score >= 62) return { label: 'Buy', tone: 'up' };
  if (score >= 45) return { label: 'Hold', tone: 'neutral' };
  if (score >= 33) return { label: 'Sell', tone: 'down' };
  return { label: 'Strong Sell', tone: 'down' };
}
export const RATING_ORDER = ['Strong Sell', 'Sell', 'Hold', 'Buy', 'Strong Buy'];

// Analyst consensus on a 1 (strong buy) to 5 (strong sell) scale
export function analystConsensus(recs) {
  const r = recs?.at(-1);
  if (!r) return null;
  const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
  if (!total) return null;
  const score = (r.strongBuy * 1 + r.buy * 2 + r.hold * 3 + r.sell * 4 + r.strongSell * 5) / total;
  const label = score <= 1.5 ? 'Strong Buy' : score <= 2.5 ? 'Buy' : score <= 3.5 ? 'Hold' : score <= 4.5 ? 'Sell' : 'Strong Sell';
  const tone = score <= 2.5 ? 'up' : score <= 3.5 ? 'neutral' : 'down';
  const buyShare = ((r.strongBuy + r.buy) / total) * 100;
  return { label, tone, total, score, buyShare, period: r.period };
}

export function median(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Warning scores from the annual statements
// ---------------------------------------------------------------------------

// Piotroski F-Score: 9 yes/no checks. 7-9 is strong, 0-3 is weak.
export function piotroski(annual) {
  const rows = annual?.rows;
  if (!rows) return null;
  const n = annual.periods.length;
  let i = -1;
  for (let k = n - 1; k >= 1; k--) {
    if (rows.revenue[k] != null && rows.netIncome[k] != null && rows.totalAssets[k] != null) { i = k; break; }
  }
  if (i < 1) return null;
  const j = i - 1;
  const v = (key, k) => rows[key]?.[k] ?? null;
  const has = (...xs) => xs.every((x) => x != null);
  const roa = (k) => (has(v('netIncome', k), v('totalAssets', k)) ? v('netIncome', k) / v('totalAssets', k) : null);
  const lev = (k) => (v('totalAssets', k) ? (v('longTermDebt', k) ?? 0) / v('totalAssets', k) : null);
  const cr = (k) => (has(v('currentAssets', k), v('currentLiabilities', k)) ? v('currentAssets', k) / v('currentLiabilities', k) : null);
  const gm = (k) => (has(v('grossProfit', k), v('revenue', k)) ? v('grossProfit', k) / v('revenue', k) : null);
  const turn = (k) => (has(v('revenue', k), v('totalAssets', k)) ? v('revenue', k) / v('totalAssets', k) : null);
  const test = (a, b, cmp) => (a == null || b == null ? null : cmp(a, b));

  const checks = [
    ['Profitable (positive net income)', v('netIncome', i) != null ? v('netIncome', i) > 0 : null],
    ['Positive operating cash flow', v('operatingCashFlow', i) != null ? v('operatingCashFlow', i) > 0 : null],
    ['Return on assets improved', test(roa(i), roa(j), (a, b) => a > b)],
    ['Cash flow is bigger than net income', test(v('operatingCashFlow', i), v('netIncome', i), (a, b) => a > b)],
    ['Less long-term debt (vs. assets)', test(lev(i), lev(j), (a, b) => a <= b)],
    ['Better current ratio', test(cr(i), cr(j), (a, b) => a > b)],
    ['No new shares issued', test(v('shares', i), v('shares', j), (a, b) => a <= b * 1.005)],
    ['Higher gross margin', test(gm(i), gm(j), (a, b) => a > b)],
    ['Higher asset turnover', test(turn(i), turn(j), (a, b) => a > b)],
  ].map(([label, pass]) => ({ label, pass }));
  const known = checks.filter((c) => c.pass !== null);
  if (known.length < 5) return null;
  const score = known.filter((c) => c.pass).length;
  return { score, known: known.length, scaled: (score / known.length) * 9, checks, year: annual.periods[i].label };
}

// Altman Z-Score: bankruptcy-risk warning. Above 2.99 safe, 1.81-2.99 grey zone, below 1.81 distress.
export function altmanZ(annual, marketCap) {
  const rows = annual?.rows;
  if (!rows || !marketCap) return null;
  const i = rows.totalAssets?.findLastIndex((x) => x != null);
  if (i == null || i < 0) return null;
  const ta = rows.totalAssets[i];
  const needed = {
    ca: rows.currentAssets[i], cl: rows.currentLiabilities[i], re: rows.retainedEarnings[i],
    ebit: rows.operatingIncome[i], tl: rows.totalLiabilities[i], sales: rows.revenue[i],
  };
  if (Object.values(needed).some((x) => x == null) || !ta || !needed.tl) return null;
  const parts = {
    workingCapital: (1.2 * (needed.ca - needed.cl)) / ta,
    retained: (1.4 * needed.re) / ta,
    ebit: (3.3 * needed.ebit) / ta,
    market: (0.6 * marketCap) / needed.tl,
    sales: (1.0 * needed.sales) / ta,
  };
  const z = Object.values(parts).reduce((s, x) => s + x, 0);
  const zone = z > 2.99 ? ['Safe', 'up'] : z >= 1.81 ? ['Grey zone', 'neutral'] : ['Distress', 'down'];
  return { z, zone: zone[0], tone: zone[1], parts, year: annual.periods[i].label };
}

// ---------------------------------------------------------------------------
// The app score
// ---------------------------------------------------------------------------

const pick = (m, ...keys) => {
  for (const k of keys) if (typeof m?.[k] === 'number' && Number.isFinite(m[k])) return m[k];
  return null;
};
const lastOf = (arr) => arr?.findLast((v) => v != null) ?? null;

export function appScore(input) {
  const { quote, metrics: m = {}, financials, tech, risk, earnings = [], recs = [], insiders = null, peers = [], valuation } = input;
  const annual = financials?.annual;
  const quarterly = financials?.quarterly;
  const inputs = Object.fromEntries(FACTORS.map((x) => [x.key, []]));
  const add = (factor, label, display, score, note) => {
    if (score == null) return;
    inputs[factor].push({ label, value: display, score: Math.round(score), note });
  };
  const price = quote?.price;
  const marketCap = quote?.marketCap ?? (m.marketCapitalization ? m.marketCapitalization * 1e6 : null);

  // ----- Valuation -----
  const pe = pick(m, 'peTTM', 'peExclExtraTTM', 'peBasicExclExtraTTM');
  const eps = pick(m, 'epsTTM', 'epsExclExtraItemsTTM');
  if (pe != null && pe > 0) add('valuation', 'P/E (TTM)', f.times(pe), scale(pe, [[8, 100], [15, 85], [20, 72], [30, 52], [45, 32], [70, 12], [100, 5]]));
  else if (eps != null && eps < 0) add('valuation', 'P/E (TTM)', 'Losing money', 20);
  const ps = pick(m, 'psTTM');
  add('valuation', 'P/S (TTM)', f.times(ps), scale(ps, [[1, 100], [3, 78], [6, 58], [10, 38], [20, 15], [40, 5]]));
  const epsGrowth = pick(m, 'epsGrowth5Y', 'epsGrowthTTMYoy');
  if (pe > 0 && epsGrowth > 0) {
    const peg = pe / epsGrowth;
    add('valuation', 'PEG (P/E ÷ growth)', f.num(peg), scale(peg, [[0.5, 100], [1, 85], [1.5, 68], [2, 52], [3, 32], [5, 10]]));
  }
  if (valuation?.fcf != null && marketCap) {
    const yieldPct = (valuation.fcf / marketCap) * 100;
    add('valuation', 'Free cash flow yield', f.pct(yieldPct, { sign: false }), scale(yieldPct, [[-5, 5], [0, 18], [1.5, 38], [3, 58], [5, 78], [8, 95]]));
  }
  if (valuation?.dcf && price) {
    const upside = (valuation.dcf.perShare / price - 1) * 100;
    add('valuation', 'DCF value vs. price', f.pct(upside), scale(upside, [[-60, 5], [-30, 25], [0, 55], [20, 75], [40, 92]]), 'Default DCF inputs');
  }
  const peerPe = median(peers.map((p) => (p.pe > 0 ? p.pe : null)));
  if (pe > 0 && peerPe) {
    const ratio = pe / peerPe;
    add('valuation', 'P/E vs. peers', `${ratio.toFixed(2)}× peer median`, scale(ratio, [[0.6, 92], [0.8, 75], [1, 60], [1.3, 42], [1.8, 22], [2.5, 8]]));
  }

  // ----- Growth -----
  const revYoY = pick(m, 'revenueGrowthTTMYoy') ?? lastOf(annual?.growth.revenue);
  add('growth', 'Revenue growth (YoY)', f.pct(revYoY), scale(revYoY, [[-15, 5], [-5, 20], [0, 35], [5, 50], [10, 65], [20, 85], [35, 100]]));
  const epsYoY = pick(m, 'epsGrowthTTMYoy') ?? lastOf(annual?.growth.eps);
  add('growth', 'EPS growth (YoY)', f.pct(epsYoY), scale(epsYoY, [[-30, 5], [-10, 22], [0, 38], [10, 58], [20, 75], [40, 95]]));
  const rev5 = pick(m, 'revenueGrowth5Y');
  add('growth', 'Revenue growth (5Y / yr)', f.pct(rev5), scale(rev5, [[-5, 10], [0, 28], [5, 48], [10, 66], [15, 80], [25, 97]]));
  const g = annual?.growth.revenue?.filter((v) => v != null) ?? [];
  if (g.length >= 4) {
    const accel = g.at(-1) - (g.at(-2) + g.at(-3) + g.at(-4)) / 3;
    add('growth', 'Growth speeding up?', `${accel >= 0 ? '+' : '−'}${Math.abs(accel).toFixed(1)} pts vs. 3-yr avg`, scale(accel, [[-15, 15], [-5, 38], [0, 55], [5, 72], [15, 90]]));
  }
  const fcfGrowth = lastOf(annual?.growth.freeCashFlow);
  add('growth', 'Free cash flow growth', f.pct(fcfGrowth), scale(fcfGrowth, [[-30, 10], [0, 40], [10, 62], [25, 85]]));

  // ----- Profitability -----
  const gm = pick(m, 'grossMarginTTM') ?? lastOf(annual?.ratios.grossMargin);
  add('profitability', 'Gross margin', f.pct(gm, { sign: false }), scale(gm, [[5, 10], [20, 35], [35, 58], [50, 78], [65, 95]]));
  const om = pick(m, 'operatingMarginTTM') ?? lastOf(annual?.ratios.operatingMargin);
  add('profitability', 'Operating margin', f.pct(om, { sign: false }), scale(om, [[-10, 5], [0, 22], [8, 45], [15, 65], [25, 85], [35, 97]]));
  const nm = pick(m, 'netProfitMarginTTM') ?? lastOf(annual?.ratios.netMargin);
  add('profitability', 'Net margin', f.pct(nm, { sign: false }), scale(nm, [[-10, 5], [0, 25], [5, 45], [12, 65], [20, 82], [30, 97]]));
  const roe = pick(m, 'roeTTM') ?? lastOf(annual?.ratios.roe);
  add('profitability', 'Return on equity', f.pct(roe, { sign: false }), scale(roe, [[-10, 5], [0, 20], [8, 42], [15, 65], [25, 85], [40, 97]]));
  const roic = lastOf(annual?.ratios.roic);
  add('profitability', 'Return on invested capital', f.pct(roic, { sign: false }), scale(roic, [[0, 15], [6, 40], [10, 60], [15, 78], [25, 95]]));
  const fcfm = lastOf(annual?.ratios.fcfMargin);
  add('profitability', 'Free cash flow margin', f.pct(fcfm, { sign: false }), scale(fcfm, [[-10, 5], [0, 25], [5, 45], [12, 65], [20, 85], [30, 97]]));

  // ----- Financial health -----
  const equity = lastOf(annual?.rows.equity);
  if (equity != null && equity < 0) add('health', 'Debt / equity', 'Negative equity', 20);
  else {
    const de = pick(m, 'totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual') ?? lastOf(annual?.ratios.debtToEquity);
    add('health', 'Debt / equity', f.num(de), scale(de, [[0, 100], [0.3, 88], [0.7, 72], [1.2, 52], [2, 32], [4, 10]]));
  }
  const cr = pick(m, 'currentRatioQuarterly', 'currentRatioAnnual') ?? lastOf(annual?.ratios.currentRatio);
  add('health', 'Current ratio', f.num(cr), scale(cr, [[0.5, 15], [0.8, 35], [1, 52], [1.5, 72], [2.5, 92]]));
  if (valuation?.netCash != null && (valuation.cash || valuation.debt)) {
    if (valuation.netCash >= 0) add('health', 'Cash vs. debt', `Net cash ${f.money(valuation.netCash)}`, 95);
    else if (valuation.fcf > 0) {
      const years = -valuation.netCash / valuation.fcf;
      add('health', 'Years of cash flow to repay debt', `${years.toFixed(1)} yrs`, scale(years, [[0, 95], [1, 85], [3, 65], [5, 45], [8, 25], [12, 8]]));
    } else add('health', 'Cash vs. debt', `Net debt ${f.money(-valuation.netCash)}, no free cash flow`, 12);
  }
  const z = altmanZ(annual, marketCap);
  if (z) add('health', 'Altman Z-Score', `${z.z.toFixed(2)} · ${z.zone}`, scale(z.z, [[0.5, 5], [1.8, 30], [2.5, 55], [3, 75], [5, 95]]));
  const fscore = piotroski(annual);
  if (fscore) add('health', 'Piotroski F-Score', `${fscore.score} of ${fscore.known}`, scale(fscore.scaled, [[1, 5], [3, 25], [5, 50], [7, 78], [9, 100]]));
  const interest = lastOf(annual?.rows.interestExpense);
  const ebit = lastOf(annual?.rows.operatingIncome);
  if (interest > 0 && ebit != null) {
    const cover = ebit / interest;
    add('health', 'Interest coverage', `${cover.toFixed(1)}×`, scale(cover, [[1, 10], [3, 40], [6, 65], [12, 85], [25, 98]]));
  }

  // ----- Momentum -----
  if (tech) {
    const trendScore = { Uptrend: 90, 'Pullback in uptrend': 65, Mixed: 50, 'Bounce in downtrend': 35, Downtrend: 15 }[tech.trend.label];
    add('momentum', 'Trend', tech.trend.label, trendScore);
    const r6 = tech.performance.find((p) => p.label === '6M')?.value;
    add('momentum', '6-month return', f.pct(r6), scale(r6, [[-30, 5], [-15, 22], [0, 45], [10, 62], [25, 82], [50, 97]]));
    if (risk?.relative1y != null) {
      add('momentum', 'vs. S&P 500 (1 year)', `${f.pct(risk.relative1y)} pts`, scale(risk.relative1y, [[-30, 5], [-10, 28], [0, 52], [10, 70], [25, 88], [50, 98]]));
    } else {
      const r1 = tech.performance.find((p) => p.label === '1Y')?.value;
      add('momentum', '1-year return', f.pct(r1), scale(r1, [[-30, 5], [0, 40], [15, 62], [30, 80], [60, 95]]));
    }
    add('momentum', 'RSI (14)', f.num(tech.rsi.value, 0), scale(tech.rsi.value, [[20, 40], [30, 38], [40, 42], [50, 60], [60, 78], [68, 72], [75, 55], [85, 38]]));
    add('momentum', 'From 52-week high', f.pct(tech.range52.fromHigh), scale(tech.range52.fromHigh, [[-50, 8], [-30, 30], [-15, 58], [-5, 82], [0, 92]]));
  }

  // ----- Earnings -----
  const reported = earnings.filter((e) => e.actual != null && e.estimate != null);
  if (reported.length) {
    const beats = reported.filter((e) => e.actual >= e.estimate).length;
    add('earnings', 'Beat estimates', `${beats} of last ${reported.length}`, scale((beats / reported.length) * 100, [[0, 8], [25, 28], [50, 50], [75, 75], [100, 95]]));
    const surprises = reported.map((e) => e.surprisePercent).filter((x) => x != null);
    if (surprises.length) {
      const avg = surprises.reduce((s, x) => s + x, 0) / surprises.length;
      add('earnings', 'Average surprise', f.pct(avg), scale(avg, [[-10, 5], [-3, 25], [0, 45], [3, 65], [8, 85], [15, 97]]));
    }
  }
  const qEps = lastOf(quarterly?.growth.eps);
  add('earnings', 'Latest quarter EPS vs. year ago', f.pct(qEps), scale(qEps, [[-30, 8], [-10, 28], [0, 45], [10, 65], [25, 85], [50, 98]]));
  const conv = lastOf(annual?.ratios.cashConversion);
  add('earnings', 'Cash backing profits', conv != null ? `${conv.toFixed(2)}× net income` : null, scale(conv, [[0.3, 10], [0.7, 35], [0.9, 55], [1.1, 75], [1.4, 92]]));

  // ----- Sentiment -----
  const consensus = analystConsensus(recs);
  if (consensus) {
    add('sentiment', 'Analyst consensus', `${consensus.label} (${consensus.total})`, scale(consensus.score, [[1.2, 97], [1.8, 82], [2.3, 68], [2.8, 52], [3.3, 35], [4, 15], [4.8, 5]]));
    const older = recs.length >= 3 ? analystConsensus(recs.slice(0, recs.length - 2)) : null;
    if (older) {
      const change = consensus.buyShare - older.buyShare;
      add('sentiment', 'Analysts turning', `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(0)} pts buy share`, scale(change, [[-15, 20], [-5, 40], [0, 55], [5, 70], [15, 88]]));
    }
  }
  if (Array.isArray(insiders) && insiders.length) {
    const buys = insiders.filter((t) => t.transactionCode === 'P');
    const sells = insiders.filter((t) => t.transactionCode === 'S');
    const sold = sells.reduce((s, t) => s + Math.abs(t.change) * (t.transactionPrice || 0), 0);
    if (buys.length && buys.length >= sells.length) add('sentiment', 'Insiders', `${buys.length} buys, ${sells.length} sells`, 85);
    else if (buys.length) add('sentiment', 'Insiders', `${buys.length} buys, ${sells.length} sells`, 65);
    else if (sells.length) add('sentiment', 'Insiders', `${sells.length} sells, no buys`, sold > 1e8 ? 35 : 45);
  }

  // ----- Put it together -----
  const factors = FACTORS.map((factor) => {
    const list = inputs[factor.key];
    const score = list.length ? list.reduce((s, x) => s + x.score, 0) / list.length : null;
    return { ...factor, score: score == null ? null : Math.round(score), grade: grade(score), inputs: list };
  });
  const scored = factors.filter((x) => x.score != null);
  const weightSum = scored.reduce((s, x) => s + x.weight, 0);
  const overall = scored.length >= 4 ? Math.round(scored.reduce((s, x) => s + x.score * x.weight, 0) / weightSum) : null;
  return { overall, grade: grade(overall), ...ratingFor(overall), factors, coverage: scored.length };
}
