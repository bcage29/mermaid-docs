import { isMarkerLine, parseRegions } from './markers.js';
import { parseDoc, validateDoc } from './docFormat.js';
import { listConnections } from './connections.js';
import type { Region, ValidationIssue } from './types.js';

export interface Coverage {
  /** Connections the diagram draws. Zero for diagram types that cannot be parsed. */
  total: number;
  /** Of those, how many fall inside some step's region. */
  covered: number;
  /** Lines holding connections no step documents, ascending and deduplicated. */
  uncoveredLines: number[];
}

/**
 * How much of what the diagram draws the walkthrough explains.
 *
 * Reported as a number, never as a validation warning: plenty of connections - a return
 * arrow, an aside - need no narration, so "uncovered" is information rather than a defect.
 */
export function computeCoverage(mmd: string, regions: Region[]): Coverage {
  const connections = listConnections(mmd);
  const covers = (line: number) => regions.some((r) => line >= r.startLine && line <= r.endLine);

  let covered = 0;
  const uncoveredLines = new Set<number>();
  for (const connection of connections) {
    if (covers(connection.line)) covered++;
    else uncoveredLines.add(connection.line);
  }

  return { total: connections.length, covered, uncoveredLines: [...uncoveredLines].sort((a, b) => a - b) };
}

/**
 * Cross-check a diagram against its documentation.
 *
 * The two files are keyed by the same ids — `%% @step:start auth` in the .mmd and
 * `## auth - ...` in the .md — so drift between them is the failure mode worth catching.
 */
export function validateDiagram(mmd: string, md: string | undefined): ValidationIssue[] {
  const { regions, issues: mmdIssues } = parseRegions(mmd);
  const issues: ValidationIssue[] = [...mmdIssues];

  // A region that wraps only blank lines or comments renders no highlight at all. This is
  // the usual outcome of an off-by-one line number, and is otherwise completely silent.
  const lines = mmd.split('\n');
  for (const region of regions) {
    const hasContent = lines
      .slice(region.startLine - 1, region.endLine)
      .some((line) => line.trim() !== '' && !isMarkerLine(line) && !line.trim().startsWith('%%'));
    if (!hasContent) {
      issues.push({
        severity: 'warning',
        code: 'empty-region',
        message: `Region "${region.id}" covers lines ${region.startLine}-${region.endLine}, which contain no diagram content, so it will highlight nothing. Check the line numbers.`,
        line: region.startMarkerLine,
        file: 'mmd',
      });
    }
  }

  if (md === undefined) return issues;

  const doc = parseDoc(md);
  issues.push(...validateDoc(doc));

  const regionIds = new Set(regions.map((r) => r.id));
  const sectionIds = new Set(doc.sections.map((s) => s.id));

  for (const section of doc.sections) {
    if (!regionIds.has(section.id)) {
      issues.push({
        severity: 'warning',
        code: 'orphan-section',
        message: `Step "${section.id}" is documented but has no region in the diagram, so it highlights nothing. Add "%% @step:start ${section.id}" / "%% @step:end ${section.id}".`,
        line: section.headingLine,
        file: 'md',
      });
    }
  }

  for (const region of regions) {
    if (!sectionIds.has(region.id)) {
      issues.push({
        severity: 'warning',
        code: 'orphan-region',
        message: `Region "${region.id}" is marked in the diagram but has no "## ${region.id} - ..." section in the documentation.`,
        line: region.startMarkerLine,
        file: 'mmd',
      });
    }
  }

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
