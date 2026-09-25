// ==========================================================================
// research.js: numbers the research note is built on, worked out by the app
// (not the AI), so they're always consistent and checkable:
//   - scenarios: what the stock could be worth if things go badly / as
//     expected / well
//   - price levels: the prices worth knowing, from highest to lowest
//   - your "before you buy" checklist ticks, saved on this device
// ==========================================================================

import { dcf } from './valuation.js';
import { median } from './ratings.js';

// Bear / base / bull values. Uses the DCF when the company has positive free
// cash flow; otherwise a P/E-based estimate.
export function scenarios({ val, quote, metrics = {}, peers = [], peHistory = [] }) {
  const price = quote?.price;
  if (!price) return null;

  if (val?.fcf > 0 && val.shares) {
    const g = val.growth;
    const cases = [
      ['bear', 'Bear case', Math.max(-5, g - Math.max(5, g * 0.5)), val.discount + 1],
      ['base', 'Base case', g, val.discount],
      ['bull', 'Bull case', g + 5, Math.max(6, val.discount - 1)],
    ];
    return {
      method: 'DCF',
      cases: cases.map(([key, label, growth, discount]) => {
        const value = dcf({ ...val, growth, discount })?.perShare ?? null;
        return {
          key, label, value,
          changePct: value != null ? (value / price - 1) * 100 : null,
          assumptions: `${round1(growth)}% yearly cash-flow growth for 5 years, ${round1(discount)}% discount rate`,
        };
      }),
    };
  }

  const eps = metrics.epsTTM ?? metrics.epsExclExtraItemsTTM;
  const pe = metrics.peTTM ?? metrics.peExclExtraTTM;
  if (!(eps > 0) || !(pe > 0)) return null;
  const growth = Math.min(40, Math.max(-20, metrics.epsGrowth5Y ?? metrics.epsGrowthTTMYoy ?? 5));
  const nextEps = eps * (1 + growth / 100);
  const normal = median([pe, median(peers.map((p) => (p.pe > 0 ? p.pe : null))), median(peHistory)].filter(Boolean)) ?? pe;
  const cases = [
    ['bear', 'Bear case', 0.75 * Math.min(pe, normal)],
    ['base', 'Base case', normal],
    ['bull', 'Bull case', 1.2 * Math.max(pe, normal)],
  ];
  return {
    method: 'P/E',
    cases: cases.map(([key, label, multiple]) => {
      const value = multiple * nextEps;
      return {
        key, label, value,
        changePct: (value / price - 1) * 100,
        assumptions: `${round1(multiple)}× next year's EPS of $${nextEps.toFixed(2)} (EPS growth ${round1(growth)}%)`,
      };
    }),
  };
}

// The prices worth knowing, highest first, with how far each is from today
export function priceLevels({ quote, tech, dcfValue }) {
  const price = quote?.price;
  if (!price || !tech) return [];
  const list = [
    ['52-week high', tech.range52.high, 'resistance'],
    ['60-day high', tech.range60.high, 'resistance'],
    ['50-day average', tech.averages[1].value, 'average'],
    ['200-day average', tech.averages[2].value, 'average'],
    ['60-day low', tech.range60.low, 'support'],
    ['52-week low', tech.range52.low, 'support'],
    ['Fair value (DCF)', dcfValue, 'value'],
    ['Today', price, 'current'],
  ].filter(([, p]) => p != null && Number.isFinite(p));
  return list
    .map(([label, level, kind]) => ({ label, price: level, kind, distancePct: (level / price - 1) * 100 }))
    .sort((a, b) => b.price - a.price);
}

const round1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// "Before you buy" checklist ticks
// ---------------------------------------------------------------------------

const CHECKS_KEY = 'thesis-journal/checklist/';

export function loadChecks(ticker) {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHECKS_KEY + ticker)) ?? []);
  } catch {
    return new Set();
  }
}

export function saveChecks(ticker, checks) {
  try { localStorage.setItem(CHECKS_KEY + ticker, JSON.stringify([...checks])); } catch { /* storage blocked */ }
}
