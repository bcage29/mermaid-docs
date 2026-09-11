# Viewer

![The viewer on a sequence diagram: one step's messages highlighted in blue while the rest of the flow is dimmed, with the step's documentation beside it](../assets/viewer.png)

## Keyboard

| Key | Action |
| --- | --- |
| `→` / `j` | Next step |
| `←` / `k` | Previous step |
| `Home` / `End` | First / last step |
| `` ` `` | Toggle the source panel |
| `f` | Toggle zoom-to-step |
| `F` | Toggle fullscreen |

## What works where

Connection highlighting needs to know what a diagram draws, so it covers **flowcharts**
(`flowchart` / `graph`), **sequence diagrams**, and **architecture diagrams**
(`architecture-beta`). Every other Mermaid diagram type still renders, and its **source
lines still highlight**; the diagram itself is simply left alone rather than partly
emphasised.

## Limits

- Diagram file names must be unique within the scanned folder and its direct subfolders.
- Diagram files, sibling documentation, and directories below the workspace root must not
  be symbolic links. The selected root itself may be one. Path checks do not sandbox a
  workspace against concurrent changes by untrusted local processes.
- The viewer is read-only. Edit through your editor, the [CLI](cli.md), or the
  [MCP tools](mcp.md).
- The server binds to `127.0.0.1`. `--lan` has no authentication — use it only on a
  network you trust.
- Requires Node.js 20 or newer.
