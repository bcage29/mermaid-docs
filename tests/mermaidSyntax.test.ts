import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdir, readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkMermaidSyntax, validateDiagramSource } from '../src/server/mermaidSyntax.js';
import { runValidate } from '../src/cli/commands/validate.js';

describe('checkMermaidSyntax', () => {
  it('passes a diagram Mermaid can parse', async () => {
    expect(await checkMermaidSyntax('flowchart TD\nA --> B')).toEqual([]);
  });

  it('reports a style value with parentheses as an error on its line', async () => {
    const mmd = 'flowchart TD\nA --> B\nclassDef passive filter:grayscale(1),opacity:0.65\nclass A passive';
    expect(await checkMermaidSyntax(mmd)).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'mermaid-syntax',
        line: 3,
        file: 'mmd',
        message: expect.stringContaining('unexpected "("'),
      }),
    ]);
  });

  it('numbers lines in the file, not in what Mermaid parses after stripping', async () => {
    // Front matter, a directive, step markers and comments all vanish before Mermaid parses.
    const mmd = [
      '---',
      'title: Demo',
      '---',
      '%%{init: {"theme": "dark"}}%%',
      'flowchart TD',
      '%% @step:start a',
      'A --> B',
      '%% @step:end a',
      '',
      '%% styling',
      'classDef passive filter:grayscale(1)',
    ].join('\n');
    expect(await checkMermaidSyntax(mmd)).toMatchObject([{ code: 'mermaid-syntax', line: 11 }]);
  });

  it('places errors from the Langium-based parsers too', async () => {
    const mmd = 'architecture-beta\n%% a comment\nservice db(database)[Database]\nservice x(foo\n';
    expect(await checkMermaidSyntax(mmd)).toMatchObject([{ severity: 'error', code: 'mermaid-syntax', line: 4 }]);
  });

  it('reports an unknown diagram type', async () => {
    expect(await checkMermaidSyntax('%% note\nnotADiagram\nA --> B')).toMatchObject([
      { severity: 'error', code: 'mermaid-syntax', line: 2 },
    ]);
  });

  it('warns when an edge label swallowed the lines after it', async () => {
    // `<--|label|` is not edge syntax, but Mermaid accepts it and reads the next lines as
    // the label, dropping the `tm -.-> pip2` edge without a word.
    const mmd = 'flowchart LR\npip1 <--|priority| tm\ntm -.->|Failover| pip2\npip2 --> web';
    expect(await checkMermaidSyntax(mmd)).toEqual([
      expect.objectContaining({ severity: 'warning', code: 'suspicious-edge-label', line: 2, file: 'mmd' }),
    ]);
  });

  it('leaves ordinary edge labels alone', async () => {
    const mmd = 'flowchart LR\nA -->|uses --force| B\nB -- "one-way" --> C\nC -.->|retry| A';
    expect(await checkMermaidSyntax(mmd)).toEqual([]);
  });

  it('passes every bundled example', async () => {
    for (const group of await readdir('examples')) {
      for (const file of (await readdir(join('examples', group))).filter((f) => f.endsWith('.mmd'))) {
        const path = join('examples', group, file);
        const md = await readFile(path.replace(/\.mmd$/, '.md'), 'utf8').catch(() => undefined);
        expect(await validateDiagramSource(await readFile(path, 'utf8'), md), path).toEqual([]);
      }
    }
  });
});

describe('validate command', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mermaid-docs-syntax-'));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await rm(root, { recursive: true, force: true });
  });

  it('fails on a parse error and names the line', async () => {
    await writeFile(join(root, 'broken.mmd'), 'flowchart TD\nA --> B\nclassDef passive filter:grayscale(1)');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const counts = await runValidate({ root });
    expect(counts).toEqual({ errors: 1, warnings: 0 });
    expect(process.exitCode).toBe(1);
    expect(stdout.mock.calls.map(([chunk]) => String(chunk)).join('')).toMatch(/^error: .*broken\.mmd:3 Mermaid cannot parse/m);
  });
});
