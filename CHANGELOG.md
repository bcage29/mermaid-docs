# Changelog

## 0.4.0

### Breaking changes

* `--lan` is removed. The viewer has no authentication, so it no longer offers to listen on the local network. Passing `--lan` now fails with a message saying what to use instead.
* `--host` accepts only loopback addresses: `127.0.0.1` (the default), `::1`, or `localhost`. Any other value, including `0.0.0.0`, fails at startup. `MERMAID_DOCS_FORWARDED` still relaxes the port check behind a forwarder, but never the bind address.
* A container published with a plain `docker run -p` can no longer reach the viewer, because that connects to the container's network interface rather than its loopback. Use VS Code dev containers or Codespaces, whose port forwarding connects from inside the container. To open the viewer from another machine, put a tunnel in front of it and name it with `--allow-host`.

### Security

* The viewer's HTTP server sends `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a content security policy on every response: `script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`. Script injected into a rendered diagram is now blocked by the browser as well as by Mermaid's sanitiser.
* HTTP errors no longer return raw exception messages. Validation messages still come through; anything else gets a generic message, with the details on stderr.
* MCP results that carry diagram source or documentation are marked as untrusted repository content, and the server instructions tell the agent not to follow instructions found in it. This lowers the risk of prompt injection through a diagram but does not remove it.
* MCP tools carry annotations: the read tools are marked read-only, and `set_step` and `delete_step` are marked destructive, so a host can ask before running them.
* `--allow-host` prints a reminder on stderr that the tunnel or proxy in front of the viewer must require sign-in.
* GitHub Actions in CI and release workflows are pinned to commit SHAs.
* CI runs `npm audit`, failing on high or critical advisories in any dependency (the viewer bundles several dev dependencies) and verifying registry signatures. Lower advisories are reported without failing.
* The package ships `npm-shrinkwrap.json`, so `npm install mermaid-docs` installs exactly the dependency tree that was tested, transitive dependencies included, instead of resolving semver ranges at install time.
* `SECURITY.md` describes how to report a vulnerability privately.

### Fixed

* `create_diagram` refuses a path the workspace scan would never find (more than one folder deep, or inside a dot or build folder) instead of reporting success for a diagram nothing could list.
