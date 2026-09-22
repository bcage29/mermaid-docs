import { watch as chokidarWatch } from 'chokidar';
import { relative, sep } from 'node:path';

export interface Watcher {
  close(): Promise<void>;
}

/**
 * Watch the workspace for diagram and documentation changes.
 *
 * Writes land from several places at once - an MCP tool, a CLI command, the user's editor -
 * so changes are debounced and reported by diagram id.
 */
export function watchWorkspace(root: string, onChange: (ids: string[]) => void): Watcher {
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;

  const flush = () => {
    timer = undefined;
    if (pending.size === 0) return;
    const ids = [...pending];
    pending.clear();
    onChange(ids);
  };

  const watcher = chokidarWatch(root, {
    ignoreInitial: true,
    ignored: (path) => /(^|[\\/])(node_modules|\.git|dist|build|coverage)([\\/]|$)/.test(path),
    // A bind mount into a container - a Dev Container on macOS or Windows - delivers no
    // file events at all, so the viewer would sit there never reloading. Polling costs
    // CPU on a large workspace, so it is asked for rather than guessed at: chokidar reads
    // CHOKIDAR_USEPOLLING itself and overrides anything set here, so passing it again
    // would only turn off atomic-write normalization as a side effect.
    interval: 300,
  });

  const queue = (path: string) => {
    if (!/\.(mmd|md)$/i.test(path)) return;
    // Both files map to the same diagram, keyed by the .mmd path.
    const id = relative(root, path).split(sep).join('/').replace(/\.md$/i, '.mmd');
    pending.add(id);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 100);
  };

  watcher.on('add', queue).on('change', queue).on('unlink', queue);

  // An unreadable or unwatchable entry - a stale socket, a directory the user cannot open -
  // is one file the viewer will not live-reload, not a reason to take the process down.
  // Without a listener the EventEmitter rethrows, which kills the MCP server mid-session.
  watcher.on('error', (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mermaid-docs: watch error, continuing without it: ${message}\n`);
  });

  return {
    async close() {
      if (timer) clearTimeout(timer);
      await watcher.close();
    },
  };
}
