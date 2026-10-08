import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuild } from '../src/cli/commands/build.js';

let dir: string;
let root: string;
let webRoot: string;
let out: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mermaid-docs-build-'));
  root = join(dir, 'diagrams');
  webRoot = join(dir, 'web');
  out = join(dir, 'site');
  await mkdir(join(root, 'auth'), { recursive: true });
  await writeFile(join(root, 'auth', 'login.mmd'), 'flowchart TD\n%% @step:start submit\nUser --> API\n%% @step:end submit');
  await writeFile(join(root, 'auth', 'login.md'), '---\ntitle: Login\n---\n\nOverview.\n\n## submit - User submits\n\nThe form posts.\n');
  await writeFile(join(root, 'plain.mmd'), 'flowchart TD\nA --> B');
  await mkdir(join(webRoot, 'assets'), { recursive: true });
  await writeFile(
    join(webRoot, 'index.html'),
    '<!doctype html>\n<html>\n  <head>\n    <title>Mermaid Docs</title>\n  </head>\n  <body></body>\n</html>\n',
  );
  await writeFile(join(webRoot, 'assets', 'index.js'), '');
  process.exitCode = undefined;
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  await rm(dir, { recursive: true, force: true });
});

const readJson = async (path: string) => JSON.parse(await readFile(join(out, path), 'utf8'));

describe('build', () => {
  it('writes the viewer and every API response as files', async () => {
    await runBuild({ root, flags: { out }, webRoot });

    expect(existsSync(join(out, 'assets', 'index.js'))).toBe(true);
    expect(existsSync(join(out, '.nojekyll'))).toBe(true);
    expect(await readJson('api/workspace.json')).toEqual({ root: 'diagrams', stale: false });

    const list = await readJson('api/diagrams.json');
    expect(list.map((d: { name: string }) => d.name)).toEqual(['login', 'plain']);
    expect(list[0]).toMatchObject({ relPath: 'auth/login.mmd', group: 'auth', title: 'Login', stepCount: 1 });

    const login = await readJson('api/diagrams/login.json');
    expect(login).toMatchObject({ name: 'login', relPath: 'auth/login.mmd', title: 'Login' });
    expect(login.steps[0]).toMatchObject({ id: 'submit', title: 'User submits' });
    // Published, so nothing about the machine that built it.
    expect(JSON.stringify(login)).not.toContain(dir);
  });

  it('marks the page as static and carries the security policy in it', async () => {
    await runBuild({ root, flags: { out, title: 'Auth <flows>' }, webRoot });
    const html = await readFile(join(out, 'index.html'), 'utf8');
    expect(html).toContain('<meta name="mermaid-docs-mode" content="static" />');
    expect(html).toContain(`content="script-src 'self'; object-src 'none'; base-uri 'none'"`);
    expect(html).toContain('<title>Auth &lt;flows&gt; · Mermaid Docs</title>');
    expect(await readJson('api/workspace.json')).toMatchObject({ root: 'Auth <flows>' });
  });

  it('replaces a previous build, dropping diagrams that were removed', async () => {
    await runBuild({ root, flags: { out }, webRoot });
    await rm(join(root, 'plain.mmd'));
    await runBuild({ root, flags: { out }, webRoot });
    expect(existsSync(join(out, 'api', 'diagrams', 'plain.json'))).toBe(false);
    expect(await readJson('api/diagrams.json')).toHaveLength(1);
  });

  it('refuses to write into a folder it did not create', async () => {
    await mkdir(out);
    await writeFile(join(out, 'keep.txt'), 'mine');
    await expect(runBuild({ root, flags: { out }, webRoot })).rejects.toThrow('not written by mermaid-docs build');
    expect(await readFile(join(out, 'keep.txt'), 'utf8')).toBe('mine');
  });

  it('refuses an output folder that contains the diagrams', async () => {
    await expect(runBuild({ root, flags: { out: dir }, webRoot })).rejects.toThrow('must not contain');
  });

  it('does not publish a workspace with errors', async () => {
    await writeFile(join(root, 'broken.mmd'), 'flowchart TD\n%% @step:start open\nA --> B');
    await expect(runBuild({ root, flags: { out }, webRoot })).rejects.toThrow('fix the error above first');
    expect(existsSync(out)).toBe(false);
  });
});
