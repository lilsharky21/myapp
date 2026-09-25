// ==========================================================================
// journal.js: everything about your saved ideas.
// Loading, saving, creating, and the journal itself: dated notes, trades
// you made, thesis changes, reviews, and closing an idea with a verdict.
// It doesn't know anything about how the page looks (that's app.js and
// js/tabs/journal.js). Every change returns a new copy of the idea.
// ==========================================================================

// The name your data is saved under in the browser.
// "v1" lets us change the format later without breaking old saves.
const STORAGE_KEY = 'thesis-journal/v1';
const DAY = 86_400_000;
export const REVIEW_DAYS = 90;

// Load your ideas from this browser.
// Returns { ideas, deleted, firstVisit, canSave }.
// `deleted` remembers which ideas you deleted (id -> when), so a deletion
// syncs to your other devices instead of the idea coming back.
export function loadIdeas() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      // Nothing saved yet: show a few examples so the app isn't empty.
      return { ideas: sampleIdeas(), deleted: {}, firstVisit: true, canSave: true };
    }
    const data = JSON.parse(raw);
    return {
      ideas: Array.isArray(data.ideas) ? data.ideas.map(normalizeIdea) : [],
      deleted: data.deleted && typeof data.deleted === 'object' ? data.deleted : {},
      firstVisit: false,
      canSave: true,
    };
  } catch {
    // Some browsers (private mode, blocked storage) refuse to save.
    // The app still works; it just forgets when you close it.
    return { ideas: sampleIdeas(), deleted: {}, firstVisit: true, canSave: false };
  }
}

// Save all ideas. Returns true if it worked.
export function saveIdeas(ideas, deleted = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ideas, deleted }));
    return true;
  } catch {
    return false;
  }
}

// Make a brand-new idea from what you typed in the form.
export function createIdea(fields) {
  const now = new Date().toISOString();
  return normalizeIdea({
    id: makeId(),
    ticker: '',
    company: '',
    thesis: '',
    bull: '',
    bear: '',
    target: null,      // your target price (a number, or null if blank)
    entry: null,       // the price when you added it
    conviction: 3,     // 1 to 5
    status: 'watching',  // 'watching', 'own' or 'closed'
    createdAt: now,
    updatedAt: now,
    ...fields,
  });
}

// Fill in anything an older save doesn't have yet
export function normalizeIdea(idea) {
  return {
    ...idea,
    notes: Array.isArray(idea.notes) ? idea.notes : [],           // [{ id, at, text, price }]
    trades: Array.isArray(idea.trades) ? idea.trades : [],        // [{ id, at, side: 'buy'|'sell', shares, price }]
    thesisHistory: Array.isArray(idea.thesisHistory) ? idea.thesisHistory : [], // [{ at, thesis, target }]
    reviews: Array.isArray(idea.reviews) ? idea.reviews : [],     // [ISO date you reviewed it]
    reviewBy: idea.reviewBy ?? isoDay(Date.parse(idea.createdAt || Date.now()) + REVIEW_DAYS * DAY),
    closed: idea.closed ?? null,                                  // { at, verdict, lesson, exit, from }
    alerts: Array.isArray(idea.alerts) ? idea.alerts : [],        // [{ id, dir: 'above'|'below', price, label, createdAt, firedAt }]
  };
}

// Words for each conviction level, in the order 1 to 5.
export const CONVICTION_WORDS = ['Speculative', 'Low', 'Medium', 'High', 'Table-pounding'];

// How a closed idea turned out
export const VERDICTS = [
  ['right', 'Called it', 'The thesis played out the way I said.'],
  ['early', 'Too early', 'Right idea, wrong timing.'],
  ['lucky', 'Lucky', 'It worked, but not for my reasons.'],
  ['wrong', 'Wrong', 'The thesis broke.'],
];

// Turn what someone typed ("$1,250.50") into a number (1250.5), or null if blank/invalid.
export function parsePrice(text) {
  const cleaned = String(text ?? '').replace(/[$,\s]/g, '');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Journal changes. Each takes an idea and returns the changed copy.
// ---------------------------------------------------------------------------

const touch = (idea, changes) => ({ ...idea, ...changes, sample: false, updatedAt: new Date().toISOString() });

// Editing in the sheet: keep the old thesis and target in the timeline
export function applyEdit(idea, fields) {
  const changed = (fields.thesis ?? idea.thesis) !== idea.thesis || (fields.target ?? null) !== (idea.target ?? null);
  const history = changed && (idea.thesis || idea.target != null)
    ? [...idea.thesisHistory, { at: new Date().toISOString(), thesis: idea.thesis, target: idea.target }]
    : idea.thesisHistory;
  return touch(idea, { ...fields, thesisHistory: history });
}

// A dated note, stamped with the price at that moment
export function addNote(idea, text, price = null) {
  const note = { id: makeId('n'), at: new Date().toISOString(), text: text.trim(), price: price ?? null };
  return touch(idea, { notes: [...idea.notes, note] });
}

export function removeEntry(idea, id) {
  return touch(idea, { notes: idea.notes.filter((n) => n.id !== id), trades: idea.trades.filter((t) => t.id !== id) });
}

// Bought / sold shares. Buying something you were watching marks it as owned.
export function logTrade(idea, { side, shares, price, at }) {
  const trade = { id: makeId('t'), at: at || new Date().toISOString(), side, shares, price };
  const trades = [...idea.trades, trade].sort((a, b) => a.at.localeCompare(b.at));
  const status = side === 'buy' && idea.status === 'watching' ? 'own' : idea.status;
  return touch(idea, { trades, status, entry: idea.entry ?? price });
}

// You looked at it again: push the next review out
export function markReviewed(idea, days = REVIEW_DAYS) {
  return touch(idea, {
    reviews: [...idea.reviews, new Date().toISOString()],
    reviewBy: isoDay(Date.now() + days * DAY),
  });
}

export function closeIdea(idea, { verdict, lesson, exit }) {
  return touch(idea, {
    status: 'closed',
    closed: { at: new Date().toISOString(), verdict, lesson: lesson.trim(), exit, from: idea.status },
  });
}

export function reopenIdea(idea) {
  return touch(idea, {
    status: idea.closed?.from === 'own' ? 'own' : 'watching',
    closed: null,
    reviewBy: isoDay(Date.now() + REVIEW_DAYS * DAY),
  });
}

// ---------------------------------------------------------------------------
// Price alerts (checked whenever the app refreshes prices)
// ---------------------------------------------------------------------------

export function addAlert(idea, { dir, price, label = '' }) {
  const alert = { id: makeId('a'), dir, price, label, createdAt: new Date().toISOString(), firedAt: null };
  return touch(idea, { alerts: [...idea.alerts, alert] });
}

export function removeAlert(idea, id) {
  return touch(idea, { alerts: idea.alerts.filter((a) => a.id !== id) });
}

// Returns { idea, fired } where fired lists alerts the price just crossed.
// Each alert fires once; idea is unchanged (same object) if nothing fired.
export function checkAlerts(idea, price) {
  if (price == null || !idea.alerts?.length) return { idea, fired: [] };
  const fired = idea.alerts.filter((a) => !a.firedAt && (a.dir === 'above' ? price >= a.price : price <= a.price));
  if (!fired.length) return { idea, fired };
  const now = new Date().toISOString();
  const ids = new Set(fired.map((a) => a.id));
  const alerts = idea.alerts.map((a) => (ids.has(a.id) ? { ...a, firedAt: now, firedPrice: price } : a));
  return { idea: { ...idea, alerts, updatedAt: now }, fired: fired.map((a) => ({ ...a, firedAt: now, firedPrice: price })) };
}

// Alerts that went off in the last `days` days (shown in Today and on the card)
export function recentAlerts(idea, days = 3, now = Date.now()) {
  return (idea.alerts ?? []).filter((a) => a.firedAt && now - Date.parse(a.firedAt) < days * DAY);
}

// ---------------------------------------------------------------------------
// How much to buy: size a position so a stop-loss costs a set share of your account
// ---------------------------------------------------------------------------

// account: your total investing money · riskPct: most you'd lose on this one idea (1 = 1%)
// entry: price you'd buy at · stop: price where you'd admit you're wrong and sell
export function sizePosition({ account, riskPct, entry, stop }) {
  if (!(account > 0) || !(riskPct > 0) || !(entry > 0) || !(stop >= 0) || stop >= entry) return null;
  const riskMoney = account * (riskPct / 100);
  const perShare = entry - stop;
  // Never more than the whole account, whatever the stop says
  const shares = Math.min(Math.floor(riskMoney / perShare), Math.floor(account / entry));
  return {
    riskMoney,
    perShare,
    shares,
    cost: shares * entry,
    pctOfAccount: ((shares * entry) / account) * 100,
    lossAtStop: shares * perShare,
    stopPct: (perShare / entry) * 100,
  };
}

// ---------------------------------------------------------------------------
// Reading the journal
// ---------------------------------------------------------------------------

// Your position from the trades you logged (average-cost method, like most brokers)
// Returns null if you haven't logged any trades.
export function position(idea, livePrice = null) {
  if (!idea.trades?.length) return null;
  let shares = 0;
  let cost = 0;       // what the shares you still hold cost you
  let realized = 0;   // profit or loss already locked in by selling
  let invested = 0;   // everything you ever paid
  for (const t of idea.trades) {
    if (t.side === 'buy') {
      shares += t.shares;
      cost += t.shares * t.price;
      invested += t.shares * t.price;
    } else {
      const sold = Math.min(t.shares, shares);
      const avg = shares > 0 ? cost / shares : 0;
      realized += sold * (t.price - avg);
      cost -= sold * avg;
      shares -= sold;
    }
  }
  if (shares < 1e-9) { shares = 0; cost = 0; }
  const avgCost = shares > 0 ? cost / shares : null;
  const value = livePrice != null && shares > 0 ? shares * livePrice : null;
  const unrealized = value != null ? value - cost : null;
  return {
    shares,
    avgCost,
    cost,
    realized,
    invested,
    value,
    unrealized,
    unrealizedPct: unrealized != null && cost > 0 ? (unrealized / cost) * 100 : null,
    total: (unrealized ?? 0) + realized,
  };
}

// The price your idea is measured from: the price when added, else your first buy, else your first note's price
export function startPrice(idea) {
  return idea.entry ?? idea.trades?.[0]?.price ?? idea.notes?.find((n) => n.price)?.price ?? null;
}

// How the idea has done since you started it (or until you closed it), in percent
export function ideaReturn(idea, livePrice) {
  const start = startPrice(idea);
  const end = idea.status === 'closed' ? idea.closed?.exit ?? livePrice : livePrice;
  return start > 0 && end != null ? ((end - start) / start) * 100 : null;
}

export function needsReview(idea, now = Date.now()) {
  return idea.status !== 'closed' && Boolean(idea.reviewBy) && idea.reviewBy <= isoDay(now);
}

// How good your calls have been, from your closed ideas.
// spy: daily S&P 500 (SPY) candles, to compare each idea with the market over the same dates.
// benchReturn(candles, fromIso, toIso) is passed in (it lives with the Journal tab).
export function trackRecord(ideas, spy, benchReturn) {
  const closed = ideas.filter((i) => i.status === 'closed' && i.closed);
  const rows = closed.map((i) => {
    const ret = ideaReturn(i, null);
    const market = benchReturn ? benchReturn(spy, i.createdAt, i.closed.at) : null;
    return {
      idea: i,
      ret,
      market,
      vsMarket: ret != null && market != null ? ret - market : null,
      days: Math.max(0, Math.round((Date.parse(i.closed.at) - Date.parse(i.createdAt)) / DAY)),
    };
  });
  const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const withReturn = rows.filter((r) => r.ret != null).sort((a, b) => b.ret - a.ret);
  const verdicts = Object.fromEntries(VERDICTS.map(([key]) => [key, closed.filter((i) => i.closed.verdict === key).length]));
  const byConviction = [1, 2, 3, 4, 5]
    .map((level) => ({ level, list: rows.filter((r) => r.idea.conviction === level) }))
    .filter((g) => g.list.length)
    .map((g) => ({ level: g.level, count: g.list.length, avgReturn: avg(g.list.map((r) => r.ret)) }));
  return {
    count: closed.length,
    verdicts,
    calledRate: closed.length ? (verdicts.right / closed.length) * 100 : null,
    winRate: withReturn.length ? (withReturn.filter((r) => r.ret > 0).length / withReturn.length) * 100 : null,
    avgReturn: avg(rows.map((r) => r.ret)),
    avgVsMarket: avg(rows.map((r) => r.vsMarket)),
    beatMarket: rows.filter((r) => r.vsMarket != null).length
      ? rows.filter((r) => r.vsMarket > 0).length / rows.filter((r) => r.vsMarket != null).length * 100
      : null,
    avgDays: avg(rows.map((r) => r.days)),
    best: withReturn[0] ?? null,
    worst: withReturn.length > 1 ? withReturn.at(-1) : null,
    byConviction,
    lessons: closed.filter((i) => i.closed.lesson)
      .sort((a, b) => b.closed.at.localeCompare(a.closed.at))
      .map((i) => ({ ticker: i.ticker, lesson: i.closed.lesson, at: i.closed.at, verdict: i.closed.verdict })),
  };
}

// Everything that happened to an idea, newest first
export function timeline(idea) {
  const events = [{ kind: 'created', at: idea.createdAt, price: idea.entry }];
  for (const n of idea.notes) events.push({ kind: 'note', ...n });
  for (const t of idea.trades) events.push({ kind: 'trade', ...t });
  for (const h of idea.thesisHistory) events.push({ kind: 'thesis', ...h });
  for (const at of idea.reviews) events.push({ kind: 'review', at });
  for (const a of idea.alerts ?? []) if (a.firedAt) events.push({ kind: 'alert', ...a, at: a.firedAt });
  if (idea.closed) events.push({ kind: 'closed', ...idea.closed });
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

// ---------------------------------------------------------------------------
// Syncing between devices, and backups
// ---------------------------------------------------------------------------

// Combine two copies of the journal (this device's and the saved one).
// For each idea the most recently changed copy wins; deletions win over
// older copies. Example ideas are only kept once per ticker.
export function mergeJournals(local, remote) {
  const deleted = { ...(remote?.deleted ?? {}) };
  for (const [id, at] of Object.entries(local?.deleted ?? {})) {
    if (!deleted[id] || at > deleted[id]) deleted[id] = at;
  }
  const newer = (a, b) => {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
    return (a.ratings?.at ?? 0) >= (b.ratings?.at ?? 0); // same edit: keep the fresher ratings
  };
  const byId = new Map();
  // This device's copy goes second, so it wins a tie
  for (const idea of [...(remote?.ideas ?? []), ...(local?.ideas ?? [])]) {
    if (!idea?.id) continue;
    const have = byId.get(idea.id);
    if (!have || newer(idea, have)) byId.set(idea.id, idea);
  }
  const alive = [...byId.values()].filter((i) => !(deleted[i.id] && deleted[i.id] >= i.updatedAt));
  const yours = new Set(alive.filter((i) => !i.sample).map((i) => i.ticker));
  const firstSample = new Map();
  for (const i of alive) {
    if (i.sample && !yours.has(i.ticker) && (!firstSample.has(i.ticker) || i.id < firstSample.get(i.ticker))) firstSample.set(i.ticker, i.id);
  }
  const ideas = alive
    .filter((i) => !i.sample || firstSample.get(i.ticker) === i.id)
    .map(normalizeIdea)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { ideas, deleted };
}

// The same journal, written the same way every time (to tell if anything changed)
export function journalKey({ ideas, deleted }) {
  const sorted = [...ideas].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify([sorted, Object.keys(deleted).sort().map((k) => [k, deleted[k]])]);
}

// A backup file you can keep anywhere
export function exportJournal({ ideas, deleted }) {
  return JSON.stringify({ app: 'thesis-journal', version: 2, exportedAt: new Date().toISOString(), ideas, deleted }, null, 2);
}

// Read a backup file. Throws with a readable message if it isn't one.
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("That file isn't a Thesis Journal backup."); }
  if (!data || !Array.isArray(data.ideas) || data.ideas.some((i) => !i?.id || !i?.ticker)) {
    throw new Error("That file isn't a Thesis Journal backup.");
  }
  return { ideas: data.ideas.map(normalizeIdea), deleted: data.deleted ?? {} };
}

// ---------------------------------------------------------------------------

// "2026-09-25" for a time
export function isoDay(t) {
  return new Date(t).toISOString().slice(0, 10);
}

// A short random id like "i-k3j9x2a". It starts with a letter so it's safe to use in CSS.
function makeId(prefix = 'i') {
  return `${prefix}-` + Math.random().toString(36).slice(2, 9);
}

// Example ideas for your first visit. They're marked `sample` so the card shows a "Sample" tag.
function sampleIdeas() {
  return [
    createIdea({
      ticker: 'NVDA',
      company: 'NVIDIA',
      thesis: 'Data-center AI spending keeps compounding for years, not quarters.',
      bull: 'Cloud giants keep raising their capex plans, and CUDA keeps developers locked in.',
      bear: 'Big customers switch to their own chips, or a capex pause hits revenue fast.',
      conviction: 4,
      sample: true,
    }),
    createIdea({
      ticker: 'COST',
      company: 'Costco',
      thesis: 'The membership fee is the business. Renewals are the moat.',
      bull: 'Renewal rates stay high, fee hikes stick, and new warehouses keep opening.',
      bear: 'The valuation already assumes perfection. Any slowdown gets punished.',
      conviction: 3,
      sample: true,
    }),
    createIdea({
      ticker: 'AAPL',
      company: 'Apple',
      thesis: 'Services become a bigger share of profit every year.',
      bull: 'The installed base keeps growing, and services carry much higher margins than hardware.',
      bear: 'Regulators force lower App Store fees.',
      conviction: 3,
      status: 'own',
      sample: true,
    }),
  ];
}
