// ==========================================================================
// analysis.js: turns a stock's raw data into everything the app works out
// from it (technicals, risk, valuation, scenarios, the app score), plus the
// compact bundle the AI reads. Shared by the stock page, the Compare table
// and "write notes for my whole watchlist", so they always agree.
// ==========================================================================

import { technicalSummary, riskStats, seasonality } from './indicators.js';
import { appScore, analystConsensus, piotroski, altmanZ, median } from './ratings.js';
import { dcf, dcfInputs, impliedGrowth } from './valuation.js';
import { scenarios, priceLevels } from './research.js';
import { pick } from './ui.js';
import { CONVICTION_WORDS } from './journal.js';
import * as api from './api.js';

// data: { quote, daily, bench, fund, fin, peers, insidersLive }
// d: the object to fill (the stock page keeps it, so slow parts aren't redone)
export function analyze(data, d = {}) {
  const { quote, fund, fin } = data;
  const daily = data.daily?.candles;
  const bench = data.bench?.candles;
  if (daily !== d.dailyRef || bench !== d.benchRef) {
    d.dailyRef = daily;
    d.benchRef = bench;
    d.tech = daily ? technicalSummary(daily) : null;
    d.risk = daily ? riskStats(daily, bench) : null;
    d.season = daily ? seasonality(daily) : null;
  }
  const peers = data.peers ?? [];
  d.consensus = analystConsensus(fund?.recommendations);
  d.val = fin ? dcfInputs({ financials: fin, metrics: fund?.metrics, quote }) : null;
  d.dcfDefault = d.val ? dcf(d.val) : null;
  d.scenarios = scenarios({
    val: d.val,
    quote,
    metrics: fund?.metrics,
    peers,
    peHistory: (fund?.metricSeries?.annual?.pe ?? []).map((p) => p?.v).filter((v) => v > 0),
  });
  d.levels = priceLevels({ quote, tech: d.tech, dcfValue: d.dcfDefault?.perShare });
  d.score = appScore({
    quote,
    metrics: fund?.metrics,
    financials: fin,
    tech: d.tech,
    risk: d.risk,
    earnings: fund?.earnings,
    recs: fund?.recommendations,
    insiders: data.insidersLive ? fund?.insiders : null,
    peers,
    valuation: d.val ? { ...d.val, dcf: d.dcfDefault } : null,
  });
  return d;
}

// The few numbers a watchlist card and the Compare table show, saved on the idea
export function snapshot(d, { quote, fund, aiRating = null, demo = false }) {
  const m = fund?.metrics ?? {};
  const dcfValue = d.dcfDefault?.perShare;
  return {
    wallStreet: d.consensus?.label ?? null,
    app: d.score?.overall != null ? { label: d.score.label, grade: d.score.grade, score: d.score.overall } : null,
    ai: aiRating,
    pe: pick(m, 'peTTM', 'peExclExtraTTM'),
    revenueGrowth: pick(m, 'revenueGrowthTTMYoy'),
    dcfUpside: dcfValue && quote?.price ? ((dcfValue - quote.price) / quote.price) * 100 : null,
    nextEarnings: fund?.nextEarnings?.date ?? null,
    demo,
    at: Date.now(),
  };
}

// Load everything for one stock and analyze it (used outside the stock page).
// withNews: the AI also reads recent headlines.
export async function loadAndAnalyze(ticker, { withNews = false } = {}) {
  const [quote, daily, fund, fin, peers, bench, news] = await Promise.all([
    api.getQuote(ticker), api.getDaily(ticker), api.getFundamentals(ticker), api.getFinancials(ticker),
    api.getPeers(ticker), api.getBenchmark(), withNews ? api.getNews(ticker) : null,
  ]);
  const val = (r) => (r && (r.status === 'live' || r.status === 'demo') ? r.data : null);
  const results = [quote, daily, fund, fin, peers, bench, news].filter(Boolean);
  if (results.some((r) => r.status === 'locked')) throw Object.assign(new Error('Passcode needed'), { code: 'locked' });
  if (!val(quote)) throw new Error(quote.message || `No price for ${ticker}.`);
  const data = {
    quote: val(quote), daily: val(daily), bench: val(bench), fund: val(fund), fin: val(fin),
    peers: val(peers)?.peers ?? [], news: val(news), insidersLive: fund.status === 'live',
  };
  const demo = results.some((r) => r.status === 'demo');
  return { data, derived: analyze(data), demo };
}

// Everything the AI reads, kept compact (numbers rounded to 4 digits).
// c: { idea, q, fund, fin, news, peers, tech, risk, consensus, val, dcfDefault, score, scenarios, levels, insidersLive, demo }
export function researchBundle(c) {
  const r = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(4)));
  const m = c.fund?.metrics ?? {};
  const a = c.fin?.annual;
  const q = c.fin?.quarterly;
  const t = c.tech;
  const last = (arr, n = 5) => arr?.slice(-n).map(r);
  const recs = c.fund?.recommendations ?? [];
  const older = recs.length >= 3 ? analystConsensus(recs.slice(0, recs.length - 2)) : null;
  const trades = c.insidersLive ? c.fund?.insiders ?? [] : null;
  const fscore = piotroski(a);
  const z = altmanZ(a, c.q?.marketCap);
  const implied = c.val && c.q?.price ? impliedGrowth(c.q.price, c.val) : null;
  const perf = (label) => r(t?.performance.find((p) => p.label === label)?.value);
  const value = (list) => list.reduce((s, x) => s + Math.abs(x.change) * (x.transactionPrice || 0), 0);

  return {
    dataMode: c.demo ? 'demo' : 'live',
    ticker: c.idea.ticker,
    company: c.q?.name || c.idea.company || null,
    industry: c.q?.industry ?? null,
    asOf: new Date().toISOString().slice(0, 10),
    price: { price: r(c.q?.price), changeTodayPct: r(c.q?.changePct), marketCap: r(c.q?.marketCap), high52w: r(pick(m, '52WeekHigh')), low52w: r(pick(m, '52WeekLow')) },
    keyStats: {
      peTTM: r(pick(m, 'peTTM', 'peExclExtraTTM')), psTTM: r(pick(m, 'psTTM')), pb: r(pick(m, 'pbQuarterly', 'pbAnnual')),
      epsTTM: r(pick(m, 'epsTTM')), grossMarginPct: r(pick(m, 'grossMarginTTM')), operatingMarginPct: r(pick(m, 'operatingMarginTTM')),
      netMarginPct: r(pick(m, 'netProfitMarginTTM')), roePct: r(pick(m, 'roeTTM')), revenueGrowthYoYPct: r(pick(m, 'revenueGrowthTTMYoy')),
      epsGrowthYoYPct: r(pick(m, 'epsGrowthTTMYoy')), revenueGrowth5yPct: r(pick(m, 'revenueGrowth5Y')),
      debtToEquity: r(pick(m, 'totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual')), currentRatio: r(pick(m, 'currentRatioQuarterly', 'currentRatioAnnual')),
      beta: r(pick(m, 'beta')), dividendYieldPct: r(pick(m, 'dividendYieldIndicatedAnnual')),
    },
    technicals: t ? {
      trend: t.trend.label, rsi14: r(t.rsi.value), rsiState: t.rsi.state, macd: t.macd.state,
      vs50DayAvgPct: r(t.averages[1].distance), vs200DayAvgPct: r(t.averages[2].distance),
      cross: t.cross ? `${t.cross.kind} cross ${t.cross.daysAgo} days ago` : null,
      returnsPct: { '1M': perf('1M'), '6M': perf('6M'), '1Y': perf('1Y'), '3Y': perf('3Y') },
      volatility30dPct: r(t.volatility30), fromHigh52wPct: r(t.range52.fromHigh),
    } : null,
    risk: c.risk ? { beta1y: r(c.risk.beta), sharpe1y: r(c.risk.sharpe), maxDrawdown5yPct: r(c.risk.maxDrawdown.value), return1yPct: r(c.risk.return1y), sp500Return1yPct: r(c.risk.benchReturn1y) } : null,
    annualFinancials: a?.periods.length ? {
      years: a.periods.slice(-5).map((p) => p.label),
      revenue: last(a.rows.revenue), netIncome: last(a.rows.netIncome), freeCashFlow: last(a.rows.freeCashFlow),
      operatingMarginPct: last(a.ratios.operatingMargin), roicPct: last(a.ratios.roic),
      cash: last(a.rows.cash), longTermDebt: last(a.rows.longTermDebt),
    } : null,
    latestQuarter: q?.periods.length ? { period: q.periods.at(-1).label, revenueYoYPct: r(q.growth.revenue.at(-1)), epsYoYPct: r(q.growth.eps.at(-1)) } : null,
    health: { piotroskiFScore: fscore ? `${fscore.score} of ${fscore.known}` : null, altmanZ: z ? `${z.z.toFixed(2)} (${z.zone})` : null },
    valuation: {
      dcfValuePerShare: r(c.dcfDefault?.perShare),
      dcfAssumptions: c.val ? `${c.val.growth}% growth for 5 years fading to 2.5%, 9% discount rate` : null,
      priceImpliesGrowthPct: implied && !implied.bound ? r(implied.value) : null,
      fcfYieldPct: c.val?.fcf != null && c.q?.marketCap ? r((c.val.fcf / c.q.marketCap) * 100) : null,
      peerMedianPE: r(median((c.peers ?? []).map((p) => (p.pe > 0 ? p.pe : null)))),
      peerMedianPS: r(median((c.peers ?? []).map((p) => p.ps))),
    },
    earnings: {
      lastFour: (c.fund?.earnings ?? []).slice(-4).map((e) => ({ period: e.period, actual: e.actual, estimate: e.estimate, surprisePct: r(e.surprisePercent) })),
      next: c.fund?.nextEarnings?.date ?? null,
    },
    analysts: recs.length ? {
      consensus: c.consensus?.label ?? null,
      latest: recs.at(-1),
      buySharePct: r(c.consensus?.buyShare),
      buySharePct2MonthsEarlier: r(older?.buyShare),
    } : null,
    insiders12m: trades ? {
      openMarketBuys: trades.filter((x) => x.transactionCode === 'P').length,
      openMarketSells: trades.filter((x) => x.transactionCode === 'S').length,
      valueBought: r(value(trades.filter((x) => x.transactionCode === 'P'))),
      valueSold: r(value(trades.filter((x) => x.transactionCode === 'S'))),
    } : 'not available',
    headlines: (c.news?.news ?? []).slice(0, 12).map((n) => ({ date: new Date(n.time).toISOString().slice(0, 10), source: n.source, headline: n.headline })),
    appScore: c.score?.overall != null ? {
      overall: c.score.overall,
      label: c.score.label,
      // Each factor with the measurements behind it and how each scored (0-100)
      factors: c.score.factors.map((x) => ({
        factor: x.name, grade: x.grade, score: x.score,
        inputs: x.inputs.map((i) => `${i.label}: ${i.value} (scored ${i.score})`),
      })),
    } : null,
    scenarios: c.scenarios ? {
      method: c.scenarios.method,
      cases: c.scenarios.cases.map((s) => ({ case: s.key, value: r(s.value), vsPricePct: r(s.changePct), assumptions: s.assumptions })),
    } : null,
    priceLevels: (c.levels ?? []).map((l) => ({ level: l.label, price: r(l.price), vsPricePct: r(l.distancePct) })),
    investorThesis: {
      thesis: c.idea.thesis || null, bullCase: c.idea.bull || null, bearCase: c.idea.bear || null,
      targetPrice: c.idea.target, entryPrice: c.idea.entry, conviction: CONVICTION_WORDS[(c.idea.conviction ?? 3) - 1],
      // Your own dated notes, newest last, so the AI can check how your thinking has held up
      yourNotes: (c.idea.notes ?? []).slice(-6).map((n) => ({ date: n.at.slice(0, 10), priceThen: n.price, note: n.text.slice(0, 400) })),
    },
  };
}
