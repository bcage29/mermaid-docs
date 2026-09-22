import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, request } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi, startServer, type ServerHandle } from '../src/server/http.js';

let root: string;
let viewer: ServerHandle;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mermaid-docs-hosts-'));
  await writeFile(join(root, 'demo.mmd'), 'flowchart TD\nStart --> End');
  // These boundaries are relaxed behind a port forwarder, so pin the detection rather
  // than letting the machine running the suite decide.
  process.env.MERMAID_DOCS_FORWARDED = '0';
  viewer = await startServer(root);
});

afterEach(async () => {
  delete process.env.MERMAID_DOCS_FORWARDED;
  delete process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  await viewer.close();
  await rm(root, { recursive: true, force: true });
});

function get(url: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = request(url, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('viewer request boundaries', () => {
  it.each(['localhost', '127.0.0.1'])('accepts the local %s host and matching origin', async (host) => {
    const authority = `${host}:${viewer.port}`;
    expect((await get(`${viewer.url}/api/diagrams/demo`, {
      host: authority, origin: `http://${authority}`,
    })).status).toBe(200);
  });

  it.each(['/api/workspace', '/api/diagrams', '/api/diagrams/demo', '/api/events', '/'])
    ('rejects untrusted hosts on %s', async (path) => {
      const response = await get(`${viewer.url}${path}`, {
        host: `attacker.example:${viewer.port}`, origin: `http://attacker.example:${viewer.port}`,
      });
      expect(response).toEqual({ status: 403, body: '{"error":"Forbidden"}' });
    });

  it.each(['null', 'http://attacker.example', 'http://localhost:1'])('rejects origin %s', async (origin) => {
    expect((await get(`${viewer.url}/api/workspace`, { origin })).status).toBe(403);
  });

  it.each(['localhost:1', 'localhost.attacker.example', 'attacker.example@localhost', 'localhost/path'])
    ('rejects malformed or mismatched authority %s', async (host) => {
      expect((await get(`${viewer.url}/api/workspace`, { host })).status).toBe(403);
    });

  it('rejects cross-site requests and does not trust forwarded headers', async () => {
    expect((await get(`${viewer.url}/api/workspace`, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await get(`${viewer.url}/api/workspace`, {
      host: `attacker.example:${viewer.port}`, 'x-forwarded-host': `localhost:${viewer.port}`,
    })).status).toBe(403);
  });

  it('preserves direct access when bound to all IPv4 interfaces', async () => {
    await viewer.close();
    viewer = await startServer(root, 0, '0.0.0.0');
    const url = `http://127.0.0.1:${viewer.port}/api/diagrams`;
    expect((await get(url)).status).toBe(200);
    expect((await get(url, { host: `attacker.example:${viewer.port}` })).status).toBe(403);
  });

  it('also protects the shared API when mounted as middleware', async () => {
    const api = createApi(root);
    const server = createServer((req, res) => { void api.handle(req, res); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test address');
      const url = `http://127.0.0.1:${address.port}/api/diagrams`;
      expect((await get(url)).status).toBe(200);
      expect((await get(url, { host: `attacker.example:${address.port}` })).status).toBe(403);
    } finally {
      api.closeClients();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('behind a port forwarder', () => {
  /** Restart the viewer so it reads the environment the test just set. */
  async function restart(allowedHosts: string[] = []) {
    await viewer.close();
    viewer = await startServer(root, 0, '127.0.0.1', allowedHosts);
  }

  it('accepts the port the forwarder chose rather than the one it bound', async () => {
    const authority = `localhost:${viewer.port + 1}`;
    expect((await get(`${viewer.url}/api/workspace`, {
      host: authority, origin: `http://${authority}`,
    })).status).toBe(403);

    process.env.MERMAID_DOCS_FORWARDED = '1';
    await restart();
    const forwarded = `localhost:${viewer.port + 1}`;
    expect((await get(`${viewer.url}/api/workspace`, {
      host: forwarded, origin: `http://${forwarded}`,
    })).status).toBe(200);
  });

  it('still rejects untrusted hosts inside a container', async () => {
    process.env.MERMAID_DOCS_FORWARDED = '1';
    await restart();
    expect((await get(`${viewer.url}/api/workspace`, { host: 'attacker.example' })).status).toBe(403);
  });

  it('accepts the Codespaces domain, whose browser speaks https where this server does not', async () => {
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = 'app.github.dev';
    await restart();
    const authority = `demo-${viewer.port}.app.github.dev`;
    expect((await get(`${viewer.url}/api/workspace`, {
      host: authority, origin: `https://${authority}`,
    })).status).toBe(200);
    expect((await get(`${viewer.url}/api/workspace`, {
      host: authority, origin: 'https://attacker.example',
    })).status).toBe(403);
  });

  // A named proxy answers on a port of its own, so these use a port the server never
  // bound: a port check reintroduced for proxied hosts has to fail here.
  it('accepts a hostname named with --allow-host, and only that one', async () => {
    await restart(['viewer.internal']);
    expect((await get(`${viewer.url}/api/workspace`, { host: `viewer.internal:${viewer.port + 1}` })).status)
      .toBe(200);
    expect((await get(`${viewer.url}/api/workspace`, { host: `other.internal:${viewer.port + 1}` })).status)
      .toBe(403);
  });

  it('ignores a port written into an --allow-host value rather than never matching', async () => {
    await restart(['viewer.internal:9443']);
    expect((await get(`${viewer.url}/api/workspace`, { host: 'viewer.internal:9443' })).status).toBe(200);
  });
});
