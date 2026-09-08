import { ID_RE } from './markers.js';
import type { DocSection, ParsedDoc, ValidationIssue } from './types.js';

/**
 * A step heading: `## <id>` optionally followed by ` - <title>`.
 *
 * The id is the first whitespace-delimited token, so ids may themselves contain hyphens
 * (`## auth-one-test - Authentication` -> id `auth-one-test`, title `Authentication`).
 * Only `##` declares a step; `###` and deeper are ordinary content inside a step body.
 */
const HEADING_RE = /^##[ \t]+(\S+)[ \t]*(?:-[ \t]+(.*))?$/;

/** Fenced code blocks may contain `## ...` lines that must not be read as headings. */
const FENCE_RE = /^\s*(```+|~~~+)/;

/**
 * A step's phase: `<!-- @phase Authentication -->` on a line of its own.
 *
 * A comment rather than a heading, so tagging a step never means moving it. Phases are
 * labels, not structure - the same one may appear on any steps, in any order, with others
 * in between. Markdown renders it as nothing, the way the .mmd markers are inert to
 * Mermaid.
 */
const PHASE_RE = /^\s*<!--\s*@phase\s+(.+?)\s*-->\s*$/;

export function parsePhase(line: string): string | undefined {
  return PHASE_RE.exec(line)?.[1]?.trim() || undefined;
}

export function formatPhase(phase: string): string {
  return `<!-- @phase ${phase} -->`;
}

export interface ParsedHeading {
  id: string;
  title: string;
}

/** Parse a `## id - Title` heading line. Returns undefined for non-step headings. */
export function parseHeading(line: string): ParsedHeading | undefined {
  const m = HEADING_RE.exec(line);
  if (!m) return undefined;
  const id = m[1]!;
  const title = m[2]?.trim();
  return { id, title: title && title.length > 0 ? title : id };
}

export function formatHeading(id: string, title?: string): string {
  return title && title !== id ? `## ${id} - ${title}` : `## ${id}`;
}

/**
 * Split a .md file into frontmatter, overview prose and step sections.
 *
 * Bodies are kept as verbatim slices of the input; nothing is round-tripped through a
 * markdown AST, so untouched prose is preserved byte-for-byte on re-serialisation.
 */
export function parseDoc(md: string): ParsedDoc {
  const lines = md.split('\n');
  let cursor = 0;
  let frontmatter: string | undefined;

  // YAML frontmatter, only when the very first line opens it.
  if (lines[0]?.trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]!.trim() === '---') {
        frontmatter = lines.slice(1, i).join('\n');
        cursor = i + 1;
        break;
      }
    }
  }

  const sections: DocSection[] = [];
  const overviewLines: string[] = [];
  let current: { id: string; title: string; headingLine: number; body: string[]; phase?: string } | undefined;
  let fence: string | undefined;

  for (let i = cursor; i < lines.length; i++) {
    const line = lines[i]!;

    // Track fenced blocks so `## ` inside a code sample is not mistaken for a heading.
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === undefined) fence = marker[0];
      else if (marker[0] === fence) fence = undefined;
    }

    const heading = fence === undefined ? parseHeading(line) : undefined;
    if (heading) {
      if (current) sections.push(toSection(current));
      current = { ...heading, headingLine: i + 1, body: [] };
      continue;
    }

    // Belongs to the step it sits in, and is lifted out rather than left in the prose.
    if (current && fence === undefined) {
      const phase = parsePhase(line);
      if (phase) {
        if (current.phase === undefined) current.phase = phase;
        continue;
      }
    }

    if (current) current.body.push(line);
    else overviewLines.push(line);
  }
  if (current) sections.push(toSection(current));

  return {
    ...(frontmatter !== undefined ? { frontmatter } : {}),
    overview: overviewLines.join('\n').trim(),
    sections,
  };
}

function toSection(s: { id: string; title: string; headingLine: number; body: string[]; phase?: string }): DocSection {
  return {
    id: s.id,
    title: s.title,
    headingLine: s.headingLine,
    body: s.body.join('\n').trim(),
    ...(s.phase ? { phase: s.phase } : {}),
  };
}

/** Render a parsed doc back to markdown. */
export function serializeDoc(doc: ParsedDoc): string {
  const parts: string[] = [];
  if (doc.frontmatter !== undefined) parts.push(`---\n${doc.frontmatter}\n---\n`);
  if (doc.overview.trim()) parts.push(`${doc.overview.trim()}\n`);

  for (const section of doc.sections) {
    const head = section.phase
      ? `${formatHeading(section.id, section.title)}\n${formatPhase(section.phase)}`
      : formatHeading(section.id, section.title);
    const body = section.body.trim();
    parts.push(body ? `${head}\n\n${body}\n` : `${head}\n`);
  }
  return parts.join('\n');
}

/** Insert or replace a section, preserving the order of everything else. */
export function setSection(
  doc: ParsedDoc,
  id: string,
  patch: { title?: string; body?: string; phase?: string; after?: string },
): ParsedDoc {
  if (!ID_RE.test(id)) {
    throw new Error(`Invalid step id "${id}". Use letters, digits, "-" and "_", starting alphanumeric.`);
  }
  const sections = [...doc.sections];
  const index = sections.findIndex((s) => s.id === id);

  if (index >= 0) {
    const existing = sections[index]!;
    sections[index] = {
      ...existing,
      title: patch.title ?? existing.title,
      body: patch.body ?? existing.body,
      ...(patch.phase !== undefined ? { phase: patch.phase } : {}),
    };
  } else {
    const section: DocSection = {
      id,
      title: patch.title ?? id,
      body: patch.body ?? '',
      headingLine: -1,
      ...(patch.phase !== undefined ? { phase: patch.phase } : {}),
    };
    // `after: ""` means "put it first"; an unknown id falls through to the end.
    if (patch.after === '') sections.unshift(section);
    else {
      const at = patch.after ? sections.findIndex((s) => s.id === patch.after) : -1;
      if (at >= 0) sections.splice(at + 1, 0, section);
      else sections.push(section);
    }
  }
  return { ...doc, sections };
}

export function removeSection(doc: ParsedDoc, id: string): ParsedDoc {
  return { ...doc, sections: doc.sections.filter((s) => s.id !== id) };
}

/** Reorder sections to match `ids`; any section not named keeps its relative order at the end. */
export function reorderSections(doc: ParsedDoc, ids: string[]): ParsedDoc {
  const byId = new Map(doc.sections.map((s) => [s.id, s]));
  const ordered: DocSection[] = [];
  for (const id of ids) {
    const section = byId.get(id);
    if (section) {
      ordered.push(section);
      byId.delete(id);
    }
  }
  return { ...doc, sections: [...ordered, ...byId.values()] };
}

/** Structural problems within the .md alone. Cross-file checks live in validate.ts. */
export function validateDoc(doc: ParsedDoc): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>();
  for (const section of doc.sections) {
    if (!ID_RE.test(section.id)) {
      issues.push({
        severity: 'error',
        code: 'invalid-id',
        message: `"${section.id}" is not a valid step id. Use letters, digits, "-" and "_".`,
        line: section.headingLine,
        file: 'md',
      });
    }
    const previous = seen.get(section.id);
    if (previous !== undefined) {
      issues.push({
        severity: 'error',
        code: 'duplicate-section',
        message: `Step "${section.id}" is documented twice (first at line ${previous}).`,
        line: section.headingLine,
        file: 'md',
      });
    } else {
      seen.set(section.id, section.headingLine);
    }
  }
  return issues;
}
