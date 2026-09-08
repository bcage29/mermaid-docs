import { ID_RE } from './markers.js';

export interface Route {
  /** Diagram name: the .mmd basename, unique across the workspace. */
  name?: string;
  stepId?: string;
}

/**
 * The viewer's URL format, shared so the MCP tool links the same way the app does.
 *
 * `#/auth-flow/token-issue`. Diagram names are unique and a workspace is at most one
 * folder deep, so a name never contains a slash - which is what keeps this to two plain
 * segments with nothing to disambiguate.
 */
export function parseHash(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent);

  const [name, stepId] = parts;
  if (!name) return {};
  return { name, ...(stepId && ID_RE.test(stepId) ? { stepId } : {}) };
}

export function buildHash(name: string, stepId?: string): string {
  return `#/${encodeURIComponent(name)}${stepId ? `/${encodeURIComponent(stepId)}` : ''}`;
}

/** The addressable name of a diagram, from its path or file name. */
export function diagramName(relPath: string): string {
  return relPath.replace(/^.*\//, '').replace(/\.mmd$/i, '');
}
