import { useCallback, useEffect, useMemo, useRef } from 'react';
import { isMarkerLine } from '../../core/markers.js';
import { containsLine, rangesOfStep } from '../hooks/useRangeNodes.js';
import type { Step } from '../../core/types.js';

export interface SourcePanelProps {
  mmd: string;
  step?: Step;
  /** Line the user clicked, which overrides the step's own highlight. */
  selectedLine?: number;
  onSelectLine: (line: number | undefined) => void;
}

/**
 * The .mmd source with the current step's lines highlighted.
 *
 * Lines are clickable: picking one moves the walkthrough to the step that documents it
 * and marks the line within that step's region. A line no step covers is focused on its
 * own, so the source can still be explored outside the authored walkthrough. Clicking the
 * same line again clears the selection.
 *
 * Hand-rolled rather than a code editor - there is no Mermaid grammar to syntax-highlight
 * with, and we need precise control over dimming, selection and scroll-into-view.
 */
export function SourcePanel({ mmd, step, selectedLine, onSelectLine }: SourcePanelProps) {
  const listRef = useRef<HTMLPreElement | null>(null);
  const firstHighlighted = useRef<HTMLButtonElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const ranges = useMemo(() => rangesOfStep(step), [step]);
  const firstLine = ranges[0]?.startLine;

  // Centred by hand rather than with scrollIntoView, which measures the scroll container
  // as it is at that moment: opening the panel runs this while it is still sizing, and the
  // step lands at the top edge instead of the middle.
  const centreOn = useCallback((target: HTMLButtonElement | null, behavior: ScrollBehavior) => {
    const list = listRef.current;
    if (!list || !target) return;
    const offset = target.getBoundingClientRect().top - list.getBoundingClientRect().top;
    const top = list.scrollTop + offset - (list.clientHeight - target.offsetHeight) / 2;
    list.scrollTo({ top: Math.max(0, top), behavior });
  }, []);

  const isOffScreen = useCallback((target: HTMLButtonElement | null) => {
    const list = listRef.current;
    if (!list || !target) return false;
    const box = list.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    return rect.top < box.top || rect.bottom > box.bottom;
  }, []);

  // Follow the step, but not the user's own clicks - scrolling away from a line someone
  // just clicked is disorienting.
  useEffect(() => {
    if (selectedLine !== undefined) return;
    centreOn(firstHighlighted.current, 'smooth');
  }, [step?.id, selectedLine, centreOn]);

  // A line selected from the diagram is usually somewhere else in the file, so it is
  // brought into view. One clicked in the panel is already visible and is left alone.
  useEffect(() => {
    if (selectedLine === undefined || !isOffScreen(selectedRef.current)) return;
    centreOn(selectedRef.current, 'smooth');
  }, [selectedLine, centreOn, isOffScreen]);

  // The panel is sized after it mounts, and again whenever the splitter moves, so the
  // step is re-centred if it has been left out of view.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => {
      const target = selectedLine !== undefined ? selectedRef.current : firstHighlighted.current;
      if (isOffScreen(target)) centreOn(target, 'auto');
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, [centreOn, isOffScreen, selectedLine]);

  const lines = mmd.split('\n');
  // A line outside the step takes the highlight over so the two never compete; inside it,
  // the step stays lit and the line is emphasised within it.
  const linePicked = selectedLine !== undefined && !containsLine(ranges, selectedLine);

  return (
    <div className="source-panel" data-testid="source-panel">
      <div className="panel-header source-header">
        <span>Diagram source</span>
        {selectedLine !== undefined && (
          <button type="button" className="clear-selection" onClick={() => onSelectLine(undefined)}>
            Line {selectedLine} selected · clear
          </button>
        )}
      </div>
      <pre className="source-lines" ref={listRef}>
        {lines.map((line, i) => {
          const n = i + 1;
          const selected = selectedLine === n;
          const highlighted = linePicked ? selected : containsLine(ranges, n) || selected;
          const dimmed = !highlighted && (selectedLine !== undefined || ranges.length > 0);
          return (
            <button
              key={n}
              type="button"
              ref={(el) => {
                if (selected) selectedRef.current = el;
                if (highlighted && !selected && n === firstLine) firstHighlighted.current = el;
              }}
              className={`source-line${highlighted ? ' hl' : ''}${dimmed ? ' dim' : ''}${selected ? ' selected' : ''}`}
              data-line={n}
              data-highlighted={highlighted ? 'true' : undefined}
              // Marker comments draw nothing, so selecting one would blank the diagram.
              disabled={isMarkerLine(line) || line.trim() === ''}
              onClick={() => onSelectLine(selected ? undefined : n)}
            >
              <span className="line-number">{n}</span>
              <code>{line || ' '}</code>
            </button>
          );
        })}
      </pre>
    </div>
  );
}
