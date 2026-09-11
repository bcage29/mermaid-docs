# Assets

Working files: the icon artwork and the screenshots in the README. The build never reads
this folder, and none of it ships to npm — the package includes only `dist`.

## README images

Shown in [`../README.md`](../README.md), so GitHub and npmjs.com render them. Nothing in
the code references them, so don't clear them out as unused.

| File | Where it appears |
| --- | --- |
| `walkthrough.gif` | the hero — stepping through `examples/sequence/messaging.mmd` |
| `viewer.png` | the still under "What works where" |

Both come from the viewer running against `examples/` in its dark default. Recapture them
there rather than editing the images.

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
