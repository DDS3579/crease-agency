/**
 * Static server for the built site that applies `_headers` verbatim, so the harness
 * tests the real CSP and caching policy rather than a dev approximation.
 * Used by scripts/posters.ts, scripts/qa.ts, Playwright and Lighthouse CI.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HARNESS_PORT = 4180;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export interface HeaderRule { pattern: string; headers: Record<string, string> }

export function parseHeaders(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  let current: HeaderRule | null = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: {} };
      rules.push(current);
    } else if (current) {
      const i = raw.indexOf(':');
      if (i > 0) current.headers[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
    }
  }
  return rules;
}

function matches(pattern: string, path: string): boolean {
  if (pattern.endsWith('/*')) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}

export function headersFor(rules: HeaderRule[], path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) if (matches(rule.pattern, path)) Object.assign(out, rule.headers);
  return out;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

export interface ServeOptions { dist?: string; port?: number; headersFile?: string }
export interface RunningServer { url: string; port: number; close: () => Promise<void> }

export async function serve(opts: ServeOptions = {}): Promise<RunningServer> {
  const dist = resolve(opts.dist ?? join(root, 'dist'));
  if (!existsSync(join(dist, 'index.html'))) {
    throw new Error(`No built site at ${dist}. Run "pnpm build" first.`);
  }
  const headersPath = opts.headersFile ?? join(dist, '_headers');
  const rules = existsSync(headersPath) ? parseHeaders(readFileSync(headersPath, 'utf8')) : [];
  const port = opts.port ?? HARNESS_PORT;

  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';

      const file = join(dist, normalize(path).replace(/^(\.\.[/\\])+/, ''));
      if (!file.startsWith(dist + sep) && file !== join(dist, 'index.html')) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      try {
        const body = await readFile(file);
        res.writeHead(200, {
          'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
          'Content-Length': String(body.byteLength),
          ...headersFor(rules, path)
        });
        res.end(body);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      }
    })();
  });

  await new Promise<void>((ok, err) => {
    server.once('error', err);
    server.listen(port, '127.0.0.1', ok);
  });

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((ok) => {
        server.close(() => ok());
        server.closeAllConnections();
      })
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const s = await serve();
  console.log(`serving dist with _headers at ${s.url}`);
}
