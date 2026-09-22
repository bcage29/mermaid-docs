import { startServer } from '../../server/http.js';
import { watchWorkspace } from '../../server/watch.js';
import { isDirectory } from '../../server/workspace.js';
import { diagramName } from '../../core/route.js';

export interface ServeOptions {
  root: string;
  flags: Record<string, string | boolean>;
}

/** Open a URL in the default browser without taking a dependency. */
async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import('node:child_process');
  // Inside a container or a remote session there is no browser to launch, so VS Code puts
  // a helper in BROWSER that opens the page on the machine the user is sitting at.
  const command =
    process.env.BROWSER ||
    (process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open');
  try {
    const child = spawn(command, [url], {
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    });
    // A missing opener is reported asynchronously, and an unhandled 'error' event would
    // take the server down with it. Container images rarely ship xdg-open.
    child.on('error', () => {});
    child.unref();
  } catch {
    // Not being able to open a browser is not worth failing the command over.
  }
}

export async function runServe({ root, flags }: ServeOptions): Promise<void> {
  if (!(await isDirectory(root))) {
    throw new Error(`Not a directory: ${root}`);
  }

  const port = typeof flags.port === 'string' ? Number(flags.port) : 0;
  // --host 0.0.0.0 (or --lan) exposes the viewer to the local network. There is no
  // authentication, so this is opt-in and announced.
  const host =
    typeof flags.host === 'string' ? flags.host : flags.lan === true ? '0.0.0.0' : '127.0.0.1';
  const allowedHosts =
    typeof flags['allow-host'] === 'string'
      ? flags['allow-host'].split(',').map((entry) => entry.trim())
      : [];
  const handle = await startServer(root, Number.isFinite(port) ? port : 0, host, allowedHosts);
  const watcher = watchWorkspace(root, (ids) => {
    for (const id of ids) handle.broadcast('changed', { name: diagramName(id) });
  });

  process.stdout.write(`mermaid-docs serving ${root}\n${handle.url}\n`);
  if (handle.host !== '127.0.0.1' && handle.host !== 'localhost') {
    process.stdout.write(
      `Reachable by anyone on this network. It serves every .mmd and .md under ${root}.\n`,
    );
  }
  if (flags.open !== false && flags['no-open'] !== true) await openBrowser(handle.url);

  const shutdown = async () => {
    await watcher.close();
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
