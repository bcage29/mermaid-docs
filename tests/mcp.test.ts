import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MMD = `flowchart TD
  A[Start] --> B[Middle]
  B --> C[End]`;

let root: string;
let client: Client;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'mmdocs-mcp-'));
  await mkdir(join(root, 'flow'), { recursive: true });
  await writeFile(join(root, 'flow', 'demo.mmd'), MMD, 'utf8');

  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/cli/index.ts', 'mcp', root],
      cwd: process.cwd(),
      stderr: 'pipe',
    }),
  );
}, 120_000);

afterAll(async () => {
  await client?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

describe('mcp server', () => {
  it('delivers the format instructions to the client', () => {
    // This is the reason mmdocs ships MCP and not only a CLI: the agent learns the
    // format from here without the user explaining it.
    const instructions = client.getInstructions();
    expect(instructions).toBeTruthy();
    expect(instructions).toContain('@step:start');
    expect(instructions).toContain('## user-entry - User arrives');
  });

  it('registers the documented tool surface', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'create_diagram',
      'delete_step',
      'get_diagram',
      'get_viewer_url',
      'list_connections',
      'list_diagrams',
      'reorder_steps',
      'set_step',
      'validate_diagram',
    ]);
  });

  it('lists diagrams found under the root', async () => {
    const res = await client.callTool({ name: 'list_diagrams', arguments: {} });
    expect((res.content as Array<{ text: string }>)[0]!.text).toContain('flow/demo.mmd');
  });

  it('writes a step into both files and keeps them in sync', async () => {
    await client.callTool({
      name: 'set_step',
      arguments: {
        id: 'flow/demo.mmd',
        stepId: 'begin',
        title: 'It begins',
        body: 'The entry point.',
        startLine: 2,
        endLine: 2,
      },
    });

    const mmd = await readFile(join(root, 'flow', 'demo.mmd'), 'utf8');
    const md = await readFile(join(root, 'flow', 'demo.md'), 'utf8');
    expect(mmd).toContain('%% @step:start begin');
    expect(mmd).toContain('%% @step:end begin');
    expect(md).toContain('## begin - It begins');
    expect(md).toContain('The entry point.');

    const validated = await client.callTool({ name: 'validate_diagram', arguments: { id: 'flow/demo.mmd' } });
    const text = (validated.content as Array<{ text: string }>)[0]!.text;
    expect(text).not.toContain('error:');
    // One step so far, so only the first of the two arrows is documented.
    expect(text).toContain('1/2 connections documented.');
    expect(validated.structuredContent).toMatchObject({ coverage: { total: 2, covered: 1, uncoveredLines: [5] } });
  });

  it('lists connections with the step that documents each one', async () => {
    const res = await client.callTool({ name: 'list_connections', arguments: { id: 'flow/demo.mmd' } });
    expect(res.structuredContent).toMatchObject({
      connections: [
        { from: 'A', to: 'B', stepId: 'begin' },
        { from: 'B', to: 'C', stepId: null },
      ],
    });
    expect((res.content as Array<{ text: string }>)[0]!.text).toContain('NO STEP');
  });

  it('reports no connections for a diagram type it cannot read', async () => {
    await writeFile(join(root, 'er.mmd'), 'erDiagram\n  USER ||--o{ SESSION : has\n', 'utf8');
    const res = await client.callTool({ name: 'list_connections', arguments: { id: 'er.mmd' } });
    expect(res.structuredContent).toMatchObject({ connections: [], coverage: { total: 0 } });
  });

  it('reports a bad line range instead of corrupting the file', async () => {
    const res = await client.callTool({
      name: 'set_step',
      arguments: { id: 'flow/demo.mmd', stepId: 'bad', startLine: 900, endLine: 901 },
    });
    expect(res.isError).toBe(true);
    const mmd = await readFile(join(root, 'flow', 'demo.mmd'), 'utf8');
    expect(mmd).not.toContain('bad');
  });

  it('refuses a diagram id that escapes the workspace root', async () => {
    const res = await client.callTool({
      name: 'get_diagram',
      arguments: { id: '../../../etc/passwd.mmd' },
    });
    expect(res.isError).toBe(true);
    expect((res.content as Array<{ text: string }>)[0]!.text).toContain('outside the workspace');
  });

  it('creates a diagram once and refuses to overwrite its files', async () => {
    const created = await client.callTool({
      name: 'create_diagram', arguments: { path: 'created.mmd', mmd: MMD, title: 'Created' },
    });
    expect(created.isError).not.toBe(true);
    const originalDoc = await readFile(join(root, 'created.md'), 'utf8');
    const collision = await client.callTool({
      name: 'create_diagram', arguments: { path: 'created.mmd', mmd: 'Changed', title: 'Changed' },
    });
    expect(collision.isError).toBe(true);
    expect(JSON.stringify(collision)).toContain('already exists');
    expect(await readFile(join(root, 'created.mmd'), 'utf8')).toBe(MMD);
    expect(await readFile(join(root, 'created.md'), 'utf8')).toBe(originalDoc);
  });

  it('rejects linked documentation through HTTP and MCP without changing either file', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'mmdocs-outside-'));
    const diagramPath = join(root, 'linked.mmd');
    const docPath = join(root, 'linked.md');
    const target = join(outside, 'private.txt');
    try {
      await writeFile(target, 'SYNTHETIC_OUTSIDE_CONTENT');
      await writeFile(diagramPath, MMD);
      await symlink(target, docPath);

      const read = await client.callTool({ name: 'get_diagram', arguments: { id: 'linked.mmd' } });
      expect(read.isError).toBe(true);
      expect(JSON.stringify(read)).not.toContain('SYNTHETIC_OUTSIDE_CONTENT');

      const updated = await client.callTool({
        name: 'set_step',
        arguments: { id: 'linked.mmd', stepId: 'begin', body: 'Changed', startLine: 2, endLine: 2 },
      });
      expect(updated.isError).toBe(true);

      const created = await client.callTool({
        name: 'create_diagram', arguments: { path: 'linked.mmd', mmd: 'Changed' },
      });
      expect(created.isError).toBe(true);
      expect(await readFile(target, 'utf8')).toBe('SYNTHETIC_OUTSIDE_CONTENT');
      expect(await readFile(diagramPath, 'utf8')).toBe(MMD);

      const viewer = await client.callTool({ name: 'get_viewer_url', arguments: {} });
      const { url } = viewer.structuredContent as { url: string };
      const response = await fetch(`${url}/api/diagrams/linked`);
      expect(response.ok).toBe(false);
      const body = await response.text();
      expect(body).toMatch(/symbolic link/i);
      expect(body).not.toContain('SYNTHETIC_OUTSIDE_CONTENT');
    } finally {
      await rm(docPath, { force: true });
      await rm(diagramPath, { force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects creation through a linked parent before creating outside directories', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'mmdocs-outside-'));
    const link = join(root, 'linked-directory');
    try {
      await symlink(outside, link, 'dir');
      const created = await client.callTool({
        name: 'create_diagram', arguments: { path: 'linked-directory/new/demo.mmd', mmd: MMD },
      });
      expect(created.isError).toBe(true);
      expect(JSON.stringify(created)).toMatch(/symbolic link/i);
      await expect(readFile(join(outside, 'new'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(link, { force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('deep-links the viewer to a step', async () => {
    const res = await client.callTool({
      name: 'get_viewer_url',
      arguments: { id: 'flow/demo.mmd', stepId: 'begin' },
    });
    // Diagrams are addressed by their bare name, which is unique across the workspace.
    expect((res.content as Array<{ text: string }>)[0]!.text).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/#\/demo\/begin$/,
    );
  });

  it('removes a step from both files', async () => {
    await client.callTool({ name: 'delete_step', arguments: { id: 'flow/demo.mmd', stepId: 'begin' } });
    const mmd = await readFile(join(root, 'flow', 'demo.mmd'), 'utf8');
    expect(mmd).toBe(MMD);
  });
});
