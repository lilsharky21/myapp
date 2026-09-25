// ==========================================================================
// ai.js: the AI analyst.
//
// It hands the AI the numbers already on the page (it never asks the AI
// to remember prices or news) and asks for a structured rating: an overall
// call, a view on each section, bull/bear points, risks, and a check of
// YOUR thesis against the data.
//
// Which AI runs, in order of preference:
//   1. "Your Mac"  - Ollama running on your MacBook (free, private, no limits)
//   2. "Claude"    - inside the claude.ai preview, using your own Claude plan
//   3. "Gemini"    - Google's free tier, through our backend (for the phone)
// ==========================================================================

import { passcodeHeaders } from './api.js';

const OLLAMA = 'http://localhost:11434';
const CACHE_PREFIX = 'thesis-journal/ai/';
const DAY_MS = 86_400_000;
// Models that follow instructions well, best first. Any installed model works.
const PREFERRED_LOCAL = ['qwen3', 'gemma3', 'llama3.3', 'llama3.1', 'mistral-small', 'phi4', 'llama3'];

export const RATINGS = ['Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'];
export const SECTIONS = [
  ['valuation', 'Valuation'], ['growth', 'Growth'], ['profitability', 'Profitability'], ['health', 'Financial health'],
  ['momentum', 'Momentum'], ['earnings', 'Earnings'], ['sentiment', 'Sentiment'], ['news', 'News'],
];

// ---------------------------------------------------------------------------
// Finding an AI to use
// ---------------------------------------------------------------------------

let enginesPromise = null;

// Returns the available engines, best first: [{ id, label }]
export function findEngines() {
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
      const hit = names.find((n) => n.startsWith(want));
      if (hit) return hit;
    }
    return names[0] ?? null;
  } catch {
    return null; // Ollama isn't running (or this isn't your Mac)
  }
}

async function cloudStatus() {
  try {
    const res = await fetch('/api/ai', { headers: { Accept: 'application/json', ...passcodeHeaders() } });
    if (!(res.headers.get('content-type') || '').includes('json')) return null;
    return await res.json();
  } catch {
    return null;
  }
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
      onText: ({ text }) => onProgress?.(text.length),
    }).catch((e) => { throw Object.assign(new Error(claudeMessage(e.code)), { code: e.code }); });
  } else if (engine.id === 'local') {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      signal,
      body: JSON.stringify({
        model: engine.model,
        stream: false,
        format: 'json',
        options: { temperature: 0.2, num_ctx: 16384 },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Your Mac's AI answered ${res.status}. Is the model downloaded?`);
    raw = parseJSON((await res.json()).message?.content);
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
  return entry;
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
  const clean = String(text).replace(/```(?:json)?/g, '');
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
  const str = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (v) => (Array.isArray(v) ? v.map((x) => str(x, 280)).filter(Boolean).slice(0, 5) : []);
  const rating = RATINGS.find((r) => r.toLowerCase() === str(raw?.rating).toLowerCase()) ?? 'Hold';
  const view = (v) => ['Positive', 'Neutral', 'Negative'].find((x) => x.toLowerCase() === str(v).toLowerCase()) ?? 'Neutral';
  const sections = {};
  for (const [key] of SECTIONS) {
    const s = raw?.sections?.[key];
    sections[key] = s ? { view: view(s.view), line: str(s.line, 400) } : null;
  }
  const status = ['Intact', 'Weakening', 'Broken', 'No thesis'].find((x) => x.toLowerCase() === str(raw?.thesis?.status).toLowerCase()) ?? 'No thesis';
  return {
    rating,
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw?.confidence) || 50))),
    headline: str(raw?.headline, 240),
    summary: str(raw?.summary, 1200),
    sections,
    bull: list(raw?.bull),
    bear: list(raw?.bear),
    risks: list(raw?.risks),
    catalysts: list(raw?.catalysts),
    watch: list(raw?.watch),
    thesis: { status, line: str(raw?.thesis?.line, 500) },
  };
}

// ---------------------------------------------------------------------------
// The instructions the AI gets
// ---------------------------------------------------------------------------

export function buildPrompt(bundle) {
  const demo = bundle.dataMode === 'demo'
    ? '\nIMPORTANT: these are made-up DEMO numbers, not real market data. Analyze them exactly as given and begin the summary with "Based on demo numbers:".\n'
    : '';
  return `You are an equity research analyst writing for one private investor who keeps a thesis journal.
Rate the stock using ONLY the data below. Do not use outside knowledge about this company's recent events, prices or news, because it may be out of date. If important data is missing, say so. Cite specific numbers from the data. Be balanced and plain-spoken, with no hype. This is research, not personal financial advice.
${demo}
Reply with ONLY one JSON object in exactly this shape:
{
  "rating": "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell",
  "confidence": 0-100,
  "headline": "one sentence verdict",
  "summary": "3-4 sentences",
  "sections": {
    "valuation": {"view": "Positive" | "Neutral" | "Negative", "line": "1-2 sentences with numbers"},
    "growth": {...same shape}, "profitability": {...}, "health": {...}, "momentum": {...},
    "earnings": {...}, "sentiment": {...}, "news": {...}
  },
  "bull": ["3 short points"],
  "bear": ["3 short points"],
  "risks": ["3 short points"],
  "catalysts": ["up to 3 upcoming events or drivers found in the data"],
  "watch": ["3 specific things to monitor"],
  "thesis": {"status": "Intact" | "Weakening" | "Broken" | "No thesis", "line": "1-2 sentences comparing the investor's own thesis with the data"}
}

DATA:
${JSON.stringify(bundle)}`;
}
