/**
 * What someone in a dev container or Codespace has to do to open the viewer, if anything.
 *
 * The browser is outside the container, so the viewer is only reachable once its port is
 * forwarded. VS Code forwards the ports a terminal prints, but this server is started by an
 * agent and its output never reaches a terminal, and a free port changes on every start.
 * Pinning the port lets devcontainer.json forward it ahead of time.
 *
 * Returned rather than only logged: most MCP clients hide a server's stderr, so the text
 * also rides along with get_viewer_url, where the agent passes it on.
 */
export function forwardingHint(
  requestedPort: number,
  boundPort: number,
  forwarded: boolean,
): string | undefined {
  if (!forwarded) return undefined;
  if (requestedPort !== 0 && requestedPort === boundPort) {
    return `Detected a container environment; viewer is on port ${boundPort}. If needed, forward it manually.`;
  }
  if (requestedPort === 0) {
    return [
      `Detected a container environment; port ${boundPort} may not be automatically forwarded. Forward it if needed.`,
      'Pass --port <port> to request a fixed port on each start.',
    ].join('\n');
  }
  return [
    `Detected a container environment; port ${requestedPort} is busy, so using ${boundPort}. Forward it if needed.`,
    'Pass --port <free-port> to request a fixed port on each start.',
  ].join('\n');
}
