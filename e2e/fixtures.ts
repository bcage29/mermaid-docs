import { test as base, expect } from '@playwright/test';
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
