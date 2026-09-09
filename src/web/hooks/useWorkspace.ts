import { useEffect, useState } from 'react';
import { STATIC_DEMO } from '../staticExamples.js';

export interface Workspace {
  /** Display name of the selected workspace, without its parent directories. */
  root: string;
  /** The viewer assets on disk are newer than the running server. */
  stale: boolean;
}

/**
 * Which workspace this viewer is serving.
 *
 * Worth showing: several viewers on several ports look identical otherwise, and a server
 * left running across a rebuild serves a new UI from an old API.
 */
export function useWorkspace(): Workspace | undefined {
  const [workspace, setWorkspace] = useState<Workspace | undefined>(
    STATIC_DEMO ? { root: 'Bundled examples', stale: false } : undefined,
  );

  useEffect(() => {
    if (STATIC_DEMO) return;
    fetch('/api/workspace')
      .then((res) => (res.ok ? (res.json() as Promise<Workspace>) : undefined))
      .then(setWorkspace)
      .catch(() => undefined);
  }, []);

  return workspace;
}
