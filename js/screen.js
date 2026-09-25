// ==========================================================================
// screen.js: Discover, the stock screener.
// Looks through ~90 well-known US stocks (js/universe.js), gives each a
// Quick score from its key numbers, and offers ready-made screens that a
// beginner can understand ("Fast growers", "Quality at a fair price"...).
// Tap any result to open its full research page.
// ==========================================================================

import { UNIVERSE } from './universe.js';
import { scale, grade } from './ratings.js';
import * as f from './format.js';
import { gradeHTML } from './ui.js';
import { technicalSummary } from './indicators.js';
import { getDaily, passcodeHeaders } from './api.js';

const esc = f.esc;
const CACHE = 'thesis-journal/screen-v3';
const CACHE_MS = 6 * 3_600_000;

// ---------------------------------------------------------------------------
// The Quick score: the same scoring rules as the app score's matching
// factors (js/ratings.js), using only the key numbers (no chart or DCF).
// ---------------------------------------------------------------------------

const avg = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export const QUICK_FACTORS = [
  ['value', 'Value', 25],
  ['growth', 'Growth', 25],
  ['quality', 'Quality', 20],
  ['health', 'Health', 15],
  ['momentum', 'Momentum', 15],
];

export function quickScore(s) {
  const parts = {
    value: avg([
      s.pe > 0 ? scale(s.pe, [[8, 100], [15, 85], [20, 72], [30, 52], [45, 32], [70, 12], [100, 5]]) : s.pe != null ? 10 : null,
      scale(s.ps, [[1, 100], [3, 78], [6, 58], [10, 38], [20, 15], [40, 5]]),
    ]),
    growth: avg([
      scale(s.revenueGrowth, [[-15, 5], [-5, 20], [0, 35], [5, 50], [10, 65], [20, 85], [35, 100]]),
      scale(s.epsGrowth, [[-30, 5], [-10, 22], [0, 38], [10, 58], [20, 75], [40, 95]]),
      scale(s.revenueGrowth5y, [[-5, 10], [0, 28], [5, 48], [10, 66], [15, 80], [25, 97]]),
    ]),
    quality: avg([
      scale(s.grossMargin, [[5, 10], [20, 35], [35, 58], [50, 78], [65, 95]]),
      scale(s.operatingMargin, [[-10, 5], [0, 22], [8, 45], [15, 65], [25, 85], [35, 97]]),
      scale(s.netMargin, [[-10, 5], [0, 25], [5, 45], [12, 65], [20, 82], [30, 97]]),
      scale(s.roe, [[-10, 5], [0, 20], [8, 42], [15, 65], [25, 85], [40, 97]]),
    ]),
    health: avg([
      s.debtToEquity != null && s.debtToEquity >= 0 ? scale(s.debtToEquity, [[0, 100], [0.3, 88], [0.7, 72], [1.2, 52], [2, 32], [4, 10]]) : null,
      scale(s.currentRatio, [[0.5, 15], [0.8, 35], [1, 52], [1.5, 72], [2.5, 92]]),
    ]),
    momentum: avg([
      scale(s.return6m, [[-30, 5], [-15, 22], [0, 45], [10, 62], [25, 82], [50, 97]]),
      scale(s.return1y, [[-30, 5], [0, 40], [15, 62], [30, 80], [60, 95]]),
    ]),
  };
  let total = 0;
  let weight = 0;
  for (const [key, , w] of QUICK_FACTORS) {
    if (parts[key] == null) continue;
    total += parts[key] * w;
    weight += w;
  }
  const overall = weight >= 50 ? Math.round(total / weight) : null;
  return { ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v == null ? null : Math.round(v)])), overall, grade: grade(overall) };
}

// ---------------------------------------------------------------------------
// The Swing score: is the price trend working right now? For trades that
// last days to weeks. Built from the trend (6 months), strength vs. the
// S&P 500 (3 months), how close it is to its 52-week high, and volume.
// ---------------------------------------------------------------------------

export function swingScore(s) {
  const parts = [
    [scale(s.return26w ?? s.return6m, [[-30, 5], [-10, 25], [0, 40], [15, 65], [40, 90], [80, 97]]), 35],
    [scale(s.vsSpx13w, [[-20, 5], [-8, 25], [0, 48], [8, 72], [20, 92]]), 30],
    [scale(s.fromHigh, [[-50, 5], [-30, 25], [-15, 55], [-5, 82], [-1, 92], [0, 88]]), 20],
    [scale(s.volumeRatio, [[0.6, 30], [1, 50], [1.4, 75], [2, 92], [3, 97]]), 15],
  ].filter(([v]) => v != null);
  const weight = parts.reduce((a, [, w]) => a + w, 0);
  if (weight < 50) return null;
  return Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / weight);
}

// Business quality and price trend together: good stocks to own right now
// (if the trend numbers are missing, the business score alone)
function combined(s) {
  if (s.q.overall == null) return null;
  return s.swing == null ? s.q.overall : Math.round(s.q.overall * 0.6 + s.swing * 0.4);
}

// P/E divided by long-term profit growth. Under 1.5 is "growth at a reasonable price"
const peg = (s) => (s.pe > 0 && s.epsGrowth5y > 0 ? s.pe / s.epsGrowth5y : null);

// Tech: by industry, or a company that reinvests 8%+ of sales in R&D (but not drug makers)
const TECH_INDUSTRY = /tech|semiconductor|software|internet|electronic|communications equipment|computer|hardware|it services/i;
const NOT_TECH = /biotech|pharma|health|life science|medical|drug/i;
export function isTech(s) {
  if (s.sector && NOT_TECH.test(s.sector)) return false;
  if (s.sector && TECH_INDUSTRY.test(s.sector)) return true;
  return s.rdIntensity >= 8 || (s.isTechLike === true && !s.sector);
}

// Days until the next earnings report (null if none in the next 3 weeks)
export function daysToEarnings(s, now = Date.now()) {
  if (!s.nextEarnings) return null;
  const d = Math.round((Date.parse(s.nextEarnings + 'T12:00:00Z') - now) / 86_400_000);
  return d >= 0 ? d : null;
}

// Suggested swing stop and target from the chart: 1.5× the average daily range
// below the price, and twice that distance above it (2:1 reward to risk)
export function stopTarget(tech) {
  const atr = tech?.atr?.value;
  if (!atr || !tech.last) return null;
  return { stop: tech.last - 1.5 * atr, target: tech.last + 3 * atr, riskPct: ((1.5 * atr) / tech.last) * 100 };
}

// ---------------------------------------------------------------------------
// Ready-made screens, by time frame
// ---------------------------------------------------------------------------

export const HORIZONS = [
  ['best', 'Best', 'Best overall: strong businesses whose price trend is also working.'],
  ['early', 'Early', 'Early finds: smaller companies whose growth is speeding up or that just turned the corner. Bigger upside, bigger swings: keep positions small.'],
  ['long', 'Long term', 'Years. Buy good businesses at sensible prices and hold them.'],
  ['medium', 'Months', 'Companies whose profits are improving, which tends to show up in the price over months.'],
  ['swing', 'Swing', 'Days to weeks. Trading price moves. Faster, riskier, and needs a stop every time.'],
];

const by = (fn, dir = -1) => (a, b) => {
  const x = fn(a);
  const y = fn(b);
  if (x == null) return 1;
  if (y == null) return -1;
  return (y - x) * -dir;
};

export const PRESETS = [
  // ----- Best overall -----
  {
    key: 'best', group: 'best', name: 'Best right now',
    about: 'The best mix of a strong business (Long-term score) and a strong price trend (Swing score).',
    check: 'Open it and read the AI note. Check the Valuation tab: a great stock can still be too expensive.',
    test: (s) => combined(s) != null, sort: by(combined),
  },
  {
    key: 'quality-trend', group: 'best', name: 'Great business, rising price',
    about: 'Very profitable companies that are beating the S&P 500 over the last 3 months and trading near their highs.',
    check: 'These are often popular, so check the P/E against peers (Valuation tab) before buying.',
    test: (s) => s.q.quality >= 65 && s.vsSpx13w > 0 && s.fromHigh >= -15, sort: by((s) => s.q.quality + (s.swing ?? 0)),
  },
  // ----- Early finds -----
  {
    key: 'gems', group: 'early', name: 'Hidden gems',
    about: 'Companies under $10B growing sales 20%+ a year, where growth is speeding up or profits are improving. The kind of stock that’s often found before it’s famous.',
    check: 'Read the AI note and the latest earnings. Small companies can be one bad quarter from a big drop, so size the position carefully.',
    test: (s) => s.marketCap != null && s.marketCap < 10e9 && s.revenueGrowth >= 20 && s.earlyScore >= 55, sort: by((s) => s.earlyScore),
  },
  {
    key: 'turned', group: 'early', name: 'Just turned profitable',
    about: 'Lost money the year before, made money last year. Turning profitable often changes how the market values a company.',
    check: 'Check it wasn’t a one-off (like selling a business). The Financials tab shows if operating profit improved too.',
    test: (s) => s.turnedProfitable, sort: by((s) => s.revenueGrowth),
  },
  {
    key: 'speeding', group: 'early', name: 'Growth speeding up',
    about: 'Sales grew faster last year than the year before (from the annual reports). Speeding-up growth is one of the earliest signs of a big run.',
    check: 'Check the latest quarter (Earnings tab): is it still speeding up?',
    test: (s) => s.acceleration >= 5 && s.revenueGrowth >= 15, sort: by((s) => s.acceleration),
  },
  {
    key: 'money-in', group: 'early', name: 'Money moving in early',
    about: 'Smaller companies beating the S&P 500 over 3 months, with volume above normal and the price near its high. Often a sign big investors are starting to buy.',
    check: 'Find out why in the News tab. Buying after a big jump is risky; a calm day or small dip is a better entry.',
    test: (s) => s.marketCap != null && s.marketCap < 20e9 && s.vsSpx13w >= 5 && s.volumeRatio >= 1.2 && s.fromHigh >= -15, sort: by((s) => s.vsSpx13w),
    confirm: (t) => [t.averages[1].above && t.averages[2].above && t.rsi.value < 78,
      !t.averages[2].above ? 'Below its 200-day average' : !t.averages[1].above ? 'Slipped under its 50-day' : t.rsi.value >= 78 ? `RSI ${t.rsi.value.toFixed(0)}: overbought` : 'Trend confirmed'],
  },
  {
    key: 'rising-tech', group: 'early', name: 'Rising tech',
    about: 'Tech companies under $50B growing 20%+ a year. Where tomorrow’s big names often come from.',
    check: 'Is the growth profitable, or paid for by losses? Check the cash-flow margin in the Financials tab.',
    test: (s) => isTech(s) && s.revenueGrowth >= 20 && s.marketCap != null && s.marketCap < 50e9, sort: by((s) => (s.earlyScore ?? 0) + (s.q.overall ?? 0)),
  },
  // ----- Long term -----
  {
    key: 'top', group: 'long', name: 'Top long-term score',
    about: 'The highest Long-term scores: good value, growth, quality, health and momentum together.',
    check: 'Read the bear case in the AI note. Ask: will this company be bigger in 5 years?',
    test: () => true, sort: by((s) => s.q.overall),
  },
  {
    key: 'quality', group: 'long', name: 'Quality at a fair price',
    about: 'Very profitable businesses (high margins and returns) whose P/E isn’t extreme. A classic long-term approach.',
    check: 'Check the Financials tab: have margins stayed high for several years?',
    test: (s) => s.q.quality >= 65 && s.pe > 0 && s.pe <= 35, sort: by((s) => (s.q.quality ?? 0) + (s.q.value ?? 0)),
  },
  {
    key: 'compounders', group: 'long', name: 'Compounders',
    about: 'Sales up 10%+ a year for 5 years, with high returns on equity and solid profits. The kind of business that grows your money quietly.',
    check: 'Look for what keeps competitors away (brand, network, switching costs). The AI note’s snapshot helps.',
    test: (s) => s.revenueGrowth5y >= 10 && s.roe >= 15 && s.netMargin >= 10, sort: by((s) => s.q.overall),
  },
  {
    key: 'growth', group: 'long', name: 'Fast growers',
    about: 'Sales growing 15% a year or more. Growth can drive big gains, but these often cost more and swing harder.',
    check: 'Is the company profitable yet? If not, check how much cash it has left (Financials tab).',
    test: (s) => s.revenueGrowth >= 15, sort: by((s) => s.revenueGrowth),
  },
  {
    key: 'cheap', group: 'long', name: 'Cheap vs. profits',
    about: 'Profitable companies with a P/E under 18: the price is low compared with what they earn.',
    check: 'Find out why it’s cheap (News tab, AI note). Sometimes the market is right.',
    test: (s) => s.pe > 0 && s.pe < 18 && s.netMargin > 5, sort: by((s) => s.pe, 1),
  },
  {
    key: 'strong', group: 'long', name: 'Strong balance sheet',
    about: 'Little debt and plenty of short-term cash. These tend to survive recessions better.',
    check: 'Pair it with growth: safe but shrinking is not a great investment.',
    test: (s) => s.debtToEquity != null && s.debtToEquity < 0.6 && s.currentRatio >= 1.3 && s.netMargin > 0, sort: by((s) => s.q.health),
  },
  {
    key: 'dividend', group: 'long', name: 'Dividend payers',
    about: 'Pay out 2.5% a year or more in cash and are profitable. Steadier, slower-growing businesses.',
    check: 'Check the dividend has grown over time, and that profits comfortably cover it.',
    test: (s) => s.dividendYield >= 2.5 && s.netMargin > 0, sort: by((s) => s.dividendYield),
  },
  // ----- Months -----
  {
    key: 'garp', group: 'medium', name: 'Growth at a reasonable price',
    about: 'P/E divided by profit growth (the PEG ratio) under 1.5: you’re not overpaying for the growth.',
    check: 'Make sure the growth is expected to continue: read the latest earnings in the Earnings tab.',
    test: (s) => peg(s) != null && peg(s) <= 1.5 && s.epsGrowth5y >= 8, sort: by(peg, 1),
  },
  {
    key: 'accelerating', group: 'medium', name: 'Growth speeding up',
    about: 'Last quarter’s sales grew faster than the past year’s. Speeding-up growth often leads the price higher over the following months.',
    check: 'Check the Earnings tab: did they beat estimates, and did they raise guidance?',
    test: (s) => s.revenueGrowthQ >= 10 && s.revenueGrowth != null && s.revenueGrowthQ >= s.revenueGrowth + 3, sort: by((s) => s.revenueGrowthQ - s.revenueGrowth),
  },
  {
    key: 'turnaround', group: 'medium', name: 'Turnarounds',
    about: 'The stock fell over the past year, but last quarter’s profits jumped. The market may not have noticed the recovery yet.',
    check: 'Read the news: is the improvement a one-off, or a real change in the business?',
    test: (s) => s.return1y <= -10 && s.epsGrowthQ >= 15, sort: by((s) => s.epsGrowthQ),
  },
  {
    key: 'steady', group: 'medium', name: 'Steady winners',
    about: 'Beating the S&P 500 by 10+ points over 6 months and still near their highs. Trends like this often last months.',
    check: 'Check the Technicals tab: is it still above its 50-day average?',
    test: (s) => s.vsSpx26w >= 10 && s.fromHigh >= -10, sort: by((s) => s.vsSpx26w),
  },
  // ----- Swing -----
  {
    key: 'pullback', group: 'swing', name: 'Pullback in an uptrend',
    about: 'Up strongly over 6 months, but dipped this week and is a bit below its high. Swing traders buy these dips in strong trends.',
    check: 'Tap “Check the charts”. Best when it’s above its 200-day average and RSI has cooled to 35–55. Set a stop under the recent low.',
    test: (s) => (s.return26w ?? s.return6m) >= 10 && s.return5d <= -2 && s.fromHigh >= -15 && s.fromHigh <= -3,
    sort: by((s) => s.swing),
    confirm: (t) => [t.averages[2].above && t.rsi.value >= 35 && t.rsi.value <= 55,
      !t.averages[2].above ? 'Below its 200-day average' : t.rsi.value > 55 ? `RSI ${t.rsi.value.toFixed(0)}: hasn’t cooled off yet` : t.rsi.value < 35 ? `RSI ${t.rsi.value.toFixed(0)}: falling hard` : 'Uptrend, cooled off'],
  },
  {
    key: 'breakout', group: 'swing', name: 'Near a breakout',
    about: 'Within 3% of the 52-week high, with trading volume picking up. A move to new highs can run for a while.',
    check: 'Wait for a close above the 52-week high, or set an alert just above it. Stop just under the breakout level.',
    test: (s) => s.fromHigh >= -3 && s.volumeRatio >= 1.1 && s.return13w > 0, sort: by((s) => s.volumeRatio),
    confirm: (t) => [t.averages[1].above && t.rsi.value >= 50 && t.rsi.value <= 75,
      !t.averages[1].above ? 'Below its 50-day average' : t.rsi.value > 75 ? `RSI ${t.rsi.value.toFixed(0)}: stretched` : t.rsi.value < 50 ? `RSI ${t.rsi.value.toFixed(0)}: momentum fading` : 'Strong, not stretched'],
  },
  {
    key: 'momentum', group: 'swing', name: 'Momentum leaders',
    about: 'Beating the S&P 500 over both the last month and 3 months. Strong stocks tend to keep leading for a while.',
    check: 'Don’t chase a stock up 10% today. Look for a calm day or small dip to enter.',
    test: (s) => s.vsSpx4w >= 3 && s.vsSpx13w >= 5, sort: by((s) => s.vsSpx13w),
    confirm: (t) => [t.averages[1].above && t.averages[2].above && t.rsi.value < 78,
      !t.averages[2].above ? 'Below its 200-day average' : !t.averages[1].above ? 'Slipped under its 50-day' : t.rsi.value >= 78 ? `RSI ${t.rsi.value.toFixed(0)}: overbought` : 'Trend confirmed'],
  },
  {
    key: 'bounce', group: 'swing', name: 'Oversold bounce',
    about: 'Down 15%+ over 3 months but up this week, in a decent business. Bounces can be sharp, but they’re the riskiest swing trade.',
    check: 'Keep it small and use a tight stop under this month’s low. Many “cheap” stocks keep falling.',
    test: (s) => s.return13w <= -15 && s.return5d >= 2 && s.q.quality >= 45, sort: by((s) => s.return5d),
    confirm: (t) => [t.rsi.value >= 30 && t.rsi.value <= 50,
      t.rsi.value < 30 ? `RSI ${t.rsi.value.toFixed(0)}: still falling` : t.rsi.value > 50 ? `RSI ${t.rsi.value.toFixed(0)}: bounce already happened` : 'Turning up from oversold'],
  },
  {
    key: 'volume', group: 'swing', name: 'Unusual volume',
    about: 'Trading 50%+ more than usual over the last 2 weeks. Big money may be moving in (or out). Check the news for why.',
    check: 'Direction matters: heavy volume on up days is good, heavy volume on down days is a warning.',
    test: (s) => s.volumeRatio >= 1.5, sort: by((s) => s.volumeRatio),
    confirm: (t) => [t.averages[1].above, t.averages[1].above ? 'Above its 50-day average' : 'Below its 50-day average'],
  },
];

export const SECTORS = [...new Set(UNIVERSE.map((u) => u[2]))];

// Add both scores to each stock (once)
export function scored(stocks) {
  return stocks.map((s) => {
    if (s.q) return s;
    const withQ = { ...s, q: quickScore(s) };
    withQ.swing = swingScore(s);
    return withQ;
  });
}

// Apply a screen and the filters; returns the matching stocks, best first
// Company size by market value
export const SIZES = [
  ['large', 'Large (over $10B)', (cap) => cap >= 10e9],
  ['mid', 'Mid ($2–10B)', (cap) => cap >= 2e9 && cap < 10e9],
  ['small', 'Small (under $2B)', (cap) => cap < 2e9],
];

export function runScreen(stocks, { preset = 'best', sector = '', maxPe = null, size = '', techOnly = false } = {}) {
  const p = PRESETS.find((x) => x.key === preset) ?? PRESETS[0];
  const sizeTest = SIZES.find(([key]) => key === size)?.[2];
  const list = scored(stocks)
    .filter((s) => (!sector || s.sector === sector) && (maxPe == null || (s.pe > 0 && s.pe <= maxPe)))
    .filter((s) => !sizeTest || (s.marketCap != null && sizeTest(s.marketCap)))
    .filter((s) => !techOnly || isTech(s))
    .filter((s) => { try { return p.test(s); } catch { return false; } })
    .sort(p.sort);
  if (p.group !== 'swing') return list;
  // Swing trades: an earnings report within a week can gap the price either way, so those go last
  const soon = (s) => { const d = daysToEarnings(s); return d != null && d <= 7; };
  return [...list.filter((s) => !soon(s)), ...list.filter(soon)];
}

// ---------------------------------------------------------------------------
// "Why it's here": a stock's strongest facts for the time frame you're looking at
// ---------------------------------------------------------------------------

const REASON_ORDER = {
  best: ['growth', 'margin', 'strength', 'high', 'fcf', 'cheap', 'roe'],
  early: ['speeding', 'turned', 'growth', 'marginUp', 'rd', 'strength', 'size'],
  long: ['growth', 'margin', 'fcf', 'roe', 'cheap', 'debt', 'dividend'],
  medium: ['accel', 'eps', 'peg', 'growth', 'strength6', 'margin'],
  swing: ['dip', 'high', 'strength', 'volume', 'bounce', 'growth'],
};

export function reasonsFor(s, group = 'best') {
  const r0 = (v) => Math.round(v);
  const facts = {
    growth: s.revenueGrowth >= 15 && `Sales +${r0(s.revenueGrowth)}%`,
    margin: s.netMargin >= 15 && `${r0(s.netMargin)}% profit margin`,
    fcf: s.fcfMargin >= 15 && `${r0(s.fcfMargin)}% cash-flow margin`,
    roe: s.roe >= 25 && `${r0(s.roe)}% return on equity`,
    cheap: s.pe > 0 && s.pe <= 16 && `P/E ${r0(s.pe)}`,
    peg: peg(s) != null && peg(s) <= 1.2 && `PEG ${peg(s).toFixed(1)}`,
    debt: s.debtToEquity != null && s.debtToEquity >= 0 && s.debtToEquity < 0.3 && 'Almost no debt',
    dividend: s.dividendYield >= 3 && `${s.dividendYield.toFixed(1)}% dividend`,
    strength: s.vsSpx13w >= 5 && `+${r0(s.vsSpx13w)} pts vs S&P (3 mo)`,
    strength6: s.vsSpx26w >= 10 && `+${r0(s.vsSpx26w)} pts vs S&P (6 mo)`,
    high: s.fromHigh >= -3 && 'At its 52-week high',
    dip: s.return5d <= -2 && (s.return26w ?? s.return6m) >= 10 && `Dipped ${r0(Math.abs(s.return5d))}% this week`,
    volume: s.volumeRatio >= 1.5 && `Volume ${s.volumeRatio.toFixed(1)}× usual`,
    bounce: s.return5d >= 3 && s.return13w <= -15 && `Up ${r0(s.return5d)}% this week`,
    accel: s.revenueGrowthQ != null && s.revenueGrowth != null && s.revenueGrowthQ >= s.revenueGrowth + 5 && `Sales growth speeding up (+${r0(s.revenueGrowthQ)}%)`,
    eps: s.epsGrowthQ >= 25 && `Profits +${r0(s.epsGrowthQ)}% last quarter`,
    speeding: s.acceleration >= 5 && `Growth speeding up (+${r0(s.acceleration)} pts)`,
    turned: s.turnedProfitable && 'Just turned profitable',
    marginUp: s.marginChange >= 3 && `Margins up ${r0(s.marginChange)} pts`,
    rd: s.rdIntensity >= 10 && `Reinvests ${r0(s.rdIntensity)}% in R&D`,
    size: s.marketCap != null && s.marketCap < 10e9 && `${f.money(s.marketCap)} company`,
  };
  const list = (REASON_ORDER[group] ?? REASON_ORDER.best).map((k) => facts[k]).filter(Boolean).slice(0, 3);
  // Always flag an earnings report coming up soon
  const d = daysToEarnings(s);
  if (d != null && d <= 10) list.unshift(`⚠ Earnings ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`}`);
  return list;
}

// ---------------------------------------------------------------------------
// Chart check: real technicals (RSI, moving averages) for the top results,
// from their daily price history. Used by the swing screens.
// Returns { [ticker]: technicalSummary }
// ---------------------------------------------------------------------------

export async function checkCharts(tickers, onEach) {
  await Promise.all(tickers.map(async (t) => {
    const r = await getDaily(t);
    const candles = r.status === 'live' || r.status === 'demo' ? r.data.candles : null;
    onEach(t, candles?.length > 200 ? technicalSummary(candles) : null);
  }));
}

// ---------------------------------------------------------------------------
// Loading: one set of ~23 stocks at a time, pausing between fresh sets so
// the free Finnhub limit isn't hit. Saved on this device for 12 hours.
// ---------------------------------------------------------------------------

export function savedScreen() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE));
    return saved && Date.now() - saved.at < CACHE_MS && saved.complete ? saved : null;
  } catch {
    return null;
  }
}

// onUpdate({ stocks, loaded, total, waiting, demo, error })
// onUpdate({ stocks, loaded, total, waiting, demo, error, scan })
export async function loadScreen({ onUpdate, signal }) {
  const saved = savedScreen();
  if (saved) return onUpdate({ stocks: saved.stocks, loaded: saved.stocks.length, total: saved.stocks.length, demo: saved.demo, scan: saved.scan });

  // Step 1: the whole-market scan (every NYSE and Nasdaq company's annual report)
  const first = await getJSON('/api/candidates', signal);
  if (!first) return;
  if (first.status === 'offline') return useDemo(onUpdate);
  if (first.status === 'locked') return onUpdate({ stocks: [], error: 'Open any stock and enter your passcode first.' });
  const candidates = first.status === 'ok' && !first.body.fallback ? first.body.candidates : null;
  if (!candidates?.length) return loadFixedList({ onUpdate, signal }); // SEC unavailable: the built-in list

  // Step 2: price, valuation and momentum for the finalists, best first
  const scan = { scanned: first.body.scanned, listed: first.body.listed, year: first.body.year };
  const bySymbol = new Map(candidates.map((c) => [c.symbol, c]));
  const stocks = [];
  onUpdate({ stocks: [], loaded: 0, total: candidates.length, scan });
  for (let i = 0; i < candidates.length; i += CHUNK) {
    if (signal.aborted) return;
    const symbols = candidates.slice(i, i + CHUNK).map((c) => c.symbol);
    const started = Date.now();
    const r = await getJSON(`/api/screen?symbols=${encodeURIComponent(symbols.join(','))}`, signal);
    if (!r) return;
    if (r.status === 'offline') return useDemo(onUpdate);
    if (r.status === 'locked') return onUpdate({ stocks, error: 'Open any stock and enter your passcode first.' });
    if (r.status !== 'ok') return onUpdate({ stocks, scan, error: r.body?.message || "Couldn't load the screener. Try again in a minute." });
    stocks.push(...r.body.stocks.map((st) => mergeSec(st, bySymbol.get(st.symbol))));
    const done = i + CHUNK >= candidates.length;
    // A slow answer came fresh from Finnhub (not the cache): pause so the free limit isn't hit
    const pause = !done && Date.now() - started > 1500 ? 60_000 : 0;
    onUpdate({ stocks: [...stocks], loaded: Math.min(i + CHUNK, candidates.length), total: candidates.length, waiting: pause / 1000, scan });
    if (done) return remember(stocks, false, scan);
    if (pause) await wait(pause, signal);
  }
}

const CHUNK = 15;

// The SEC's annual-report numbers fill in anything Finnhub didn't have
function mergeSec(stock, c) {
  if (!c) return stock;
  return {
    ...stock,
    name: stock.name && stock.name !== stock.symbol ? stock.name : titleCase(c.name),
    exchange: c.exchange,
    revenue: c.revenue,
    revenueGrowth: stock.revenueGrowth ?? c.revenueGrowthSec,
    netMargin: stock.netMargin ?? c.netMarginSec,
    roe: stock.roe ?? c.roeSec,
    fcfMargin: c.fcfMargin,
    businessScore: c.businessScore,
    earlyScore: c.earlyScore,
    acceleration: c.acceleration,
    turnedProfitable: c.turnedProfitable,
    marginChange: c.marginChange,
    rdIntensity: c.rdIntensity,
    isTechLike: c.isTechLike,
  };
}

const titleCase = (name) => String(name ?? '').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());

// Returns { status: 'ok' | 'offline' | 'locked' | 'error', body } or null if cancelled
async function getJSON(path, signal) {
  let res;
  try {
    res = await fetch(path, { headers: { Accept: 'application/json', ...passcodeHeaders() }, signal });
  } catch (err) {
    return err.name === 'AbortError' ? null : { status: 'offline' };
  }
  if (!(res.headers.get('content-type') || '').includes('json') || res.status === 503) return { status: 'offline' };
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) return { status: 'locked' };
  return { status: res.ok ? 'ok' : 'error', body };
}

function wait(ms, signal) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

// No backend or no key: made-up numbers so the screen can be tried
function useDemo(onUpdate) {
  const demo = demoStocks();
  remember(demo, true, null);
  onUpdate({ stocks: demo, loaded: demo.length, total: demo.length, demo: true });
}

// Fallback when the SEC scan isn't available: the built-in list of well-known stocks
async function loadFixedList({ onUpdate, signal }) {
  const stocks = [];
  for (let set = 0; ; set++) {
    if (signal.aborted) return;
    const started = Date.now();
    const r = await getJSON(`/api/screen?set=${set}`, signal);
    if (!r) return;
    if (r.status === 'offline') return useDemo(onUpdate);
    if (r.status === 'locked') return onUpdate({ stocks, error: 'Open any stock and enter your passcode first.' });
    if (r.status !== 'ok') return onUpdate({ stocks, error: r.body?.message || "Couldn't load the screener. Try again in a minute." });
    stocks.push(...r.body.stocks);
    const done = set + 1 >= r.body.sets;
    const pause = !done && Date.now() - started > 1500 ? 60_000 : 0;
    onUpdate({ stocks: [...stocks], loaded: stocks.length, total: UNIVERSE.length, waiting: pause / 1000 });
    if (done) return remember(stocks, false, null);
    if (pause) await wait(pause, signal);
  }
}

function remember(stocks, demo, scan) {
  try { localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), stocks, demo, scan, complete: true })); } catch { /* storage full */ }
}

export function forgetScreen() {
  try { localStorage.removeItem(CACHE); } catch { /* blocked */ }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const gradeCell = (score) => (score != null ? `${gradeHTML(grade(score))} <span class="cmp-sub">${score}</span>` : f.DASH);
const pctCell = (v) => `<td class="${f.tone(v)}">${f.pct(v)}</td>`;

// Every column the screens can show: [header, cell]
const COLUMNS = {
  best: ['Overall', (s) => `<td>${gradeCell(combined(s))}</td>`],
  score: ['Long-term', (s) => `<td>${gradeCell(s.q.overall)}</td>`],
  swing: ['Swing', (s) => `<td>${gradeCell(s.swing)}</td>`],
  value: ['Value', (s) => `<td>${s.q.value != null ? gradeHTML(grade(s.q.value)) : f.DASH}</td>`],
  growth: ['Growth', (s) => `<td>${s.q.growth != null ? gradeHTML(grade(s.q.growth)) : f.DASH}</td>`],
  quality: ['Quality', (s) => `<td>${s.q.quality != null ? gradeHTML(grade(s.q.quality)) : f.DASH}</td>`],
  health: ['Health', (s) => `<td>${s.q.health != null ? gradeHTML(grade(s.q.health)) : f.DASH}</td>`],
  price: ['Price', (s) => `<td>${f.price(s.price)}</td>`],
  today: ['Today', (s) => pctCell(s.changePct)],
  ret5d: ['5 days', (s) => pctCell(s.return5d)],
  ret13w: ['3 months', (s) => pctCell(s.return13w)],
  ret1y: ['1 year', (s) => pctCell(s.return1y)],
  vsSpx: ['vs S&P (3m)', (s) => pctCell(s.vsSpx13w)],
  vsSpx26: ['vs S&P (6m)', (s) => pctCell(s.vsSpx26w)],
  fromHigh: ['From high', (s) => `<td class="${s.fromHigh >= -3 ? 'up' : ''}">${f.pct(s.fromHigh)}</td>`],
  volume: ['Volume', (s) => `<td class="${s.volumeRatio >= 1.5 ? 'up' : ''}">${s.volumeRatio != null ? `${s.volumeRatio.toFixed(1)}×` : f.DASH}</td>`],
  pe: ['P/E', (s) => `<td>${f.times(s.pe)}</td>`],
  peg: ['PEG', (s) => `<td>${peg(s) != null ? peg(s).toFixed(2) : f.DASH}</td>`],
  revGrowth: ['Rev. growth', (s) => pctCell(s.revenueGrowth)],
  revQ: ['Rev. (last qtr)', (s) => pctCell(s.revenueGrowthQ)],
  epsQ: ['EPS (last qtr)', (s) => pctCell(s.epsGrowthQ)],
  netMargin: ['Net margin', (s) => `<td>${f.pct(s.netMargin, { sign: false })}</td>`],
  div: ['Dividend', (s) => `<td>${s.dividendYield ? f.pct(s.dividendYield, { sign: false }) : f.DASH}</td>`],
  sector: ['Industry', (s) => `<td class="muted-cell">${esc(s.sector ?? '')}</td>`],
  early: ['Early', (s) => `<td>${gradeCell(s.earlyScore ?? null)}</td>`],
  size: ['Size', (s) => `<td>${s.marketCap != null ? f.money(s.marketCap) : f.DASH}</td>`],
  accel: ['Growth trend', (s) => `<td class="${f.tone(s.acceleration)}">${s.acceleration != null ? `${s.acceleration >= 0 ? '+' : '−'}${Math.abs(s.acceleration).toFixed(0)} pts` : f.DASH}</td>`],
  marginChg: ['Margin change', (s) => `<td class="${f.tone(s.marginChange)}">${s.marginChange != null ? `${s.marginChange >= 0 ? '+' : '−'}${Math.abs(s.marginChange).toFixed(1)} pts` : f.DASH}</td>`],
};

const LAYOUTS = {
  best: ['best', 'score', 'swing', 'price', 'ret13w', 'fromHigh', 'pe', 'revGrowth', 'sector'],
  early: ['early', 'score', 'swing', 'size', 'revGrowth', 'accel', 'marginChg', 'vsSpx', 'sector'],
  long: ['score', 'value', 'growth', 'quality', 'health', 'pe', 'revGrowth', 'netMargin', 'ret1y', 'div', 'sector'],
  medium: ['score', 'swing', 'peg', 'revQ', 'epsQ', 'revGrowth', 'vsSpx26', 'ret1y', 'sector'],
  swing: ['swing', 'price', 'today', 'ret5d', 'ret13w', 'vsSpx', 'fromHigh', 'volume', 'score', 'sector'],
};

// view: { preset, sector, maxPe, stocks, loaded, total, waiting, demo, error, showAll, charts }
// onList: the tickers already on your watchlist
// isNew(symbol): true if it entered this screen since you last looked
export function discoverHTML(view, onList, isNew = () => false) {
  const p = PRESETS.find((x) => x.key === view.preset) ?? PRESETS[0];
  const results = view.stocks ? runScreen(view.stocks, view) : [];
  const horizon = HORIZONS.find(([key]) => key === p.group);
  const tabs = HORIZONS.map(([key, label]) => `<button type="button" role="tab" data-horizon="${key}" aria-selected="${key === p.group}">${label}</button>`).join('');
  const chips = PRESETS.filter((x) => x.group === p.group)
    .map((x) => `<button type="button" class="chip${x.key === p.key ? ' on' : ''}" data-preset="${x.key}">${x.name}</button>`).join('');
  const sectorList = view.stocks?.length ? [...new Set(view.stocks.map((s) => s.sector).filter(Boolean))].sort() : SECTORS;
  const sectors = ['<option value="">All industries</option>', ...sectorList.map((s) => `<option value="${esc(s)}"${s === view.sector ? ' selected' : ''}>${esc(s)}</option>`)].join('');
  const sizes = ['<option value="">Any size</option>', ...SIZES.map(([key, label]) => `<option value="${key}"${key === view.size ? ' selected' : ''}>${label}</option>`)].join('');
  const scanLine = view.scan ? `Scanned ${view.scan.scanned.toLocaleString('en-US')} US companies · ` : '';
  const loading = view.total && view.loaded < view.total
    ? `<p class="muted-line"><span class="spinner"></span>${scanLine}checking the best ${view.total} (${view.loaded} done)${view.waiting ? ` · next batch in ${view.waiting}s (keeps you inside the free data limit)` : '…'}</p>`
    : !view.stocks && !view.error ? '<p class="muted-line"><span class="spinner"></span>Scanning every NYSE and Nasdaq company…</p>' : '';

  const LIMIT = 25;
  const shown = view.showAll ? results : results.slice(0, LIMIT);
  const cols = LAYOUTS[p.group];
  const charts = view.charts ?? {};
  const withCharts = Boolean(p.confirm) && shown.some((s) => charts[s.symbol]);
  const chartCells = (s) => {
    if (!withCharts) return '';
    const c = charts[s.symbol];
    if (c === undefined) return '<td class="muted-cell check-cell">Not checked</td><td class="muted-cell">—</td><td class="muted-cell">—</td><td class="muted-cell">—</td>';
    if (c === 'loading') return '<td class="muted-cell"><span class="spinner"></span></td><td></td><td></td><td></td>';
    if (!c) return '<td class="muted-cell">No chart data</td><td></td><td></td><td></td>';
    const [pass, why] = p.confirm(c);
    const plan = stopTarget(c);
    return `<td class="check-cell"><span class="check-pill ${pass ? 'pass' : 'fail'}">${pass ? '✓' : '✗'} ${esc(why)}</span></td>
      <td class="plan-cell">${plan ? `<span class="down">${f.price(plan.stop)}</span> / <span class="up">${f.price(plan.target)}</span>` : f.DASH}</td>
      <td>${c.rsi.value != null ? c.rsi.value.toFixed(0) : f.DASH}</td>
      <td class="${c.trend.tone}">${esc(c.trend.label)}</td>`;
  };
  const rows = shown.map((s) => {
    const why = reasonsFor(s, p.group);
    const mark = onList.has(s.symbol)
      ? '<span class="on-list" title="On your watchlist">★</span>'
      : `<button type="button" class="row-add" data-add="${esc(s.symbol)}" data-name="${esc(s.name)}" data-price="${s.price ?? ''}" aria-label="Add ${esc(s.symbol)} to your watchlist">+</button>`;
    return `<tr data-ticker="${esc(s.symbol)}" data-name="${esc(s.name)}" tabindex="0">
      <th scope="row" class="sticky">
        <span class="row-top"><span class="cmp-ticker">${esc(s.symbol)}</span>${isNew(s.symbol) ? '<span class="new-badge">New</span>' : ''}${mark}</span>
        <span class="help">${esc(s.name)}</span>
        ${why.length ? `<span class="why">${why.map((w) => (w.startsWith('⚠') ? `<span class="why-warn">${esc(w)}</span>` : esc(w))).join(' · ')}</span>` : ''}
      </th>
      ${COLUMNS[cols[0]][1](s)}
      ${chartCells(s)}
      ${cols.slice(1).map((c) => COLUMNS[c][1](s)).join('')}
    </tr>`;
  }).join('');
  // The chart check sits right after the score, where you can see it without scrolling
  const heads = ['Stock', COLUMNS[cols[0]][0], ...(withCharts ? ['Chart check', 'Stop / Target', 'RSI', 'Chart trend'] : []), ...cols.slice(1).map((c) => COLUMNS[c][0])];
  const top = shown.slice(0, 8).map((s) => s.symbol);
  const checking = top.some((t) => charts[t] === 'loading');
  const chartButton = p.confirm && shown.length
    ? `<button type="button" class="btn-primary small" data-action="check-charts" data-tickers="${top.join(',')}"${checking ? ' disabled' : ''}>
        ${checking ? 'Checking charts…' : withCharts ? 'Check the charts again' : `Check the charts for the top ${Math.min(8, shown.length)}`}</button>
       <p class="muted-line">Loads each stock’s price history to confirm the setup with real indicators (RSI and moving averages).</p>`
    : '';

  return `
    <nav class="stock-nav scrolled" id="discover-nav">
      <button type="button" class="back-btn" data-action="back"><svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8"/></svg>Watchlist</button>
      <span class="nav-title">Discover</span>
      <button type="button" class="text-btn" data-action="refresh-screen">Refresh</button>
    </nav>
    <header class="discover-head">
      <h1>Discover</h1>
      <p class="muted-line">${view.scan
        ? `Scans all ${view.scan.listed.toLocaleString('en-US')} NYSE and Nasdaq companies' latest annual reports (${view.scan.year}), keeps the ${view.total} strongest businesses and fastest growers, then checks their price, valuation and trend. Well-known names only show up if their numbers earn it.`
        : `Ready-made screens for every time frame. Tap a stock to research it, or + to add it.`}</p>
    </header>
    ${view.demo ? '<div class="notice demo"><strong>Demo numbers.</strong> Real numbers appear once the app is on Vercel with your Finnhub key.</div>' : ''}
    <div class="segmented horizons" style="--n:${HORIZONS.length}; --i:${HORIZONS.indexOf(horizon)}" role="tablist" aria-label="Time frame">
      <span class="seg-thumb" aria-hidden="true"></span>${tabs}
    </div>
    <p class="muted-line horizon-about">${esc(horizon[2])}</p>
    <div class="preset-chips" role="tablist" aria-label="Screens">${chips}</div>
    <div class="card-plain preset-about">
      <p class="stat-label">${esc(p.name)}</p><p>${esc(p.about)}</p>
      <p class="preset-check"><strong>Then check:</strong> ${esc(p.check)}</p>
      ${p.group === 'swing' ? '<p class="muted-line warn-line">Swing trading is the riskiest way to use this app. Most short-term traders do worse than simply holding an index fund. Keep positions small and always set a stop (Journal tab → How much should I buy?).</p>' : ''}
    </div>
    <div class="screen-filters">
      <button type="button" class="chip tech-chip${view.techOnly ? ' on' : ''}" data-action="tech-only" aria-pressed="${Boolean(view.techOnly)}">Tech only</button>
      <label class="sort-pick"><span>Industry</span><select data-filter="sector">${sectors}</select></label>
      <label class="sort-pick"><span>Size</span><select data-filter="size">${sizes}</select></label>
      <label class="sort-pick"><span>Max P/E</span><input data-filter="maxPe" inputmode="decimal" placeholder="Any" value="${view.maxPe ?? ''}" size="4"></label>
    </div>
    ${loading}
    ${view.error ? `<div class="card-plain error-card"><p>${esc(view.error)}</p></div>` : ''}
    ${view.stocks ? (results.length ? `
      <p class="muted-line result-count">${results.length} match${results.length === 1 ? '' : 'es'}${results.length > LIMIT && !view.showAll ? `, best ${LIMIT} shown` : ''}</p>
      <div class="card-plain table-card compare-card">
        <div class="table-wrap from-left"><table class="fin-table compare-table screen-table">
          <thead><tr>${heads.map((h, i) => `<th scope="col"${i === 0 ? ' class="sticky"' : ''}>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
      ${results.length > LIMIT && !view.showAll ? `<button type="button" class="text-btn show-all" data-action="show-all">Show all ${results.length}</button>` : ''}
      <div class="chart-check">${chartButton}
        <button type="button" class="text-btn small" data-action="research-top" data-tickers="${shown.slice(0, 5).map((x) => x.symbol).join(',')}">Research the top ${Math.min(5, shown.length)} with AI</button>
        <p class="muted-line" data-research-msg></p>
      </div>` : '<div class="card-plain empty-card"><p class="empty-title">No matches right now</p><p class="muted-line">Markets change daily. Try another screen, clear the filters, or check back tomorrow.</p></div>') : ''}
    <p class="fineprint">Covers US companies that file annual reports with the SEC; foreign companies and OTC penny stocks aren't included. <strong>Long-term score</strong>: the business (value, growth, profitability, financial health) using the same rules as the app score, without the chart, DCF and analyst parts. <strong>Swing score</strong>: the price trend (6-month return, strength vs. the S&P 500, distance from the 52-week high, volume). A screen is a starting point for research, not a buy list.</p>`;
}

// Made-up but steady numbers for the preview
function demoStocks() {
  const rand = (seed, i) => {
    let h = 2166136261;
    for (const ch of seed + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return ((h >>> 0) % 10000) / 10000;
  };
  return UNIVERSE.map(([symbol, name, sector]) => {
    const r = (i, lo, hi) => lo + rand(symbol, i) * (hi - lo);
    const revenueGrowth = r(4, -8, 40);
    return {
      symbol, name, sector,
      pe: r(2, 8, 60), ps: r(3, 1, 20),
      revenueGrowth, epsGrowth: r(5, -20, 60), revenueGrowth5y: r(6, -2, 30),
      grossMargin: r(7, 20, 80), operatingMargin: r(8, 2, 45), netMargin: r(9, -2, 35), roe: r(10, 2, 60),
      debtToEquity: r(11, 0, 2.5), currentRatio: r(12, 0.7, 3), beta: r(13, 0.5, 1.8),
      dividendYield: rand(symbol, 14) > 0.55 ? r(15, 0.5, 5) : null,
      return6m: r(16, -30, 45), return1y: r(17, -35, 80),
      price: r(18, 20, 800), changePct: r(19, -4, 4), return5d: r(20, -8, 8), return13w: r(21, -30, 40),
      vsSpx4w: r(22, -10, 12), vsSpx13w: r(23, -20, 25), vsSpx26w: r(24, -25, 35),
      fromHigh: -r(25, 0, 45), volumeRatio: r(26, 0.6, 2.4),
      epsGrowth5y: r(27, -5, 35), revenueGrowthQ: revenueGrowth + r(28, -8, 12), epsGrowthQ: r(29, -30, 70),
      acceleration: r(30, -15, 20), turnedProfitable: rand(symbol, 31) > 0.85, marginChange: r(32, -6, 10),
      rdIntensity: sector === 'Tech' ? r(33, 8, 30) : r(33, 0, 6), earlyScore: Math.round(r(34, 25, 90)),
      marketCap: 10 ** r(35, 8.7, 12.3), // spread from ~$500M to ~$2T
      nextEarnings: rand(symbol, 36) > 0.8 ? new Date(Date.now() + Math.floor(r(37, 1, 20)) * 86_400_000).toISOString().slice(0, 10) : null,
    };
  });
}
