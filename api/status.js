// GET /api/status
// Checks every data connection for real: one tiny request per service.
// The app's "Data connections" card uses this to show ✓ or how to fix it.

import { guard, fail, fetchJSON } from '../lib/http.js';
import { storage } from './notes.js';

export async function GET(request) {
  try {
    guard(request);
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const [finnhub, twelvedata, sec, gemini, notes] = await Promise.all([
      check('FINNHUB_API_KEY', (key) =>
        fetchJSON(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${encodeURIComponent(key)}`)),
      check('TWELVEDATA_API_KEY', async (key) => {
        // Twelve Data reports a bad key inside a normal-looking answer
        const data = await fetchJSON(`https://api.twelvedata.com/time_series?symbol=AAPL&interval=1day&outputsize=1&apikey=${encodeURIComponent(key)}`);
        if (data.status !== 'ok') throw Object.assign(new Error(data.message || 'Twelve Data error'), { status: data.code });
      }),
      check('SEC_USER_AGENT', (agent) =>
        fetchJSON('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': agent } })),
      check('GEMINI_API_KEY', (key) =>
        fetchJSON(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, { headers: { 'x-goog-api-key': key } }), { badRequestMeansRejected: true, optional: 'Optional. Research is written on your Mac instead.' }),
      check('BLOB_READ_WRITE_TOKEN', async () => {
        // Reading a note that doesn't exist proves the storage answers
        const { get } = await storage();
        await get('notes/__check__.json', { access: 'private', useCache: false });
      }, { missingMessage: "Turn on sync so your phone shows the same journal and your Mac's research: Vercel → Storage → Create → Blob → connect, then redeploy (see docs/SETUP.md)." }),
    ]);
    return Response.json({
      finnhub,
      twelvedata,
      sec,
      gemini,
      notes,
      productionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || null,
      passcode: process.env.APP_PASSCODE ? { status: 'ok' } : { status: 'optional', message: 'No passcode set. Anyone with your link could use your free limits.' },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return fail(err);
  }
}

async function check(envName, run, { badRequestMeansRejected = false, optional = null, missingMessage = null } = {}) {
  const value = process.env[envName];
  if (!value && optional) return { status: 'optional', message: optional };
  if (!value) return { status: 'missing', message: missingMessage ?? `${envName} isn't set in Vercel yet.` };
  try {
    await run(value);
    return { status: 'ok' };
  } catch (err) {
    if (err.status === 401 || err.status === 403 || (badRequestMeansRejected && err.status === 400)) {
      return { status: 'rejected', message: 'The key was refused. Copy it again carefully (no spaces) and redeploy.' };
    }
    if (err.status === 429) return { status: 'error', message: 'The free limit was hit just now. Try again in a minute.' };
    return { status: 'error', message: `Couldn't reach the service (${err.message}).` };
  }
}
