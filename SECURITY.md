# Security policy

## Supported versions

Only the latest minor release gets security fixes. Upgrade to it before reporting, if you
can, to confirm the problem is still there.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through
GitHub instead: open the repository's **Security** tab and choose **Report a
vulnerability**, or go straight to
<https://github.com/bcage29/mermaid-docs/security/advisories/new>.

Include:

- the mermaid-docs version, Node.js version, and how you run it (CLI, MCP server, or
  `npm run dev`)
- what an attacker controls, such as a diagram file, an HTTP request, or a tool call, and
  what they gain from it
- the steps to reproduce, ideally with a `.mmd` and `.md` pair or a request that shows the
  problem

## What to expect

This project has a single maintainer. You should get an acknowledgement within a week.
Once the report is confirmed, the fix is developed in a private advisory and released as
a patch to the latest minor version. The advisory is then published with credit to you,
unless you ask to stay anonymous.

## Scope

Some behaviour is by design and is not a vulnerability on its own:

- The viewer has no authentication. It only listens on loopback, and anyone who exposes
  it beyond that, through a tunnel named with `--allow-host` or otherwise, has to put
  sign-in in front of it. See [docs/viewer.md](docs/viewer.md).
- The MCP server marks diagram content as untrusted and tells the agent not to follow
  instructions found in it. That lowers the risk of prompt injection but does not remove
  it. See [docs/mcp.md](docs/mcp.md).

A way around either of those safeguards, such as reaching the viewer from a host that is
not allowed or running script from a diagram despite the content security policy, is in
scope.
