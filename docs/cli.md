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
