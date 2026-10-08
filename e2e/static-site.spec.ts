import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { promisify } from 'node:util';

const BASE = '/my-repo/';
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

let site: string;
let server: Server;
let origin: string;

/**
 * A site from `mermaid-docs build`, served the way GitHub Pages serves a project site:
 * plain files under `/<repo>/`, with nothing at the root. A rooted asset or API path
 * misses and 404s here, as it would there.
 */
test.beforeAll(async () => {
  site = join(await mkdtemp(join(tmpdir(), 'mermaid-docs-site-')), '_site');
  await promisify(execFile)(process.execPath, ['dist/cli/index.js', 'build', 'examples', '--out', site, '--title', 'Examples']);

  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (!path.startsWith(BASE)) return void res.writeHead(404).end();
    const file = normalize(join(site, path.slice(BASE.length) || 'index.html'));
    readFile(file)
      .then((body) => res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body))
      .catch(() => res.writeHead(404).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(join(site, '..'), { recursive: true, force: true });
});

test('a built site works from a subpath with no server behind it', async ({ page }) => {
  const missed: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404) missed.push(response.url());
  });
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(`${origin}${BASE}#/auth-flow/credential-check`);
  await expect(page.getByTestId('workspace-root')).toHaveText('Examples');
  await expect(page.getByTestId('diagram-title')).toHaveText('Authentication Flow');
  await expect(page.getByTestId('step-title')).toHaveText('Credentials are checked');
  await expect(page.locator('.mermaid-host path[data-id="L_Login_Auth_0"].is-active')).toHaveCount(1);
  await expect(page).toHaveTitle('Examples · Mermaid Docs');

  // Every diagram in the workspace is listed, not only the one opened.
  await expect(page.locator('select option')).toHaveCount(3);

  expect(missed).toEqual([]);
  expect(errors).toEqual([]);
});

test('an unknown diagram reports itself rather than a parse error', async ({ page }) => {
  await page.goto(`${origin}${BASE}#/no-such-diagram`);
  await expect(page.getByText('No diagram named "no-such-diagram".')).toBeVisible();
});
