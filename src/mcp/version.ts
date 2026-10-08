import { readFileSync } from 'node:fs';

/**
 * This package's version, read from its own package.json.
 *
 * Two levels up from both `src/mcp/` and the bundled `dist/mcp/`, so it resolves the same
 * from source and from an install. Read rather than written out, because a copy is never
 * bumped with the release.
 */
export const VERSION: string = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version;
