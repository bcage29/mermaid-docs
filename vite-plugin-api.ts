import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { createApi } from './src/server/http.js';
import { watchWorkspace } from './src/server/watch.js';

/**
 * Run the viewer's API inside `npm run dev`, so one command gives both hot-reload paths:
 * Vite's Fast Refresh for the React source, and the workspace watcher pushing `changed`
 * events over SSE for the .mmd/.md files being documented.
 *
 * Mounted as middleware rather than as a second HTTP server behind a proxy: Vite restarts
 * in-process whenever this file or anything it imports changes, and it reuses its own
 * listening socket, so a server of ours would be left holding its port with nothing to
 * release it.
 *
 * Workspace: MMDOCS_ROOT, defaulting to the checked-in examples.
 */
export function mmdocsApi(): Plugin {
  const root = resolve(process.env.MMDOCS_ROOT ?? 'examples');

  return {
    name: 'mmdocs-api',
    apply: 'serve',
    configureServer(server) {
      const api = createApi(root);
      const watcher = watchWorkspace(root, (ids) => {
        for (const id of ids) api.broadcast('changed', { id });
      });

      server.middlewares.use((req, res, next) => {
        api.handle(req, res).then((handled) => {
          if (!handled) next();
        }, next);
      });

      server.config.logger.info(`  ➜  Diagrams: ${root}`);
      server.httpServer?.once('close', () => void watcher.close());
    },
  };
}
