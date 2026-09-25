// GET /api/rates
// US Treasury yields (the interest rates the government pays), straight
// from the US Treasury's public daily yield curve. Free, no key.
// Rates move the whole market: when they rise, future profits are worth
// less today, which usually weighs on stock prices (growth stocks most).

import { ok, fail, guard, cached, HOUR } from '../../lib/http.js';

const TENORS = [['1mo', '1M', 1 / 12], ['3mo', '3M', 0.25], ['6mo', '6M', 0.5], ['1yr', '1Y', 1], ['2yr', '2Y', 2],
  ['5yr', '5Y', 5], ['10yr', '10Y', 10], ['20yr', '20Y', 20], ['30yr', '30Y', 30]];

const csvUrl = (year) => 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/'
  + `${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;

async function yearCsv(year) {
  const res = await fetch(csvUrl(year), { signal: AbortSignal.timeout(12000), headers: { Accept: 'text/csv' } });
  if (!res.ok) throw Object.assign(new Error(`home.treasury.gov answered ${res.status}`), { status: res.status });
  return res.text();
}

// The Treasury CSV: "Date","1 Mo",...,"30 Yr" with dates like 09/24/2026, newest first
export function parseTreasuryCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const cells = (line) => line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
  const header = cells(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  if (col.date == null) return [];
  return lines.slice(1).map((line) => {
    const c = cells(line);
    const [m, d, y] = c[col.date].split('/');
    const curve = TENORS
      .filter(([key]) => col[key] != null && c[col[key]] !== '' && Number.isFinite(Number(c[col[key]])))
      .map(([key, label, years]) => ({ label, years, yield: Number(c[col[key]]) }));
    return { date: `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, curve };
  }).filter((r) => r.date.length === 10 && r.curve.length).sort((a, b) => b.date.localeCompare(a.date));
}

export function summarizeRates(rows) {
  const latest = rows[0];
  if (!latest) return null;
  const monthAgoDate = new Date(Date.parse(latest.date) - 30 * 86_400_000).toISOString().slice(0, 10);
  const monthAgo = rows.find((r) => r.date <= monthAgoDate) ?? null;
  const at = (row, label) => row?.curve.find((p) => p.label === label)?.yield ?? null;
  const two = at(latest, '2Y');
  const ten = at(latest, '10Y');
  return {
    date: latest.date,
    curve: latest.curve,
    monthAgo: monthAgo ? { date: monthAgo.date, curve: monthAgo.curve } : null,
    key: ['3M', '2Y', '10Y', '30Y'].map((label) => ({
      label,
      yield: at(latest, label),
      change: at(latest, label) != null && at(monthAgo, label) != null ? at(latest, label) - at(monthAgo, label) : null,
    })).filter((k) => k.yield != null),
    spread2s10s: two != null && ten != null ? ten - two : null,
    inverted: two != null && ten != null ? two > ten : null,
  };
}

export async function GET(request) {
  try {
    guard(request);
    const year = new Date().getUTCFullYear();
    const rows = await cached(`treasury:${year}`, 6 * HOUR, async () => {
      let list = parseTreasuryCsv(await yearCsv(year));
      // Early January: last year's numbers are needed for "a month ago"
      if (list.length < 25) list = list.concat(parseTreasuryCsv(await yearCsv(year - 1).catch(() => '')));
      if (!list.length) throw Object.assign(new Error('The Treasury data had an unexpected format'), { status: 502 });
      return list;
    });
    return ok(summarizeRates(rows), { maxAge: 6 * 3600, swr: 12 * 3600 });
  } catch (err) {
    return fail(err);
  }
}
