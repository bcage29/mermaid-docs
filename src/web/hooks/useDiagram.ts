import { useCallback, useEffect, useState } from 'react';
import { buildHash, parseHash } from '../../core/route.js';
import type { Route } from '../../core/route.js';
import { useChanges } from './useEvents.js';
import type { Diagram, DiagramSummary } from '../types.js';

export type { Route };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** The diagram list, refreshed whenever the workspace changes. */
export function useDiagramList(): { diagrams: DiagramSummary[]; error?: string; reload: () => void } {
  const [diagrams, setDiagrams] = useState<DiagramSummary[]>([]);
  const [error, setError] = useState<string>();

  const reload = useCallback(() => {
    getJson<DiagramSummary[]>('/api/diagrams')
      .then((list) => {
        setDiagrams(list);
        setError(undefined);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(reload, [reload]);
  // Any write may have added or removed a file, so the list follows the watcher too -
  // a diagram created while the viewer is open appears without a page reload.
  useChanges(reload);

  return { diagrams, ...(error !== undefined ? { error } : {}), reload };
}

/** A single diagram, reloaded when the watcher reports it changed on disk. */
export function useDiagram(name: string | undefined): {
  diagram?: Diagram;
  error?: string;
  loading: boolean;
} {
  const [diagram, setDiagram] = useState<Diagram>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const load = useCallback((diagramName: string) => {
    setLoading(true);
    getJson<Diagram>(`/api/diagrams/${encodeURIComponent(diagramName)}`)
      .then((d) => {
        setDiagram(d);
        setError(undefined);
      })
      .catch((e: unknown) => {
        setDiagram(undefined);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!name) {
      setDiagram(undefined);
      return;
    }
    load(name);
  }, [name, load]);

  // Live reload: the agent or the user's editor writes the files, the watcher tells us.
  useChanges(
    useCallback((changed: string) => {
      if (name && changed === name) load(name);
    }, [name, load]),
  );

  return { ...(diagram !== undefined ? { diagram } : {}), ...(error !== undefined ? { error } : {}), loading };
}

export function useRoute(): [Route, (next: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((next: Route) => {
    const hash = next.name ? buildHash(next.name, next.stepId) : '';
    if (hash === window.location.hash) return;

    // Stepping replaces rather than pushes: walking a 27-step diagram should not bury the
    // back button under 27 entries. Switching diagram still pushes, so Back leaves it.
    if (parseHash(window.location.hash).name === next.name) {
      history.replaceState(null, '', hash || window.location.pathname);
      // replaceState fires no hashchange, so the listener will not do this for us.
      setRoute(next);
      return;
    }
    window.location.hash = hash;
  }, []);

  return [route, navigate];
}
