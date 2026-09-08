import { useCallback, useEffect, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper, useControls } from 'react-zoom-pan-pinch';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { useMermaidRender } from '../hooks/useMermaidRender.js';
import { useRangeNodes } from '../hooks/useRangeNodes.js';
import { useConnectionHighlight, useConnections } from '../hooks/useConnectionHighlight.js';
import type { DiagramConnections, Highlight } from '../hooks/useConnectionHighlight.js';
import { clearStickyActors, positionStickyActors, raiseSequenceNumbers } from '../stickyActors.js';
import { addHitTargets, hitTarget } from '../connectionHits.js';
import type { LineRange } from '../hooks/useRangeNodes.js';
import type { Connection } from '../../core/connections.js';
import { nodeIdFromElementId } from '../../core/mermaidIds.js';
import type { Diagram } from '../../core/types.js';

/** 800% maximum zoom. The SVG scales by CSS transform, so text stays vector-crisp. */
const MAX_SCALE = 8;
const MIN_SCALE = 0.1;

/** Where each diagram type keeps its connections and their labels. */
const HIGHLIGHT_TARGETS: Record<'flowchart' | 'sequence', { lines: string; labels: string }> = {
  flowchart: { lines: 'path.flowchart-link', labels: '.edgeLabels > *' },
  sequence: { lines: '.messageLine0, .messageLine1', labels: '.messageText' },
};

/**
 * Emphasise the connections the current step draws, and fade the rest.
 *
 * Flowchart paths carry a `data-id` that survives re-layout, so they are matched by id.
 * Everything else is matched by position, which is the order Mermaid emits elements in -
 * note that an invisible `~~~` link produces an edge label but no path, so labels and
 * lines count separately.
 *
 * Classes are toggled rather than cleared and rewritten. Clearing first restarts the CSS
 * transition on everything, so a line that is muted before and after the step change
 * visibly flashes back to full opacity on its way to being muted again.
 */
function applyHighlight(host: HTMLElement, highlight: Highlight): void {
  if (!highlight.enabled || highlight.kind === 'other') {
    for (const el of host.querySelectorAll('.is-active, .is-muted')) {
      el.classList.remove('is-active', 'is-muted');
    }
    return;
  }

  const mark = (el: Element, active: boolean) => {
    el.classList.toggle('is-active', active);
    el.classList.toggle('is-muted', !active);
  };

  const targets = HIGHLIGHT_TARGETS[highlight.kind];
  // Sequence message lines carry a `data-id` too, but it is not an edge id and nothing
  // maps to it, so only flowcharts match by id.
  const byId = highlight.kind === 'flowchart';
  host.querySelectorAll(targets.lines).forEach((el, i) => {
    const dataId = byId ? el.getAttribute('data-id') : null;
    mark(el, dataId ? highlight.activeEdgeIds.has(dataId) : highlight.activeLines.has(i));
  });
  host.querySelectorAll(targets.labels).forEach((el, i) => {
    mark(el, highlight.activeLabels.has(i));
  });
}

/** The connection a clicked element belongs to, matched the same way the highlight is. */
function connectionAt(host: HTMLElement, clicked: Element, { connections, kind }: DiagramConnections): Connection | undefined {
  if (kind === 'other') return undefined;

  const hit = hitTarget(clicked);
  if (hit) {
    return hit.edgeId
      ? connections.find((c) => c.edgeId === hit.edgeId)
      : connections.find((c) => c.index === hit.index);
  }

  // Labels have no twin - they are large enough to click as they are.
  const targets = HIGHLIGHT_TARGETS[kind];
  const label = clicked.closest(targets.labels);
  if (label) {
    const i = [...host.querySelectorAll(targets.labels)].indexOf(label);
    return connections.find((c) => c.slot === i);
  }

  return undefined;
}

/**
 * Zoom moves by a factor, not a fixed amount: one button click is +40%, one wheel notch
 * +10%, wherever you already are. react-zoom-pan-pinch takes absolute increments (a step
 * of 0.5 means "add 0.5 to the scale"), which zooms wildly at a fitted 40% and barely
 * moves at 600%, so the steps below are derived from the current scale instead.
 */
const BUTTON_FACTOR = 1.4;
const WHEEL_FACTOR = 1.1;
const DOUBLE_CLICK_FACTOR = 1.8;
/** Absolute increments that land on scale x factor, and back again. */
const stepIn = (scale: number, factor: number) => scale * (factor - 1);
const stepOut = (scale: number, factor: number) => scale * (1 - 1 / factor);
/** Shorter than the 300ms default, so smaller steps don't feel sluggish when repeated. */
const ZOOM_MS = 30;
/** How long the diagram takes to travel between steps. */
const PLACE_MS = 1000;

/** Capped, or a step drawing one small node blows it up to fill the viewport. */
const MAX_STEP_SCALE = 2;
/** Fraction of the viewport a framed step fills, so it is seen in its surroundings. */
const STEP_FRAME_BUFFER = 0.8;

/**
 * Scale that frames the given elements with room to spare.
 *
 * zoomToElement fits them edge to edge, which reads as cropped - the step fills the pane
 * with no sign of what it connects to. The scale is computed here instead so the fit can
 * be backed off.
 */
function framedScale(host: HTMLElement, targets: Element[]): number | undefined {
  const viewport = host.closest('.canvas-viewport');
  if (!viewport || targets.length === 0) return undefined;
  const rects = targets.map((t) => t.getBoundingClientRect());
  const width = Math.max(...rects.map((r) => r.right)) - Math.min(...rects.map((r) => r.left));
  const height = Math.max(...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top));
  if (!width && !height) return undefined;
  // getBoundingClientRect is post-transform, so divide out the scale already applied.
  const content = host.closest('.canvas-content');
  const applied = content ? new DOMMatrixReadOnly(getComputedStyle(content).transform).a || 1 : 1;
  const area = viewport.getBoundingClientRect();
  const fit = Math.min((area.width * applied) / width, (area.height * applied) / height);
  return Math.min(fit * STEP_FRAME_BUFFER, MAX_STEP_SCALE);
}

/** Corner brackets pointing out to enter, in to leave. */
function FullscreenIcon({ active }: { active: boolean }) {
  const d = active
    ? 'M8 3v5H3M13 3v5h5M8 18v-5H3M13 18v-5h5'
    : 'M3 8V3h5M18 8V3h-5M3 13v5h5M18 13v5h-5';
  return (
    <svg viewBox="0 0 21 21" width="14" height="14" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Toolbar({
  scale,
  onFit,
  isFullscreen,
  onToggleFullscreen,
}: {
  scale: number;
  onFit: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const { zoomIn, zoomOut } = useControls();
  return (
    <div className="canvas-toolbar">
      <button type="button" onClick={() => zoomOut(stepOut(scale, BUTTON_FACTOR), ZOOM_MS)} aria-label="Zoom out">−</button>
      <span className="zoom-readout" data-testid="zoom-level">{Math.round(scale * 100)}%</span>
      <button type="button" onClick={() => zoomIn(stepIn(scale, BUTTON_FACTOR), ZOOM_MS)} aria-label="Zoom in">+</button>
      <button type="button" onClick={onFit} data-testid="fit-button">Reset</button>
      <button
        type="button"
        className="icon-button"
        onClick={onToggleFullscreen}
        data-testid="fullscreen-toggle"
        aria-pressed={isFullscreen}
        aria-label={isFullscreen ? 'Leave fullscreen' : 'Enter fullscreen'}
        title={`${isFullscreen ? 'Leave' : 'Enter'} fullscreen (Shift+F)`}
      >
        <FullscreenIcon active={isFullscreen} />
      </button>
    </div>
  );
}

export interface MermaidCanvasProps {
  diagram?: Diagram;
  /** Lines in view: the current step's regions, or a single line the user clicked. */
  ranges: LineRange[];
  zoomToStep: boolean;
  /** Called with the .mmd line of a connection the user clicked in the diagram. */
  onSelectLine?: (line: number) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function MermaidCanvas({
  diagram,
  ranges,
  zoomToStep,
  onSelectLine,
  isFullscreen,
  onToggleFullscreen,
}: MermaidCanvasProps) {
  const { svg, error } = useMermaidRender(diagram?.mmd, diagram?.id ?? '');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  // Hides the diagram until it has been fitted, so the fit is not visible as a jump.
  const [fitted, setFitted] = useState(false);
  // Tracked only so the sticky actor row repaints while the diagram is dragged.
  const [pan, setPan] = useState(0);
  const apiRef = useRef<ReactZoomPanPinchRef | null>(null);
  // Where the pointer went down, so a pan is not mistaken for a click on a connection.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  const rangeNodes = useRangeNodes(diagram, ranges);
  const parsed = useConnections(diagram);
  const highlight = useConnectionHighlight(parsed, ranges);
  const sticky = highlight.kind === 'sequence';

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const from = pressedAt.current;
      pressedAt.current = null;
      if (!from || !host || !onSelectLine) return;
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > 4) return;
      const connection = connectionAt(host, event.target as Element, parsed);
      if (connection) onSelectLine(connection.line);
    },
    [host, onSelectLine, parsed],
  );

  // The diagram is inserted by hand rather than through dangerouslySetInnerHTML: React
  // re-applies that whenever the pan/zoom library re-renders, replacing the <svg> and
  // taking the highlight classes with it, which reads as a flicker.
  useEffect(() => {
    if (!host) return;
    host.innerHTML = svg;
  }, [host, svg]);

  // The pan/zoom library owns this subtree and recreates it on its own re-renders, which
  // drops everything written to it - so it is all re-applied whenever it does.
  useEffect(() => {
    if (!host) return;
    const paint = () => {
      if (parsed.kind !== 'other' && onSelectLine) addHitTargets(host, parsed.kind);
      applyHighlight(host, highlight);
      if (sticky) positionStickyActors(host, scale);
      else clearStickyActors(host);
      if (parsed.kind === 'sequence') raiseSequenceNumbers(host);
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [host, highlight, svg, sticky, scale, pan, parsed, onSelectLine]);

  // The library measures the rendered diagram and centres it, so each one gets the scale
  // its own proportions call for. Never enlarged: a small diagram stays its own size.
  const fit = useCallback((durationMs: number) => {
    apiRef.current?.fitToView({ mode: 'contain', maxScale: 1, animationTime: durationMs });
  }, []);

  // Frame whatever the current step draws. Flowcharts expose addressable nodes; sequence
  // diagrams have none, so there the step's own messages and their labels are framed.
  const frameStep = useCallback(
    (durationMs: number) => {
      const api = apiRef.current;
      if (!zoomToStep || !host || !api) return false;

      let targets: Element[] = [];
      if (highlight.kind === 'flowchart') {
        targets = [...host.querySelectorAll<SVGGElement>('g.node[id]')].filter((el) => {
          const id = nodeIdFromElementId(el.id);
          return id !== undefined && rangeNodes.includes(id);
        });
      } else if (highlight.kind === 'sequence' && highlight.enabled) {
        const { lines, labels } = HIGHLIGHT_TARGETS.sequence;
        targets = [
          ...[...host.querySelectorAll(lines)].filter((_, i) => highlight.activeLines.has(i)),
          ...[...host.querySelectorAll(labels)].filter((_, i) => highlight.activeLabels.has(i)),
        ];
      }

      if (targets.length === 0) return false;
      const scaleTo = framedScale(host, targets);
      if (scaleTo === undefined) return false;
      api.zoomToElement(targets as unknown as HTMLElement[], { scale: scaleTo, animationTime: durationMs });
      return true;
    },
    [zoomToStep, host, rangeNodes, highlight],
  );

  const placed = useRef(false);
  useEffect(() => {
    placed.current = false;
    setFitted(false);
  }, [svg]);

  // Place the diagram: instantly the first time, so the page never opens with it sliding
  // into position, then animated as the walkthrough moves from step to step.
  useEffect(() => {
    if (!svg || !host) return;
    const frame = requestAnimationFrame(() => {
      const duration = placed.current ? PLACE_MS : 0;
      // Nothing to frame means the overview, or a diagram type with no addressable nodes.
      if (!frameStep(duration) && (!placed.current || zoomToStep)) fit(duration);
      placed.current = true;
      setFitted(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [svg, host, fit, frameStep, zoomToStep]);

  const onInit = useCallback((ref: ReactZoomPanPinchRef) => {
    apiRef.current = ref;
  }, []);

  if (error) {
    return (
      <div className="canvas-error" role="alert">
        <h2>This diagram could not be rendered</h2>
        <pre>{error}</pre>
      </div>
    );
  }

  return (
    <div className="canvas" data-testid="canvas">
      <TransformWrapper
        minScale={MIN_SCALE}
        maxScale={MAX_SCALE}
        limitToBounds={false}
        centerOnInit
        // smooth multiplies the step by the raw deltaY, which a trackpad flick sends in
        // the tens - one flick then crosses the whole zoom range. One notch, one step.
        smooth={false}
        wheel={{ step: stepIn(scale, WHEEL_FACTOR) }}
        doubleClick={{ mode: 'zoomIn', step: stepIn(scale, DOUBLE_CLICK_FACTOR), animationTime: 120 }}
        onInit={onInit}
        onTransform={(_ref: ReactZoomPanPinchRef, state: { scale: number; positionY: number }) => {
          setScale(state.scale);
          setPan(state.positionY);
        }}
      >
        <Toolbar scale={scale} onFit={() => fit(200)} isFullscreen={isFullscreen} onToggleFullscreen={onToggleFullscreen} />
        <TransformComponent wrapperClass="canvas-viewport" contentClass="canvas-content">
          <div
            ref={setHost}
            className={`mermaid-host${onSelectLine ? ' is-clickable' : ''}${fitted ? ' is-fitted' : ''}`}
            onPointerDown={(e) => {
              pressedAt.current = { x: e.clientX, y: e.clientY };
            }}
            onClick={onClick}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
