import { UserInputError } from '../core/errors.js';

export interface ServerOptions {
  port: number;
  host: string;
  allowedHosts: string[];
}

/**
 * Where the viewer listens, from the flags `serve` and `mcp` share.
 *
 * MERMAID_DOCS_PORT stands in for --port, because some MCP clients make an environment
 * variable easier to set than an argument. Without either, the port is a free one.
 */
export function serverOptions(
  flags: Record<string, string | boolean>,
  env: NodeJS.ProcessEnv = process.env,
): ServerOptions {
  const rawPort = typeof flags.port === 'string' ? flags.port : env.MERMAID_DOCS_PORT;
  const port = rawPort ? Number(rawPort) : 0;
  if (flags.lan !== undefined) {
    throw new UserInputError(
      '--lan was removed in 0.4.0: the viewer has no authentication, so it only listens on loopback. ' +
        'To open it from elsewhere, forward the port with VS Code, or put a tunnel in front and name it with --allow-host.',
    );
  }
  const host = typeof flags.host === 'string' ? flags.host : '127.0.0.1';
  const allowedHosts =
    typeof flags['allow-host'] === 'string'
      ? flags['allow-host'].split(',').map((entry) => entry.trim())
      : [];
  return { port: Number.isInteger(port) && port >= 0 ? port : 0, host, allowedHosts };
}
