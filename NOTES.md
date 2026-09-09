# Open items

Things worth a decision or a follow-up. Written 2026-09-05, at the end of the initial build.

## Resolved

### 1. ~~The npm name may not be available~~ — resolved 2026-09-06

**Closed.** Published name is **`mermaid-docs`**, which was fully available. The package
installs the `mermaid-docs` command and uses the same name for its MCP server.

Chosen for discoverability: the name includes "mermaid", and the
ecosystem convention is `rehype-mermaid` / `mdx-mermaid` / `astro-mermaid`. It also makes
an MCP config self-documenting to whoever reads it later.

### 2. ~~Diagram highlighting only works for flowcharts~~ — resolved 2026-09-08

**Closed.** Highlighting emphasises **connections**, not boxes, and works for flowcharts
and sequence diagrams. Every other diagram type is left untouched rather than partly
highlighted, so nothing renders wrong — `detectDiagramKind` returns `other` and
`applyHighlight` returns early.

This reverses the 2026-09-06 decision to drop diagram emphasis entirely. That version
highlighted **nodes**, which is what made it flowchart-only: boxes are addressable in a
flowchart and barely meaningful anywhere else. Connections are what a step actually
narrates, and both diagram types that have them expose them the same way.

How the pieces fit:

- `src/core/connections.ts` lists what a diagram draws, in Mermaid's render order.
- `useConnectionHighlight` turns a step's line region into the elements to emphasise.
- `MermaidCanvas.applyHighlight` writes `.is-active` / `.is-muted`.

Three facts about Mermaid's output the implementation depends on, all verified against a
real render rather than inferred:

- Flowchart link paths carry `data-id="L_<from>_<to>_<n>"`, so they are matched by id and
  never by position. Repeated node pairs increment `<n>`.
- An invisible `~~~` link emits **no path but does emit an `.edgeLabels` child**. Labels
  and lines therefore need separate counters — `Connection.slot` and `Connection.index`.
- A sequence self-message (`A->>A`) renders as `path.messageLine0`, not `line`. Style
  rules have to cover both element types.

## Deferred work

- **No CLI equivalents for `reorder_steps` and `create_diagram`.** Both exist as MCP
  tools. An agent without MCP can't reorder steps except by editing the `.md` directly
  (which is safe — order is just section order — but undocumented).
- **`GET /api/diagrams` now loads every diagram** to report its title and step count, and
  the watcher refires it on every save. Fine for a folder of diagrams on localhost; cache
  it by mtime if a workspace ever gets big enough to notice.
- **Bundle is 771 kB** (`dist/web/assets/index-*.js`), mostly Mermaid's diagram
  renderers. Fine for a tool served from localhost; worth code-splitting by diagram type
  if it ever ships anywhere else.
- **`npm test` spawns `tsx` for the MCP integration tests**, which is slow (~3s) and was
  seen to time out once when run concurrently with `tsc`. Running the MCP tests against
  `dist/` instead would be faster and more representative of what users actually run.

## Things to keep in mind when changing the viewer

- **A diagram is identified by its bare file name**, not its path. The scan goes one folder
  deep and names must be unique, which is what keeps the URL to `#/<name>/<step>` with
  nothing to disambiguate. Deeper nesting or duplicate names would both force the path back
  into the URL, and with it the question of where the path ends and the step begins.
  `src/core/route.ts` holds the format and is shared with the MCP server, which has no DOM
  and no React - that is why it lives in core rather than in a hook.

- **A step has `regions: Region[]`, not one region.** One documented step often maps to
  several places in a diagram — an auth block repeated before each request, a submission
  made by each party — so an id may be marked more than once and every occurrence
  highlights together. Reopening an id that is still *open* remains an error; closing and
  reopening it is not. `setStep` writes a single region and replaces all of them, which is
  why extra occurrences are added by editing the `.mmd`.

- **Mermaid's `useMaxWidth` must stay `false`.** It writes an inline `max-width` onto the
  `<svg>` that caps zoom well below the configured maximum, in a way that looks like the
  zoom library is broken.
- **The diagram is inserted with `host.innerHTML`, not `dangerouslySetInnerHTML`.** React
  re-applies that prop whenever the pan/zoom library re-renders, replacing the `<svg>`
  element even though the markup is identical - toggling the source panel was enough. The
  highlight classes went with it and were re-applied a frame later, which read as a
  flicker. Handing the subtree to React is what causes this; the previous viewer never hit it
  because it owned the DOM itself.
- **Highlight classes are not transitioned.** A transition turns any momentary loss of
  those classes into a visible fade, so the fix above and this one go together.
- **Highlight classes are toggled, never cleared and rewritten.** Clearing first restarts
  the transition on every element, so a link that is muted both before and after a step
  change flashes back to full opacity on its way to being muted again.
- **The canvas is hidden until it has been fitted** (`.mermaid-host.is-fitted`), and the
  initial fit is applied with a zero duration. Animating it meant every page load began
  with the diagram visibly sliding and scaling into place.
- **A link is about two pixels wide, which is unclickable.** Each one gets a transparent
  twin with a fat stroke (`src/web/connectionHits.ts`), and the real link is set to
  `pointer-events: none` so it cannot swallow clicks along its own centre. The twins carry
  a different class so they never match the highlight selectors or the element counting.
- **`getScreenCTM()` does not account for the pan/zoom library's CSS transform**, so it
  reports where an element would be at 100%. To map SVG coordinates to the screen, compare
  the element's own `getBBox()` and `getBoundingClientRect()`. The e2e helper `linkPoint`
  does this, and also waits for the fit animation to stop before trusting a hit test.
- **The canvas panel is a flex column.** `.canvas` used to be `height: 100%` while sharing
  the panel with the issue banner, so on any diagram with a warning the canvas ran past the
  bottom of its panel and sat invisibly on top of the source panel below, swallowing clicks
  meant for it.
- **The pan/zoom library owns the SVG subtree and recreates it on its own re-renders**,
  which drops any class written to it. `MermaidCanvas` re-applies the highlight from a
  `MutationObserver` for exactly this reason. Test any change that writes to the SVG with
  a **cold page load** — hash navigation masks the bug by changing effect dependencies.
  Anything that *adds* elements from that observer must be idempotent, or it retriggers
  itself forever; `addHitTargets` and `positionStickyActors` both guard for this.
- **Mermaid's palette is set by `mermaid.initialize`, not by CSS.** Switching theme
  re-initialises it and re-renders every diagram, so `useMermaidRender` takes the theme as
  a dependency. The app's own colours are CSS variables under `:root[data-theme]`; dark is
  the default so the page is never briefly white.
- **Zoom steps in react-zoom-pan-pinch are absolute, not multiplicative.** `zoomIn(0.5)`
  means "add 0.5 to the scale", so a fixed step is violent at a fitted 40% and imperceptible
  at 600%, and `smooth` (on by default) multiplies the wheel step by the raw `deltaY`, which
  a trackpad sends in the tens. `MermaidCanvas` derives every step from the current scale
  and turns `smooth` off, so one click is +15% and one wheel notch +4% wherever you are.
- **`zoomToStep` is on by default and frames a step's nodes**, using `zoomToElement` with
  the whole array of them rather than picking one. It quietly does nothing for
  non-flowchart diagrams, which have no addressable nodes, and the overview refits instead.
  It reads the rendered diagram to do this; removing it would also retire
  `nodeIdFromElementId` and `extractRegionElements` in `src/core/mermaidIds.ts` — but not
  the file, which `src/core/connections.ts` depends on for `parseFlowchartLine`.
- **There is one placement effect, not two.** Fitting and framing compete for the same
  transform, so they are decided together: instantly on first paint (while the canvas is
  still hidden), animated afterwards.
