import { parseRegions } from './markers.js';
import { parseDoc } from './docFormat.js';
import { validateDiagram } from './validate.js';
import type { Diagram, Region, Step } from './types.js';

/** Pull `title:` out of YAML frontmatter without taking a YAML dependency. */
export function frontmatterTitle(frontmatter: string | undefined): string | undefined {
  if (!frontmatter) return undefined;
  for (const line of frontmatter.split('\n')) {
    const m = /^title:\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  return undefined;
}

export interface BuildDiagramInput {
  id: string;
  relPath: string;
  mmd: string;
  /** Undefined when the sibling .md does not exist yet. */
  md?: string;
}

/**
 * Join a .mmd and its sibling .md into the model the viewer renders.
 *
 * Step order comes from the .md (document order). A documented step with no matching
 * region still appears — it simply highlights nothing.
 */
export function buildDiagram(input: BuildDiagramInput): Diagram {
  const { regions } = parseRegions(input.mmd);
  const doc = input.md !== undefined ? parseDoc(input.md) : undefined;
  const regionsById = new Map<string, Region[]>();
  for (const region of regions) {
    const list = regionsById.get(region.id) ?? [];
    list.push(region);
    regionsById.set(region.id, list);
  }

  const name = input.relPath.replace(/^.*\//, '').replace(/\.mmd$/, '');
  const group = input.relPath.includes('/') ? input.relPath.replace(/\/[^/]*$/, '') : '';

  const steps: Step[] = (doc?.sections ?? []).map((section) => ({
    id: section.id,
    title: section.title,
    body: section.body,
    ...(section.phase ? { phase: section.phase } : {}),
    regions: regionsById.get(section.id) ?? [],
  }));

  return {
    id: input.id,
    relPath: input.relPath,
    name,
    group,
    hasDocumentation: input.md !== undefined,
    title: frontmatterTitle(doc?.frontmatter) ?? name,
    mmd: input.mmd,
    overview: doc?.overview ?? '',
    steps,
    issues: validateDiagram(input.mmd, input.md),
  };
}
