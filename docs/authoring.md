# Authoring walkthroughs

## Step markers

Markers go on their own line. Mermaid treats them as comments, so the diagram still
renders correctly in GitHub, VS Code, or anywhere else.

```text
flowchart TD
  %% @step:start user-entry
  User[User] --> Login[Login Page]
  %% @step:end user-entry
```

Regions may be **nested**, **overlapped**, or **repeated**. Repeating an id is how you
document something the diagram does more than once — an auth handshake before every
request, say — and every occurrence highlights together.

## Step documentation

The id is the first token after `##`; if the rest begins with `- `, that is the title.

```markdown
## user-entry - User arrives
```

Everything before the first `##` is the diagram overview, shown before step 1. Use `###`
or deeper for subsections inside a step body. Ordinary Markdown works throughout — code
blocks, tables, links.

The document title comes from the optional YAML frontmatter, and falls back to the file
name:

```markdown
---
title: Sign-in flow
---
```

## Phases

Group steps into phases with an optional comment under the heading:

```markdown
## user-entry - User arrives
<!-- @phase Authentication -->
```

A phase is a label, not a hierarchy: the same phase can tag any steps, in any order.

## Editing by hand

Inserting a marker shifts every line below it, so writing several steps by hand tends to
corrupt the ranges. The [CLI](cli.md) and the [MCP tools](mcp.md) adjust the line numbers
for you.
