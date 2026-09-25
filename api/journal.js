// GET /api/journal  -> your saved journal { journal } (or { journal: null } if none yet)
// PUT /api/journal  -> save it { ideas, deleted }
//
// Your watchlist and journal, stored as one private file in your own Vercel
// Blob storage (the same place research notes sync through). That's how the
// Mac and the iPhone show the same ideas.

import { fail, guard } from '../lib/http.js';
import { storage, blobConfigured } from './notes.js';

const MAX_BYTES = 3_000_000;
const PATH = 'journal/ideas.json';
const noStore = { 'Cache-Control': 'no-store' };
const notConfigured = () => Response.json({ error: 'not_configured', service: 'Sync' }, { status: 503, headers: noStore });

export async function GET(request) {
  try {
    guard(request);
    if (!blobConfigured()) return notConfigured();
    const { get } = await storage();
    const found = await get(PATH, { access: 'private', useCache: false });
    if (!found || found.statusCode !== 200) return Response.json({ journal: null }, { headers: noStore });
    const journal = JSON.parse(await new Response(found.stream).text());
    return Response.json({ journal }, { headers: noStore });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request) {
  try {
    guard(request);
    if (!blobConfigured()) return notConfigured();
    const text = await request.text();
    if (text.length > MAX_BYTES) return Response.json({ error: 'bad_request', message: 'Journal is too large.' }, { status: 413, headers: noStore });
    const { ideas, deleted } = JSON.parse(text || '{}');
    if (!Array.isArray(ideas) || ideas.some((i) => typeof i?.id !== 'string' || typeof i?.ticker !== 'string')
        || (deleted != null && typeof deleted !== 'object')) {
      return Response.json({ error: 'bad_request', message: 'Send { ideas, deleted }.' }, { status: 400, headers: noStore });
    }
    const savedAt = Date.now();
    const { put } = await storage();
    await put(PATH, JSON.stringify({ ideas, deleted: deleted ?? {}, savedAt }), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });
    return Response.json({ saved: true, savedAt }, { headers: noStore });
  } catch (err) {
    if (err instanceof SyntaxError) return Response.json({ error: 'bad_request', message: 'Not valid JSON.' }, { status: 400, headers: noStore });
    return fail(err);
  }
}
