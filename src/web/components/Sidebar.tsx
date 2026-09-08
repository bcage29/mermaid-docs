import type { Diagram } from '../types.js';
import type { Step } from '../../core/types.js';

/** Double chevron pointing at the edge the pane collapses towards. */
function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M12.5 6.5L7 12l5.5 5.5M18 6.5L12.5 12l5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface SidebarProps {
  diagram?: Diagram;
  activeStepId?: string;
  onSelectStep: (stepId?: string) => void;
  onCollapse?: () => void;
}

/** The walkthrough: the steps of the diagram picked in the header. */
export function Sidebar({ diagram, activeStepId, onSelectStep, onCollapse }: SidebarProps) {
  // Consecutive runs, not a map: order is the walkthrough, and a phase is a heading in it.
  const groups: Array<{ phase?: string; steps: Array<{ step: Step; index: number }> }> = [];
  diagram?.steps.forEach((step, index) => {
    const last = groups[groups.length - 1];
    if (last && last.phase === step.phase) last.steps.push({ step, index });
    else groups.push({ ...(step.phase ? { phase: step.phase } : {}), steps: [{ step, index }] });
  });

  return (
    <nav className="sidebar" data-testid="sidebar">
      {onCollapse ? (
        <button
          type="button"
          className="panel-header sidebar-header"
          onClick={onCollapse}
          data-testid="collapse-steps-header"
          aria-label="Hide steps"
          title="Hide steps"
        >
          Steps
        </button>
      ) : (
        <div className="panel-header">Steps</div>
      )}
      {!diagram && <p className="empty-note">No diagram selected.</p>}
      {diagram && (
        <div className="step-list" data-testid="step-list">
          <button
            type="button"
            className={`tree-item${!activeStepId ? ' active' : ''}`}
            onClick={() => onSelectStep(undefined)}
          >
            Overview
          </button>
          {groups.map((group, g) => (
            <div key={group.phase ?? `ungrouped-${g}`} className="step-group">
              {group.phase && (
                <div className="step-phase" data-testid="step-phase">{group.phase}</div>
              )}
              {group.steps.map(({ step, index }) => (
                <button
                  key={step.id}
                  type="button"
                  className={`tree-item${step.id === activeStepId ? ' active' : ''}`}
                  onClick={() => onSelectStep(step.id)}
                  data-testid="step-item"
                >
                  <span className="step-index">{index + 1}</span>
                  {step.title}
                  {!step.regions.length && <span className="badge" title="No region in the diagram">no region</span>}
                </button>
              ))}
            </div>
          ))}
          {diagram.steps.length === 0 && (
            <p className="empty-note">No steps yet. Ask your agent to document this diagram.</p>
          )}
        </div>
      )}
      {onCollapse && (
        <button
          type="button"
          className="sidebar-collapse"
          onClick={onCollapse}
          data-testid="collapse-steps"
          aria-label="Hide steps"
          title="Hide steps"
        >
          <CollapseIcon />
        </button>
      )}
    </nav>
  );
}
