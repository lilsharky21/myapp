// ==========================================================================
// lib/blob.js: your private storage in Vercel Blob.
// Used for syncing the journal, research notes, and the Mac's to-do list.
// Everything is saved as private files that only this app can read.
// ==========================================================================

// The storage library, loaded when first needed (tests swap in a fake one)
let blob = null;
export const storage = async () => (blob ??= await import('@vercel/blob'));
export function useStorageForTests(fake) {
  blob = fake;
}

// Vercel connects Blob storage in one of two ways, depending on the project:
// a BLOB_READ_WRITE_TOKEN setting, or a BLOB_STORE_ID setting (the storage
// library then signs in automatically). Either one means it's set up.
export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

// Read a saved JSON file, or null if there isn't one yet
export async function readJSON(path) {
  const { get } = await storage();
  const found = await get(path, { access: 'private', useCache: false });
  if (!found || found.statusCode !== 200) return null;
  return JSON.parse(await new Response(found.stream).text());
}

export async function writeJSON(path, value) {
  const { put } = await storage();
  await put(path, JSON.stringify(value), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

export const notePath = (ticker) => `notes/${ticker}.json`;
export const QUEUE_PATH = 'jobs/queue.json';
export const JOURNAL_PATH = 'journal/ideas.json';

// The Mac's to-do list: { requests: [{ ticker, at, tries }], done: { TICKER: time }, last: { ticker, at } }
export async function readQueue() {
  const q = (await readJSON(QUEUE_PATH)) ?? {};
  return { requests: Array.isArray(q.requests) ? q.requests : [], done: q.done ?? {}, last: q.last ?? null };
}

// Remember that a note was just written (so automatic refreshes skip it)
export async function markNoteDone(ticker, at) {
  const q = await readQueue();
  q.requests = q.requests.filter((r) => r.ticker !== ticker);
  q.done[ticker] = at;
  q.last = { ticker, at };
  await writeJSON(QUEUE_PATH, q);
}
