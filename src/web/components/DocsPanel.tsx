import { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

/** Double chevron pointing at the edge the pane collapses towards. */
function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M11.5 6.5L17 12l-5.5 5.5M6 6.5L11.5 12L6 17.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface DocsPanelProps {
  title: string;
  body: string;
  /** Position in the walkthrough, e.g. "Step 2 of 7". Absent on the overview. */
  position?: string;
  /** The `# Phase` this step sits under, when the documentation groups its steps. */
  phase?: string;
  fontScale: number;
  onFontScale: (next: number) => void;
  onCollapse?: () => void;
}

/** Copy button injected into every fenced code block. */
function CodeBlock({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const ref = useRef<HTMLPreElement>(null);
  return (
    <div className="code-block">
      <button
        type="button"
        className="copy-button"
        onClick={() => navigator.clipboard?.writeText(ref.current?.textContent ?? '')}
      >
        Copy
      </button>
      <pre ref={ref} {...props}>
        {children}
      </pre>
    </div>
  );
}

export function DocsPanel({ title, body, position, phase, fontScale, onFontScale, onCollapse }: DocsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // A new step starts at the top of its documentation, not wherever the last one ended.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [title, body]);

  return (
    <div className="docs-panel" data-testid="docs-panel">
      <div className="panel-header docs-header">
        {/* A div, not a button: a heading is not allowed inside one. */}
        <div
          className={`docs-title${onCollapse ? ' clickable' : ''}`}
          {...(onCollapse
            ? {
                role: 'button',
                tabIndex: 0,
                onClick: onCollapse,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onCollapse();
                  }
                },
                'aria-label': 'Hide documentation',
                title: 'Hide documentation',
                'data-testid': 'collapse-docs-header',
              }
            : {})}
        >
          {position && <span className="step-counter-label">{position}</span>}
          <h2 data-testid="step-title">{title}</h2>
        </div>
        <div className="docs-header-actions">
          {phase && <span className="phase-tag" data-testid="phase-tag">{phase}</span>}
          <div className="font-controls">
          <button type="button" onClick={() => onFontScale(Math.max(0.8, fontScale - 0.1))} aria-label="Smaller text">
            A−
          </button>
          <button type="button" onClick={() => onFontScale(Math.min(1.8, fontScale + 0.1))} aria-label="Larger text">
            A+
          </button>
          </div>
        </div>
      </div>
      {/* 0.875rem is the 14px the rest of the type is sized against. */}
      <div className="docs-body" ref={scrollRef} style={{ fontSize: `${fontScale * 0.875}rem` }} data-testid="docs-body">
        {body.trim() ? (
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={{ pre: CodeBlock }}>
            {body}
          </Markdown>
        ) : (
          <p className="empty-note">
            No documentation for this step yet. Ask your agent to describe it.
          </p>
        )}
      </div>
      {onCollapse && (
        <button
          type="button"
          className="docs-collapse"
          onClick={onCollapse}
          data-testid="collapse-docs"
          aria-label="Hide documentation"
          title="Hide documentation"
        >
          <CollapseIcon />
        </button>
      )}
    </div>
  );
}
