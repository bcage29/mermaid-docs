import { useEffect, useState } from 'react';
import { STATIC_DEMO } from '../staticExamples.js';

export type ConnectionStatus = 'connecting' | 'live' | 'lost';
type ChangeListener = (id: string) => void;

/**
 * One EventSource shared by the whole app.
 *
 * Every hook that cares about disk changes reads this connection, so the open diagram and
 * the diagram list reload together and agree on whether the server is still there.
 *
 * The status matters: the viewer is served on an ephemeral port, so restarting the server
 * moves it. A tab left on the old port keeps rendering its last state and silently stops
 * updating, which looks exactly like broken live reload. The header says so instead.
 */
const changeListeners = new Set<ChangeListener>();
const statusListeners = new Set<(status: ConnectionStatus) => void>();
let source: EventSource | undefined;
let status: ConnectionStatus = STATIC_DEMO ? 'live' : 'connecting';

function setStatus(next: ConnectionStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of statusListeners) listener(next);
}

function connect(): void {
  if (STATIC_DEMO || source) return;
  source = new EventSource('/api/events');
  source.onopen = () => setStatus('live');
  // The browser reconnects on its own; a server that moved never answers, so this stays.
  source.onerror = () => setStatus('lost');
  source.addEventListener('changed', (event) => {
    const { name } = JSON.parse((event as MessageEvent<string>).data) as { name: string };
    for (const listener of changeListeners) listener(name);
  });
}

/** Run a callback whenever a diagram changes on disk. */
export function useChanges(onChange: ChangeListener): void {
  useEffect(() => {
    connect();
    changeListeners.add(onChange);
    return () => {
      changeListeners.delete(onChange);
    };
  }, [onChange]);
}

/** Whether the live-reload connection is still up. */
export function useConnectionStatus(): ConnectionStatus {
  const [current, setCurrent] = useState<ConnectionStatus>(status);
  useEffect(() => {
    connect();
    statusListeners.add(setCurrent);
    setCurrent(status);
    return () => {
      statusListeners.delete(setCurrent);
    };
  }, []);
  return current;
}
