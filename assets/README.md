# Assets

Working files: the icon artwork and the screenshots in the README. The build never reads
this folder, and none of it ships to npm — the package includes only `dist`.

## README images

Shown in [`../README.md`](../README.md), so GitHub and npmjs.com render them. Nothing in
the code references them, so don't clear them out as unused.

| File | Where it appears |
| --- | --- |
| `walkthrough.gif` | the hero — stepping through `examples/architecture/agentic-rag.mmd` in light mode |
| `viewer.png` | the still under "What works where" |

Both come from the viewer running against `examples/`. Recapture them there rather than
editing the images.

`walkthrough.gif` is recorded by [`scripts/record-gif.mjs`](../scripts/record-gif.mjs):
it starts the built viewer, steps through the diagram with the keyboard, opens the source
panel for the last two steps, and assembles the screenshots with ffmpeg. It needs a build,
Playwright's Chromium, and ffmpeg. The Playwright image has everything except ffmpeg, and
keeps the container's `node_modules` and `dist` apart from the host's:

```bash
docker run --rm -v "$PWD":/work -v /work/node_modules -v /work/dist -w /work \
  mcr.microsoft.com/playwright:v1.63.0-noble bash -c \
  'apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null &&
   npm ci && npm run build && npm run record:gif'
```

Match the image tag to the installed `@playwright/test` version. Set `KEEP_FRAMES=1` to
keep the screenshots for checking a recording frame by frame.

`viewer.png` is captured by hand, in the dark default.

## Icon

`mermaid-docs-icon-branch.svg` is the original; the two PNGs are exports of it.

The icon files the viewer actually serves live in `src/web/public/`, which Vite copies
into `dist/web/`:

| Served file | Used by |
| --- | --- |
| `favicon.ico` | `<link rel="icon">` in `src/web/index.html` (embeds 16/32/48) |
| `mermaid-docs-icon-branch-180.png` | `<link rel="apple-touch-icon">`; opaque on purpose, Apple composites no transparency |
| `mermaid-docs-icon-branch-transparent.svg` | header brand mark in `src/web/App.tsx` |

Export new sizes from the SVG here instead of adding them to `public/` — everything in
that folder ships in the npm tarball at full size.
