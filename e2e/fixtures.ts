import { test as base, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface ServerFixture {
  baseURL: string;
  /** Temp copy of examples/, safe for tests that write to disk. */
  root: string;
}

/**
 * Boot the real CLI against a throwaway copy of the examples, and read the port it chose.
 *
 * The server binds to an ephemeral port, so the URL has to come from its output rather
 * than being fixed in advance.
 */
async function startServer(root: string): Promise<{ url: string; child: ChildProcessWithoutNullStreams }> {
  const child = spawn('node', ['dist/cli/index.js', root, '--no-open'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  }) as ChildProcessWithoutNullStreams;

  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not report a URL within 20s')), 20_000);
    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early with code ${code}`));
    });
  });

  return { url, child };
}

export const test = base.extend<ServerFixture>({
  root: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), 'mermaid-docs-e2e-'));
    await cp('examples', dir, { recursive: true });
    await use(dir);
    await rm(dir, { recursive: true, force: true });
  },
  baseURL: async ({ root }, use) => {
    const { url, child } = await startServer(root);
    await use(url);
    child.kill('SIGTERM');
  },
});

export { expect };

/**
 * The overview has been placed: inside the canvas and centred across it, and scaled down
 * only when it would not otherwise fit. Fitting never enlarges, so a diagram that fits
 * stays at 100%.
 */
export async function expectOverviewFitted(page: Page, { shrunk }: { shrunk: boolean }): Promise<void> {
  await expect(page.locator('.mermaid-host.is-fitted svg')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const area = document.querySelector('.canvas-viewport')!.getBoundingClientRect();
        const svg = document.querySelector('.mermaid-host svg')!.getBoundingClientRect();
        return {
          inside:
            svg.left >= area.left - 1 &&
            svg.right <= area.right + 1 &&
            svg.top >= area.top - 1 &&
            svg.bottom <= area.bottom + 1,
          centredX: Math.abs(svg.left - area.left - (area.right - svg.right)) <= 2,
        };
      }),
    )
    .toEqual({ inside: true, centredX: true });

  const zoom = Number((await page.getByTestId('zoom-level').textContent())!.replace('%', ''));
  if (shrunk) expect(zoom).toBeLessThan(100);
  else expect(zoom).toBe(100);
}

