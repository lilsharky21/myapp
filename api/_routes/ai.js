// GET  /api/ai  -> is cloud AI set up? { configured, model }
// POST /api/ai  -> { prompt } in, { text } out
//
// The phone's AI. It uses Google's Gemini free tier (key at aistudio.google.com).
// On your Mac, the app talks to local AI (Ollama) directly instead, so this
// isn't used there. The app builds the prompt; this just passes it along with
// the secret key added.

import { fail, guard, needKey, fetchJSON } from '../../lib/http.js';

const model = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_PROMPT = 120_000; // characters

export async function GET(request) {
  try {
    guard(request);
    return Response.json(
      {
        configured: Boolean(process.env.GEMINI_API_KEY),
        provider: 'Gemini',
        model: model(),
        // The app's permanent address (Vercel sets this), used in setup instructions
        productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request) {
  try {
    guard(request);
    const key = needKey('GEMINI_API_KEY', 'Gemini');
    const { prompt } = await request.json().catch(() => ({}));
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT) {
      return Response.json({ error: 'bad_request', message: 'Send { prompt } as text.' }, { status: 400 });
    }

    const data = await fetchJSON(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model())}:generateContent`,
      {
        method: 'POST',
        timeoutMs: 55_000, // just under the 60-second limit set in vercel.json
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: 'application/json' },
        }),
      },
    );
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) {
      return Response.json({ error: 'upstream', message: 'The AI sent back an empty answer. Try again.' }, { status: 502 });
    }
    return Response.json({ text, model: model() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return fail(err);
  }
}
