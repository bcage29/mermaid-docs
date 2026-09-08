import { setTheme } from '../hooks/useTheme.js';
import type { Theme } from '../hooks/useTheme.js';

/** Shows what you get if you press it, not what is currently on. Filled, because thin
 *  strokes at 16px read as an indistinct smudge. */
function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="4.6" fill="currentColor" />
        <path
          d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.4 4.4l2.1 2.1M17.5 17.5l2.1 2.1M19.6 4.4l-2.1 2.1M6.5 17.5l-2.1 2.1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M21 14.2A9.2 9.2 0 0 1 9.8 3a9.2 9.2 0 1 0 11.2 11.2z" fill="currentColor" />
    </svg>
  );
}

export interface ViewerSettingsProps {
  theme: Theme;
  zoomToStep: boolean;
  onZoomToStep: (on: boolean) => void;
  showSource: boolean;
  onShowSource: (on: boolean) => void;
}

/** View options, floating over the canvas opposite the zoom controls. */
export function ViewerSettings({
  theme,
  zoomToStep,
  onZoomToStep,
  showSource,
  onShowSource,
}: ViewerSettingsProps) {
  return (
    <div className="canvas-settings" data-testid="viewer-settings">
      <label>
        <input type="checkbox" checked={showSource} onChange={(e) => onShowSource(e.target.checked)} />
        View Source
      </label>
      <label>
        <input type="checkbox" checked={zoomToStep} onChange={(e) => onZoomToStep(e.target.checked)} />
        Zoom to step
      </label>
      <button
        type="button"
        className="icon-button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        data-testid="theme-toggle"
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      >
        <ThemeIcon theme={theme} />
      </button>
    </div>
  );
}
