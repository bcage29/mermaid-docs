import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { STATIC_MODE_META, staticPaths } from '../../core/staticSite.js';
import { WEB_ROOT } from '../../server/http.js';
import { isDirectory, listDiagrams, loadDiagram } from '../../server/workspace.js';
import { runValidate } from './validate.js';

export interface BuildOptions {
  root: string;
  flags: Record<string, string | boolean>;
  /** The built viewer to copy. Defaults to the one this package ships. */
  webRoot?: string;
}

/**
 * Pages has no response headers to set, so the policy the live server sends as a header
 * goes in the page instead. `frame-ancestors` is ignored in a meta tag and left out.
 */
const STATIC_HEAD = [
  `<meta name="${STATIC_MODE_META}" content="static" />`,
  `<meta http-equiv="Content-Security-Policy" content="script-src 'self'; object-src 'none'; base-uri 'none'" />`,
  '<meta name="referrer" content="no-referrer" />',
];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Make `out` ready to write into, without ever deleting something we did not write.
 *
 * A previous build is recognised by the meta tag in its index.html and replaced whole, so
 * a deleted diagram does not linger. Any other non-empty folder is refused: `--out` is
 * easy to get wrong, and wiping it would be unrecoverable.
 */
async function prepareOut(out: string): Promise<void> {
  if (!existsSync(out)) return void (await mkdir(out, { recursive: true }));
  if ((await readdir(out)).length === 0) return;
  const index = join(out, 'index.html');
  const previous = existsSync(index) && (await readFile(index, 'utf8')).includes(`name="${STATIC_MODE_META}"`);
  if (!previous) {
    throw new Error(`${out} is not empty and was not written by mermaid-docs build. Choose an empty or new folder.`);
  }
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
}

async function writeJson(out: string, path: string, body: unknown): Promise<void> {
  const file = join(out, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(body), 'utf8');
}

/**
 * Write the viewer and every diagram out as a static site.
 *
 * The output needs no server, so it can be published anywhere that serves files - GitHub
 * Pages in particular. Diagrams are validated first and errors stop the build, because a
 * published site is read by people who cannot see the issue banner's cause.
 */
export async function runBuild({ root, flags, webRoot = WEB_ROOT }: BuildOptions): Promise<void> {
  if (!(await isDirectory(root))) throw new Error(`Expected a folder of diagrams, got: ${root}`);
  const out = resolve(typeof flags.out === 'string' ? flags.out : '_site');
  const title = (typeof flags.title === 'string' && flags.title.trim()) || basename(resolve(root)) || 'Workspace';

  const fromOut = relative(out, resolve(root));
  if (fromOut === '' || (!fromOut.startsWith('..') && !isAbsolute(fromOut))) {
    throw new Error(`--out must not contain the diagram folder: ${out}`);
  }
  if (!existsSync(join(webRoot, 'index.html'))) {
    throw new Error('Viewer assets are missing. Run "npm run build" before building a site.');
  }

  const { errors } = await runValidate({ root });
  if (errors > 0) throw new Error(`Not building: fix the ${errors === 1 ? 'error' : `${errors} errors`} above first.`);

  await prepareOut(out);
  await cp(webRoot, out, { recursive: true });

  const index = join(out, 'index.html');
  const html = await readFile(index, 'utf8');
  if (!html.includes('<head>')) throw new Error(`Unexpected viewer index.html: no <head> in ${index}`);
  await writeFile(
    index,
    html
      .replace('<head>', `<head>\n    ${STATIC_HEAD.join('\n    ')}`)
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)} · Mermaid Docs</title>`),
    'utf8',
  );

  const diagrams = await listDiagrams(root);
  await writeJson(out, staticPaths.workspace, { root: title, stale: false });
  await writeJson(out, staticPaths.diagrams, diagrams);
  for (const { relPath, name } of diagrams) {
    await writeJson(out, staticPaths.diagramFile(name), await loadDiagram(root, relPath));
  }
  // Only a branch-based Pages deploy runs Jekyll, which hides files starting with "_".
  await writeFile(join(out, '.nojekyll'), '', 'utf8');

  process.stdout.write(`wrote ${diagrams.length} diagram${diagrams.length === 1 ? '' : 's'} to ${out}\n`);
}
