// ==========================================================================
// api/router.js: the app's whole backend, as ONE Vercel function.
//
// Vercel's free plan allows at most 12 functions per deployment, and every
// file directly in api/ counts as one. So each endpoint lives in api/_routes/
// (the "_" keeps Vercel from making it a function of its own), and this file
// sends every /api/<name> request to the right one. vercel.json rewrites
// /api/<name> to /api/router?route=<name>. The addresses the app uses don't change.
// ==========================================================================

// Written out one by one so Vercel packs every route into this function
const ROUTES = {
  ai: () => import('./_routes/ai.js'),
  financials: () => import('./_routes/financials.js'),
  fundamentals: () => import('./_routes/fundamentals.js'),
  history: () => import('./_routes/history.js'),
  jobs: () => import('./_routes/jobs.js'),
  journal: () => import('./_routes/journal.js'),
  market: () => import('./_routes/market.js'),
  news: () => import('./_routes/news.js'),
  notes: () => import('./_routes/notes.js'),
  peers: () => import('./_routes/peers.js'),
  quote: () => import('./_routes/quote.js'),
  rates: () => import('./_routes/rates.js'),
  screen: () => import('./_routes/screen.js'),
  search: () => import('./_routes/search.js'),
  status: () => import('./_routes/status.js'),
};
export const ROUTE_NAMES = Object.keys(ROUTES);

async function handle(request) {
  const url = new URL(request.url);
  // From the rewrite (?route=quote), or from the address itself (/api/quote)
  const name = url.searchParams.get('route') || url.pathname.split('/').filter(Boolean).pop();
  const load = Object.hasOwn(ROUTES, name) ? ROUTES[name] : null;
  if (!load) return Response.json({ error: 'not_found', message: 'No such API.' }, { status: 404 });
  const handler = (await load())[request.method];
  if (!handler) return Response.json({ error: 'bad_request', message: 'Method not allowed.' }, { status: 405 });

  // Hand the route the same address it would have had on its own
  url.searchParams.delete('route');
  url.pathname = `/api/${name}`;
  const init = { method: request.method, headers: request.headers };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }
  return handler(new Request(url, init));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
