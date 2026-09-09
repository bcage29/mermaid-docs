import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer, type ServerHandle } from '../src/server/http.js';

let root: string;
let viewer: ServerHandle;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mmdocs-privacy-'));
  await writeFile(join(root, 'demo.mmd'), 'flowchart TD\nStart --> End');
  viewer = await startServer(root);
});

afterEach(async () => {
  await viewer.close();
  await rm(root, { recursive: true, force: true });
});

describe('HTTP path privacy', () => {
  it('returns only the workspace display name', async () => {
    const response = await fetch(`${viewer.url}/api/workspace`);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ root: basename(root), stale: false });
    expect(body).not.toContain(root);
  });

  it('preserves useful local diagnostics for missing diagrams', async () => {
    const response = await fetch(`${viewer.url}/api/diagrams/missing`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'No diagram named "missing".' });
  });
});