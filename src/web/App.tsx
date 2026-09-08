import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, Separator, usePanelCallbackRef } from 'react-resizable-panels';
import { SplitLayout } from './components/SplitLayout.js';
import { Sidebar } from './components/Sidebar.js';
import { MermaidCanvas } from './components/MermaidCanvas.js';
import { SourcePanel } from './components/SourcePanel.js';
import { DocsPanel } from './components/DocsPanel.js';
import { StepNav } from './components/StepNav.js';
import { IssueBanner } from './components/IssueBanner.js';
import { DiagramPicker } from './components/DiagramPicker.js';
import { ViewerSettings } from './components/ViewerSettings.js';
import { useDiagram, useDiagramList, useRoute } from './hooks/useDiagram.js';
import { useConnectionStatus } from './hooks/useEvents.js';
import { useFullscreen } from './hooks/useFullscreen.js';
import { useWorkspace } from './hooks/useWorkspace.js';
import { useTheme } from './hooks/useTheme.js';
import { containsLine, rangesOfStep, stepAtLine } from './hooks/useRangeNodes.js';

/** Keep the tail, which is the part that identifies a workspace. CSS truncation would
 *  drop it, and right-to-left truncation reorders the leading slash. */
function shortenPath(path: string, max = 44): string {
  return path.length <= max ? path : `\u2026${path.slice(-(max - 1))}`;
}

export function App() {
  const { diagrams } = useDiagramList();
  const [route, navigate] = useRoute();
  const connection = useConnectionStatus();
  const theme = useTheme();
  const workspace = useWorkspace();
  const bodyRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(useCallback(() => bodyRef.current, []));
  const [sidebar, setSidebar] = usePanelCallbackRef();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Land on the first diagram so the app is never blank on first load.
  const activeName = route.name ?? diagrams[0]?.name;
  const { diagram, error, loading } = useDiagram(activeName);

  const [showSource, setShowSource] = useState(false);
  const [zoomToStep, setZoomToStep] = useState(true);
  const [fontScale, setFontScale] = useState(1);
  // A line the user clicked in the source panel, remembered together with where it was
  // clicked so it belongs to one step of one diagram and never leaks into another.
  const [selection, setSelection] = useState<{ diagramName: string; stepId?: string; line: number }>();

  // Index 0 is the overview; steps follow in document order.
  const stepIndex = useMemo(() => {
    if (!diagram || !route.stepId) return 0;
    const found = diagram.steps.findIndex((s) => s.id === route.stepId);
    return found === -1 ? 0 : found + 1;
  }, [diagram, route.stepId]);

  const total = (diagram?.steps.length ?? 0) + 1;
  const step = stepIndex > 0 ? diagram?.steps[stepIndex - 1] : undefined;

  const selectedLine =
    selection && selection.diagramName === activeName && selection.stepId === route.stepId
      ? selection.line
      : undefined;

  // A selected line inside the step refines it; one outside it stands alone.
  const stepRanges = useMemo(() => rangesOfStep(step), [step]);
  const focusRanges = useMemo(
    () =>
      selectedLine !== undefined && !containsLine(stepRanges, selectedLine)
        ? [{ startLine: selectedLine, endLine: selectedLine }]
        : stepRanges,
    [selectedLine, stepRanges],
  );

  // Drop a selection the walkthrough has moved away from, so returning to the step later
  // doesn't bring a stale line back with it.
  useEffect(() => {
    setSelection((s) => (s && s.diagramName === activeName && s.stepId === route.stepId ? s : undefined));
  }, [route.stepId, activeName]);

  const goTo = useCallback(
    (index: number) => {
      if (!diagram || !activeName) return;
      const clamped = Math.max(0, Math.min(index, diagram.steps.length));
      navigate({ name: activeName, ...(clamped > 0 ? { stepId: diagram.steps[clamped - 1]!.id } : {}) });
    },
    [diagram, activeName, navigate],
  );

  // Clicking a line jumps to the step that documents it, so the source doubles as a way
  // into the walkthrough. A line no step covers stays where it is and just gets focused.
  const onSelectLine = useCallback(
    (line: number | undefined) => {
      if (line === undefined || !diagram || !activeName) {
        setSelection(undefined);
        return;
      }
      const stepId = stepAtLine(diagram.steps, line)?.id ?? route.stepId;
      setSelection({ diagramName: activeName, line, ...(stepId !== undefined ? { stepId } : {}) });
      if (stepId !== route.stepId) navigate({ name: activeName, ...(stepId ? { stepId } : {}) });
    },
    [diagram, activeName, route.stepId, navigate],
  );

  const onSelectDiagram = useCallback((name: string) => navigate({ name }), [navigate]);
  const onSelectStep = useCallback(
    (stepId?: string) => activeName && navigate({ name: activeName, ...(stepId ? { stepId } : {}) }),
    [activeName, navigate],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      switch (event.key) {
        case 'ArrowRight':
        case 'j':
          goTo(stepIndex + 1);
          break;
        case 'ArrowLeft':
        case 'k':
          goTo(stepIndex - 1);
          break;
        case 'Home':
          goTo(0);
          break;
        case 'End':
          goTo(total - 1);
          break;
        case '`':
          setShowSource((v) => !v);
          break;
        case 'f':
          setZoomToStep((v) => !v);
          break;
        case 'F':
          toggleFullscreen();
          break;
        case 'Escape':
          setSelection(undefined);
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, stepIndex, total, toggleFullscreen]);

  return (
    <div className="app" ref={bodyRef}>
      <header className="app-header">
        <a className="brand" href="#/" title="Mermaid Docs">
          <img
            className="brand-mark"
            src="/mermaid-docs-icon-branch-transparent.svg"
            alt=""
            width="22"
            height="22"
            data-testid="brand-mark"
          />
          <span className="brand-name">Mermaid Docs</span>
        </a>
        {workspace && (
          <span className="workspace-root" title={workspace.root} data-testid="workspace-root">
            {shortenPath(workspace.root)}
          </span>
        )}
        <DiagramPicker
          diagrams={diagrams}
          {...(activeName !== undefined ? { activeName } : {})}
          onSelectDiagram={onSelectDiagram}
        />
        {diagram && <span className="diagram-title" data-testid="diagram-title">{diagram.title}</span>}
        <div className="header-actions">
          {workspace?.stale && (
            <span
              className="header-warning"
              data-testid="stale-server"
              title="The viewer was rebuilt after this server started, so the page and the API are out of step. Restart the server."
            >
              Server out of date · restart
            </span>
          )}
          {connection === 'lost' && (
            <button
              type="button"
              className="connection-lost"
              data-testid="connection-lost"
              onClick={() => window.location.reload()}
              title="The viewer lost contact with the server, so the page has stopped updating. The server restarts on a new port, so this tab may be pointed at an address nothing is listening on."
            >
              Not live · reload
            </button>
          )}
          <StepNav index={stepIndex} total={total} onPrevious={() => goTo(stepIndex - 1)} onNext={() => goTo(stepIndex + 1)} />
        </div>
      </header>

      <SplitLayout
        id={`mmdocs:${activeName ?? 'none'}`}
        orientation="horizontal"
        panelIds={['sidebar', 'center', 'docs']}
        className="app-body"
      >
        <Panel
          defaultSize="18"
          minSize="10"
          collapsible
          id="sidebar"
          className="sidebar-panel"
          panelRef={setSidebar}
          onResize={(size) => setSidebarCollapsed(size.asPercentage === 0)}
        >
          <Sidebar
            {...(diagram !== undefined ? { diagram } : {})}
            {...(route.stepId !== undefined ? { activeStepId: route.stepId } : {})}
            onSelectStep={onSelectStep}
            onCollapse={() => sidebar?.collapse()}
          />
        </Panel>
        <Separator className="resize-handle" />

        {sidebarCollapsed && (
          <button
            type="button"
            className="sidebar-reveal"
            onClick={() => sidebar?.expand()}
            data-testid="expand-steps"
            title="Show steps"
          >
            <span>Steps</span>
          </button>
        )}

        <Panel defaultSize="52" minSize="20" id="center">
          <SplitLayout
            id={`mmdocs:center:${activeName ?? 'none'}`}
            orientation="vertical"
            panelIds={showSource ? ['canvas', 'source'] : ['canvas']}
            className="center-group"
          >
            <Panel defaultSize={showSource ? '62' : '100'} minSize="20" id="canvas" className="canvas-panel">
              {error && <div className="canvas-error" role="alert"><h2>Could not load diagram</h2><pre>{error}</pre></div>}
              {!error && loading && !diagram && <p className="empty-note">Loading…</p>}
              {!error && diagram && (
                <>
                  <IssueBanner issues={diagram.issues} />
                  <MermaidCanvas
                    diagram={diagram}
                    ranges={focusRanges}
                    zoomToStep={zoomToStep}
                    onSelectLine={onSelectLine}
                    isFullscreen={isFullscreen}
                    onToggleFullscreen={toggleFullscreen}
                  />
                </>
              )}
              <ViewerSettings
                theme={theme}
                zoomToStep={zoomToStep}
                onZoomToStep={setZoomToStep}
                showSource={showSource}
                onShowSource={setShowSource}
              />
            </Panel>
            {showSource && diagram && (
              <>
                <Separator className="resize-handle horizontal" />
                <Panel defaultSize="38" minSize="10" collapsible id="source">
                  <SourcePanel
                    mmd={diagram.mmd}
                    {...(step !== undefined ? { step } : {})}
                    {...(selectedLine !== undefined ? { selectedLine } : {})}
                    onSelectLine={onSelectLine}
                  />
                </Panel>
              </>
            )}
          </SplitLayout>
        </Panel>
        <Separator className="resize-handle" />

        <Panel defaultSize="30" minSize="15" collapsible id="docs">
          <DocsPanel
            title={step?.title ?? diagram?.title ?? 'Mermaid Docs'}
            body={step?.body ?? diagram?.overview ?? ''}
            {...(step?.phase !== undefined ? { phase: step.phase } : {})}
            {...(stepIndex > 0 ? { position: `Step ${stepIndex} of ${total - 1}` } : {})}
            fontScale={fontScale}
            onFontScale={setFontScale}
          />
        </Panel>
      </SplitLayout>
    </div>
  );
}
