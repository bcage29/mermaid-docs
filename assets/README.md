# Brand assets

Source masters for the app icon. Nothing here is served or published — the build
never looks at this folder.

The three files the viewer actually serves live in `src/web/public/` and are copied
into `dist/web/` by Vite:

| Served file | Used by |
| --- | --- |
| `favicon.ico` | `<link rel="icon">` in `src/web/index.html` (embeds 16/32/48) |
| `mermaid-docs-icon-branch-180.png` | `<link rel="apple-touch-icon">`; opaque on purpose, Apple composites no transparency |
| `mermaid-docs-icon-branch-transparent.svg` | header brand mark in `src/web/App.tsx` |

Regenerate those from the masters here rather than adding more sizes to `public/` —
everything in that folder ships in the npm tarball at full size.
