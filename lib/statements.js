// ==========================================================================
// lib/statements.js: turns the SEC's giant list of reported numbers into
// clean income statements, balance sheets and cash flow statements.
//
// How companies report, and what this file untangles:
//  - Each number has a "tag" (like "NetIncomeLoss") and a period.
//  - Different companies use different tags for the same thing (revenue has 4+).
//  - Quarterly reports (10-Q) often give "year to date" totals (6 or 9 months),
//    so a single quarter has to be worked out by subtracting.
//  - Q4 is almost never reported on its own: it's the full year minus 9 months.
// ==========================================================================

import { deriveRows, ratiosFor, growthFor } from '../js/statement-math.js';

const DAY_MS = 86_400_000;
const FORMS = new Set(['10-K', '10-Q', '10-K/A', '10-Q/A', '10-KT', '10-QT']);

// Every line we show, and the SEC tags that can hold it (best first).
export const LINES = {
  income: [
    { key: 'revenue', label: 'Revenue', tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueGoodsNet'] },
    { key: 'costOfRevenue', label: 'Cost of revenue', tags: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'] },
    { key: 'grossProfit', label: 'Gross profit', tags: ['GrossProfit'] },
    { key: 'rnd', label: 'Research & development', tags: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'] },
    { key: 'sga', label: 'Selling, general & admin', tags: ['SellingGeneralAndAdministrativeExpense'] },
    { key: 'operatingIncome', label: 'Operating income', tags: ['OperatingIncomeLoss'] },
    { key: 'ebitda', label: 'EBITDA', tags: [] },
    { key: 'interestExpense', label: 'Interest expense', tags: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt'] },
    { key: 'incomeTax', label: 'Income tax', tags: ['IncomeTaxExpenseBenefit'] },
    { key: 'netIncome', label: 'Net income', tags: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'] },
    { key: 'eps', label: 'EPS (diluted)', tags: ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'], unit: 'USD/shares', perShare: true, format: 'eps' },
    { key: 'shares', label: 'Diluted shares', tags: ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfShareOutstandingBasicAndDiluted'], unit: 'shares', perShare: true, format: 'shares' },
  ],
  balance: [
    { key: 'cash', label: 'Cash & equivalents', tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash'], instant: true },
    { key: 'shortInvestments', label: 'Short-term investments', tags: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'], instant: true },
    { key: 'receivables', label: 'Receivables', tags: ['AccountsReceivableNetCurrent'], instant: true },
    { key: 'inventory', label: 'Inventory', tags: ['InventoryNet'], instant: true },
    { key: 'currentAssets', label: 'Current assets', tags: ['AssetsCurrent'], instant: true },
    { key: 'totalAssets', label: 'Total assets', tags: ['Assets'], instant: true },
    { key: 'currentLiabilities', label: 'Current liabilities', tags: ['LiabilitiesCurrent'], instant: true },
    { key: 'longTermDebt', label: 'Long-term debt', tags: ['LongTermDebtNoncurrent', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations'], instant: true },
    { key: 'totalLiabilities', label: 'Total liabilities', tags: ['Liabilities'], instant: true },
    { key: 'retainedEarnings', label: 'Retained earnings', tags: ['RetainedEarningsAccumulatedDeficit'], instant: true },
    { key: 'equity', label: "Shareholders' equity", tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], instant: true },
  ],
  cashflow: [
    { key: 'operatingCashFlow', label: 'Operating cash flow', tags: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'] },
    { key: 'capex', label: 'Capital expenditures', tags: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'] },
    { key: 'dna', label: 'Depreciation & amortization', tags: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'Depreciation'] },
    { key: 'freeCashFlow', label: 'Free cash flow', tags: [] },
    { key: 'sbc', label: 'Stock-based compensation', tags: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'] },
    { key: 'buybacks', label: 'Share buybacks', tags: ['PaymentsForRepurchaseOfCommonStock'] },
    { key: 'dividends', label: 'Dividends paid', tags: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'] },
  ],
};

// companyfacts JSON from the SEC -> { annual, quarterly, lines }
export function buildStatements(companyFacts) {
  const gaap = companyFacts?.facts?.['us-gaap'] ?? {};
  const allLines = [...LINES.income, ...LINES.balance, ...LINES.cashflow];

  // 1. Work out every line's values by period
  const series = {};
  for (const line of allLines) {
    series[line.key] = line.instant
      ? mergeInstant(line.tags.map((tag) => instantSeries(facts(gaap, tag, line.unit ?? 'USD'))))
      : mergeFlow(line.tags.map((tag) => flowSeries(facts(gaap, tag, line.unit ?? 'USD'), line)));
  }
  // Used to fill in total liabilities when a company doesn't report it directly
  const liabAndEquity = mergeInstant([instantSeries(facts(gaap, 'LiabilitiesAndStockholdersEquity', 'USD'))]);
  const equityWithMinority = mergeInstant([instantSeries(facts(gaap, 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'USD'))]);

  // 2. Build the two views
  const build = (basis, count, labelFor, growthLag) => {
    const ends = pickPeriods([series.revenue, series.netIncome, series.operatingCashFlow], basis, count);
    const rows = {};
    for (const line of allLines) {
      rows[line.key] = ends.map((end) =>
        line.instant ? nearest(series[line.key], end) : series[line.key][basis].get(end) ?? null,
      );
    }
    // Fill gaps we can calculate
    deriveRows(rows, ends.length);
    rows.totalLiabilities = rows.totalLiabilities.map((v, i) => {
      if (v != null) return v;
      const total = nearest(liabAndEquity, ends[i]);
      const eq = nearest(equityWithMinority, ends[i]) ?? rows.equity[i];
      return total != null && eq != null ? total - eq : null;
    });

    return {
      periods: ends.map((end) => ({ end, label: labelFor(end) })),
      rows,
      ratios: ratiosFor(rows, ends.length, growthLag === 4 ? 4 : 1),
      growth: growthFor(rows, growthLag),
    };
  };

  return {
    lines: Object.fromEntries(Object.entries(LINES).map(([k, ls]) =>
      [k, ls.map(({ key, label, format }) => ({ key, label, format: format ?? 'money' }))])),
    annual: build('annual', 10, (end) => `FY${end.slice(0, 4)}`, 1),
    quarterly: build('quarterly', 12, quarterLabel, 4),
  };
}

// ---------- helpers ----------

// All reported values for one tag, one per period, with restated numbers winning.
function facts(gaap, tag, unit) {
  const list = gaap[tag]?.units?.[unit];
  if (!list) return [];
  const byPeriod = new Map();
  for (const f of list) {
    if (!FORMS.has(f.form) || typeof f.val !== 'number') continue;
    const key = `${f.start ?? ''}|${f.end}`;
    const prev = byPeriod.get(key);
    if (!prev || f.filed > prev.filed) byPeriod.set(key, f);
  }
  return [...byPeriod.values()];
}

const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / DAY_MS;

// Things measured over time (revenue, cash flow). Returns { annual: Map, quarterly: Map } keyed by end date.
function flowSeries(list, { perShare }) {
  const annual = new Map();
  const quarterly = new Map();
  const byStart = new Map(); // all totals that begin on the same day (year-to-date chains)

  for (const f of list) {
    if (!f.start) continue;
    const days = daysBetween(f.start, f.end);
    if (days >= 350 && days <= 380) annual.set(f.end, f.val);
    if (days >= 80 && days <= 100) quarterly.set(f.end, f.val);
    if (!byStart.has(f.start)) byStart.set(f.start, []);
    byStart.get(f.start).push({ end: f.end, val: f.val, days });
  }

  // Work out missing single quarters: (9 months) - (6 months) = Q3, (full year) - (9 months) = Q4.
  // Per-share numbers can't be subtracted like this, so they're skipped.
  if (!perShare) {
    for (const chain of byStart.values()) {
      chain.sort((a, b) => a.end.localeCompare(b.end));
      for (let i = 1; i < chain.length; i++) {
        const gap = daysBetween(chain[i - 1].end, chain[i].end);
        if (gap >= 80 && gap <= 100 && chain[i - 1].days >= 80 && !quarterly.has(chain[i].end)) {
          quarterly.set(chain[i].end, chain[i].val - chain[i - 1].val);
        }
      }
    }
  }
  return { annual, quarterly };
}

// Balance-sheet items are a snapshot on one day. Returns Map(end -> value).
function instantSeries(list) {
  const map = new Map();
  for (const f of list) if (!f.start) map.set(f.end, f.val);
  return map;
}

// Combine several tags: the tag used most recently wins, older tags fill older gaps.
function mergeFlow(parts) {
  const ordered = parts.filter((p) => p.annual.size || p.quarterly.size).sort((a, b) => latest(b) - latest(a));
  const out = { annual: new Map(), quarterly: new Map() };
  for (const p of ordered) {
    for (const [end, v] of p.annual) if (!out.annual.has(end)) out.annual.set(end, v);
    for (const [end, v] of p.quarterly) if (!out.quarterly.has(end)) out.quarterly.set(end, v);
  }
  return out;
}
function mergeInstant(parts) {
  const ordered = parts.filter((m) => m.size).sort((a, b) => lastKey(b) - lastKey(a));
  const out = new Map();
  for (const m of ordered) for (const [end, v] of m) if (!out.has(end)) out.set(end, v);
  return out;
}
const lastKey = (map) => Math.max(0, ...[...map.keys()].map(Date.parse));
const latest = (p) => Math.max(lastKey(p.annual), lastKey(p.quarterly));

// The most recent `count` period end dates found in any of the key lines, oldest first.
function pickPeriods(seriesList, basis, count) {
  const ends = new Set();
  for (const s of seriesList) for (const end of s[basis].keys()) ends.add(end);
  // Drop near-duplicates (some companies report 2025-06-28 and 2025-06-30 for the same quarter)
  const sorted = [...ends].sort().reverse();
  const picked = [];
  for (const end of sorted) {
    if (picked.some((p) => Math.abs(daysBetween(end, p)) < 20)) continue;
    picked.push(end);
    if (picked.length === count) break;
  }
  return picked.reverse();
}

// Balance-sheet value on (or within a week of) a date
function nearest(map, end) {
  if (map.has(end)) return map.get(end);
  for (const [d, v] of map) if (Math.abs(daysBetween(d, end)) <= 7) return v;
  return null;
}

function quarterLabel(end) {
  const d = new Date(end + 'T00:00:00Z');
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} '${String(d.getUTCFullYear()).slice(2)}`;
}
