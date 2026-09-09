import { captureStdout } from './stdio-guard.js';

// Claim stdout before importing anything that might log to it.
const transportStream = captureStdout();

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { basename } from 'node:path';
import { INSTRUCTIONS } from './instructions.js';
import { UserInputError } from '../core/errors.js';
import { mcpErrorMessage } from './errors.js';
import { deleteStep, reorderSteps, scaffoldDoc, setStep } from '../core/mutate.js';
import { computeCoverage, validateDiagram } from '../core/validate.js';
import { listConnections } from '../core/connections.js';
import { parseRegions } from '../core/markers.js';
import { buildHash, diagramName } from '../core/route.js';
import { startServer } from '../server/http.js';
import { watchWorkspace } from '../server/watch.js';
import {
  createDiagram,
  loadDiagram,
  readDiagramFiles,
  scanDiagrams,
  writeDiagram,
} from '../server/workspace.js';

export interface McpOptions {
  root: string;
}

/** Tools return human-readable text plus the structured payload. */
function result(text: string, structured?: unknown) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(structured !== undefined ? { structuredContent: structured as Record<string, unknown> } : {}),
  };
}

function fail(error: unknown) {
  return { content: [{ type: 'text' as const, text: mcpErrorMessage(error) }], isError: true };
}

export async function runMcp({ root }: McpOptions): Promise<void> {
  // The viewer shares this process so the agent and the browser watch one workspace.
  const http = await startServer(root, 0);
  const watcher = watchWorkspace(root, (ids) => {
    for (const id of ids) http.broadcast('changed', { name: diagramName(id) });
  });
  process.stderr.write(`mermaid-docs viewer: ${http.url}\n`);

  const server = new McpServer(
    { name: 'mermaid-docs', version: '0.1.0' },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    'list_diagrams',
    {
      title: 'List diagrams',
      description: 'List every Mermaid diagram in the workspace, with its step count.',
      inputSchema: {},
    },
    async () => {
      try {
        const refs = await scanDiagrams(root);
        const diagrams = await Promise.all(
          refs.map(async (ref) => {
            const diagram = await loadDiagram(root, ref.id);
            return {
              id: ref.id,
              title: diagram.title,
              group: ref.group,
              stepCount: diagram.steps.length,
              hasDocumentation: ref.hasDocumentation,
            };
          }),
        );
        const listing = diagrams.map((d) => `${d.id} - ${d.title} (${d.stepCount} steps)`).join('\n');
        return result(diagrams.length ? listing : 'No .mmd files found in the workspace.', { diagrams });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_diagram',
    {
      title: 'Get diagram',
      description: 'Read a diagram, its documentation, and its steps with their line ranges.',
      inputSchema: { id: z.string().describe('Diagram id: the .mmd path relative to the workspace root') },
    },
    async ({ id }) => {
      try {
        const diagram = await loadDiagram(root, id);
        const steps = diagram.steps.map((s) => ({
          id: s.id,
          title: s.title,
          body: s.body,
          regions: s.regions.map((r) => ({ startLine: r.startLine, endLine: r.endLine })),
        }));
        const numbered = diagram.mmd
          .split('\n')
          .map((line, i) => `${String(i + 1).padStart(3)} | ${line}`)
          .join('\n');
        return result(
          `# ${diagram.title}\n\n${diagram.overview}\n\nDiagram (${diagram.relPath}), with line numbers:\n${numbered}\n\nSteps:\n${
            steps
              .map((s) => {
                const at = s.regions.map((r) => `${r.startLine}-${r.endLine}`).join(', ') || '-';
                return `- ${s.id} (lines ${at}): ${s.title}`;
              })
              .join('\n') ||
            '(none yet)'
          }`,
          { ...diagram, steps },
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'list_connections',
    {
      title: 'List connections',
      description:
        'List every arrow the diagram draws, with the line it is on and the step that documents it. Use this to find what a walkthrough has not explained yet.',
      inputSchema: { id: z.string().describe('Diagram id: the .mmd path relative to the workspace root') },
    },
    async ({ id }) => {
      try {
        const files = await readDiagramFiles(root, id);
        const { regions } = parseRegions(files.mmd);
        const connections = listConnections(files.mmd).map((c) => ({
          line: c.line,
          from: c.from,
          to: c.to,
          label: c.label ?? null,
          invisible: c.invisible,
          stepId: regions.find((r) => c.line >= r.startLine && c.line <= r.endLine)?.id ?? null,
        }));

        if (connections.length === 0) {
          return result('No connections found. This diagram type is not one whose arrows can be located.', {
            connections,
            coverage: computeCoverage(files.mmd, regions),
          });
        }

        const listing = connections
          .map((c) => `line ${c.line}: ${c.from} -> ${c.to}${c.label ? ` (${c.label})` : ''} - ${c.stepId ?? 'NO STEP'}`)
          .join('\n');
        const coverage = computeCoverage(files.mmd, regions);
        return result(`${listing}\n\n${coverage.covered}/${coverage.total} documented.`, { connections, coverage });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'create_diagram',
    {
      title: 'Create diagram',
      description: 'Create a new .mmd diagram and its documentation file. Refuses to overwrite either existing file.',
      inputSchema: {
        path: z.string().describe('Path for the new .mmd, relative to the workspace root'),
        mmd: z.string().describe('Mermaid diagram source'),
        title: z.string().optional().describe('Title for the documentation frontmatter'),
      },
    },
    async ({ path, mmd, title }) => {
      try {
        await createDiagram(root, path, {
          mmd,
          md: scaffoldDoc(title ?? basename(path, '.mmd')),
        });
        return result(`Created ${path} and its documentation file.`, { id: path });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'set_step',
    {
      title: 'Create or update a step',
      description:
        'Create or update a walkthrough step. Writes the %% @step marker pair into the .mmd and the matching "## id - Title" section into the .md, keeping the two in sync and handling line-number shifts. Prefer this over editing the files directly.',
      inputSchema: {
        id: z.string().describe('Diagram id: the .mmd path relative to the workspace root'),
        stepId: z.string().describe('Step id, used in both the marker and the h2 heading'),
        title: z.string().optional().describe('Step title'),
        body: z.string().optional().describe('Step documentation, as markdown'),
        phase: z.string().optional().describe('Grouping label, shown as a tag on the step and used to group the walkthrough'),
        startLine: z.number().int().positive().optional().describe('First diagram line to highlight (1-based)'),
        endLine: z.number().int().positive().optional().describe('Last diagram line to highlight (1-based)'),
        after: z.string().optional().describe('Insert after this step id; empty string means first'),
      },
    },
    async ({ id, stepId, title, body, phase, startLine, endLine, after }) => {
      try {
        if ((startLine === undefined) !== (endLine === undefined)) {
          return fail(new UserInputError('startLine and endLine must be provided together.'));
        }
        const files = await readDiagramFiles(root, id);
        const out = setStep(
          { mmd: files.mmd, ...(files.md !== undefined ? { md: files.md } : {}) },
          {
            stepId,
            ...(title !== undefined ? { title } : {}),
            ...(body !== undefined ? { body } : {}),
            ...(phase !== undefined ? { phase } : {}),
            ...(startLine !== undefined && endLine !== undefined ? { startLine, endLine } : {}),
            ...(after !== undefined ? { after } : {}),
          },
          basename(files.absPath, '.mmd'),
        );
        await writeDiagram(root, id, { mmd: out.mmd, ...(out.md !== undefined ? { md: out.md } : {}) });
        const issues = validateDiagram(out.mmd, out.md);
        return result(
          `Step "${stepId}" written.${issues.length ? `\n\nIssues:\n${issues.map((i) => `- ${i.severity}: ${i.message}`).join('\n')}` : ''}`,
          { stepId, issues },
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'delete_step',
    {
      title: 'Delete a step',
      description: 'Remove a step: its marker pair from the .mmd and its section from the .md.',
      inputSchema: { id: z.string(), stepId: z.string() },
    },
    async ({ id, stepId }) => {
      try {
        const files = await readDiagramFiles(root, id);
        const out = deleteStep(
          { mmd: files.mmd, ...(files.md !== undefined ? { md: files.md } : {}) },
          stepId,
          basename(files.absPath, '.mmd'),
        );
        await writeDiagram(root, id, { mmd: out.mmd, ...(out.md !== undefined ? { md: out.md } : {}) });
        return result(`Step "${stepId}" removed.`, { stepId });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'reorder_steps',
    {
      title: 'Reorder steps',
      description: 'Set the walkthrough order by listing step ids. Unlisted steps keep their relative order at the end.',
      inputSchema: { id: z.string(), stepIds: z.array(z.string()) },
    },
    async ({ id, stepIds }) => {
      try {
        const files = await readDiagramFiles(root, id);
        const out = reorderSteps(
          { mmd: files.mmd, ...(files.md !== undefined ? { md: files.md } : {}) },
          stepIds,
          basename(files.absPath, '.mmd'),
        );
        await writeDiagram(root, id, out.md !== undefined ? { md: out.md } : {});
        return result(`Reordered ${stepIds.length} steps.`, { stepIds });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'validate_diagram',
    {
      title: 'Validate a diagram',
      description:
        'Check that step markers are balanced, that ids match between the .mmd and the .md, and how many of the connections the diagram draws are documented.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      try {
        const files = await readDiagramFiles(root, id);
        const issues = validateDiagram(files.mmd, files.md);
        const coverage = computeCoverage(files.mmd, parseRegions(files.mmd).regions);
        const lines = issues.map((i) => `${i.severity}: ${i.file}${i.line ? `:${i.line}` : ''} ${i.message}`);
        if (coverage.total > 0) lines.push(`${coverage.covered}/${coverage.total} connections documented.`);
        return result(lines.length === 0 ? 'No problems found.' : lines.join('\n'), { issues, coverage });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'get_viewer_url',
    {
      title: 'Get viewer URL',
      description: 'URL of the running viewer, optionally deep-linked to a diagram and step.',
      inputSchema: { id: z.string().optional(), stepId: z.string().optional() },
    },
    async ({ id, stepId }) => {
      const url = id ? `${http.url}/${buildHash(diagramName(id), stepId)}` : http.url;
      return result(url, { url });
    },
  );

  server.registerPrompt(
    'document-diagram',
    {
      title: 'Document a diagram',
      description: 'Walk a diagram and propose a step-by-step walkthrough.',
      argsSchema: { id: z.string().describe('Diagram id to document') },
    },
    ({ id }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Read the diagram "${id}" with get_diagram, then break it into a walkthrough a newcomer could follow. Create each step with set_step, choosing line ranges that match what the step explains. Finish by calling validate_diagram and sharing the viewer URL.`,
          },
        },
      ],
    }),
  );

  const transport = new StdioServerTransport(process.stdin, transportStream);
  await server.connect(transport);

  const shutdown = async () => {
    await watcher.close();
    await http.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
