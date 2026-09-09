import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { useTheme } from './useTheme.js';

let configured: string | undefined;

/** Re-initialising is how Mermaid's palette is changed; it merges into the existing config. */
function initMermaid(theme: 'default' | 'dark'): void {
  if (configured === theme) return;
  configured = theme;
  mermaid.initialize({
    startOnLoad: false,
    theme,
    securityLevel: 'strict',
    // Mermaid otherwise writes an inline max-width onto the <svg>, which caps how far the
    // diagram can grow and makes zoom appear stuck well below the configured maximum.
    flowchart: { useMaxWidth: false, htmlLabels: true },
    sequence: { useMaxWidth: false },
    er: { useMaxWidth: false },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false },
  });
}

export interface RenderState {
  svg: string;
  error?: string;
}

/**
 * Render Mermaid source to an SVG string.
 *
 * Rendering is keyed on the source and the theme, never on the selected step: stepping
 * only toggles classes on the already-rendered SVG, so next/prev stays instant.
 */
export function useMermaidRender(mmd: string | undefined, id: string): RenderState {
  const [state, setState] = useState<RenderState>({ svg: '' });
  const counter = useRef(0);
  const theme = useTheme();

  useEffect(() => {
    if (!mmd) {
      setState({ svg: '' });
      return;
    }
    initMermaid(theme === 'light' ? 'default' : 'dark');
    let cancelled = false;
    const renderId = `mermaid-docs-${(counter.current += 1)}`;

    mermaid
      .render(renderId, mmd)
      .then(({ svg }) => {
        if (cancelled) return;
        // Strip the inline max-width so the SVG can scale past its container when zoomed.
        setState({ svg: svg.replace(/style="max-width:[^"]*"/g, 'style="max-width:none"') });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ svg: '', error: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      cancelled = true;
    };
  }, [mmd, id, theme]);

  return state;
}
