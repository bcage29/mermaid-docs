# MCP server

The MCP server is the reason this is more than a viewer. It teaches your coding agent the
file format on connect, and gives it tools to create diagrams, write and reorder steps,
check that every arrow is covered, and link you straight to the right step in the viewer.

## Claude Code

```bash
claude mcp add --scope project --transport stdio mermaid-docs -- \
  npx -y mermaid-docs mcp ./docs
```

Start Claude Code, approve the project server, and check it with `/mcp`.

## VS Code

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "mermaid-docs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mermaid-docs", "mcp", "${workspaceFolder}/docs"]
    }
  }
}
```

Run **MCP: List Servers** from the Command Palette, start `mermaid-docs`, and approve it.

## Cursor, Windsurf, Zed, and other clients

Most other clients use the `mcpServers` key:

```json
{
  "mcpServers": {
    "mermaid-docs": {
      "command": "npx",
      "args": ["-y", "mermaid-docs", "mcp", "./docs"]
    }
  }
}
```

## Then ask

> Document the auth flow diagram as a walkthrough.

The server runs the viewer alongside it, so the agent can send you a link to the exact
step it just wrote.

## Tools the agent gets

| Tool | What it does |
| --- | --- |
| `list_diagrams` | Every diagram in the workspace, with its step count |
| `get_diagram` | A diagram, its documentation, and its steps with line ranges |
| `list_connections` | Every arrow the diagram draws, and which step covers it |
| `create_diagram` | A new `.mmd` and its documentation file |
| `set_step` | Create or update a step, keeping marker and prose in sync |
| `delete_step` | Remove a step's marker pair and its section |
| `reorder_steps` | Set the walkthrough order |
| `validate_diagram` | Errors and coverage gaps |
| `get_viewer_url` | A link, optionally deep-linked to a diagram and step |

Plus a `document-diagram` prompt that walks a whole diagram end to end.

Prefer `set_step` over editing files directly: inserting a marker shifts every line below
it, so writing several steps by hand tends to corrupt the ranges.
