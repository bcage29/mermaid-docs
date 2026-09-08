import { useMemo } from 'react';
import { extractRegionElements } from '../../core/mermaidIds.js';
import type { Diagram, Step } from '../../core/types.js';

/** 1-based inclusive line range in the .mmd. */
export interface LineRange {
  startLine: number;
  endLine: number;
}

export function rangesOfStep(step: Step | undefined): LineRange[] {
  return (step?.regions ?? []).map((r) => ({ startLine: r.startLine, endLine: r.endLine }));
}

/** Whether any of a step's ranges covers a line. Marker lines sit outside their region. */
export function containsLine(ranges: LineRange[], line: number): boolean {
  return ranges.some((r) => line >= r.startLine && line <= r.endLine);
}

/** The step that draws a line, if any. The first match wins where regions overlap. */
export function stepAtLine(steps: Step[], line: number): Step | undefined {
  return steps.find((s) => containsLine(rangesOfStep(s), line));
}

/**
 * The node ids a step's ranges draw.
 *
 * Used only to frame the diagram when "zoom to step" is on.
 */
export function useRangeNodes(diagram: Diagram | undefined, ranges: LineRange[]): string[] {
  return useMemo(() => {
    if (!diagram || ranges.length === 0) return [];
    const lines = diagram.mmd.split('\n');
    const ids = new Set<string>();
    for (const range of ranges) {
      for (const id of extractRegionElements(lines.slice(range.startLine - 1, range.endLine)).nodeIds) {
        ids.add(id);
      }
    }
    return [...ids];
  }, [diagram, ranges]);
}
