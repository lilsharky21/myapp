// ==========================================================================
// dev-server.js: runs the whole app on your computer for testing.
//   npm run dev   ->  open http://localhost:3000
// It serves the page files and runs the api/ functions the same way Vercel does.
// Put keys in a file called .env (see .env.example). .env is never uploaded.
// ==========================================================================

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = new URL('.', import.meta.url).pathname;

// Load KEY=value lines from .env
if (existsSync(join(ROOT, '.env'))) {
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    // /api/quote -> api/quote.js
    const api = url.pathname.match(/^\/api\/([a-z-]+)$/);
    if (api) {
      const file = join(ROOT, 'api', `${api[1]}.js`);
      if (!existsSync(file)) return send(res, 404, 'text/plain', 'No such API');
      const handlers = await import(file);
      const handler = handlers[req.method];
      if (!handler) return send(res, 405, 'text/plain', 'Method not allowed');
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'));
      const response = await handler(new Request(url, { method: req.method, headers, body }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }

    // Everything else is a file
    const path = normalize(join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!path.startsWith(ROOT) || path.includes('/.') || path.includes('/lib/') || path.includes('/api/')) {
      return send(res, 404, 'text/plain', 'Not found');
    }
    const body = await readFile(path);
    send(res, 200, TYPES[extname(path)] ?? 'application/octet-stream', body);
  } catch (err) {
    if (err.code === 'ENOENT') return send(res, 404, 'text/plain', 'Not found');
    console.error(err);
    send(res, 500, 'text/plain', 'Server error');
  }
}).listen(PORT, () => console.log(`Thesis Journal running at http://localhost:${PORT}`));

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}
