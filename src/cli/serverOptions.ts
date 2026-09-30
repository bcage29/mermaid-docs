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
  // --host 0.0.0.0 (or --lan) exposes the viewer to the local network. There is no
  // authentication, so this is opt-in and announced.
  const host =
    typeof flags.host === 'string' ? flags.host : flags.lan === true ? '0.0.0.0' : '127.0.0.1';
  const allowedHosts =
    typeof flags['allow-host'] === 'string'
      ? flags['allow-host'].split(',').map((entry) => entry.trim())
      : [];
  return { port: Number.isInteger(port) && port >= 0 ? port : 0, host, allowedHosts };
}
