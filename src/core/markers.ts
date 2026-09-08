import type { Region, ValidationIssue } from './types.js';

/**
 * `%% @step:start <id>` / `%% @step:end <id>` on a line of its own.
 *
 * Mermaid treats any own-line `%%` prefix as a comment, so these markers are inert:
 * the .mmd still renders untouched in GitHub, VS Code preview and the live editor.
 */
const MARKER_RE = /^\s*%%\s*@step:(start|end)\s+([A-Za-z0-9][A-Za-z0-9_-]*)\s*$/;

/** Ids allowed in markers and in `## id - Title` headings. */
export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export interface MarkerLine {
  kind: 'start' | 'end';
  id: string;
  /** 1-based. */
  line: number;
}

/** True when the line is a step marker (and so must be skipped by callers walking source). */
export function isMarkerLine(line: string): boolean {
  return MARKER_RE.test(line);
}

/** Find every step marker in the source, in file order. */
export function findMarkers(mmd: string): MarkerLine[] {
  const out: MarkerLine[] = [];
  const lines = mmd.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = MARKER_RE.exec(lines[i]!);
    if (m) out.push({ kind: m[1] as 'start' | 'end', id: m[2]!, line: i + 1 });
  }
  return out;
}

export interface ParsedRegions {
  regions: Region[];
  issues: ValidationIssue[];
}

/**
 * Parse `%% @step:*` regions out of a .mmd file.
 *
 * Regions may nest and overlap freely — each id is an independent range, so we track
 * open starts per id rather than using a single stack.
 *
 * An id may also be marked in several places: one step often describes something the
 * diagram does more than once, such as an authentication block that repeats before every
 * request. Each occurrence becomes its own region under the same id. Reopening an id that
 * is still open is a different thing and remains an error.
 */
export function parseRegions(mmd: string): ParsedRegions {
  const regions: Region[] = [];
  const issues: ValidationIssue[] = [];
  const open = new Map<string, MarkerLine>();
  // Ids whose `start` we rejected. Their matching `end` is swallowed so a single mistake
  // produces a single error rather than a cascade.
  const swallowEnd = new Set<string>();

  for (const marker of findMarkers(mmd)) {
    if (marker.kind === 'start') {
      if (open.has(marker.id)) {
        issues.push({
          severity: 'error',
          code: 'duplicate-region',
          message: `Region "${marker.id}" was opened again before it was closed.`,
          line: marker.line,
          file: 'mmd',
        });
        swallowEnd.add(marker.id);
        continue;
      }
      open.set(marker.id, marker);
      continue;
    }

    const start = open.get(marker.id);
    if (!start) {
      if (swallowEnd.delete(marker.id)) continue;
      issues.push({
        severity: 'error',
        code: 'unopened-region',
        message: `Region "${marker.id}" is closed but was never opened.`,
        line: marker.line,
        file: 'mmd',
      });
      continue;
    }
    open.delete(marker.id);
    regions.push({
      id: marker.id,
      // The marker lines themselves are not part of the highlighted body.
      startLine: start.line + 1,
      endLine: marker.line - 1,
      startMarkerLine: start.line,
      endMarkerLine: marker.line,
    });
  }

  for (const [id, marker] of open) {
    issues.push({
      severity: 'error',
      code: 'unclosed-region',
      message: `Region "${id}" is never closed. Add "%% @step:end ${id}".`,
      line: marker.line,
      file: 'mmd',
    });
  }

  regions.sort((a, b) => a.startMarkerLine - b.startMarkerLine);
  return { regions, issues };
}

/** Every region carrying an id, in source order. */
export function findRegions(mmd: string, id: string): Region[] {
  return parseRegions(mmd).regions.filter((r) => r.id === id);
}

/** The first region carrying an id. */
export function findRegion(mmd: string, id: string): Region | undefined {
  return parseRegions(mmd).regions.find((r) => r.id === id);
}

export function startMarker(id: string, indent = ''): string {
  return `${indent}%% @step:start ${id}`;
}

export function endMarker(id: string, indent = ''): string {
  return `${indent}%% @step:end ${id}`;
}

/**
 * Remove every marker pair for an id, leaving the diagram body untouched.
 * Returns the source unchanged when the id has no region.
 */
export function removeRegion(mmd: string, id: string): string {
  const regions = findRegions(mmd, id);
  if (regions.length === 0) return mmd;
  const lines = mmd.split('\n');
  // Delete from the bottom up so the remaining line numbers stay valid.
  const markerLines = regions
    .flatMap((r) => [r.startMarkerLine, r.endMarkerLine])
    .sort((a, b) => b - a);
  for (const line of markerLines) lines.splice(line - 1, 1);
  return lines.join('\n');
}

export interface RegionSpec {
  id: string;
  /** 1-based inclusive line range in the source as the caller sees it. */
  startLine: number;
  endLine: number;
}

/**
 * Wrap one or more line ranges in `%% @step` marker pairs, in a single pass.
 *
 * Sequential splicing cannot do this correctly. Every inserted marker shifts the lines
 * below it, and nested regions defeat a simple bottom-up order: an outer region starts
 * above an inner region's insertion point but ends below it, so writing the inner one
 * first invalidates the outer one's end line.
 *
 * Instead every range is resolved against the *original* coordinates, then all markers are
 * emitted in one walk. Ties are ordered so regions nest properly: at a shared start line
 * the widest region opens first; at a shared end line the narrowest closes first.
 */
export function setRegions(mmd: string, specs: RegionSpec[]): string {
  for (const spec of specs) {
    if (!ID_RE.test(spec.id)) {
      throw new Error(`Invalid step id "${spec.id}". Use letters, digits, "-" and "_", starting alphanumeric.`);
    }
    if (spec.endLine < spec.startLine) {
      throw new Error(
        `Region "${spec.id}" ends (line ${spec.endLine}) before it starts (line ${spec.startLine}).`,
      );
    }
  }

  // Drop any existing marker pair for the ids being written, and record where every
  // surviving original line ends up so the caller's line numbers can be rebased onto it.
  const replacing = new Set(specs.map((s) => s.id));
  const drop = new Set<number>();
  for (const region of parseRegions(mmd).regions) {
    if (!replacing.has(region.id)) continue;
    drop.add(region.startMarkerLine);
    drop.add(region.endMarkerLine);
  }

  const original = mmd.split('\n');
  const base: string[] = [];
  const rebased = new Array<number>(original.length + 1).fill(0);
  for (let i = 0; i < original.length; i++) {
    if (drop.has(i + 1)) continue;
    base.push(original[i]!);
    rebased[i + 1] = base.length;
  }

  /** A caller line may name a marker we just dropped; slide to the nearest surviving line. */
  const resolve = (line: number, direction: 1 | -1): number => {
    for (let l = line; l >= 1 && l <= original.length; l += direction) {
      if (rebased[l]) return rebased[l]!;
    }
    return direction === 1 ? base.length : 1;
  };

  const opens = new Map<number, Array<{ id: string; span: number; indent: string }>>();
  const closes = new Map<number, Array<{ id: string; span: number; indent: string }>>();

  for (const spec of specs) {
    if (spec.startLine < 1 || spec.endLine > original.length) {
      throw new Error(
        `Region "${spec.id}" spans lines ${spec.startLine}-${spec.endLine}, outside the diagram (1-${original.length}).`,
      );
    }
    const start = resolve(spec.startLine, 1);
    const end = resolve(spec.endLine, -1);
    const indent = /^\s*/.exec(base[start - 1] ?? '')?.[0] ?? '';
    const entry = { id: spec.id, span: end - start, indent };
    if (!opens.has(start)) opens.set(start, []);
    if (!closes.has(end)) closes.set(end, []);
    opens.get(start)!.push(entry);
    closes.get(end)!.push(entry);
  }

  for (const list of opens.values()) list.sort((a, b) => b.span - a.span);
  for (const list of closes.values()) list.sort((a, b) => a.span - b.span);

  const out: string[] = [];
  for (let i = 0; i < base.length; i++) {
    const line = i + 1;
    for (const entry of opens.get(line) ?? []) out.push(startMarker(entry.id, entry.indent));
    out.push(base[i]!);
    for (const entry of closes.get(line) ?? []) out.push(endMarker(entry.id, entry.indent));
  }
  return out.join('\n');
}

/** Wrap a single line range. See {@link setRegions}. */
export function setRegion(mmd: string, id: string, startLine: number, endLine: number): string {
  return setRegions(mmd, [{ id, startLine, endLine }]);
}
