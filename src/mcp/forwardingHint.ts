/** The port the setup snippet suggests pinning, when none was asked for. */
const SUGGESTED_PORT = 4747;

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
    return (
      `Running in a container: the viewer is on port ${boundPort}. If the link does not open, ` +
      `add ${boundPort} to "forwardPorts" in .devcontainer/devcontainer.json and rebuild the ` +
      'container, or forward it from the Ports panel.'
    );
  }
  const port = requestedPort || SUGGESTED_PORT;
  const cause =
    requestedPort === 0
      ? `port ${boundPort} was picked at random and changes on every start`
      : `port ${requestedPort} was in use, so it fell back to port ${boundPort}`;
  return [
    `Running in a container: ${cause}, so it may not be forwarded to your machine.`,
    `To open it now, forward port ${boundPort} from the Ports panel.`,
    `To fix it for good, pin the port${requestedPort === 0 ? '' : ' (a free one)'} in the MCP server config:`,
    `  "args": ["-y", "mermaid-docs", "mcp", "./docs", "--port", "${port}"]`,
    'and forward it in .devcontainer/devcontainer.json, then rebuild the container:',
    `  "forwardPorts": [${port}]`,
  ].join('\n');
}
