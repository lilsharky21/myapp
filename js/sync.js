// ==========================================================================
// sync.js: keeps your journal the same on every device.
// This device always saves first (so nothing waits on the internet), then
// the journal is merged with the copy in your Vercel storage and saved back.
// ==========================================================================

import { passcodeHeaders } from './api.js';

// Returns { status: 'live', journal } | { status: 'off' } (Blob not set up) | { status: 'offline' } (no backend here) | { status: 'locked' } | { status: 'error' }
export async function pullJournal() {
  let res;
  try {
    res = await fetch('/api/journal', { headers: { Accept: 'application/json', ...passcodeHeaders() }, cache: 'no-store' });
  } catch {
    return { status: 'error' };
  }
  if (!(res.headers.get('content-type') || '').includes('json')) return { status: 'offline' };
  const body = await res.json().catch(() => ({}));
  if (res.status === 503) return { status: 'off' };
  if (res.status === 401) return { status: 'locked' };
  if (!res.ok) return { status: 'error' };
  return { status: 'live', journal: body.journal };
}

export async function pushJournal({ ideas, deleted }) {
  try {
    const res = await fetch('/api/journal', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...passcodeHeaders() },
      body: JSON.stringify({ ideas, deleted }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
