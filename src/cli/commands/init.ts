import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { scaffoldDoc } from '../../core/mutate.js';
import { docPathFor } from '../../server/workspace.js';

export interface InitOptions {
  mmdPath: string;
}

/** Create the sibling documentation file for a diagram that has none. */
export async function runInit({ mmdPath }: InitOptions): Promise<void> {
  if (!/\.mmd$/i.test(mmdPath)) throw new Error(`Expected a .mmd file, got: ${mmdPath}`);
  await readFile(mmdPath, 'utf8'); // fail early if the diagram is missing

  const docPath = docPathFor(mmdPath);
  if (existsSync(docPath)) {
    process.stdout.write(`${docPath} already exists\n`);
    return;
  }

  await writeFile(docPath, scaffoldDoc(basename(mmdPath, '.mmd')), 'utf8');
  process.stdout.write(`created ${docPath}\n`);
}
