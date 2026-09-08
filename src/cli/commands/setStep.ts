import { basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { setStep } from '../../core/mutate.js';
import { validateDiagram } from '../../core/validate.js';
import { docPathFor } from '../../server/workspace.js';

export interface SetStepOptions {
  mmdPath: string;
  flags: Record<string, string | boolean>;
}

async function readBody(flags: Record<string, string | boolean>): Promise<string | undefined> {
  if (typeof flags.body === 'string') return flags.body;
  if (typeof flags['body-file'] !== 'string') return undefined;
  const path = flags['body-file'];
  if (path === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
  }
  return readFile(path, 'utf8');
}

function readLine(flags: Record<string, string | boolean>, key: string): number | undefined {
  const raw = flags[key];
  if (typeof raw !== 'string') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${key} must be a positive line number.`);
  return value;
}

/**
 * Create or update a step across both files.
 *
 * This is the operation an agent cannot do reliably with plain edits: the marker pair and
 * the documentation section share an id, and inserting markers shifts every line below.
 */
export async function runSetStep({ mmdPath, flags }: SetStepOptions): Promise<void> {
  const stepId = typeof flags.id === 'string' ? flags.id : undefined;
  if (!stepId) throw new Error('--id is required.');
  if (!/\.mmd$/i.test(mmdPath)) throw new Error(`Expected a .mmd file, got: ${mmdPath}`);

  const startLine = readLine(flags, 'start');
  const endLine = readLine(flags, 'end');
  if ((startLine === undefined) !== (endLine === undefined)) {
    throw new Error('--start and --end must be given together.');
  }

  const mmd = await readFile(mmdPath, 'utf8');
  const docPath = docPathFor(mmdPath);
  let md: string | undefined;
  try {
    md = await readFile(docPath, 'utf8');
  } catch {
    md = undefined;
  }

  // Read once: --body-file - consumes stdin, which cannot be read twice.
  const body = await readBody(flags);

  const out = setStep(
    { mmd, ...(md !== undefined ? { md } : {}) },
    {
      stepId,
      ...(typeof flags.title === 'string' ? { title: flags.title } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(startLine !== undefined && endLine !== undefined ? { startLine, endLine } : {}),
      ...(typeof flags.after === 'string' ? { after: flags.after } : {}),
    },
    basename(mmdPath, '.mmd'),
  );

  await writeFile(mmdPath, out.mmd, 'utf8');
  if (out.md !== undefined) await writeFile(docPath, out.md, 'utf8');

  const issues = validateDiagram(out.mmd, out.md);
  for (const issue of issues) {
    if (issue.severity === 'error') process.stderr.write(`error: ${issue.message}\n`);
  }
  process.stdout.write(`step "${stepId}" written to ${mmdPath} and ${docPath}\n`);
}
