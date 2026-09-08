/**
 * Delivered to the client at initialization and surfaced to the model.
 *
 * This is the reason mmdocs ships an MCP server rather than only a CLI: the agent learns
 * the file format here, without the user having to explain it or maintain a CLAUDE.md.
 */
export const INSTRUCTIONS = `mmdocs documents Mermaid diagrams as guided, step-by-step walkthroughs.

FILE FORMAT
Every diagram is exactly two sibling files that share a basename:
  auth-flow.mmd   the Mermaid diagram, plus step region markers
  auth-flow.md    all documentation for that diagram

STEP REGIONS (.mmd)
A step highlights a range of diagram lines, marked with Mermaid comments:

  flowchart TD
    %% @step:start user-entry
    User[User] --> Login[Login Page]
    %% @step:end user-entry

Markers must be on their own line. Mermaid treats them as comments, so the diagram still
renders normally everywhere. Regions may nest and overlap. Ids match [A-Za-z0-9][A-Za-z0-9_-]*.

A step may be marked in MORE THAN ONE place. Use this when one step describes something
the diagram does repeatedly - an auth block that runs before every request, a submission
made by each party. Repeat the same id and every occurrence highlights together. Note that
set_step writes a single region: supplying a line range replaces all of them, so add extra
occurrences by editing the .mmd.

STEP DOCUMENTATION (.md)
Each step is an h2 whose first token is the step id, matching the marker:

  ## user-entry - User arrives

  The user hits /login. No session cookie is present yet.

The id is the first whitespace-delimited token; if the rest begins with "- ", that is the
title. Ids may contain hyphens: "## auth-one-test - Authentication" has id "auth-one-test".

IMPORTANT: every h2 declares a step. Use h3 or deeper for subsections inside a step body.
Text before the first h2 is the diagram overview, shown before step 1. Optional YAML
frontmatter may set a title. Step order is the order the h2 sections appear.

A step may carry an optional phase, which tags it and groups the walkthrough:

  ## user-entry - User arrives
  <!-- @phase Authentication -->

It is a label, not a hierarchy: the same phase may appear on any steps, in any order, with
others in between, and tagging a step never means moving it. Set it with set_step's phase
argument rather than writing the comment by hand.

WORKING WITH THESE FILES
Prefer the set_step tool over editing the files directly. It keeps the marker pair and the
documentation section in sync and handles the line arithmetic - inserting a marker shifts
every line below it, so writing several steps by hand usually corrupts the ranges.

Use list_connections to see every arrow the diagram draws and which step, if any, covers
it. A walkthrough is finished when nothing is left on NO STEP.

Use validate_diagram after any manual edit. Use get_viewer_url to give the user a link to
a specific step in the running viewer.`;
