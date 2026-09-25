// ==========================================================================
// valuation.js: what might the business be worth?
//
// DCF (discounted cash flow): add up all the cash the company should
// produce in the future, shrunk back to today's dollars (a dollar in
// 10 years is worth less than a dollar now), then divide by shares.
// ==========================================================================

// Returns { perShare, pvCash, pvTerminal, terminalShare } or null if it can't be worked out.
//   fcf       free cash flow for the last 12 months ($)
//   growth    yearly growth for the first 5 years (%), fading to `terminal` by year 10
//   discount  the yearly return you require (%)
//   terminal  growth forever after year 10 (%)
//   netCash   cash minus debt ($), added on top
export function dcf({ fcf, growth, discount, terminal, netCash = 0, shares, years = 10, fastYears = 5 }) {
  if (!(fcf > 0) || !(shares > 0) || !(discount > terminal)) return null;
  const g = growth / 100;
  const r = discount / 100;
  const tg = terminal / 100;
  let cash = fcf;
  let pvCash = 0;
  for (let year = 1; year <= years; year++) {
    const rate = year <= fastYears ? g : g + (tg - g) * ((year - fastYears) / (years - fastYears));
    cash *= 1 + rate;
    pvCash += cash / (1 + r) ** year;
  }
  // Everything after year 10, valued as if it grows at `terminal` forever
  const pvTerminal = ((cash * (1 + tg)) / (r - tg)) / (1 + r) ** years;
  const perShare = (pvCash + pvTerminal + netCash) / shares;
  return { perShare, pvCash, pvTerminal, terminalShare: (pvTerminal / (pvCash + pvTerminal)) * 100 };
}

// Reverse DCF: what yearly growth does today's price already assume?
export function impliedGrowth(price, inputs) {
  const value = (g) => dcf({ ...inputs, growth: g })?.perShare;
  let lo = -30;
  let hi = 80;
  if (value(lo) == null || !price) return null;
  if (price <= value(lo)) return { value: lo, bound: 'below' };
  if (price >= value(hi)) return { value: hi, bound: 'above' };
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (value(mid) < price) lo = mid; else hi = mid;
  }
  return { value: (lo + hi) / 2, bound: null };
}

// Graham number: Benjamin Graham's rough ceiling for a defensive investor
export function graham(eps, bookPerShare) {
  return eps > 0 && bookPerShare > 0 ? Math.sqrt(22.5 * eps * bookPerShare) : null;
}

// Sensible starting inputs from the company's own numbers
export function dcfInputs({ financials, metrics = {}, quote }) {
  const q = financials?.quarterly;
  const a = financials?.annual;
  const lastQuarters = q?.rows.freeCashFlow?.slice(-4) ?? [];
  const ttm = lastQuarters.length === 4 && lastQuarters.every((v) => v != null)
    ? lastQuarters.reduce((s, v) => s + v, 0)
    : null;
  const annualFcf = a?.rows.freeCashFlow ?? [];
  const lastAnnualIndex = annualFcf.findLastIndex((v) => v != null);
  const fcf = ttm ?? (lastAnnualIndex >= 0 ? annualFcf[lastAnnualIndex] : null);
  const fcfSource = ttm != null ? 'last 4 quarters' : lastAnnualIndex >= 0 ? a.periods[lastAnnualIndex].label : null;

  // Balance sheet from the most recent report
  const latest = (rows, key) => rows?.[key]?.findLast((v) => v != null) ?? null;
  const src = q?.periods.length ? q.rows : a?.rows;
  const cash = (latest(src, 'cash') ?? 0) + (latest(src, 'shortInvestments') ?? 0);
  const debt = latest(src, 'longTermDebt') ?? 0;
  const shares = quote?.sharesOutstanding ?? latest(a?.rows, 'shares');

  // Growth: the company's 5-year revenue growth, kept between 0% and 25%
  let growth = metrics.revenueGrowth5Y;
  if (growth == null && a?.rows.revenue) {
    const rev = a.rows.revenue.filter((v) => v > 0);
    if (rev.length >= 3) {
      const span = Math.min(5, rev.length - 1);
      growth = ((rev.at(-1) / rev.at(-1 - span)) ** (1 / span) - 1) * 100;
    }
  }
  growth = Math.round(Math.min(25, Math.max(0, growth ?? 8)) * 2) / 2;

  return { fcf, fcfSource, netCash: cash - debt, cash, debt, shares, growth, discount: 9, terminal: 2.5 };
}
