import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { loadDiagram, scanDiagrams } from './workspace.js';

/** First non-internal IPv4 address, for printing a URL other devices can open. */
function lanAddress(): string {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return 'localhost';
}

/** Where `vite build` puts the viewer, relative to the compiled server. */
const WEB_ROOT = fileURLToPath(new URL('../web/', import.meta.url));

/** When this process loaded its code, for the staleness check below. */
const STARTED_AT = Date.now();

/**
 * Whether the viewer assets on disk are newer than the running server.
 *
 * The server holds its compiled code in memory but reads the browser bundle from disk on
 * every request, so a rebuild while it runs leaves a new UI talking to an old API. That
 * mismatch surfaces as inexplicable missing data rather than an error.
 */
async function serverIsStale(): Promise<boolean> {
  try {
    const { mtimeMs } = await stat(join(WEB_ROOT, 'index.html'));
    return mtimeMs > STARTED_AT;
  } catch {
    return false;
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export interface ServerHandle {
  server: Server;
  port: number;
  /** The interface actually bound. */
  host: string;
  url: string;
  /** Push a change notification to every connected browser. */
  broadcast(event: string, data: unknown): void;
  close(): Promise<void>;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/**
 * Start the viewer HTTP server.
 *
 * Binds to loopback on an ephemeral port by default. Nothing here writes to stdout, so
 * the same process can also speak MCP over stdio.
 *
 * `host` may be widened to reach the viewer from another device on the network. The
 * server has no authentication and serves everything under `root`, so that is strictly
 * opt-in.
 */
export interface Api {
  /** Handles the `/api` routes, reporting whether the request was one of them. */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /** Push a change notification to every connected browser. */
  broadcast(event: string, data: unknown): void;
  /** End the open event streams. */
  closeClients(): void;
}

/**
 * The viewer's API, independent of who owns the socket.
 *
 * `mmdocs serve` puts it behind its own HTTP server; `npm run dev` mounts it as Vite
 * middleware. Both run this same handler rather than a copy.
 */
export function createApi(root: string): Api {
  const clients = new Set<ServerResponse>();

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (!path.startsWith('/api/')) return false;

    if (path === '/api/workspace') {
      sendJson(res, 200, { root: basename(root) || 'Workspace', stale: await serverIsStale() });
      return true;
    }

    if (path === '/api/diagrams') {
      const refs = await scanDiagrams(root);
      // Only the first file claiming a name is reachable by it, so only it is listed.
      // `validate` is where a clash is reported.
      const unique = refs.filter((r, i) => refs.findIndex((o) => o.name === r.name) === i);
      // The picker shows the documented title and step count, so the list carries both
      // rather than the browser fetching every diagram to find out.
      sendJson(
        res,
        200,
        await Promise.all(
          unique.map(async ({ id, relPath, name, group, hasDocumentation }) => {
            const diagram = await loadDiagram(root, id);
            return {
              relPath,
              name,
              group,
              hasDocumentation,
              title: diagram.title,
              stepCount: diagram.steps.length,
            };
          }),
        ),
      );
      return true;
    }

    if (path.startsWith('/api/diagrams/')) {
      const name = path.slice('/api/diagrams/'.length);
      const ref = (await scanDiagrams(root)).find((d) => d.name === name);
      if (!ref) {
        sendJson(res, 404, { error: `No diagram named "${name}".` });
        return true;
      }
      try {
        sendJson(res, 200, await loadDiagram(root, ref.id));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJson(res, message.includes('outside the workspace') ? 403 : 404, { error: message });
      }
      return true;
    }

    if (path === '/api/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return true;
    }

    return false;
  }

  return {
    handle,
    broadcast(event, data) {
      const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const client of clients) client.write(frame);
    },
    closeClients() {
      for (const client of clients) client.end();
      clients.clear();
    },
  };
}

async function serveStatic(path: string, res: ServerResponse): Promise<void> {
  // Unknown paths fall through to index.html so the hash router can handle them.
  const rel = path === '/' || !extname(path) ? 'index.html' : path.replace(/^\/+/, '');
  const file = join(WEB_ROOT, rel);
  if (!file.startsWith(WEB_ROOT)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      // Only the bundle is fingerprinted. Everything else - index.html, the icons - keeps
      // its name across builds, and a cached copy is how an updated favicon goes unnoticed.
      'cache-control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      rel === 'index.html'
        ? 'Viewer assets are missing. Run "npm run build" before serving.'
        : 'Not found',
    );
  }
}

/**
 * Start the viewer HTTP server.
 *
 * Binds to loopback on an ephemeral port by default. Nothing here writes to stdout, so
 * the same process can also speak MCP over stdio.
 *
 * `host` may be widened to reach the viewer from another device on the network. The
 * server has no authentication and serves everything under `root`, so that is strictly
 * opt-in.
 */
export async function startServer(root: string, requestedPort = 0, host = '127.0.0.1'): Promise<ServerHandle> {
  const api = createApi(root);

  const server = createServer((req, res) => {
    (async () => {
      if (await api.handle(req, res)) return;
      const url = new URL(req.url ?? '/', 'http://localhost');
      await serveStatic(decodeURIComponent(url.pathname), res);
    })().catch((error: unknown) => {
      if (res.headersSent) return res.end();
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  // 0.0.0.0 is not a usable address in a browser; report a reachable one.
  const displayHost = host === '0.0.0.0' || host === '::' ? lanAddress() : host;

  return {
    server,
    port,
    host,
    url: `http://${displayHost}:${port}`,
    broadcast: api.broadcast,
    async close() {
      api.closeClients();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
