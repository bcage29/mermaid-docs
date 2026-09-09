import { isMarkerLine } from './markers.js';
import { parseFlowchartLine } from './mermaidIds.js';

/** The diagram types whose connections can be located in the rendered SVG. */
export type DiagramKind = 'flowchart' | 'sequence' | 'architecture' | 'other';

/** One link or message drawn by the diagram, in the order Mermaid renders them. */
export interface Connection {
  /** Position among the connections that actually draw a line. -1 when invisible. */
  index: number;
  /**
   * Position among all connections, invisible ones included.
   *
   * Mermaid emits an `.edgeLabels` child for every edge but a path only for the visible
   * ones, so labels and lines need different counters.
   */
  slot: number;
  /** 1-based line in the .mmd that declares it. */
  line: number;
  from: string;
  to: string;
  label?: string;
  /** `~~~` links are layout hints and render no path. */
  invisible: boolean;
  /**
   * Mermaid's `data-id` on the rendered edge path, `L_<from>_<to>_<n>`. Flowcharts only —
   * sequence messages carry no id and have to be found by position.
   */
  edgeId?: string;
}

/** Statement keywords in a sequence diagram, none of which declare a message. */
const SEQUENCE_KEYWORDS = new Set([
  'participant', 'actor', 'note', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'end',
  'rect', 'activate', 'deactivate', 'autonumber', 'box', 'critical', 'break', 'option',
  'link', 'links', 'create', 'destroy', 'title', 'accTitle', 'accDescr',
]);

/** Sequence message arrows, longest first so `-->>` wins over `-->`. */
const SEQUENCE_ARROWS = ['<<-->>', '<<->>', '-->>', '--x', '--)', '->>', '-->', '-x', '-)', '->'];

/**
 * Which kind of diagram the source declares.
 *
 * Frontmatter and `%%{init}%%` directives may precede the declaration, so this looks for
 * the first line that is neither.
 */
export function detectDiagramKind(mmd: string): DiagramKind {
  const lines = mmd.split('\n');
  let inFrontmatter = false;
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === '') continue;
    if (line === '---') {
      // Only a leading `---` opens frontmatter; a later one closes it.
      if (i === 0 || inFrontmatter) inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter || line.startsWith('%%')) continue;
    if (/^(flowchart|graph)\b/.test(line)) return 'flowchart';
    if (/^sequenceDiagram\b/.test(line)) return 'sequence';
    if (/^architecture-beta\b/.test(line)) return 'architecture';
    return 'other';
  }
  return 'other';
}

function architectureConnection(raw: string): { from: string; to: string } | undefined {
  const line = raw.replace(/%%.*$/, '').trim();
  const match = /^([A-Za-z0-9_-]+)(?:\{group\})?:[LRBT]\s+(<)?--(>)?\s+[LRBT]:([A-Za-z0-9_-]+)(?:\{group\})?$/.exec(line);
  if (!match) return undefined;
  const left = match[1]!;
  const right = match[4]!;
  return match[2] && !match[3] ? { from: right, to: left } : { from: left, to: right };
}

function sequenceConnection(raw: string): { from: string; to: string; label?: string } | undefined {
  const line = raw.replace(/%%.*$/, '').trim();
  if (line === '') return undefined;

  const firstWord = /^([A-Za-z]+)/.exec(line)?.[1];
  if (firstWord && SEQUENCE_KEYWORDS.has(firstWord)) return undefined;

  // The message text follows the first `:`, and may itself contain arrows.
  const colon = line.indexOf(':');
  const head = colon === -1 ? line : line.slice(0, colon);
  const label = colon === -1 ? undefined : line.slice(colon + 1).trim();

  let at = -1;
  let arrow = '';
  for (const candidate of SEQUENCE_ARROWS) {
    const found = head.indexOf(candidate);
    if (found >= 0 && (at === -1 || found < at || (found === at && candidate.length > arrow.length))) {
      at = found;
      arrow = candidate;
    }
  }
  if (at === -1) return undefined;

  const from = /([A-Za-z0-9_][A-Za-z0-9_-]*)\s*$/.exec(head.slice(0, at))?.[1];
  // `+`/`-` before the target toggle activation and are not part of the id.
  const to = /^\s*[+-]?([A-Za-z0-9_][A-Za-z0-9_-]*)/.exec(head.slice(at + arrow.length))?.[1];
  if (!from || !to) return undefined;

  return { from, to, ...(label ? { label } : {}) };
}

/**
 * List every connection the diagram draws, in render order.
 *
 * Mermaid emits link paths in source order, so a connection's `index` is what ties a
 * step's line region back to elements in the rendered SVG. Diagram types this cannot
 * parse return nothing rather than guessing.
 */
export function listConnections(mmd: string): Connection[] {
  const kind = detectDiagramKind(mmd);
  if (kind === 'other') return [];

  const lines = mmd.split('\n');
  const out: Connection[] = [];
  const seen = new Map<string, number>();
  let index = 0;
  let slot = 0;

  for (const [i, raw] of lines.entries()) {
    if (isMarkerLine(raw)) continue;
    const line = i + 1;

    if (kind === 'sequence') {
      const message = sequenceConnection(raw);
      if (!message) continue;
      out.push({ index: index++, slot: slot++, line, ...message, invisible: false });
      continue;
    }

    if (kind === 'architecture') {
      const edge = architectureConnection(raw);
      if (!edge) continue;
      out.push({ index: index++, slot: slot++, line, ...edge, invisible: false });
      continue;
    }

    for (const edge of parseFlowchartLine(raw).edges) {
      const invisible = edge.operator === '~~~';
      const pair = `${edge.from}_${edge.to}`;
      const occurrence = seen.get(pair) ?? 0;
      seen.set(pair, occurrence + 1);
      out.push({
        index: invisible ? -1 : index++,
        slot: slot++,
        line,
        from: edge.from,
        to: edge.to,
        ...(edge.label ? { label: edge.label } : {}),
        invisible,
        edgeId: `L_${edge.from}_${edge.to}_${occurrence}`,
      });
    }
  }

  return out;
}
