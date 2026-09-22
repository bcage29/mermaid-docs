import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

/**
 * Whether something is expected to forward a port to this process.
 *
 * In a dev container the browser is outside it, so it connects to whatever port the
 * forwarder picked: `localhost:8081` reaching a server bound to 8080 is ordinary there
 * and a sign of a rewritten request anywhere else. The bound port is therefore only
 * compared when nothing sits in between.
 *
 * MERMAID_DOCS_FORWARDED settles it either way when the guess is wrong.
 */
export function isForwarded(): boolean {
  const override = process.env.MERMAID_DOCS_FORWARDED;
  if (override !== undefined && override !== '') return override !== '0' && override !== 'false';
  return (
    process.env.REMOTE_CONTAINERS === 'true' ||
    process.env.CODESPACES === 'true' ||
    existsSync('/.dockerenv')
  );
}

/**
 * Normalize a host for comparison, unwrapping IPv4-mapped IPv6 and bracketing IPv6.
 *
 * A name the user typed may carry the port they reach it on - `viewer.internal:8080` -
 * which is dropped, because what is compared is `URL.hostname`. Only a bare IPv6 address
 * is left with colons in it, and that is what the bracketing distinguishes.
 */
function hostname(host: string): string {
  const normalized = host.toLowerCase().replace(/^::ffff:/, '');
  const bracketed = /^\[(.+)\](?::\d+)?$/.exec(normalized);
  if (bracketed) return `[${bracketed[1]}]`;
  // Two or more colons is an IPv6 address; exactly one is a host and the port after it.
  if (normalized.indexOf(':') !== normalized.lastIndexOf(':')) return `[${normalized}]`;
  return normalized.replace(/:\d+$/, '');
}

interface AccessPolicy {
  /** Names for the socket itself, which the browser reaches on the port that was bound. */
  direct: Set<string>;
  /** Names of a proxy in front of it, which answers on a port of its own. A leading dot
   *  matches any subdomain. */
  proxied: Set<string>;
  forwarded: boolean;
}

/**
 * Which hosts may reach the server, given the interface bound and any extra names.
 *
 * Codespaces publishes the viewer under its own forwarding domain, so the browser sends
 * that name and never localhost. Nothing else is inferred: another proxy or tunnel has to
 * be named with --allow-host.
 */
function accessPolicy(configuredHost?: string, allowedHosts: readonly string[] = []): AccessPolicy {
  const direct = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (configuredHost && configuredHost !== '0.0.0.0' && configuredHost !== '::') {
    direct.add(hostname(configuredHost));
  }
  const proxied = new Set<string>();
  const codespaces = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (codespaces) proxied.add(`.${hostname(codespaces)}`);
  for (const host of allowedHosts) if (host) proxied.add(hostname(host));
  return { direct, proxied, forwarded: isForwarded() };
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

function requestIsAllowed(req: IncomingMessage, policy: AccessPolicy): boolean {
  const authority = req.headers.host;
  if (!authority || /[\s/@?#\\]/.test(authority)) return false;
  try {
    const protocol = 'encrypted' in req.socket && req.socket.encrypted ? 'https:' : 'http:';
    const address = new URL(`${protocol}//${authority}`);
    const proxied = [...policy.proxied].some((host) =>
      host.startsWith('.') ? address.hostname.endsWith(host) : address.hostname === host,
    );
    if (!proxied) {
      const direct = new Set(policy.direct);
      if (req.socket.localAddress) direct.add(hostname(req.socket.localAddress));
      if (!direct.has(address.hostname)) return false;
      // A forwarder answers on a port of its own and connects to this one, so the two
      // only have to agree when the browser reached the socket itself.
      const port = Number(address.port || (protocol === 'https:' ? 443 : 80));
      if (!policy.forwarded && port !== req.socket.localPort) return false;
    }
    // Compared by authority rather than by origin: a tunnel terminates TLS in front of
    // this server, so an https page reaches a plain http socket and the schemes differ.
    if (req.headers.origin !== undefined && new URL(req.headers.origin).host !== address.host) {
      return false;
    }
    return req.headers['sec-fetch-site'] !== 'cross-site';
  } catch {
    return false;
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
 * `mermaid-docs serve` puts it behind its own HTTP server; `npm run dev` mounts it as Vite
 * middleware. Both run this same handler rather than a copy.
 */
export function createApi(
  root: string,
  configuredHost?: string,
  allowedHosts: readonly string[] = [],
): Api {
  const clients = new Set<ServerResponse>();
  const policy = accessPolicy(configuredHost, allowedHosts);

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (!path.startsWith('/api/')) return false;

    if (!requestIsAllowed(req, policy)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return true;
    }

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
 * opt-in. `allowedHosts` names any proxy or tunnel the browser reaches it through.
 */
export async function startServer(
  root: string,
  requestedPort = 0,
  host = '127.0.0.1',
  allowedHosts: readonly string[] = [],
): Promise<ServerHandle> {
  const api = createApi(root, host, allowedHosts);
  const policy = accessPolicy(host, allowedHosts);

  const server = createServer((req, res) => {
    if (!requestIsAllowed(req, policy)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }
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
  // 0.0.0.0 is not a usable address in a browser; report a reachable one. A container's
  // own address is not reachable from outside it either, so there loopback is the answer
  // and the forwarder carries it the rest of the way.
  const wildcard = host === '0.0.0.0' || host === '::';
  const displayHost = wildcard ? (policy.forwarded ? 'localhost' : lanAddress()) : host;

  return {
    server,
    port,
    host,
    url: `http://${displayHost}:${port}`,
    broadcast: api.broadcast,
    async close() {
      api.closeClients();
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      // server.close() only stops new connections and waits out the old ones. The browser
      // holds keep-alive sockets open and its event stream reconnects the moment it is
      // ended, so waiting for them means never resolving - the host eventually kills the
      // process instead.
      server.closeAllConnections();
      await closed;
    },
  };
}
