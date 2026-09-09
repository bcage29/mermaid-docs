import { expect, test } from '@playwright/test';
import { createServer } from 'vite';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

test('Vite reloads the open diagram and documentation after disk changes', async ({ page }) => {
  const root = await mkdtemp(join(tmpdir(), 'mermaid-docs-dev-'));
  const previousRoot = process.env.MERMAID_DOCS_ROOT;
  process.env.MERMAID_DOCS_ROOT = root;
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    await mkdir(join(root, 'nested'));
    const diagram = join(root, 'nested/demo.mmd');
    const doc = join(root, 'nested/demo.md');
    await writeFile(diagram, 'flowchart TD\nStart --> Before');
    await writeFile(doc, '---\ntitle: Before edit\n---\n\nOriginal overview');
    server = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
    await server.listen();
    const baseURL = server.resolvedUrls!.local[0];
    const workspace = await page.request.get(`${baseURL}api/workspace`);
    expect(workspace.ok()).toBe(true);
    const workspaceInfo = await workspace.json();
    expect(workspaceInfo).toMatchObject({ root: basename(root) });
    expect(JSON.stringify(workspaceInfo)).not.toContain(root);
    const url = `${baseURL}#/demo`;
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
    await server?.close();
    if (previousRoot === undefined) delete process.env.MERMAID_DOCS_ROOT;
    else process.env.MERMAID_DOCS_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
  }
});