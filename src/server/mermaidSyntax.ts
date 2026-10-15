import type { ValidationIssue } from '../core/types.js';
import { validateDiagram } from '../core/validate.js';

/**
 * Mermaid's own verdict on a diagram's syntax, reported as validation issues.
 *
 * Lives outside `src/core` because Mermaid needs a stand-in for DOMPurify to load in Node:
 * without a `window`, DOMPurify exports a stub that lacks `addHook` and `sanitize`, and
 * Mermaid calls both while parsing some flowchart labels. Parsing never renders anything,
 * so a pass-through is enough. The patched object must be the same ESM instance Mermaid
 * imports, which is why it is patched here rather than shimmed with a fake global.
 */

interface ParseErrorLike extends Error {
  /** Jison parsers (flowchart, sequence, ...) attach the failing location here. */
  hash?: { text?: string; loc?: { first_line?: number } };
}

interface FlowEdge {
  start: string;
  end: string;
  text?: string;
}

interface MermaidLike {
  parse(text: string): Promise<{ diagramType: string }>;
  mermaidAPI: {
    getDiagramFromText(text: string): Promise<{ db: { getEdges?: () => FlowEdge[] } }>;
  };
}

let loading: Promise<MermaidLike> | undefined;

/**
 * Load Mermaid once. A failure is thrown, never skipped: validation that quietly drops the
 * syntax check reports a clean diagram that cannot render, which is what it exists to catch.
 */
function loadMermaid(): Promise<MermaidLike> {
  loading ??= (async () => {
    try {
      const { default: purify } = await import('dompurify');
      if (!purify.isSupported) {
        const noop = () => {};
        Object.assign(purify, {
          addHook: noop,
          removeHook: noop,
          removeHooks: noop,
          removeAllHooks: noop,
          sanitize: (dirty: unknown) => String(dirty),
        });
      }
      const { default: mermaid } = await import('mermaid');
      return mermaid as unknown as MermaidLike;
    } catch (error) {
      // Let a long-running MCP server try again on the next call.
      loading = undefined;
      throw new Error(`Mermaid failed to load, so diagram syntax cannot be checked: ${(error as Error).message}`, {
        cause: error,
      });
    }
  })();
  return loading;
}

/** A Mermaid comment line, as Mermaid's own `cleanupComments` recognises one. */
const COMMENT_RE = /^\s*%%(?!\{)/;
const DIRECTIVE_RE = /^\s*%%\{.*\}%%\s*$/;

/**
 * Blank out what Mermaid would strip, so that line N of what it parses is line N of the file.
 *
 * Mermaid removes front matter, directives and comment lines before parsing, and reports
 * line numbers in what is left. Step markers are comments, so on a documented diagram its
 * numbers drift further from the file with every step. Blanking keeps the line count;
 * Mermaid still trims the leading blank lines, which `leadingBlankLines` adds back.
 */
function lineFaithful(mmd: string): { text: string; leadingBlankLines: number } {
  const lines = mmd.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((line, n) => n > 0 && line.trim() === '---');
    if (close > 0) for (; i <= close; i++) lines[i] = '';
  }
  for (let n = i; n < lines.length; n++) {
    if (COMMENT_RE.test(lines[n]!) || DIRECTIVE_RE.test(lines[n]!)) lines[n] = '';
  }
  const leadingBlankLines = lines.findIndex((line) => line.trim() !== '');
  return { text: lines.join('\n'), leadingBlankLines: Math.max(leadingBlankLines, 0) };
}

function lastContentLine(text: string): number {
  const lines = text.split('\n');
  let n = lines.length;
  while (n > 1 && lines[n - 1]!.trim() === '') n--;
  return n;
}

/** The 1-based line Mermaid blames, in the text it parsed. */
function errorLine(error: ParseErrorLike): number | undefined {
  const jison = error.hash?.loc?.first_line;
  if (typeof jison === 'number') return jison;
  // Langium parsers (architecture, ...) only say it in the message.
  const match = /(?:Parse|Lexer) error on line (\d+)/.exec(error.message);
  return match ? Number(match[1]) : undefined;
}

/** Mermaid's message without its own line number and the echoed source it points into. */
function describe(error: ParseErrorLike): string {
  const lines = error.message.split('\n').map((l) => l.trim()).filter(Boolean);
  if (error.hash) {
    // "Parse error on line 3:", the echoed source, a caret line, then "Expecting ..., got 'PS'".
    const expecting = lines.find((l) => l.startsWith('Expecting'));
    const near = error.hash.text ? `unexpected "${error.hash.text}". ` : '';
    if (expecting) return `${near}${expecting}`;
  }
  // "Parsing failed: Lexer error on line 4, column 10: unexpected character ... Parse error on ..."
  return lines[0]!
    .replace(/^Parsing failed:\s*/, '')
    .replace(/^(?:Lexer|Parse) error on line \d+, /, '')
    .replace(/\s*Parse error on line .*$/, '')
    .replace(/:$/, '');
}

/** A link operator, which has no business inside a label unless a link was swallowed. */
const LINK_TOKEN_RE = /-{2,}>|-{3,}|={2,}>|={3,}|-\.+->?|~~~/;

/**
 * Flowchart edges whose label swallowed source it should not have.
 *
 * Mermaid accepts `A <--|label| B`, which is not edge syntax, by reading everything up to
 * the next link's label as one long label. The edge after it disappears, every later
 * `linkStyle` index shifts, and nothing reports a problem.
 */
function swallowedLabels(edges: FlowEdge[], fileLines: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const edge of edges) {
    const text = edge.text ?? '';
    if (!text.includes('\n') && !LINK_TOKEN_RE.test(text)) continue;
    const first = text.split('\n')[0]!.trim();
    const index = fileLines.findIndex(
      (line) => !COMMENT_RE.test(line) && line.includes(edge.start) && (first === '' || line.includes(first)),
    );
    const shown = text.replace(/\n/g, '\\n');
    issues.push({
      severity: 'warning',
      code: 'suspicious-edge-label',
      message: `The label of the link from "${edge.start}" to "${edge.end}" reads "${shown.length > 80 ? `${shown.slice(0, 77)}...` : shown}", so Mermaid probably folded the following lines into it and dropped the links they draw. Check the link syntax on this line.`,
      ...(index >= 0 ? { line: index + 1 } : {}),
      file: 'mmd',
    });
  }
  return issues;
}

/**
 * Run Mermaid's parser over a diagram.
 *
 * A parse failure is an error: the viewer cannot render the diagram at all. Input Mermaid
 * accepts but probably misreads is a warning.
 */
export async function checkMermaidSyntax(mmd: string): Promise<ValidationIssue[]> {
  const mermaid = await loadMermaid();

  const { text, leadingBlankLines } = lineFaithful(mmd);
  let diagramType: string;
  try {
    ({ diagramType } = await mermaid.parse(text));
  } catch (error) {
    const err = error as ParseErrorLike;
    if (err.name === 'UnknownDiagramError') {
      return [
        {
          severity: 'error',
          code: 'mermaid-syntax',
          message: 'Mermaid does not recognise the diagram type. The first line should name one, e.g. "flowchart TD" or "sequenceDiagram".',
          ...(leadingBlankLines < text.split('\n').length ? { line: leadingBlankLines + 1 } : {}),
          file: 'mmd',
        },
      ];
    }
    const line = errorLine(err);
    if (line === undefined && !err.hash && err.name !== 'MermaidParseError') {
      // Not a verdict on the diagram, e.g. Mermaid reaching for a browser API.
      return [];
    }
    return [
      {
        severity: 'error',
        code: 'mermaid-syntax',
        message: `Mermaid cannot parse this line: ${describe(err)}`,
        // An error at the end of input can point past the last line with content.
        ...(line !== undefined ? { line: Math.min(line + leadingBlankLines, lastContentLine(text)) } : {}),
        file: 'mmd',
      },
    ];
  }

  if (!diagramType.startsWith('flowchart')) return [];
  try {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
    return swallowedLabels(diagram.db.getEdges?.() ?? [], mmd.replace(/\r\n?/g, '\n').split('\n'));
  } catch {
    return [];
  }
}

/** `validateDiagram`, plus whether Mermaid can parse the diagram at all. */
export async function validateDiagramSource(mmd: string, md: string | undefined): Promise<ValidationIssue[]> {
  return [...(await checkMermaidSyntax(mmd)), ...validateDiagram(mmd, md)];
}
