import { isMarkerLine } from './markers.js';

export interface RegionElements {
  /** Node ids declared or referenced in the region. */
  nodeIds: Set<string>;
  /** Directed edges between those nodes, as [source, target] pairs. */
  edges: Array<[string, string]>;
  /** Subgraph ids opened in the region. */
  subgraphs: Set<string>;
}

/** Mermaid flowchart edge operators, longest first so `-->` wins over `--`. */
const EDGE_OPERATORS = [
  '<-->', '<==>', '<-.->',
  '-.->', '<-.-', '-.-',
  '==>', '<==', '===', '==',
  '-->', '<--', '---',
  '--x', 'x--', '--o', 'o--',
  '~~~',
];

/** Strip `"..."`, `'...'` and backtick labels so operators inside labels are ignored. */
function blankQuoted(line: string): string {
  return line.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, (m) => ' '.repeat(m.length));
}

/** Strip `|edge label|` segments, which sit between an operator and the target node. */
function blankPipeLabels(line: string): string {
  return line.replace(/\|[^|]*\|/g, (m) => ' '.repeat(m.length));
}

/**
 * Strip the mid-arrow label form, `A -- yes --> B`.
 *
 * The leading `--` is not itself an edge operator, so leaving the label in place makes the
 * trailing token of the source side read as `yes`. Blanking the whole `-- yes ` run leaves
 * one operator and the right two nodes.
 */
function blankMidLabels(line: string): string {
  return line.replace(/(?:--|==)[^-=>|<]*?(?=-->|---|--x|--o|==>|===)/g, (m) => ' '.repeat(m.length));
}

/** Split on a separator that appears outside `[]`, `()` and `{}`. */
function splitTopLevel(text: string, separator: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth = Math.max(0, depth - 1);
    if (ch === separator && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/**
 * Remove bracketed shape groups, so `Login[Login Page]` collapses to `Login`.
 *
 * Labels may contain spaces and nested brackets (`Store[(Database)]`), so a token split
 * alone would mistake label words for node ids.
 */
function stripShapes(text: string): string {
  let out = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '[' || ch === '(' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ']' || ch === ')' || ch === '}') {
      if (depth > 0) depth--;
      continue;
    }
    if (depth === 0) out += ch;
  }
  return out;
}

/**
 * Take the node id from one side of an edge.
 *
 * For a right-hand side we want the leading token; for a left-hand side the trailing one,
 * since `A --> B --> C` chains put the previous target on the left of the next operator.
 */
function nodeFromSide(raw: string, side: 'left' | 'right'): string | undefined {
  const tokens = stripShapes(raw).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return undefined;
  const token = side === 'left' ? tokens[tokens.length - 1]! : tokens[0]!;
  const m = /^([A-Za-z0-9_][A-Za-z0-9_-]*)/.exec(token.replace(/^[([{<>/\\]+/, ''));
  return m?.[1];
}

/** Keywords that begin a statement rather than name a node. */
const KEYWORDS = new Set([
  'graph', 'flowchart', 'subgraph', 'end', 'classDef', 'class', 'click', 'style',
  'linkStyle', 'direction', 'accTitle', 'accDescr',
]);

/** One edge drawn by a single line of flowchart source. */
export interface LineEdge {
  from: string;
  to: string;
  /** The operator joining them, e.g. `-->`. `~~~` draws nothing. */
  operator: string;
  /** `|text|` between the operator and the target, when present. */
  label?: string;
}

export interface ParsedFlowchartLine {
  /** Node ids declared or referenced, in source order. */
  nodeIds: string[];
  /** Set when the line opens a subgraph. */
  subgraph?: string;
  /** Edges in the order Mermaid renders them. */
  edges: LineEdge[];
}

/**
 * Parse one line of flowchart source into the nodes and edges it draws.
 *
 * Edge order matters beyond the ids themselves: it is what lets a step's line region be
 * matched back to elements in the rendered SVG.
 */
export function parseFlowchartLine(rawLine: string): ParsedFlowchartLine {
  const empty: ParsedFlowchartLine = { nodeIds: [], edges: [] };
  if (isMarkerLine(rawLine)) return empty;

  // Drop trailing mermaid comments, then neutralise anything that can imitate an operator.
  const withoutComment = rawLine.replace(/%%.*$/, '');
  const quoted = blankQuoted(withoutComment);

  const subgraph = /^\s*subgraph\s+([A-Za-z0-9_][A-Za-z0-9_-]*)/.exec(quoted);
  if (subgraph) return { nodeIds: [subgraph[1]!], subgraph: subgraph[1]!, edges: [] };

  const firstWord = /^\s*([A-Za-z]+)/.exec(quoted)?.[1];
  if (firstWord && KEYWORDS.has(firstWord)) return empty;

  // Slice node text from a line with mid-arrow labels gone; find operators in one that
  // also has pipe labels gone, so `-->|a --> b|` is a single edge. Both preserve length.
  const sliceSrc = blankMidLabels(quoted);
  const masked = blankPipeLabels(sliceSrc);

  const parts: string[] = [];
  const operators: string[] = [];
  let cursor = 0;
  let guard = 0;
  while (guard++ < 200) {
    let bestIndex = -1;
    let bestOp = '';
    for (const op of EDGE_OPERATORS) {
      const at = masked.indexOf(op, cursor);
      if (at >= 0 && (bestIndex === -1 || at < bestIndex || (at === bestIndex && op.length > bestOp.length))) {
        bestIndex = at;
        bestOp = op;
      }
    }
    if (bestIndex === -1) break;
    parts.push(sliceSrc.slice(cursor, bestIndex));
    operators.push(bestOp);
    cursor = bestIndex + bestOp.length;
  }
  parts.push(sliceSrc.slice(cursor));

  // `A --> B & C` fans out, so each part is a list of nodes rather than one.
  const labels: Array<string | undefined> = [];
  const groups = parts.map((part, i) => {
    let text = part;
    if (i > 0) {
      const pipe = /^\s*\|([^|]*)\|/.exec(text);
      labels.push(pipe ? pipe[1]!.trim() : undefined);
      if (pipe) text = text.slice(pipe[0].length);
    }
    const side = i === 0 ? 'left' : 'right';
    return splitTopLevel(text, '&')
      .map((piece) => nodeFromSide(piece, side))
      .filter((id): id is string => id !== undefined && !KEYWORDS.has(id));
  });

  const nodeIds = groups.flat();
  const edges: LineEdge[] = [];
  for (let i = 0; i + 1 < groups.length; i++) {
    for (const from of groups[i]!) {
      for (const to of groups[i + 1]!) {
        const label = labels[i];
        edges.push({ from, to, operator: operators[i]!, ...(label ? { label } : {}) });
      }
    }
  }

  return { nodeIds, edges };
}

/**
 * Extract the node ids, edges and subgraphs a slice of .mmd source refers to.
 *
 * Used to translate a step's line region into the set of rendered SVG elements to focus,
 * via the `data-id` attribute Mermaid puts on each node.
 */
export function extractRegionElements(lines: string[]): RegionElements {
  const nodeIds = new Set<string>();
  const edges: Array<[string, string]> = [];
  const subgraphs = new Set<string>();

  for (const rawLine of lines) {
    const parsed = parseFlowchartLine(rawLine);
    if (parsed.subgraph) subgraphs.add(parsed.subgraph);
    for (const id of parsed.nodeIds) nodeIds.add(id);
    for (const edge of parsed.edges) edges.push([edge.from, edge.to]);
  }

  return { nodeIds, edges, subgraphs };
}

/**
 * Recover the source node id from a rendered node element's DOM id.
 *
 * Mermaid 11 renders flowchart nodes as `<g class="node" id="<renderId>-flowchart-<nodeId>-<n>">`
 * and does *not* set data-id on them - only edges carry data-id. Node ids may contain
 * hyphens, so the trailing `-<counter>` is what bounds the capture.
 */
export function nodeIdFromElementId(elementId: string): string | undefined {
  return /-flowchart-(.+)-\d+$/.exec(elementId)?.[1];
}

/**
 * Resolve a Mermaid edge path id back to its source and target nodes.
 *
 * Edge paths are rendered with `id="<diagramId>-L_<src>_<tgt>_<n>"`. Node ids may
 * themselves contain `_`, so the split is ambiguous — try every split point and keep the
 * one whose halves are both known nodes.
 */
export function parseEdgeId(elementId: string, knownNodes: Set<string>): [string, string] | undefined {
  const at = elementId.indexOf('L_');
  if (at === -1) return undefined;
  const body = elementId.slice(at + 2);

  // Trailing `_<n>` is the occurrence counter.
  const lastUnderscore = body.lastIndexOf('_');
  if (lastUnderscore === -1) return undefined;
  const pair = body.slice(0, lastUnderscore);

  for (let i = 1; i < pair.length; i++) {
    if (pair[i] !== '_') continue;
    const src = pair.slice(0, i);
    const tgt = pair.slice(i + 1);
    if (knownNodes.has(src) && knownNodes.has(tgt)) return [src, tgt];
  }
  return undefined;
}
