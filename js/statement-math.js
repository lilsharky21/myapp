// ==========================================================================
// statement-math.js: the ratios and growth rates worked out from financial
// statements. Used by the backend (real SEC data) and by demo mode, so
// both always calculate the same way.
// ==========================================================================

const pct = (a, b) => (a != null && b ? (a / b) * 100 : null);

// Fill in rows we can calculate from other rows
export function deriveRows(rows, n) {
  const at = (key, i) => rows[key]?.[i] ?? null;
  const fill = (key, calc) => {
    rows[key] = Array.from({ length: n }, (_, i) => at(key, i) ?? calc(i));
  };
  fill('grossProfit', (i) => (at('revenue', i) != null && at('costOfRevenue', i) != null ? at('revenue', i) - at('costOfRevenue', i) : null));
  fill('freeCashFlow', (i) => (at('operatingCashFlow', i) != null && at('capex', i) != null ? at('operatingCashFlow', i) - at('capex', i) : null));
  fill('ebitda', (i) => (at('operatingIncome', i) != null && at('dna', i) != null ? at('operatingIncome', i) + at('dna', i) : null));
  return rows;
}

// Margins and returns. `annualize` is 4 for quarters, so returns read as yearly rates.
export function ratiosFor(rows, n, annualize = 1) {
  const r = (key, i) => rows[key]?.[i] ?? null;
  const idx = Array.from({ length: n }, (_, i) => i);
  // The share of pre-tax profit paid in tax, used for return on invested capital
  const taxRate = (i) => {
    const tax = r('incomeTax', i);
    const ni = r('netIncome', i);
    if (tax == null || ni == null || ni + tax <= 0) return 0.21;
    return Math.min(0.35, Math.max(0, tax / (ni + tax)));
  };
  return {
    grossMargin: idx.map((i) => pct(r('grossProfit', i), r('revenue', i))),
    operatingMargin: idx.map((i) => pct(r('operatingIncome', i), r('revenue', i))),
    netMargin: idx.map((i) => pct(r('netIncome', i), r('revenue', i))),
    fcfMargin: idx.map((i) => pct(r('freeCashFlow', i), r('revenue', i))),
    roe: idx.map((i) => {
      const equity = r('equity', i);
      return equity > 0 && r('netIncome', i) != null ? ((r('netIncome', i) * annualize) / equity) * 100 : null;
    }),
    roic: idx.map((i) => {
      const capital = (r('equity', i) ?? 0) + (r('longTermDebt', i) ?? 0);
      return r('operatingIncome', i) != null && capital > 0
        ? ((r('operatingIncome', i) * (1 - taxRate(i)) * annualize) / capital) * 100
        : null;
    }),
    debtToEquity: idx.map((i) => (r('equity', i) > 0 && r('longTermDebt', i) != null ? r('longTermDebt', i) / r('equity', i) : null)),
    currentRatio: idx.map((i) => (r('currentAssets', i) != null && r('currentLiabilities', i) ? r('currentAssets', i) / r('currentLiabilities', i) : null)),
    cashConversion: idx.map((i) => (r('netIncome', i) > 0 && r('operatingCashFlow', i) != null ? r('operatingCashFlow', i) / r('netIncome', i) : null)),
  };
}

// Growth vs. `lag` periods earlier (1 for years, 4 for "same quarter last year")
export function growthFor(rows, lag) {
  const growth = (arr = []) => arr.map((v, i) => {
    const before = arr[i - lag];
    return v != null && before != null && before !== 0 ? ((v - before) / Math.abs(before)) * 100 : null;
  });
  return {
    revenue: growth(rows.revenue),
    netIncome: growth(rows.netIncome),
    eps: growth(rows.eps),
    freeCashFlow: growth(rows.freeCashFlow),
    operatingIncome: growth(rows.operatingIncome),
  };
}
