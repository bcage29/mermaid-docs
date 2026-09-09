import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('package naming', () => {
  it('exposes only the full package command in both manifests', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
    expect(pkg.name).toBe('mermaid-docs');
    expect(pkg.bin).toEqual({ 'mermaid-docs': 'dist/cli/index.js' });
    expect(lock.packages[''].bin).toEqual(pkg.bin);
  });

  it('uses the full environment variable name for the static build', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8'));
    expect(pkg.scripts['build:pages']).toBe('VITE_MERMAID_DOCS_STATIC=true vite build');
  });
});