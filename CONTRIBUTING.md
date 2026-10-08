# Contributing

Issues and pull requests are welcome. The viewer's rendering, highlighting, and pan/zoom
code depends on several non-obvious details of Mermaid's output and of the pan/zoom
library; if you are changing that area, open an issue first so we can point you at the
constraints before you spend time on it.

## Reporting issues

Report security problems privately, as described in [SECURITY.md](SECURITY.md), and not
in a public issue.

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
| `npm test` | Unit tests (`vitest`) |
| `npm run test:e2e` | End-to-end tests (`playwright`) |
| `npm run typecheck` | `tsc --noEmit` |

CI runs `typecheck`, `build`, and `test` on Node 20, 22, and 24, plus the Playwright
suite on Node 22. Please make sure those pass locally before opening a pull request.

### Dependency audit

CI also runs `npm audit`. It fails on any advisory rated high or critical
(`npm audit --audit-level=high`) and reports lower ones as a warning. Dev dependencies are
gated too, because they are not only tooling: mermaid, React, and their dependencies are
bundled into the viewer that ships in `dist/web`. `npm audit signatures` checks the
registry signatures of everything installed.

When a gating advisory has no fix:

1. If a patched version of the affected transitive package exists, force it with
   `overrides` in `package.json` and note the advisory in the commit message.
2. If none exists, open an issue that records the advisory, whether mermaid-docs can
   reach the vulnerable code, and what is being waited on upstream. A maintainer may
   merge past the failing check while that issue is open. Close it, and remove any
   override, once upstream ships a fix.

### The lockfile is `npm-shrinkwrap.json`

There is no `package-lock.json`. The lockfile is published as `npm-shrinkwrap.json`, which
npm honours when users install the package, so their install resolves exactly the runtime
dependency tree CI tested, transitive dependencies included, rather than whatever the
semver ranges in `package.json` match on the day. CI fails if the packed tarball does not
contain it. `npm install` and Dependabot update it the same way they would update
`package-lock.json`.

We chose this over the alternatives because:

- Bundling the runtime dependencies into `dist/` gives the same guarantee, but makes the
  package larger and requires shipping third-party licence notices.
- Pinning only the direct dependencies to exact versions leaves every transitive
  dependency floating, and that is where most of the tree is.

The cost is that a security fix in a dependency reaches users only through a new
mermaid-docs release. When Dependabot or `npm audit` flags a runtime dependency, merge
the fix and cut a patch release instead of waiting for the next feature release.
Package managers other than npm may ignore the shrinkwrap; a user installing with them
gets the ranges in `package.json`, as before.

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
