/**
 * The contract between `mermaid-docs build` and the viewer it ships.
 *
 * A built site has no server, so every API response is written out as a file beside the
 * viewer, and the page is told to read those files instead. It is told at load time, by a
 * meta tag, because the viewer is the same prebuilt bundle the live server serves - a
 * build-time switch would mean shipping two.
 */

/** `<meta name=... content="static">` in index.html switches the viewer to static mode. */
export const STATIC_MODE_META = 'mermaid-docs-mode';

/**
 * Where each response lives, relative to index.html.
 *
 * Relative rather than rooted: a project's GitHub Pages site is served from `/<repo>/`,
 * and the same output has to work there, at a domain root, and from any other subpath.
 */
export const staticPaths = {
  workspace: 'api/workspace.json',
  diagrams: 'api/diagrams.json',
  /** The file as written to disk. Names are unique and never contain a slash. */
  diagramFile: (name: string) => `api/diagrams/${name}.json`,
  /** The same file as a URL, escaped. */
  diagramUrl: (name: string) => `api/diagrams/${encodeURIComponent(name)}.json`,
} as const;
