import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { buildDiagram } from '../core/diagramModel.js';
import { UserInputError } from '../core/errors.js';
import type { Diagram } from '../core/types.js';

/** Directories never worth scanning for diagrams. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.cache']);

export interface DiagramRef {
  /** URI-safe id: the .mmd path relative to the root, always with forward slashes. */
  id: string;
  relPath: string;
  name: string;
  group: string;
  absPath: string;
  docPath: string;
  hasDocumentation: boolean;
}

/** Absolute path of the sibling documentation file: `blah.mmd` -> `blah.md`. */
export function docPathFor(mmdPath: string): string {
  return mmdPath.replace(/\.mmd$/i, '.md');
}

function toId(root: string, absPath: string): string {
  return relative(root, absPath).split(sep).join('/');
}

/**
 * Find every .mmd file in the root and one level below it.
 *
 * The depth limit is what lets a diagram be addressed by its bare name: a workspace is a
 * flat set of diagrams, optionally sorted into one layer of folders, so names are short
 * enough to be worth requiring unique. Nesting deeper would bring back long paths.
 */
export async function scanDiagrams(root: string): Promise<DiagramRef[]> {
  const found: DiagramRef[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory: skip rather than fail the whole scan
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth === 0 && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(abs, depth + 1);
        }
        continue;
      }
      if (!entry.isFile() || !/\.mmd$/i.test(entry.name)) continue;
      const relPath = toId(root, abs);
      const docPath = docPathFor(abs);
      found.push({
        id: relPath,
        relPath,
        name: entry.name.replace(/\.mmd$/i, ''),
        group: relPath.includes('/') ? relPath.replace(/\/[^/]*$/, '') : '',
        absPath: abs,
        docPath,
        hasDocumentation: existsSync(docPath),
      });
    }
  }

  await walk(root, 0);
  found.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return found;
}

/** Names claimed by more than one diagram, which makes them unaddressable. */
export function duplicateNames(refs: DiagramRef[]): Map<string, DiagramRef[]> {
  const byName = new Map<string, DiagramRef[]>();
  for (const ref of refs) {
    const list = byName.get(ref.name) ?? [];
    list.push(ref);
    byName.set(ref.name, list);
  }
  for (const [name, list] of byName) if (list.length < 2) byName.delete(name);
  return byName;
}

/**
 * Resolve a diagram id to an absolute path, refusing anything that escapes the root.
 * The id comes from HTTP and from agent tool calls, so it is untrusted.
 */
export function resolveDiagramPath(root: string, id: string): string {
  const abs = resolve(root, id);
  const rootWithSep = resolve(root) + sep;
  if (abs !== resolve(root) && !abs.startsWith(rootWithSep)) {
    throw new UserInputError('Diagram path resolves outside the workspace root.');
  }
  if (!/\.mmd$/i.test(abs)) throw new UserInputError('Diagram id must name a .mmd file.');
  return abs;
}

/** Read a diagram and its sibling documentation into the viewer model. */
export async function loadDiagram(root: string, id: string): Promise<Diagram> {
  const abs = resolveDiagramPath(root, id);
  const mmd = await readFile(abs, 'utf8');
  const docPath = docPathFor(abs);
  let md: string | undefined;
  try {
    md = await readFile(docPath, 'utf8');
  } catch {
    md = undefined; // no sibling .md yet; the diagram still views
  }
  return buildDiagram({ id: toId(root, abs), relPath: toId(root, abs), mmd, ...(md !== undefined ? { md } : {}) });
}

export interface WriteResult {
  mmdPath: string;
  docPath: string;
}

/** Write both files for a diagram. Only the parts provided are touched. */
export async function writeDiagram(
  root: string,
  id: string,
  files: { mmd?: string; md?: string },
): Promise<WriteResult> {
  const abs = resolveDiagramPath(root, id);
  const docPath = docPathFor(abs);
  if (files.mmd !== undefined) await writeFile(abs, files.mmd, 'utf8');
  if (files.md !== undefined) await writeFile(docPath, files.md, 'utf8');
  return { mmdPath: abs, docPath };
}

/** Read raw file contents for a diagram, for callers that need to edit them. */
export async function readDiagramFiles(
  root: string,
  id: string,
): Promise<{ absPath: string; docPath: string; mmd: string; md?: string }> {
  const absPath = resolveDiagramPath(root, id);
  const docPath = docPathFor(absPath);
  const mmd = await readFile(absPath, 'utf8');
  let md: string | undefined;
  try {
    md = await readFile(docPath, 'utf8');
  } catch {
    md = undefined;
  }
  return { absPath, docPath, mmd, ...(md !== undefined ? { md } : {}) };
}

/** Ensure a directory exists for a new diagram. */
export async function ensureDirFor(filePath: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dirname(filePath), { recursive: true });
}

export async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
