// GET /api/financials?symbol=AAPL
// Income statement, balance sheet and cash flow (10 years + 12 quarters),
// straight from the company's SEC filings. No API key needed.

import { ok, fail, symbolFrom } from '../lib/http.js';
import { lookupCompany, companyFacts } from '../lib/sec.js';
import { buildStatements } from '../lib/statements.js';

export async function GET(request) {
  try {
    const symbol = symbolFrom(request);
    const company = await lookupCompany(symbol);
    if (!company) {
      return Response.json({
        error: 'not_found',
        message: `${symbol} doesn't file 10-K/10-Q reports with the SEC, so US financial statements aren't available.`,
      }, { status: 404, headers: { 'Cache-Control': 'public, s-maxage=86400' } });
    }
    const facts = await companyFacts(company.cik);
    return ok({
      symbol,
      cik: company.cik,
      name: company.name,
      source: 'SEC EDGAR (10-K and 10-Q filings)',
      ...buildStatements(facts),
    }, { maxAge: 43200, swr: 86400 });
  } catch (err) {
    return fail(err);
  }
}
