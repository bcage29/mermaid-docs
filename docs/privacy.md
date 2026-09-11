# Privacy

The viewer identifies a workspace by its folder name, not its absolute path. MCP tool
responses omit local paths from filesystem errors while keeping validation feedback
actionable, and unexpected failures return a generic message to the agent — the details
go to stderr, never to the MCP protocol's stdout stream. CLI output and local HTTP errors
do keep full diagnostics, including paths, and MCP clients often capture stderr in their
logs.

This is not a redaction tool: diagram source, documentation, and titles are returned
whenever they are asked for. Review those files before sharing the viewer or pointing an
agent at them, and remember that replacing a screenshot does not remove older copies from
Git history.
