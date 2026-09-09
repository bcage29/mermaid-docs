import { expect, test } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Vite reloads the open diagram and documentation after disk changes', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'mmdocs-dev-'));
  let server: ChildProcessWithoutNullStreams | undefined;
  try {
    await mkdir(join(root, 'nested'));
    const diagram = join(root, 'nested/demo.mmd');
    const doc = join(root, 'nested/demo.md');
    await writeFile(diagram, 'flowchart TD\nStart --> Before');
    await writeFile(doc, '---\ntitle: Before edit\n---\n\nOriginal overview');
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '0'], {
      cwd: process.cwd(),
      env: { ...process.env, MMDOCS_ROOT: root, NO_COLOR: '1' },
      stdio: 'pipe',
    });
    server = child;
    let startupTimer: NodeJS.Timeout | undefined;
    const baseURL = await new Promise<string>((resolve, reject) => {
      let output = '';
      startupTimer = setTimeout(() => reject(new Error(`Vite did not report a URL within 20s:\n${output}`)), 20_000);
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
        if (match) resolve(match[0]);
      });
      child.on('error', reject);
      child.on('exit', (code) => reject(new Error(`Vite exited with code ${code}:\n${output}`)));
    }).finally(() => clearTimeout(startupTimer));
    const workspace = await page.request.get(`${baseURL}/api/workspace`);
    expect(workspace.ok()).toBe(true);
    expect(await workspace.json()).toMatchObject({ root });
    const url = `${baseURL}/#/demo`;
    await page.goto(url);
    await expect(page.getByTestId('diagram-title')).toHaveText('Before edit');
    await expect(page.locator('.mermaid-host svg')).toContainText('Before');

    await writeFile(doc, '---\ntitle: After edit\n---\n\nUpdated overview');
    await expect(page.getByTestId('diagram-title')).toHaveText('After edit');
    await expect(page.getByTestId('docs-body')).toContainText('Updated overview');

    await writeFile(diagram, 'flowchart TD\nStart --> After');
    await expect(page.locator('.mermaid-host svg')).toContainText('After');
    await expect(page).toHaveURL(url);
  } finally {
    await page.close();
    if (server && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  }
});