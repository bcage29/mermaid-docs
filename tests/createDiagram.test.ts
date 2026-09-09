import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiagram } from '../src/server/workspace.js';

let root: string;
const files = { mmd: 'flowchart TD\nStart --> End', md: 'Overview' };

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'mmdocs-create-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('exclusive diagram creation', () => {
  it('creates both files in a new directory', async () => {
    await createDiagram(root, 'nested/demo.mmd', files);
    expect(await readFile(join(root, 'nested/demo.mmd'), 'utf8')).toBe(files.mmd);
    expect(await readFile(join(root, 'nested/demo.md'), 'utf8')).toBe(files.md);
  });

  it.each(['demo.mmd', 'demo.md'])('preserves an existing %s and leaves no partial sibling', async (filename) => {
    await writeFile(join(root, filename), 'Original');
    await expect(createDiagram(root, 'demo.mmd', files)).rejects.toThrow('already exists');
    expect(await readFile(join(root, filename), 'utf8')).toBe('Original');
    const sibling = filename === 'demo.md' ? 'demo.mmd' : 'demo.md';
    await expect(readFile(join(root, sibling))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves both existing files', async () => {
    await createDiagram(root, 'demo.mmd', files);
    await expect(createDiagram(root, 'demo.mmd', { mmd: 'Changed', md: 'Changed' }))
      .rejects.toThrow('already exists');
    expect(await readFile(join(root, 'demo.mmd'), 'utf8')).toBe(files.mmd);
    expect(await readFile(join(root, 'demo.md'), 'utf8')).toBe(files.md);
  });

  it('rolls back the diagram when the sibling is a directory', async () => {
    await mkdir(join(root, 'demo.md'));
    await expect(createDiagram(root, 'demo.mmd', files)).rejects.toThrow('already exists');
    await expect(readFile(join(root, 'demo.mmd'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not follow a dangling sibling link', async () => {
    await symlink(join(root, 'missing.txt'), join(root, 'demo.md'));
    await expect(createDiagram(root, 'demo.mmd', files)).rejects.toThrow('already exists');
    await expect(readFile(join(root, 'missing.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(root, 'demo.mmd'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('allows exactly one competing creation and keeps its files paired', async () => {
    const outcomes = await Promise.allSettled([
      createDiagram(root, 'demo.mmd', { mmd: 'First', md: 'First' }),
      createDiagram(root, 'demo.mmd', { mmd: 'Second', md: 'Second' }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    expect(await readFile(join(root, 'demo.mmd'), 'utf8'))
      .toBe(await readFile(join(root, 'demo.md'), 'utf8'));
  });
});