import type { DiagramSummary } from '../types.js';

/**
 * Diagram names are unique across the workspace, so the list is flat and a native select
 * carries it.
 */
function optionLabel(d: DiagramSummary): string {
  return d.name;
}

export interface DiagramPickerProps {
  diagrams: DiagramSummary[];
  activeName?: string;
  onSelectDiagram: (name: string) => void;
}

/** The one place diagrams are switched: the sidebar below is the walkthrough. */
export function DiagramPicker({ diagrams, activeName, onSelectDiagram }: DiagramPickerProps) {
  if (diagrams.length === 0) {
    return (
      <span className="diagram-picker empty" data-testid="diagram-select-empty">
        No .mmd files found
      </span>
    );
  }

  return (
    <label className="diagram-picker">
      <select
        value={activeName ?? ''}
        onChange={(e) => onSelectDiagram(e.target.value)}
        aria-label="Choose a diagram"
        data-testid="diagram-select"
      >
        {diagrams.map((d) => (
          <option key={d.relPath} value={d.name} data-testid="diagram-option">
            {optionLabel(d)}
          </option>
        ))}
      </select>
    </label>
  );
}
