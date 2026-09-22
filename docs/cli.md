# CLI

```bash
mermaid-docs <folder>                  # Open the viewer
mermaid-docs <folder> --lan            # Also serve on the local network
mermaid-docs mcp <folder>              # Start the MCP server and the viewer
mermaid-docs validate <folder>         # Validate every diagram
mermaid-docs init <diagram.mmd>        # Create its Markdown file
mermaid-docs set-step <diagram.mmd> --id token-issue --title "Token is issued" \
    --body "..." --start 11 --end 12
mermaid-docs delete-step <diagram.mmd> --id token-issue
```

Run `mermaid-docs --help` for every option.

## In a container

Dev Containers and Codespaces are handled without configuration: the browser runs outside
the container and reaches the viewer on whatever port the forwarder chose, and
`mermaid-docs` accepts that instead of insisting on the port it bound. Codespaces' own
forwarding domain is trusted the same way. Set `MERMAID_DOCS_FORWARDED=1` (or `0`) if a
setup is misread.

Any other proxy or tunnel in front of the viewer has to be named, or its requests are
refused as if they came from an attacker:

```bash
mermaid-docs ./docs --allow-host viewer.internal
```

A browser cannot be launched from inside a container, so `mermaid-docs` uses the `BROWSER`
helper VS Code provides and opens the page on your machine. Without one it prints the URL
and carries on.

If edits stop reloading the viewer, the workspace is on a bind mount that delivers no file
events — usual on macOS and Windows. Set `CHOKIDAR_USEPOLLING=true` to watch by polling
instead.

## Validate in CI

`validate` exits `1` on errors, so it can guard a pull request. A step marked in the
diagram but never documented is a warning, not an error — as is an arrow no step covers.

```yaml
- run: npx -y mermaid-docs validate ./docs
```

```text
$ mermaid-docs validate examples
3 diagrams checked, 0 errors, 0 warnings
39/39 connections documented
```
