// ==========================================================================
// lib/sec.js: talks to SEC EDGAR, the US government's free database of
// company filings. No key needed. The SEC only asks that every request says
// who is asking, through SEC_USER_AGENT (for example "Thesis Journal you@email.com").
// ==========================================================================

import { fetchJSON, cached, HOUR, DAY } from './http.js';

function secJSON(url, ttlMs) {
  const agent = process.env.SEC_USER_AGENT || 'Thesis Journal personal research app';
  return cached(`sec:${url}`, ttlMs, () =>
    fetchJSON(url, { headers: { 'User-Agent': agent, Accept: 'application/json' }, timeoutMs: 20000 }),
  );
}

// The SEC identifies companies by a number called a CIK, not by ticker.
// Returns { cik: '0000320193', name: 'Apple Inc.' } or null.
export async function lookupCompany(ticker) {
  // Shape: { "0": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." }, ... }
  const all = await secJSON('https://www.sec.gov/files/company_tickers.json', DAY);
  const wanted = ticker.toUpperCase().replace('.', '-'); // the SEC writes BRK.B as BRK-B
  for (const row of Object.values(all)) {
    if (row.ticker === wanted) return { cik: String(row.cik_str).padStart(10, '0'), name: row.title };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Whole-market data (for Discover)
// ---------------------------------------------------------------------------

// One number for EVERY company that files with the SEC, in one request.
// frame('us-gaap', 'Revenues', 'USD', 'CY2025') -> Map(cik -> value)
// Periods: 'CY2025' is a full year; 'CY2025Q4I' is a snapshot at the end of 2025.
export async function secFrame(taxonomy, concept, unit, period) {
  try {
    const data = await secJSON(`https://data.sec.gov/api/xbrl/frames/${taxonomy}/${concept}/${unit}/${period}.json`, DAY);
    const values = new Map();
    for (const row of data?.data ?? []) {
      if (typeof row?.cik === 'number' && typeof row.val === 'number') values.set(row.cik, row.val);
    }
    return values;
  } catch (err) {
    if (err.status === 404) return new Map(); // that year isn't published yet
    throw err;
  }
}

// Every company listed on the NYSE or Nasdaq, one ticker each.
// (OTC "penny stocks" are left out on purpose.) Map(cik -> { symbol, name, exchange })
export async function listedCompanies() {
  // Shape: { fields: ['cik', 'name', 'ticker', 'exchange'], data: [[320193, 'Apple Inc.', 'AAPL', 'Nasdaq'], ...] }
  const all = await secJSON('https://www.sec.gov/files/company_tickers_exchange.json', DAY);
  const col = Object.fromEntries((all?.fields ?? []).map((name, i) => [name, i]));
  const listed = new Map();
  for (const row of all?.data ?? []) {
    const cik = row[col.cik];
    const exchange = row[col.exchange];
    const ticker = String(row[col.ticker] ?? '');
    if (!['NYSE', 'Nasdaq'].includes(exchange) || !ticker || listed.has(cik)) continue; // first ticker = main share class
    listed.set(cik, { symbol: ticker.replace('-', '.'), name: row[col.name], exchange });
  }
  return listed;
}

// Every number the company has reported in its 10-K and 10-Q filings.
export function companyFacts(cik) {
  return secJSON(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, 12 * HOUR);
}

// The list of the company's recent filings.
export function submissions(cik) {
  return secJSON(`https://data.sec.gov/submissions/CIK${cik}.json`, HOUR);
}

// What each filing type means, in plain English.
const FORM_MEANINGS = {
  '10-K': 'Annual report',
  '10-Q': 'Quarterly report',
  '8-K': 'Major event or news',
  '4': 'Insider trade',
  '3': 'New insider',
  '144': 'Insider plans to sell',
  'DEF 14A': 'Proxy statement (votes, pay)',
  'S-1': 'Registration to sell shares',
  'S-3': 'Shelf registration',
  'SC 13D': 'Activist stake (over 5%)',
  'SC 13G': 'Passive stake (over 5%)',
  'SCHEDULE 13D': 'Activist stake (over 5%)',
  'SCHEDULE 13G': 'Passive stake (over 5%)',
  '10-K/A': 'Amended annual report',
  '10-Q/A': 'Amended quarterly report',
  '8-K/A': 'Amended event report',
  '20-F': 'Annual report (foreign company)',
  '6-K': 'Report (foreign company)',
};

// Turn the SEC's column-style list into [{ form, meaning, date, url }], newest first.
export function recentFilings(subs, limit = 40) {
  const recent = subs?.filings?.recent;
  if (!recent) return [];
  const cikNumber = String(Number(subs.cik));
  const out = [];
  for (let i = 0; i < recent.form.length && out.length < limit; i++) {
    const form = recent.form[i];
    if (!(form in FORM_MEANINGS)) continue;
    const accession = recent.accessionNumber[i].replace(/-/g, '');
    out.push({
      form,
      meaning: FORM_MEANINGS[form],
      description: recent.primaryDocDescription?.[i] || '',
      date: recent.filingDate[i],
      url: `https://www.sec.gov/Archives/edgar/data/${cikNumber}/${accession}/${recent.primaryDocument[i]}`,
    });
  }
  return out;
}
