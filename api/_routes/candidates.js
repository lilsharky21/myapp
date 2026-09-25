// GET /api/candidates
// Step 1 of Discover: scan EVERY company listed on the NYSE and Nasdaq, using
// the SEC's free whole-market data (one request returns one number for every
// company), and keep the ~120 best businesses and fastest growers. Discover
// then checks price, valuation and momentum for just those finalists.
//
// Covers companies that file US annual reports (10-K). Foreign companies that
// file 20-F reports and OTC penny stocks aren't included.

import { ok, fail, guard, cached, DAY } from '../../lib/http.js';
import { secFrame, listedCompanies } from '../../lib/sec.js';
import { scale } from '../../js/ratings.js';

const MIN_REVENUE = 250e6;   // big enough to be a real, tradeable business
const TOP_BUSINESSES = 90;
const TOP_GROWERS = 30;
const MAX = 120;

export async function GET(request) {
  try {
    guard(request);
    const result = await cached('candidates', DAY, () => scanMarket());
    return ok(result, { maxAge: 86400, swr: 2 * 86400 });
  } catch (err) {
    // SEC unreachable or a changed format: Discover falls back to its built-in list
    if (err.code === 'locked') return fail(err);
    return ok({ fallback: true, message: err.message }, { maxAge: 600, swr: 600 });
  }
}

export async function scanMarket({ now = new Date() } = {}) {
  let year = now.getUTCFullYear() - 1;
  const listed = await listedCompanies();
  if (!listed.size) throw new Error('No listed companies found');

  // Early in the year, last year's reports aren't all out yet: go back one more year
  let frames = await loadFrames(year);
  if (frames.revenue[0].size < 1000 && frames.revenue[1].size > frames.revenue[0].size) {
    year -= 1;
    frames = await loadFrames(year);
  }

  const companies = [];
  for (const [cik, company] of listed) {
    const c = measure(cik, frames);
    if (!c || c.revenue < MIN_REVENUE) continue;
    companies.push({ ...company, ...c, businessScore: businessScore(c) });
  }
  if (companies.length < 50) throw new Error('The SEC data had an unexpected format');

  const byScore = [...companies].filter((c) => c.businessScore != null).sort((a, b) => b.businessScore - a.businessScore);
  const picked = new Map(byScore.slice(0, TOP_BUSINESSES).map((c) => [c.symbol, c]));
  // Plus the fastest-growing sizable companies that make real money or cash
  const growers = companies
    .filter((c) => c.revenue >= 2 * MIN_REVENUE && c.revenueGrowthSec != null && (c.fcfMargin > 0 || c.netMarginSec > 0))
    .sort((a, b) => b.revenueGrowthSec - a.revenueGrowthSec);
  for (const c of growers) {
    if (picked.size >= TOP_BUSINESSES + TOP_GROWERS || picked.size >= MAX) break;
    if (!picked.has(c.symbol)) picked.set(c.symbol, c);
  }
  const candidates = [...picked.values()].sort((a, b) => (b.businessScore ?? 0) - (a.businessScore ?? 0));
  return { year, listed: listed.size, scanned: companies.length, candidates, at: Date.now() };
}

// The numbers Discover needs, for three years, for every company at once
async function loadFrames(year) {
  const years = [year, year - 1, year - 2];
  const duration = (concept) => years.map((y) => () => secFrame('us-gaap', concept, 'USD', `CY${y}`));
  const instant = (concept) => years.map((y) => () => secFrame('us-gaap', concept, 'USD', `CY${y}Q4I`));
  const jobs = {
    revenueA: duration('Revenues'),
    revenueB: duration('RevenueFromContractWithCustomerExcludingAssessedTax'),
    netIncome: duration('NetIncomeLoss'),
    cashFlow: duration('NetCashProvidedByUsedInOperatingActivities'),
    capex: duration('PaymentsToAcquirePropertyPlantAndEquipment'),
    assets: instant('Assets'),
    liabilities: instant('Liabilities'),
    equity: instant('StockholdersEquity'),
  };
  // A few at a time (the SEC allows up to 10 requests a second)
  const flat = Object.entries(jobs).flatMap(([key, list]) => list.map((run, i) => ({ key, i, run })));
  const out = Object.fromEntries(Object.keys(jobs).map((k) => [k, []]));
  for (let i = 0; i < flat.length; i += 6) {
    const batch = flat.slice(i, i + 6);
    const maps = await Promise.all(batch.map((j) => j.run()));
    batch.forEach((j, k) => { out[j.key][j.i] = maps[k]; });
  }
  // Companies report revenue under one of two names; use the bigger one
  out.revenue = years.map((_, i) => mergeMax(out.revenueA[i], out.revenueB[i]));
  return out;
}

function mergeMax(a, b) {
  const m = new Map(a);
  for (const [k, v] of b) if (!m.has(k) || v > m.get(k)) m.set(k, v);
  return m;
}

// One company's latest year (or the year before, for companies whose fiscal
// year lands in the earlier calendar year) vs. the year before that
export function measure(cik, f) {
  for (const i of [0, 1]) {
    const revenue = f.revenue[i].get(cik);
    const prior = f.revenue[i + 1].get(cik);
    if (!(revenue > 0) || !(prior > 0)) continue;
    const netIncome = f.netIncome[i].get(cik);
    const cash = f.cashFlow[i].get(cik);
    const capex = f.capex[i].get(cik) ?? 0;
    const assets = f.assets[i].get(cik);
    const liabilities = f.liabilities[i].get(cik);
    const equity = f.equity[i].get(cik);
    const pct = (a, b) => (a != null && b ? (a / b) * 100 : null);
    return {
      fiscalYearIndex: i,
      revenue,
      revenueGrowthSec: ((revenue - prior) / prior) * 100,
      netMarginSec: pct(netIncome, revenue),
      fcfMargin: cash != null ? pct(cash - capex, revenue) : null,
      roeSec: equity > 0 ? pct(netIncome, equity) : null,
      debtRatio: assets > 0 && liabilities != null ? liabilities / assets : null,
    };
  }
  return null;
}

// 0-100: how strong the business looks from its annual report
export function businessScore(c) {
  const parts = [
    [scale(c.revenueGrowthSec, [[-15, 5], [-5, 20], [0, 35], [5, 50], [10, 65], [20, 85], [35, 100]]), 30],
    [scale(c.netMarginSec, [[-10, 5], [0, 25], [5, 45], [12, 65], [20, 82], [30, 97]]), 20],
    [scale(c.fcfMargin, [[-10, 5], [0, 25], [5, 45], [12, 65], [20, 85], [30, 97]]), 20],
    [scale(c.roeSec, [[-10, 5], [0, 20], [8, 42], [15, 65], [25, 85], [40, 97]]), 15],
    [scale(c.debtRatio, [[0.2, 95], [0.4, 85], [0.6, 65], [0.75, 45], [0.9, 20], [1, 5]]), 15],
  ].filter(([v]) => v != null);
  const weight = parts.reduce((a, [, w]) => a + w, 0);
  if (weight < 60) return null;
  return Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / weight);
}
