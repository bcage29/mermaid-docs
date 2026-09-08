/** A step's highlighted region in the .mmd file. Line numbers are 1-based. */
export interface Region {
  id: string;
  /** First line of the region body (exclusive of the `@step:start` marker line). */
  startLine: number;
  /** Last line of the region body (exclusive of the `@step:end` marker line). */
  endLine: number;
  /** Line the `%% @step:start` marker itself sits on. */
  startMarkerLine: number;
  /** Line the `%% @step:end` marker itself sits on. */
  endMarkerLine: number;
}

/** A documentation section parsed out of the .md file. */
export interface DocSection {
  id: string;
  title: string;
  /** Section body, verbatim, excluding the heading line. */
  body: string;
  /** Line the `## id - Title` heading sits on, 1-based. */
  headingLine: number;
  /** Free-form label grouping this step with others, from `<!-- @phase ... -->`. */
  phase?: string;
}

/** The parsed .md file. */
export interface ParsedDoc {
  /** Raw YAML frontmatter text, or undefined when absent. */
  frontmatter?: string;
  /** Prose before the first `##` heading. */
  overview: string;
  sections: DocSection[];
}

/** A step as presented to the viewer: docs joined to its diagram regions. */
export interface Step {
  id: string;
  title: string;
  body: string;
  /** Free-form label grouping this step with others, from `<!-- @phase ... -->`. */
  phase?: string;
  /**
   * Every place the diagram marks this step, in source order.
   *
   * Usually one, but a step that describes something recurring - an auth block run before
   * each request, a submission made by each party - is marked wherever it happens. Empty
   * when the .md declares an id the .mmd never marks.
   */
  regions: Region[];
}

export type IssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: IssueSeverity;
  code:
    | 'unclosed-region'
    | 'unopened-region'
    | 'duplicate-region'
    | 'duplicate-section'
    | 'orphan-section'
    | 'orphan-region'
    | 'empty-region'
    | 'invalid-id';
  message: string;
  /** 1-based line in the file the issue refers to, when known. */
  line?: number;
  /** Which file the issue is in. */
  file: 'mmd' | 'md';
}

/** A diagram and its documentation, joined. */
export interface Diagram {
  /** URI-safe identifier: the path relative to the workspace root. */
  id: string;
  /** Path relative to the workspace root, e.g. "auth/auth-flow.mmd". */
  relPath: string;
  /** Display name, e.g. "auth-flow". */
  name: string;
  /** Parent folder relative to root, or "" at the top level. */
  group: string;
  hasDocumentation: boolean;
  title: string;
  mmd: string;
  overview: string;
  steps: Step[];
  issues: ValidationIssue[];
}
