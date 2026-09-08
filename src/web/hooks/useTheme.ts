import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'mmdocs:theme';

/**
 * One theme shared by the whole app.
 *
 * Mermaid renders the diagram with its own palette, so the canvas has to re-render when
 * this changes - a module-level store keeps that in step with the CSS variables instead of
 * each component holding its own copy.
 */
const listeners = new Set<(theme: Theme) => void>();

function preferred(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

let current: Theme = preferred();
document.documentElement.dataset.theme = current;

export function setTheme(next: Theme): void {
  if (current === next) return;
  current = next;
  document.documentElement.dataset.theme = next;
  localStorage.setItem(STORAGE_KEY, next);
  for (const listener of listeners) listener(next);
}

export function useTheme(): Theme {
  const [theme, setLocal] = useState(current);
  useEffect(() => {
    listeners.add(setLocal);
    setLocal(current);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);
  return theme;
}
