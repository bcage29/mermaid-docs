<img src="assets/mermaid-docs-icon-branch-transparent-512.png" alt="" width="72" align="left" hspace="12">

# Mermaid Docs

**Turn a Mermaid diagram into a guided walkthrough.**

[![npm](https://img.shields.io/npm/v/mermaid-docs?color=%230b7285)](https://www.npmjs.com/package/mermaid-docs)
[![CI](https://github.com/bcage29/mermaid-docs/actions/workflows/ci.yml/badge.svg)](https://github.com/bcage29/mermaid-docs/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/mermaid-docs)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/mermaid-docs?color=%230b7285)](LICENSE)

Mark regions of the diagram as steps, describe each one in Markdown, and the viewer plays
them back a step at a time — highlighting the connections that step is about, the source
lines that draw them, and the prose that explains them.

```bash
npx mermaid-docs ./docs
```

<p align="center">
  <img src="assets/walkthrough.gif" alt="Stepping through a sign-in flow: each step highlights the messages it explains and frames them, then the source panel opens and follows along, highlighting the lines that draw them" width="100%">
</p>

<p align="center">
  <a href="https://bcage29.github.io/mermaid-docs/"><b>Try the live demo →</b></a>
</p>

## Why

A Mermaid diagram shows the whole system at once. That is what makes it a good reference
and a poor explanation — a newcomer sees twenty arrows and no idea which three matter
first.

Mermaid Docs adds the narration track. The diagram stays an ordinary `.mmd` file that
renders anywhere, because the steps are written as Mermaid comments. What you get on top
is an order to read it in, and a viewer that dims everything you are not being told about
yet.

## How it looks in your repo

Two files with the same basename. Wrap the lines a step is about in `@step` comments —
Mermaid reads them as comments, so the diagram still renders anywhere:

```text
flowchart LR
  %% @step:start request
  Client[Browser] --> API[API]
  %% @step:end request
```

Then write one `##` section per step, starting with the matching id:

```markdown
## request - The browser calls the API

A plain `GET`, no auth yet.
```

Point the viewer at the folder and it plays back, a step at a time. Edits to either file
show up immediately — no restart.

→ [Getting started](docs/getting-started.md)

## Let an agent write it

Mermaid Docs ships an MCP server that teaches your coding agent the format on connect, and
gives it tools to write, reorder, and validate steps, and to link you straight to the one
it just wrote. So the whole job can be one sentence:

> Document the auth flow diagram as a walkthrough.

→ [MCP server setup](docs/mcp.md)

![The viewer on a sequence diagram: one step's messages highlighted in blue while the rest of the flow is dimmed, with the step's documentation beside it](assets/viewer.png)

## Documentation

| Page | |
| --- | --- |
| [Getting started](docs/getting-started.md) | The two files, and opening the viewer |
| [Authoring walkthroughs](docs/authoring.md) | Markers, step documentation, phases |
| [MCP server](docs/mcp.md) | Agent setup, and the tools it gets |
| [CLI](docs/cli.md) | Every command, and validating in CI |
| [Viewer](docs/viewer.md) | Shortcuts, supported diagram types, limits |
| [Privacy](docs/privacy.md) | What leaves your machine |

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the
development setup and the design decisions behind the viewer.

## License

[MIT](LICENSE) © Brennen Cage
