#!/usr/bin/env node
import { resolve } from 'node:path';
import { runServe } from './commands/serve.js';
import { runValidate } from './commands/validate.js';
import { runSetStep } from './commands/setStep.js';
import { runDeleteStep } from './commands/deleteStep.js';
import { runInit } from './commands/init.js';

const USAGE = `mermaid-docs - view and document Mermaid diagrams

Usage:
  mermaid-docs <folder>                     Serve the viewer on a free port
  mermaid-docs mcp <folder>                 Run the MCP server (stdio) plus the viewer
  mermaid-docs validate <folder>            Check every diagram; exit 1 on errors
  mermaid-docs init <diagram.mmd>           Create the sibling .md documentation file
  mermaid-docs set-step <diagram.mmd>       Create or update a step
  mermaid-docs delete-step <diagram.mmd>    Remove a step

Serve options:
  --port <n>       Port to listen on (default: a free one)
  --no-open        Do not launch a browser
  --lan            Also listen on the local network, so another device can connect
  --host <addr>    Interface to bind (default: 127.0.0.1)

set-step options:
  --id <id>            Step id, matching the %% @step marker (required)
  --title <text>       Step title
  --body <markdown>    Step documentation
  --body-file <path>   Read the documentation from a file ("-" for stdin)
  --start <line>       First diagram line to highlight
  --end <line>         Last diagram line to highlight
  --after <id>         Insert after this step ("" for first)
`;

export interface Args {
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): Args {
  const KNOWN = new Set(['mcp', 'validate', 'set-step', 'delete-step', 'init', 'serve']);
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    const key = name!;
    if (inline !== undefined) {
      flags[key] = inline;
    } else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith('--')) {
      flags[key] = argv[++i]!;
    } else {
      flags[key] = true;
    }
  }

  const command = positionals[0] && KNOWN.has(positionals[0]) ? positionals.shift()! : 'serve';
  return { command, positionals, flags };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return;
  }

  const { command, positionals, flags } = parseArgs(argv);
  const target = resolve(positionals[0] ?? '.');

  switch (command) {
    case 'serve':
      return runServe({ root: target, flags });
    case 'mcp': {
      // Imported lazily so the stdout guard installs before anything else can log.
      const { runMcp } = await import('../mcp/index.js');
      return runMcp({ root: target });
    }
    case 'validate':
      return runValidate({ root: target });
    case 'init':
      return runInit({ mmdPath: target });
    case 'set-step':
      return runSetStep({ mmdPath: target, flags });
    case 'delete-step':
      return runDeleteStep({ mmdPath: target, flags });
    default:
      process.stderr.write(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`mermaid-docs: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
