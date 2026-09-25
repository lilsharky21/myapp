// ==========================================================================
// ai.js: the AI analyst.
//
// It hands the AI the numbers already on the page (it never asks the AI
// to remember prices or news) and asks for a research note written for a
// beginner: the bottom line first, then scenarios, price levels, every
// section explained in plain English, a checklist, what would change the
// view, a check of YOUR thesis, and what to research next.
//
// Which AI runs, in order of preference:
//   1. "Your Mac"  - Ollama running on your MacBook (free, private, no limits)
//   2. "Claude"    - inside the claude.ai preview, using your own Claude plan
//   3. "Gemini"    - optional, only if a GEMINI_API_KEY is set on Vercel
// Notes written on the Mac are saved to your Vercel account, so your phone
// shows them too (see api/notes.js).
// ==========================================================================

import { passcodeHeaders } from './api.js';

const OLLAMA = 'http://localhost:11434';
const CACHE_PREFIX = 'thesis-journal/ai-v2/'; // v2 = the detailed beginner note
const DAY_MS = 86_400_000;
// Models that follow instructions well, best first. Any installed model works.
const PREFERRED_LOCAL = ['qwen3', 'gemma3', 'llama3.3', 'llama3.1', 'mistral-small', 'phi4', 'llama3'];

export const RATINGS = ['Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'];
export const RISK_LEVELS = ['Low', 'Medium', 'High', 'Very high'];
export const SECTIONS = [
  ['valuation', 'Valuation'], ['growth', 'Growth'], ['profitability', 'Profitability'], ['health', 'Financial health'],
  ['momentum', 'Momentum'], ['earnings', 'Earnings'], ['sentiment', 'Sentiment'], ['news', 'News'],
];

// ---------------------------------------------------------------------------
// Finding an AI to use
// ---------------------------------------------------------------------------

let enginesPromise = null;

// Returns the available engines, best first: [{ id, label }].
// Remembers the answer; { fresh: true } checks again (after you fix a setting).
export function findEngines({ fresh = false } = {}) {
  if (fresh) enginesPromise = null;
  enginesPromise ??= (async () => {
    const inClaude = typeof window.claude?.use === 'function';
    // Local AI only runs on a computer, so phones and tablets skip that check
    const computer = navigator.maxTouchPoints === 0;
    const [local, claude, cloud] = await Promise.all([
      inClaude || !computer ? null : localModel(),
      inClaude ? window.claude.use('sample').catch(() => null) : null,
      inClaude ? null : cloudStatus(),
    ]);
    const engines = [];
    if (local) engines.push({ id: 'local', label: `Your Mac · ${local}`, model: local });
    if (claude) engines.push({ id: 'claude', label: 'Claude · your Claude plan', sample: claude });
    if (cloud?.configured) engines.push({ id: 'cloud', label: `${cloud.provider} · free tier`, model: cloud.model });
    return engines;
  })();
  return enginesPromise;
}

async function localModel() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const { models = [] } = await res.json();
    const names = models.map((m) => m.name);
    for (const want of PREFERRED_LOCAL) {
      // "qwen3:14b" counts as qwen3, but "qwen3-coder:30b" doesn't (it's for code)
      const hit = names.find((n) => n.startsWith(`${want}:`));
      if (hit) return hit;
    }
    return names.find((n) => !/coder|moondream|embed/.test(n)) ?? names[0] ?? null;
  } catch {
    return null; // Ollama isn't running (or this isn't your Mac)
  }
}

let siteInfo = null; // { productionUrl } from the backend, once known

async function cloudStatus() {
  try {
    const res = await fetch('/api/ai', { headers: { Accept: 'application/json', ...passcodeHeaders() } });
    if (!(res.headers.get('content-type') || '').includes('json')) return null;
    const body = await res.json();
    siteInfo = body;
    return body;
  } catch {
    return null;
  }
}

// The app's permanent address, like https://myapp-abc.vercel.app (null if unknown)
export async function productionUrl() {
  if (!siteInfo) await cloudStatus();
  return siteInfo?.productionUrl ? `https://${siteInfo.productionUrl}` : null;
}

// ---------------------------------------------------------------------------
// Why isn't the Mac's AI connecting? Works out which problem it is.
//   'ok'          Ollama answered and has models
//   'no-model'    Ollama answered but no model is downloaded
//   'origin'      Ollama is running but refuses this app's address
//   'unreachable' nothing answered: Ollama is closed, or the browser blocked it
//   'not-computer' phones and tablets can't run it
// ---------------------------------------------------------------------------

export async function diagnoseLocalAI() {
  if (navigator.maxTouchPoints > 0) return { status: 'not-computer' };
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (res.status === 403) return { status: 'origin' };
    const { models = [] } = await res.json();
    const names = models.map((m) => m.name);
    return names.length ? { status: 'ok', models: names } : { status: 'no-model' };
  } catch {
    // A "no-cors" request still gets through when Ollama is up but refuses this
    // address. If even that fails, Ollama is closed or the browser blocked it.
    try {
      await fetch(`${OLLAMA}/api/tags`, { mode: 'no-cors', signal: AbortSignal.timeout(2500) });
      return { status: 'origin' };
    } catch {
      return { status: 'unreachable' };
    }
  }
}

export function browserName() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome|Chromium|CriOS/.test(ua)) return 'Chrome';
  if (/Firefox/.test(ua)) return 'Firefox';
  if (/Safari/.test(ua)) return 'Safari';
  return 'your browser';
}

// Load the Mac's model into memory ahead of time (when you open a stock), so
// the note starts writing right away instead of waiting 10-20 s to load.
export async function warmUp() {
  const engines = await findEngines();
  if (engines[0]?.id !== 'local') return;
  fetch(`${OLLAMA}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model: engines[0].model, keep_alive: '30m' }),
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Remembering results (one research run per stock per day is plenty)
// ---------------------------------------------------------------------------

export function savedResearch(ticker) {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_PREFIX + ticker));
    return saved && Date.now() - saved.at < DAY_MS ? saved : null;
  } catch {
    return null;
  }
}

function saveResearch(ticker, entry) {
  try { localStorage.setItem(CACHE_PREFIX + ticker, JSON.stringify(entry)); } catch { /* storage full or blocked */ }
}

// ---------------------------------------------------------------------------
// Running the research
// ---------------------------------------------------------------------------

// bundle: the data (see stock.js researchBundle). Returns { result, engine, at, demo }.
export async function runResearch(ticker, bundle, { signal, onProgress } = {}) {
  const engines = await findEngines();
  if (!engines.length) throw Object.assign(new Error('No AI is set up yet.'), { code: 'no_engine' });
  const engine = engines[0];
  const prompt = buildPrompt(bundle);

  let raw;
  if (engine.id === 'claude') {
    raw = await engine.sample.json(prompt, {
      signal,
      cache: false,
      modelTier: 'complex', // the most thorough model: slower, but this note is worth it
      onText: ({ text }) => onProgress?.(text.length),
    }).catch((e) => { throw Object.assign(new Error(claudeMessage(e.code)), { code: e.code }); });
  } else if (engine.id === 'local') {
    // Speed-ups: no "thinking out loud" first (the biggest delay with qwen3),
    // a smaller memory window, and keeping the model loaded for 30 minutes.
    // The answer streams in, so the page can show progress as it's written.
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model: engine.model,
        stream: true,
        think: false,
        format: 'json',
        keep_alive: '30m',
        options: { temperature: 0.2, num_ctx: 16384, num_predict: 6000 },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Your Mac's AI answered ${res.status}. Is the model downloaded?`);
    let text = '';
    let pending = '';
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // Each line is a small JSON piece: { message: { content: "next few words" } }
      const lines = (pending + decoder.decode(value, { stream: true })).split('\n');
      pending = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        text += JSON.parse(line).message?.content ?? '';
      }
      onProgress?.(text.length);
    }
    if (pending.trim()) text += JSON.parse(pending).message?.content ?? '';
    raw = parseJSON(text);
  } else {
    const res = await fetch('/api/ai', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...passcodeHeaders() },
      body: JSON.stringify({ prompt }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'The cloud AI had a problem. Try again in a minute.');
    raw = parseJSON(body.text);
  }

  const result = normalize(raw);
  const entry = { result, engine: engine.label, at: Date.now(), demo: bundle.dataMode === 'demo' };
  saveResearch(ticker, entry);
  // Share it with your other devices (the phone reads what the Mac wrote).
  // The preview has no backend, so it skips this.
  if (engine.id !== 'claude') shareNote(ticker, entry);
  return entry;
}

function shareNote(ticker, entry) {
  fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...passcodeHeaders() },
    body: JSON.stringify({ ticker, entry }),
  }).catch(() => { /* syncing is a bonus; the note is already saved on this device */ });
}

// The latest note saved from any of your devices, or null
export async function loadSharedNote(ticker) {
  if (typeof window.claude?.use === 'function') return null; // the preview has no backend
  try {
    const res = await fetch(`/api/notes?symbol=${encodeURIComponent(ticker)}`, { headers: { Accept: 'application/json', ...passcodeHeaders() } });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
    const { entry } = await res.json();
    if (!entry?.result || typeof entry.at !== 'number') return null;
    return { ...entry, result: normalize(entry.result), synced: true };
  } catch {
    return null;
  }
}

function claudeMessage(code) {
  return {
    not_granted: 'You chose not to let this page use Claude. Reload to be asked again.',
    rate_limited: 'Claude is busy or your usage limit was reached. Try again later.',
    invalid_json: "Claude's answer came back in the wrong format. Try again.",
    session_expired: 'Sign in to Claude again, then retry.',
    sampling_disabled: "Claude isn't available for this account.",
  }[code] || 'Claude had a problem answering. Try again.';
}

// Reads JSON even if the AI wrapped it in ```code fences``` or added a sentence
function parseJSON(text) {
  if (!text) throw new Error('The AI sent back an empty answer.');
  // Some models (like qwen3) think out loud in <think> tags first; skip that part
  const clean = String(text).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```(?:json)?/g, '');
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error("The AI's answer wasn't in the expected format. Try again.");
  }
}

// Make sure the answer has the shape the page expects, whatever the AI sent
export function normalize(raw) {
  const str = (v, max = 700) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (v, max = 6, len = 320) => (Array.isArray(v) ? v.map((x) => str(typeof x === 'string' ? x : x?.text, len)).filter(Boolean).slice(0, max) : []);
  const oneOf = (options, v, fallback) => options.find((x) => x.toLowerCase() === str(v).toLowerCase()) ?? fallback;
  const num = (v, lo, hi) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, Number(v))) : null);

  const sections = {};
  for (const [key] of SECTIONS) {
    const x = raw?.sections?.[key];
    sections[key] = x ? { view: oneOf(['Positive', 'Neutral', 'Negative'], x.view, 'Neutral'), line: str(x.line, 450), meaning: str(x.meaning, 450) } : null;
  }
  const scenario = (x) => (x ? { odds: num(x.odds, 0, 100), story: str(x.story, 500) } : null);

  return {
    version: 2,
    rating: oneOf(RATINGS, raw?.rating, 'Hold'),
    confidence: Math.round(num(raw?.confidence, 0, 100) ?? 50),
    riskLevel: oneOf(RISK_LEVELS, raw?.riskLevel, 'Medium'),
    riskWhy: str(raw?.riskWhy, 400),
    headline: str(raw?.headline, 240),
    bottomLine: str(raw?.bottomLine, 800),
    snapshot: str(raw?.snapshot, 900),
    // older notes had "summary" instead of "snapshot"
    summary: str(raw?.summary, 1200),
    sections,
    scenarios: { bear: scenario(raw?.scenarios?.bear), base: scenario(raw?.scenarios?.base), bull: scenario(raw?.scenarios?.bull) },
    levelsNote: str(raw?.levelsNote, 500),
    approach: str(raw?.approach, 500),
    beforeYouBuy: list(raw?.beforeYouBuy, 6),
    upgradeIf: list(raw?.upgradeIf, 4),
    downgradeIf: list(raw?.downgradeIf, 4),
    bull: list(raw?.bull, 5),
    bear: list(raw?.bear, 5),
    risks: list(raw?.risks, 5),
    catalysts: list(raw?.catalysts, 4),
    watch: list(raw?.watch, 5),
    questions: list(raw?.questions, 5, 400),
    glossary: Array.isArray(raw?.glossary)
      ? raw.glossary.map((g) => ({ term: str(g?.term, 60), plain: str(g?.plain, 300) })).filter((g) => g.term && g.plain).slice(0, 8)
      : [],
    thesis: {
      status: oneOf(['Intact', 'Weakening', 'Broken', 'No thesis'], raw?.thesis?.status, 'No thesis'),
      line: str(raw?.thesis?.line, 600),
      suggestions: list(raw?.thesis?.suggestions, 3),
    },
  };
}

// About how long the note takes to read
export function readingMinutes(result) {
  const text = JSON.stringify(result);
  return Math.max(1, Math.round(text.split(/\s+/).length / 230));
}

// ---------------------------------------------------------------------------
// The instructions the AI gets
// ---------------------------------------------------------------------------

export function buildPrompt(bundle) {
  const demo = bundle.dataMode === 'demo'
    ? '\nIMPORTANT: these are made-up DEMO numbers, not real market data. Analyze them exactly as given and begin the bottomLine with "Based on demo numbers:".\n'
    : '';
  return `You are a patient equity research analyst writing for ONE investor who is a beginner. They keep a thesis journal and want to make better, calmer decisions. Write a research note that is detailed and specific, but easy to follow.

RULES
- Use ONLY the DATA below for numbers, prices, news and recent events. Your general knowledge may only be used to describe what the company sells, in one or two sentences, and never for recent events or figures. If something important is missing from the data, say so.
- Be specific: every "line", "story" and list item must mention at least one number from the data, and say what it is being compared with (its own history, the peer median, the S&P 500, or the app's scoring thresholds in appScore.factors).
- Plain English: the first time you use a term like P/E, free cash flow, margin or beta, explain it in a few words in parentheses. Short sentences. No hype and no hedging filler.
- Be balanced: give the strongest honest case on both sides. If your rating differs from Wall Street or the app score, explain why in bottomLine.
- scenarios: the bear/base/bull prices are already worked out in DATA.scenarios. Do not invent other prices. For each case, write the story (what would have to happen, citing numbers) and your odds in percent; the three odds must add to 100.
- levelsNote: explain the price levels in DATA.priceLevels for a beginner: which act as support or resistance, and where the stock looks cheaper or more expensive relative to the DCF value.
- approach: general education on how investors often approach a stock with this risk level (for example building a position gradually or keeping it a small share of a portfolio). Not personal advice, and never tell them to buy or sell.
- This is research, not personal financial advice.
${demo}
Reply with ONLY one JSON object in exactly this shape (no text before or after):
{
  "rating": "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell",
  "confidence": 0-100,
  "riskLevel": "Low" | "Medium" | "High" | "Very high",
  "riskWhy": "1-2 sentences with numbers (volatility, drawdown, debt, beta)",
  "headline": "one-sentence verdict",
  "bottomLine": "3-4 sentences: the verdict, the single biggest reason for it, the single biggest risk, and what kind of investor it suits",
  "snapshot": "3-4 sentences for a beginner: what the business sells and how it is doing right now, with numbers",
  "sections": {
    "valuation": {"view": "Positive" | "Neutral" | "Negative", "line": "2 sentences with specific numbers and comparisons", "meaning": "1-2 sentences: what this means for you as an investor, in plain words"},
    "growth": {same shape}, "profitability": {...}, "health": {...}, "momentum": {...}, "earnings": {...}, "sentiment": {...}, "news": {...}
  },
  "scenarios": {
    "bear": {"odds": 0-100, "story": "2 sentences"},
    "base": {"odds": 0-100, "story": "2 sentences"},
    "bull": {"odds": 0-100, "story": "2 sentences"}
  },
  "levelsNote": "2-3 sentences",
  "approach": "1-2 sentences",
  "beforeYouBuy": ["4-5 specific things to check or decide before buying THIS stock, each actionable and tied to the data"],
  "upgradeIf": ["2-3 specific, measurable signs that would make you more positive"],
  "downgradeIf": ["2-3 specific, measurable signs that would make you more negative"],
  "bull": ["3-4 points with numbers"],
  "bear": ["3-4 points with numbers"],
  "risks": ["3 risks"],
  "catalysts": ["up to 3 upcoming events or drivers from the data, with dates when known"],
  "watch": ["3-4 numbers to track, with the level that would matter"],
  "questions": ["3 questions the data here cannot answer, and exactly where to look (for example 'Item 1A Risk Factors in the latest 10-K')"],
  "glossary": [{"term": "a term you used", "plain": "one-sentence plain-English meaning"}],
  "thesis": {
    "status": "Intact" | "Weakening" | "Broken" | "No thesis",
    "line": "2 sentences comparing the investor's own thesis, bull case and bear case with the data",
    "suggestions": ["1-3 ways to make their thesis sharper or more testable"]
  }
}

DATA:
${JSON.stringify(bundle)}`;
}
