import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { runSetStep } from '../src/cli/commands/setStep.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mermaid-docs-cli-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe('local CLI diagnostics', () => {
  it('prints full paths after writing a step', async () => {
    const mmdPath = join(root, 'demo.mmd');
    await writeFile(mmdPath, 'flowchart TD\nStart --> End');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await runSetStep({ mmdPath, flags: { id: 'begin', title: 'Begin' } });
    expect(stdout).toHaveBeenCalledWith(`step "begin" written to ${mmdPath} and ${join(root, 'demo.md')}\n`);
  });

  it('identifies the invalid input file', async () => {
    const mmdPath = join(root, 'demo.txt');
    await expect(runSetStep({ mmdPath, flags: { id: 'begin' } }))
      .rejects.toThrow(`Expected a .mmd file, got: ${mmdPath}`);
  });

  it('preserves filesystem details on stderr and exits unsuccessfully', async () => {
    const mmdPath = join(root, 'missing.mmd');
    await expect(promisify(execFile)(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', 'init', mmdPath]))
      .rejects.toMatchObject({ code: 1, stdout: '', stderr: expect.stringContaining(mmdPath) });
  }, 120_000);
});