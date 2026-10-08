# Publish to GitHub Pages

The viewer you open with `mermaid-docs <folder>` runs on your machine. To give everyone who
reads the repository the same walkthroughs, publish them as a static site:

```bash
mermaid-docs build ./docs --out _site
```

`_site` holds the viewer and every diagram, and needs no server — any static host will do.
GitHub Pages is the usual one, and there is an action for it.

> [!WARNING]
> A published site is public. On GitHub Free, Pro, and Team, that includes a Pages site
> built from a private repository; only GitHub Enterprise Cloud can restrict who sees one.
> Every diagram and walkthrough in the folder is published, so check them first. The action
> will not publish a private repository's diagrams until you confirm it — see
> [Private repositories](#private-repositories).

## With the action

1. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Add `.github/workflows/mermaid-docs.yml`:

```yaml
name: Publish diagrams

on:
  push:
    branches: [main]
    paths: ['docs/**']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: bcage29/mermaid-docs@v0
        with:
          folder: docs
          title: Architecture
      - id: deployment
        uses: actions/deploy-pages@v5
```

Change `folder` to wherever your `.mmd` files live, and `paths` to match.

The site appears at `https://<owner>.github.io/<repo>/`, and links to a step work the same
way they do locally — `https://<owner>.github.io/<repo>/#/auth-flow/token-issue`.

### Inputs

| Input | Default | |
| --- | --- | --- |
| `folder` | *(required)* | Folder of diagrams, relative to the repository root |
| `title` | the folder's name | Name shown in the viewer and the browser tab |
| `out` | `_site` | Where to write the site |
| `upload` | `true` | Upload with `actions/upload-pages-artifact`; set `false` to publish it some other way |
| `version` | the action's own | `mermaid-docs` version to run |
| `confirm-public-site` | `false` | Publish from a private or internal repository even though the site will be public |

The `path` output is the built site's absolute path.

GitHub-hosted runners have Node.js already. A self-hosted runner needs Node.js 20 or newer
on its `PATH`.

### Pinning

The action runs the `mermaid-docs` release that matches its own tag, so choosing the
action's version also chooses the viewer's.

| Reference | Moves? | |
| --- | --- | --- |
| `@v0` | Yes, to each 0.x release | Simplest. Before 1.0 a minor release may change behaviour, and you take it unreviewed |
| `@v0.5.0` | No | A release tag is never moved once published |
| `@<commit-sha>` | No | What GitHub's security hardening guide recommends for third-party actions |

A tag is a pointer its owner can change; a commit SHA is not. For a private repository, or
anywhere a compromised action would matter, pin the SHA and keep the version beside it as a
comment:

```yaml
      - uses: bcage29/mermaid-docs@<commit-sha> # v0.5.0
```

The SHA is on the [releases page](https://github.com/bcage29/mermaid-docs/releases), or
from `git ls-remote https://github.com/bcage29/mermaid-docs refs/tags/<version>^{}`.
Let Dependabot keep it current — it updates the SHA and the comment together, as a pull
request you review. Add `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

A SHA pin holds the whole chain still: the action runs an exact `mermaid-docs` version
and pins the action it uploads with by SHA as well. Never pin a branch such as `@main` — it
can name a version that has not been published to npm yet.

## Private repositories

Before it builds anything, the action asks GitHub whether the repository is public. If it
is private or internal, it then asks whether the Pages site is restricted to people who
can read the repository:

| Repository | Pages site | Result |
| --- | --- | --- |
| Public | — | Published |
| Private or internal | Restricted (Enterprise Cloud) | Published, with a notice |
| Private or internal | Public, or not yet known | **Refused**, unless `confirm-public-site: true` |

A refused run fails with the reason in the log and the job summary, and publishes nothing.
To publish anyway, confirm it on the step, where it is reviewed like any other change:

```yaml
      - uses: bcage29/mermaid-docs@v0
        with:
          folder: docs
          confirm-public-site: true
```

Every confirmed run still puts a warning in the job summary. If the visibility cannot be
read at all, the site is treated as public.

The confirmation is given once, in the workflow. To approve each deployment as well, add
required reviewers to the `github-pages` environment under **Settings → Environments**; the
deploy job then waits for one of them before it runs. For a private repository, GitHub
offers required reviewers on Enterprise plans only.

## Without the action

The action only runs `build` and uploads the result, so any CI can do the same:

```yaml
- run: npx -y mermaid-docs build docs --out _site
- uses: actions/upload-pages-artifact@v5
  with:
    path: _site
```

## What `build` does

- **Validates first.** Errors stop the build, so a broken walkthrough is never published.
  Warnings are printed and do not.
- **Replaces its own output, and nothing else.** A folder from a previous build is cleared
  so removed diagrams do not linger; any other non-empty folder is refused.
- **Works from any path.** The site uses relative URLs, so it runs at a domain root, under
  `/<repo>/`, or from a subfolder of another site.

A published site does not live-reload; rebuild it to pick up changes.
