# Getting started

A walkthrough is two files with the same basename — the diagram, and its documentation:

```text
docs/
  hello.mmd
  hello.md
```

**`docs/hello.mmd`** — wrap the lines a step is about in `@step` comments:

```text
flowchart LR
  %% @step:start request
  Client[Browser] --> API[API]
  %% @step:end request

  %% @step:start store
  API --> DB[(Database)]
  %% @step:end store
```

**`docs/hello.md`** — one `##` heading per step, starting with the matching id:

```markdown
---
title: Hello
---

What this diagram shows, before the first step.

## request - The browser calls the API

A plain `GET`, no auth yet.

## store - The API writes to the database

One row per request, so a replay can be reconstructed later.
```

Then open the viewer:

```bash
npx mermaid-docs docs
```

It serves on a free port on `127.0.0.1` and opens your browser. Edits to either file show
up immediately — no restart.

Requires Node.js 20 or newer.

## Next

- [Authoring walkthroughs](authoring.md) for the full marker and documentation format.
- [MCP server](mcp.md) to hand the writing to your coding agent instead.
