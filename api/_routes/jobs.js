// The Mac's to-do list: how your iPhone gets AI research.
//
// The AI runs on your Mac (Ollama), which your phone can't reach directly.
// So the phone leaves a request here, and a small helper on the Mac (set up
// once from Data connections) checks every few minutes, writes the note with
// Ollama, and sends it back. The note then shows on every device.
//
// POST /api/jobs { ticker } or { tickers }   -> ask the Mac for a note (phone)
// GET  /api/jobs                             -> what's waiting, and when the Mac last wrote one
// GET  /api/jobs?next=1&auto=1&model=...     -> (Mac helper) the next job, as a ready-to-send
//                                               Ollama request, or 204 if there's nothing to do
// POST /api/jobs?done=NVDA&model=...         -> (Mac helper) Ollama's answer, saved as the note

import { fail, guard } from '../../lib/http.js';
import { blobConfigured, readJSON, writeJSON, readQueue, markNoteDone, notePath, QUEUE_PATH, JOURNAL_PATH } from '../../lib/blob.js';
import { useFetcher } from '../../js/api.js';
import { loadAndAnalyze, researchBundle } from '../../js/analysis.js';
import { buildPrompt, normalize, parseJSON } from '../../js/ai.js';
import * as quote from './quote.js';
import * as history from './history.js';
import * as fundamentals from './fundamentals.js';
import * as financials from './financials.js';
import * as news from './news.js';
import * as peers from './peers.js';

const TICKER = /^[A-Z0-9.\-]{1,12}$/;
const MODEL = /^[a-zA-Z0-9._:\-]{1,60}$/;
const MAX_QUEUE = 40;
const MAX_TRIES = 3;
const STALE_MS = 3 * 86_400_000; // automatic refresh: notes older than 3 days
const noStore = { 'Cache-Control': 'no-store' };
const bad = (message, status = 400) => Response.json({ error: 'bad_request', message }, { status, headers: noStore });

// The research data is gathered by calling the other API functions directly
// (no trip over the internet), with this server's own passcode.
const HANDLERS = { quote, history, fundamentals, financials, news, peers };
useFetcher(async (path) => {
  const url = new URL(path, 'http://internal');
  const handler = HANDLERS[url.pathname.split('/').pop()]?.GET;
  if (!handler) return Response.json({ error: 'not_found' }, { status: 404 });
  return handler(new Request(url, { headers: { 'x-passcode': process.env.APP_PASSCODE ?? '' } }));
});

export async function GET(request) {
  try {
    guard(request);
    if (!blobConfigured()) return Response.json({ error: 'not_configured', service: 'Sync' }, { status: 503, headers: noStore });
    const params = new URL(request.url).searchParams;
    const q = await readQueue();
    if (!params.get('next')) {
      return Response.json({
        queued: q.requests.map((r) => r.ticker),
        requests: q.requests.map((r) => ({ ticker: r.ticker, at: r.at })),
        lastNoteAt: q.last?.at ?? null,
        lastNoteTicker: q.last?.ticker ?? null,
      }, { headers: noStore });
    }
    const model = params.get('model') || 'qwen3:14b';
    if (!MODEL.test(model)) return bad('Bad model name.');
    return nextJob(q, { model, auto: params.get('auto') === '1' });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request) {
  try {
    guard(request);
    if (!blobConfigured()) return Response.json({ error: 'not_configured', service: 'Sync' }, { status: 503, headers: noStore });
    const params = new URL(request.url).searchParams;
    const done = params.get('done');
    if (done) return finishJob(request, done.toUpperCase(), params.get('model') || 'qwen3:14b');

    const body = await request.json().catch(() => null);
    const list = (body?.tickers ?? (body?.ticker ? [body.ticker] : []))
      .map((t) => String(t).trim().toUpperCase());
    if (!list.length || list.some((t) => !TICKER.test(t))) return bad('Send { ticker } or { tickers }.');
    const q = await readQueue();
    const waiting = new Set(q.requests.map((r) => r.ticker));
    for (const ticker of list) {
      if (!waiting.has(ticker) && q.requests.length < MAX_QUEUE) q.requests.push({ ticker, at: Date.now(), tries: 0 });
      waiting.add(ticker);
    }
    await writeJSON(QUEUE_PATH, q);
    return Response.json({ queued: q.requests.map((r) => r.ticker) }, { headers: noStore });
  } catch (err) {
    return fail(err);
  }
}

// Pick the next stock and prepare everything the Mac's AI needs to write about it
async function nextJob(q, { model, auto }) {
  let journal;
  let request = q.requests[0];
  if (!request && auto) {
    journal = await readJSON(JOURNAL_PATH);
    const ticker = stalest(journal, q.done);
    if (ticker) request = { ticker, auto: true };
  }
  if (!request) return new Response(null, { status: 204, headers: noStore });

  // Count attempts, so a stock that keeps failing doesn't block the list
  if (!request.auto) {
    request.tries = (request.tries ?? 0) + 1;
    if (request.tries > MAX_TRIES) {
      q.requests = q.requests.filter((r) => r !== request);
      await writeJSON(QUEUE_PATH, q);
      return new Response(null, { status: 204, headers: noStore });
    }
    await writeJSON(QUEUE_PATH, q);
  }

  journal ??= await readJSON(JOURNAL_PATH).catch(() => null);
  const idea = journal?.ideas?.find((i) => i.ticker === request.ticker && i.status !== 'closed')
    ?? { ticker: request.ticker, company: '', conviction: 3 };
  let analyzed;
  try {
    analyzed = await loadAndAnalyze(request.ticker, { withNews: true });
  } catch {
    // No price for this ticker (a typo, or delisted): take it off the list
    q.requests = q.requests.filter((r) => r.ticker !== request.ticker);
    await writeJSON(QUEUE_PATH, q);
    return new Response(null, { status: 204, headers: noStore });
  }
  const { data, derived, demo } = analyzed;
  const bundle = researchBundle({
    idea, q: data.quote, fund: data.fund, fin: data.fin, news: data.news, peers: data.peers,
    ...derived, insidersLive: data.insidersLive, demo,
  });
  // The same settings the app uses in the browser (see runResearch in js/ai.js)
  const body = {
    model,
    stream: false,
    think: false,
    format: 'json',
    keep_alive: '30m',
    options: { temperature: 0.2, num_ctx: 16384, num_predict: 6000 },
    messages: [{ role: 'user', content: buildPrompt(bundle) }],
  };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'X-Job-Ticker': request.ticker, ...noStore },
  });
}

// Your open ideas whose note is the oldest (and over 3 days old)
export function stalest(journal, done, now = Date.now()) {
  const tickers = [...new Set((journal?.ideas ?? []).filter((i) => i.status !== 'closed').map((i) => i.ticker))]
    .filter((t) => TICKER.test(t));
  const due = tickers.filter((t) => now - (done[t] ?? 0) > STALE_MS).sort((a, b) => (done[a] ?? 0) - (done[b] ?? 0));
  return due[0] ?? null;
}

// The Mac sends back Ollama's answer: check it and save it as the note
async function finishJob(request, ticker, model) {
  if (!TICKER.test(ticker) || !MODEL.test(model)) return bad('Bad ticker or model.');
  const text = await request.text();
  if (text.length > 500_000) return bad('Answer is too large.', 413);
  let raw;
  try {
    const answer = JSON.parse(text);
    raw = parseJSON(answer?.message?.content ?? answer?.response ?? '');
  } catch {
    return bad("The AI's answer wasn't a research note. It will try again next time.", 422);
  }
  if (!raw?.rating || !(raw.bottomLine || raw.headline)) return bad("The AI's answer was missing the rating. It will try again next time.", 422);
  const result = normalize(raw);
  const entry = { result, engine: `Your Mac · ${model}`, at: Date.now(), demo: !process.env.FINNHUB_API_KEY, background: true };
  await writeJSON(notePath(ticker), entry);
  await markNoteDone(ticker, entry.at);
  return Response.json({ saved: true, ticker }, { headers: noStore });
}
