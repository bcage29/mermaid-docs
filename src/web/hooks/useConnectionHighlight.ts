import { useMemo } from 'react';
import { detectDiagramKind, listConnections } from '../../core/connections.js';
import type { Connection, DiagramKind } from '../../core/connections.js';
import type { Diagram } from '../../core/types.js';
import type { LineRange } from './useRangeNodes.js';

export interface DiagramConnections {
  connections: Connection[];
  kind: DiagramKind;
}

/** What the diagram draws. Shared by the highlight and by click-to-jump. */
export function useConnections(diagram: Diagram | undefined): DiagramConnections {
  return useMemo(
    () =>
      diagram
        ? { connections: listConnections(diagram.mmd), kind: detectDiagramKind(diagram.mmd) }
        : { connections: [], kind: 'other' as DiagramKind },
    [diagram],
  );
}

export interface Highlight {
  kind: DiagramKind;
  /** Positions among the drawn lines, for diagram types whose edges carry no id. */
  activeLines: Set<number>;
  /** Positions among the `.edgeLabels` children, which include invisible links. */
  activeLabels: Set<number>;
  /** Mermaid `data-id`s of the active edge paths. Flowcharts only. */
  activeEdgeIds: Set<string>;
  /** False when there is nothing to emphasise and the SVG should be left alone. */
  enabled: boolean;
}

const NOTHING: Omit<Highlight, 'kind'> = {
  activeLines: new Set(),
  activeLabels: new Set(),
  activeEdgeIds: new Set(),
  enabled: false,
};

/**
 * Which rendered connections belong to the lines in view.
 *
 * Emphasis only reads as emphasis against a backdrop, so a range covering everything (or
 * nothing) disables it rather than muting the whole diagram.
 */
export function useConnectionHighlight({ connections, kind }: DiagramConnections, ranges: LineRange[]): Highlight {
  return useMemo(() => {
    if (ranges.length === 0 || connections.length === 0) return { kind, ...NOTHING };

    const activeLines = new Set<number>();
    const activeLabels = new Set<number>();
    const activeEdgeIds = new Set<string>();
    for (const c of connections) {
      if (!ranges.some((r) => c.line >= r.startLine && c.line <= r.endLine)) continue;
      activeLabels.add(c.slot);
      if (c.index >= 0) activeLines.add(c.index);
      if (c.edgeId) activeEdgeIds.add(c.edgeId);
    }

    const drawn = connections.filter((c) => c.index >= 0).length;
    if (activeLines.size === 0 || activeLines.size === drawn) return { kind, ...NOTHING };

    return { kind, activeLines, activeLabels, activeEdgeIds, enabled: true };
  }, [connections, kind, ranges]);
}
