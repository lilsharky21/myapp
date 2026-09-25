// GET  /api/notes              -> is note syncing set up? { configured }
// GET  /api/notes?symbol=NVDA  -> the latest research note saved for that stock
// POST /api/notes {ticker, entry} -> save a research note (written on your Mac)
//
// Notes live in Vercel Blob storage inside your own Vercel account, as
// private files (only this app can read them). That's how research written
// by the local AI on your Mac shows up on your phone.

import { fail, guard } from '../lib/http.js';

const MAX_BYTES = 200_000;
const TICKER = /^[A-Z0-9.\-:^=]{1,15}$/;
const noStore = { 'Cache-Control': 'no-store' };

// The storage library, loaded when first needed (tests swap in a fake one)
let blob = null;
export const storage = async () => (blob ??= await import('@vercel/blob'));
export function useStorageForTests(fake) {
  blob = fake;
}

const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const pathFor = (ticker) => `notes/${ticker}.json`;

export async function GET(request) {
  try {
    guard(request);
    const raw = new URL(request.url).searchParams.get('symbol');
    if (!raw) return Response.json({ configured: configured() }, { headers: noStore });
    if (!configured()) return Response.json({ error: 'not_configured', service: 'Note sync' }, { status: 503, headers: noStore });

    const ticker = raw.trim().toUpperCase();
    if (!TICKER.test(ticker)) return Response.json({ error: 'bad_request', message: 'Bad ticker.' }, { status: 400, headers: noStore });

    const { get } = await storage();
    const found = await get(pathFor(ticker), { access: 'private', useCache: false });
    if (!found || found.statusCode !== 200) {
      return Response.json({ error: 'not_found', message: 'No saved note yet.' }, { status: 404, headers: noStore });
    }
    const entry = JSON.parse(await new Response(found.stream).text());
    return Response.json({ ticker, entry }, { headers: noStore });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request) {
  try {
    guard(request);
    if (!configured()) return Response.json({ error: 'not_configured', service: 'Note sync' }, { status: 503, headers: noStore });

    const text = await request.text();
    if (text.length > MAX_BYTES) return Response.json({ error: 'bad_request', message: 'Note is too large.' }, { status: 413, headers: noStore });
    const { ticker: rawTicker, entry } = JSON.parse(text || '{}');
    const ticker = String(rawTicker ?? '').trim().toUpperCase();
    if (!TICKER.test(ticker) || !entry?.result || typeof entry.at !== 'number') {
      return Response.json({ error: 'bad_request', message: 'Send { ticker, entry }.' }, { status: 400, headers: noStore });
    }

    const { put } = await storage();
    await put(pathFor(ticker), JSON.stringify(entry), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    return Response.json({ saved: true }, { headers: noStore });
  } catch (err) {
    if (err instanceof SyntaxError) return Response.json({ error: 'bad_request', message: 'Not valid JSON.' }, { status: 400, headers: noStore });
    return fail(err);
  }
}
