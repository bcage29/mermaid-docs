import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { computeCoverage, validateDiagram } from '../../core/validate.js';
import { parseRegions } from '../../core/markers.js';
import { docPathFor, duplicateNames, isDirectory, scanDiagrams } from '../../server/workspace.js';

export interface ValidateOptions {
  root: string;
}

/**
 * Check every diagram in the workspace and report problems.
 *
 * Exits non-zero on errors so this works as a CI gate and as a way for an agent to check
 * its own work after editing the files directly.
 */
export async function runValidate({ root }: ValidateOptions): Promise<void> {
  const single = !(await isDirectory(root));
  const refs = single
    ? [{ absPath: root, relPath: relative(process.cwd(), root) }]
    : await scanDiagrams(root);

  let errors = 0;
  let warnings = 0;
  let total = 0;
  let covered = 0;

  // A diagram is addressed by its bare name, so two files claiming one name means only
  // one of them can ever be opened.
  if (!single) {
    for (const [name, clashing] of duplicateNames(await scanDiagrams(root))) {
      process.stdout.write(
        `error: ${clashing.map((c) => c.relPath).join(' and ')} both claim the name "${name}". Rename one.\n`,
      );
      errors++;
    }
  }

  for (const ref of refs) {
    const mmd = await readFile(ref.absPath, 'utf8');
    let md: string | undefined;
    try {
      md = await readFile(docPathFor(ref.absPath), 'utf8');
    } catch {
      md = undefined;
    }

    const coverage = computeCoverage(mmd, parseRegions(mmd).regions);
    total += coverage.total;
    covered += coverage.covered;

    for (const issue of validateDiagram(mmd, md)) {
      const where = issue.file === 'md' ? docPathFor(ref.relPath) : ref.relPath;
      const at = issue.line !== undefined ? `:${issue.line}` : '';
      process.stdout.write(`${issue.severity === 'error' ? 'error' : 'warning'}: ${where}${at} ${issue.message}\n`);
      if (issue.severity === 'error') errors++;
      else warnings++;
    }
  }

  const summary = `${refs.length} diagram${refs.length === 1 ? '' : 's'} checked, ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}\n`;
  process.stdout.write(summary);
  // Diagram types whose connections cannot be located report nothing rather than 0/0.
  if (total > 0) process.stdout.write(`${covered}/${total} connections documented\n`);
  if (errors > 0) process.exitCode = 1;
}
