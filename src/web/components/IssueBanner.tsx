import { useState } from 'react';
import type { ValidationIssue } from '../types.js';

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Surface format problems without crowding out the diagram.
 *
 * Collapsed to a single line by default: a diagram mid-migration can carry dozens of
 * issues, and listing them all is taller than the canvas they sit above.
 */
export function IssueBanner({ issues }: { issues: ValidationIssue[] }) {
  const [open, setOpen] = useState(false);
  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.severity === 'error');
  const shown = errors.length > 0 ? errors : issues;
  const warnings = issues.length - errors.length;
  const summary =
    errors.length > 0
      ? count(errors.length, 'problem') + (warnings > 0 ? `, ${count(warnings, 'warning')}` : '')
      : count(warnings, 'warning');

  return (
    <div className={`issue-banner ${errors.length > 0 ? 'error' : 'warning'}`} data-testid="issue-banner" role="status">
      <button
        type="button"
        className="issue-summary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="issue-summary"
      >
        <span className="issue-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        {summary} in this diagram
      </button>
      {open && (
        <ul>
          {shown.map((issue, i) => (
            <li key={i}>
              <code>
                {issue.file}
                {issue.line !== undefined ? `:${issue.line}` : ''}
              </code>{' '}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
