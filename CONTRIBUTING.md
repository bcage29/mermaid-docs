# Contributing

Issues and pull requests are welcome. The viewer's rendering, highlighting, and pan/zoom
code depends on several non-obvious details of Mermaid's output and of the pan/zoom
library; if you are changing that area, open an issue first so we can point you at the
constraints before you spend time on it.

## Reporting issues

For a bug, include the diagram that triggers it and the steps to reproduce. A `.mmd` and
`.md` pair that shows the problem is worth more than a description of it.

For a feature, open an issue describing the problem you are trying to solve before
writing code, so the approach can be agreed on first.

## Setup

Node.js 20 or newer.

```bash
npm install
npm run dev          # viewer against examples/, with live reload
```

Set `MERMAID_DOCS_ROOT` to point `npm run dev` at a different folder:

```bash
MERMAID_DOCS_ROOT=../my-project/docs npm run dev
```

It defaults to `examples/`, and a relative path resolves against the directory you run
the command from.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server for the viewer |
| `npm run build` | Build the Node entry points (`tsup`) and the web bundle (`vite`) |
| `npm run build:pages` | Static build with `examples/` bundled in, for GitHub Pages |
| `npm test` | Unit tests (`vitest`) |
| `npm run test:e2e` | End-to-end tests (`playwright`) |
| `npm run typecheck` | `tsc --noEmit` |

CI runs `typecheck`, `build`, and `test` on Node 20, 22, and 24, plus the Playwright
suite on Node 22. Please make sure those pass locally before opening a pull request.

## Pull requests

Fork the repository, branch from `main`, and open a pull request from your fork. For
anything larger than a bug fix, open an issue first so the approach can be agreed on
before you spend time on it.

Keep each pull request to a single change, and explain the reasoning in the description
rather than only what changed. Add a test for anything that fixes a bug or adds
behaviour. Workflow changes and dependency bumps are reviewed more slowly, since they
touch the release path.

## Layout

```text
src/core/     Format parsing, validation, and mutation. No DOM, shared with the MCP server.
src/cli/      The mermaid-docs command.
src/mcp/      MCP server: tools, prompt, and the instructions the agent is taught.
src/server/   Local HTTP server, workspace scanning, file watching.
src/web/      The React viewer.
```

`src/core/route.ts` holds the viewer's URL format and is deliberately in `core` rather
than in a hook: the MCP server builds the same links and has no DOM.

## License

By contributing, you agree that your contributions will be licensed under the project's
[MIT license](LICENSE).
