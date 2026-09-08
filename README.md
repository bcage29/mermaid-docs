# Mermaid Docs

[![npm](https://img.shields.io/npm/v/mermaid-docs)](https://www.npmjs.com/package/mermaid-docs)

Turn any Mermaid diagram into a guided, step-by-step walkthrough — and let your coding
agent write the documentation.

```bash
npx mermaid-docs ./docs      # or the short alias: npx mmdocs ./docs
```

Opens a viewer on a free port. Step through a diagram and each step shows its
documentation, lights up the arrows it describes, and highlights the exact `.mmd` source
lines it refers to. Click any arrow, or any source line, to jump to the step that explains
it. Light and dark themes follow your OS until you pick one.

## Why

A Mermaid diagram in a repo is a static picture. There's no good way to explain *how to
read it* — "the request arrives here, then the token is validated there" — while pointing
at the part you mean. mmdocs adds that layer without taking the diagram hostage: the
output is two ordinary files you can read, diff and review.

## The format

Every diagram is two sibling files sharing a basename:

```
docs/auth/
  auth-flow.mmd    the diagram, plus step region markers
  auth-flow.md     all documentation for that diagram
```

**Regions** in the `.mmd` mark what each step highlights. They're Mermaid comments, so the
diagram still renders normally in GitHub, VS Code and the Mermaid live editor:

```
flowchart TD
  %% @step:start user-entry
  User[User] --> Login[Login Page]
  %% @step:end user-entry
```

A step can be marked in **more than one place**. Repeat the id wherever it applies and
every occurrence highlights together — useful when one step describes something the diagram
does repeatedly, like an auth block that runs before each request.

**Sections** in the `.md` carry the prose. The step id is the first token of an `h2`, so
the link between the two files is visible to anyone reading the doc:

```markdown
## user-entry - User arrives

The user hits `/login`. No session cookie is present yet.
```

An optional **phase** tags a step and groups the walkthrough. It's a comment, so tagging a
step never means moving it, and it renders as nothing wherever the `.md` is read:

```markdown
## user-entry - User arrives
<!-- @phase Authentication -->
```

The same phase may appear on any steps, in any order, with others in between.

The id is the first whitespace-delimited token; if the rest begins with `- `, that's the
title. Ids may contain hyphens (`## auth-one-test - Authentication` → id `auth-one-test`).

Regions may nest and overlap. Text before the first `h2` is the diagram overview. Every
`h2` declares a step, so use `h3` or deeper for subsections inside one.

## Use it with an agent

Register the MCP server and talk to your agent normally — it learns the format from the
server's instructions, so you don't have to explain it.

```json
{
  "servers": {
    "mmdocs": {
      "command": "npx",
      "args": ["-y", "mermaid-docs", "mcp", "${workspaceFolder}/docs"]
    }
  }
}
```

> "Document the auth flow diagram as a walkthrough."

The server runs the viewer too, so edits appear in your open browser immediately —
whether they come from the agent, the CLI, or you editing the files by hand.

**Tools:** `list_diagrams`, `get_diagram`, `list_connections`, `create_diagram`, `set_step`,
`delete_step`, `reorder_steps`, `validate_diagram`, `get_viewer_url`.

Prefer `set_step` over editing the files directly: it keeps the marker pair and the
documentation section in sync, and handles the line arithmetic. Inserting a marker shifts
every line below it, so writing several steps by hand usually corrupts the ranges.

`list_connections` shows every arrow the diagram draws and which step covers it, so an
agent can see what it has not explained yet. `validate_diagram` reports the same thing as
a count.

## CLI

```bash
mmdocs <folder>                  # serve the viewer (127.0.0.1 only)
mmdocs <folder> --lan            # also listen on the local network, e.g. to test on a phone
mmdocs mcp <folder>              # MCP server over stdio, plus the viewer
mmdocs validate <folder>         # check markers, ids and coverage; exits 1 on errors
mmdocs init <diagram.mmd>        # create the sibling .md
mmdocs set-step <diagram.mmd> --id token-issue --title "Token is issued" \
    --body "..." --start 11 --end 12
mmdocs delete-step <diagram.mmd> --id token-issue
```

`mmdocs validate` works as a CI gate, and as a way for an agent to check its own work
after editing the files directly.

## Keyboard

| Key | Action |
| --- | --- |
| `→` / `j` | Next step |
| `←` / `k` | Previous step |
| `Home` / `End` | First / last step |
| `` ` `` | Toggle the source panel |
| `f` | Toggle zoom-to-step |
| `F` | Toggle fullscreen |
| `Esc` | Clear a selected line |

Every step is deep-linkable: `#/<diagram>/<step-id>`, e.g. `#/auth-flow/token-issue`.

A diagram is addressed by its **file name**, never its path. mmdocs scans the folder you
point it at and one level below, so folders sort your diagrams without lengthening their
names. Names must be unique across the workspace — `mmdocs validate` fails on a clash, and
the picker flags it.

The panels all drag to resize, and the steps panel collapses to a tab down the left edge.

## Notes and limits

- **A step emphasises the connections it draws**, in the diagram and in the source panel.
  Flowchart links and sequence messages are highlighted and clickable; every other diagram
  type is left untouched rather than partly highlighted, and the source panel works for
  all of them.
- **`mmdocs validate` reports coverage**: how many of the arrows a diagram draws belong to
  no step. It's a warning, not an error, so it never fails a build on its own.
- The viewer is **read-only**. All writes go through the MCP tools, the CLI, or your
  editor; the browser reflects them live.
- The server binds to `127.0.0.1` only, and refuses diagram paths that escape the root.
  `--lan` (or `--host`) widens that to the local network for testing on another device.
  There is no authentication, so only use it on a network you trust.

## Development

```bash
npm install
npm run dev        # hot-reloading viewer, API and file watcher included
npm run build      # tsup (node) + vite (viewer)
npm test           # vitest, incl. MCP integration over stdio
npm run test:e2e   # playwright against the CLI-started server
```

`npm run dev` is the only mode that hot-reloads. It gives all three paths at once:

- **Viewer source** (`src/web/**`) - Vite Fast Refresh applies the change in place.
- **Server source** (`src/server/**`, `src/core/**`) - Vite restarts itself, keeping the
  same URL.
- **Diagram files** (the `.mmd`/`.md` being documented) - the workspace watcher pushes
  a `changed` event over SSE; the browser refetches that diagram and the diagram list, so
  edits, new files and deletions all land without a page reload.

It documents `examples/` by default; point it elsewhere with `MMDOCS_ROOT=../my-docs npm
run dev`. The API is mounted as Vite middleware, so it shares the dev server's port and a
change to the server's own source restarts it in place - see
[`vite-plugin-api.ts`](vite-plugin-api.ts).

**A server started with `mmdocs serve` (or by the MCP server) serves the built bundle from
`dist/web`.** Diagram edits still live-reload there, but changes to the viewer's own source
need `npm run build` and a browser reload. That server also takes a fresh ephemeral port
each time it restarts, so a tab left on the old address goes quiet - the header says
`Not live · reload` when its event stream drops.

## License

MIT

Not affiliated with the [Mermaid](https://mermaid.js.org) project. Mermaid is published by
its maintainers under `@mermaid-js/*`.
