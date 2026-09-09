import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDiagram, readDiagramFiles, resolveDiagramPath, writeDiagram } from '../src/server/workspace.js';

const MMD = 'flowchart TD\n  Start --> End';
let temp: string;
let root: string;
let outside: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'mermaid-docs-workspace-'));
  root = join(temp, 'workspace');
  outside = join(temp, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await writeFile(join(root, 'demo.mmd'), MMD);
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('workspace path containment', () => {
  it('loads diagrams without documentation and creates regular documentation', async () => {
    expect((await readDiagramFiles(root, 'demo.mmd')).md).toBeUndefined();
    await writeDiagram(root, 'demo.mmd', { md: 'Overview' });
    expect((await loadDiagram(root, 'demo.mmd')).overview).toBe('Overview');
  });

  it.each(['demo.mmd', 'demo.md'])('rejects reads through a linked %s', async (filename) => {
    await writeFile(join(outside, 'private.txt'), 'SYNTHETIC_OUTSIDE_CONTENT');
    await rm(join(root, filename), { force: true });
    await symlink(join(outside, 'private.txt'), join(root, filename));

    await expect(loadDiagram(root, 'demo.mmd')).rejects.toThrow(/symbolic link/i);
    await expect(readDiagramFiles(root, 'demo.mmd')).rejects.toThrow(/symbolic link/i);
  });

  it.each(['demo.mmd', 'demo.md'])('rejects writes through a linked %s before touching either file', async (filename) => {
    await writeFile(join(root, 'demo.md'), 'Original documentation');
    await writeFile(join(outside, 'private.txt'), 'SYNTHETIC_OUTSIDE_CONTENT');
    await rm(join(root, filename));
    await symlink(join(outside, 'private.txt'), join(root, filename));

    await expect(writeDiagram(root, 'demo.mmd', { mmd: 'Changed', md: 'Changed' }))
      .rejects.toThrow(/symbolic link/i);
    expect(await readFile(join(outside, 'private.txt'), 'utf8')).toBe('SYNTHETIC_OUTSIDE_CONTENT');
    const otherFile = filename === 'demo.md' ? 'demo.mmd' : 'demo.md';
    expect(await readFile(join(root, otherFile), 'utf8'))
      .toBe(filename === 'demo.md' ? MMD : 'Original documentation');
  });

  it.each(['new.mmd', 'new.md'])('rejects a dangling %s symlink', async (filename) => {
    await symlink(join(outside, 'missing.txt'), join(root, filename));
    expect(() => resolveDiagramPath(root, 'new.mmd')).toThrow(/symbolic link/i);
    await expect(writeDiagram(root, 'new.mmd', { mmd: MMD, md: 'Overview' }))
      .rejects.toThrow(/symbolic link/i);
    await expect(readFile(join(outside, 'missing.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects linked parent directories even when the remaining path does not exist', async () => {
    await symlink(outside, join(root, 'linked'), 'dir');
    expect(() => resolveDiagramPath(root, 'linked/new/nested.mmd')).toThrow(/symbolic link/i);
    await expect(writeDiagram(root, 'linked/demo.mmd', { mmd: MMD }))
      .rejects.toThrow(/symbolic link/i);
    await expect(readFile(join(outside, 'demo.mmd'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects symlinks to other files inside the workspace', async () => {
    await writeFile(join(root, 'other.md'), 'Overview');
    await symlink(join(root, 'other.md'), join(root, 'demo.md'));
    expect(() => resolveDiagramPath(root, 'demo.mmd')).toThrow(/symbolic link/i);
  });

  it('allows the selected workspace root itself to be a symlink', async () => {
    const alias = join(temp, 'alias');
    await symlink(root, alias, 'dir');
    await writeDiagram(alias, 'demo.mmd', { md: 'Overview' });
    expect((await loadDiagram(alias, 'demo.mmd')).relPath).toBe('demo.mmd');
  });

  it('allows missing regular paths but refuses traversal and sibling-prefix escapes', () => {
    expect(resolveDiagramPath(root, 'new/nested.mmd')).toBe(join(root, 'new/nested.mmd'));
    expect(() => resolveDiagramPath(root, '../outside/demo.mmd')).toThrow('outside the workspace');
    expect(() => resolveDiagramPath(root, '../workspace-other/demo.mmd')).toThrow('outside the workspace');
  });
});