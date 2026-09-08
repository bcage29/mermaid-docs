import { basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { deleteStep } from '../../core/mutate.js';
import { docPathFor } from '../../server/workspace.js';

export interface DeleteStepOptions {
  mmdPath: string;
  flags: Record<string, string | boolean>;
}

/** Remove a step's marker pair and its documentation section. */
export async function runDeleteStep({ mmdPath, flags }: DeleteStepOptions): Promise<void> {
  const stepId = typeof flags.id === 'string' ? flags.id : undefined;
  if (!stepId) throw new Error('--id is required.');

  const mmd = await readFile(mmdPath, 'utf8');
  const docPath = docPathFor(mmdPath);
  let md: string | undefined;
  try {
    md = await readFile(docPath, 'utf8');
  } catch {
    md = undefined;
  }

  const out = deleteStep({ mmd, ...(md !== undefined ? { md } : {}) }, stepId, basename(mmdPath, '.mmd'));
  await writeFile(mmdPath, out.mmd, 'utf8');
  if (md !== undefined && out.md !== undefined) await writeFile(docPath, out.md, 'utf8');
  process.stdout.write(`step "${stepId}" removed from ${mmdPath}\n`);
}
