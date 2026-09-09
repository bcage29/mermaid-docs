import { describe, expect, it } from 'vitest';
import { detectDiagramKind, listConnections } from '../src/core/connections.js';

const pairs = (mmd: string) => listConnections(mmd).map((c) => [c.from, c.to]);

describe('detectDiagramKind', () => {
  it('reads the declaration', () => {
    expect(detectDiagramKind('flowchart TD\n A --> B')).toBe('flowchart');
    expect(detectDiagramKind('graph LR\n A --> B')).toBe('flowchart');
    expect(detectDiagramKind('sequenceDiagram\n A->>B: hi')).toBe('sequence');
    expect(detectDiagramKind('architecture-beta\n service api(server)[API]')).toBe('architecture');
    expect(detectDiagramKind('classDiagram\n Animal <|-- Duck')).toBe('other');
    expect(detectDiagramKind('')).toBe('other');
  });

  it('looks past frontmatter, directives and blank lines', () => {
    expect(detectDiagramKind('---\ntitle: Auth\n---\n\n%%{init: {}}%%\nflowchart TD\n A --> B')).toBe('flowchart');
  });
});

describe('listConnections', () => {
  it('parses architecture edges and their direction', () => {
    const out = listConnections([
      'architecture-beta',
      'service web(internet)[Web]',
      'service api(server)[API]',
      'web:R --> L:api',
      'web:B <-- T:api',
    ].join('\n'));

    expect(out.map(({ from, to, line }) => ({ from, to, line }))).toEqual([
      { from: 'web', to: 'api', line: 4 },
      { from: 'api', to: 'web', line: 5 },
    ]);
  });

  it('numbers connections in source order', () => {
    const out = listConnections('flowchart TD\n  A --> B\n  B --> C');
    expect(out.map((c) => [c.index, c.line, c.from, c.to])).toEqual([
      [0, 2, 'A', 'B'],
      [1, 3, 'B', 'C'],
    ]);
  });

  it('expands chains into one connection each', () => {
    expect(pairs('flowchart TD\n A --> B --> C')).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ]);
  });

  it('expands fan-out on both sides', () => {
    expect(pairs('flowchart TD\n A --> B & C')).toEqual([
      ['A', 'B'],
      ['A', 'C'],
    ]);
    expect(pairs('flowchart TD\n A & B --> C')).toEqual([
      ['A', 'C'],
      ['B', 'C'],
    ]);
  });

  it('does not split on an ampersand inside a node label', () => {
    expect(pairs('flowchart TD\n A[read & write] --> B')).toEqual([['A', 'B']]);
  });

  it('lists invisible links but leaves them out of the index', () => {
    const out = listConnections('flowchart TD\n A --> B\n B ~~~ C\n C --> D');
    expect(out.map((c) => c.index)).toEqual([0, -1, 1]);
    expect(out[1]).toMatchObject({ from: 'B', to: 'C', invisible: true });
  });

  it('reads pipe edge labels', () => {
    const [edge] = listConnections('flowchart TD\n Auth -->|yes| Token');
    expect(edge).toMatchObject({ from: 'Auth', to: 'Token', label: 'yes' });
  });

  it('reads mid-arrow edge labels', () => {
    expect(listConnections('flowchart TD\n A -- yes --> B')).toHaveLength(1);
    expect(pairs('flowchart TD\n A -- yes --> B')).toEqual([['A', 'B']]);
  });

  it('is not confused by an arrow inside a quoted label', () => {
    expect(pairs('flowchart TD\n A["a --> b"] --> B')).toEqual([['A', 'B']]);
  });

  it('skips markers, comments and keyword statements', () => {
    const out = listConnections(
      ['flowchart TD', '%% @step:start one', '%% a comment', 'classDef big fill:#f00', 'A --> B', '%% @step:end one'].join('\n'),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ from: 'A', to: 'B', line: 5 });
  });

  it('numbers repeated node pairs so each edge id is unique', () => {
    const out = listConnections('flowchart TD\n A --> B\n A --> B');
    expect(out.map((c) => c.edgeId)).toEqual(['L_A_B_0', 'L_A_B_1']);
  });

  it('reads sequence messages of every arrow form', () => {
    for (const arrow of ['->>', '-->>', '->', '-->', '-x', '--x', '-)', '--)', '<<->>']) {
      expect(pairs(`sequenceDiagram\n A${arrow}B: hi`)).toEqual([['A', 'B']]);
    }
  });

  it('keeps sequence message text as the label and ignores arrows inside it', () => {
    const [message] = listConnections('sequenceDiagram\n Alice->>Bob: send a ->> b');
    expect(message).toMatchObject({ from: 'Alice', to: 'Bob', label: 'send a ->> b' });
  });

  it('ignores activation markers on the target', () => {
    expect(pairs('sequenceDiagram\n A->>+B: hi\n B-->>-A: bye')).toEqual([
      ['A', 'B'],
      ['B', 'A'],
    ]);
  });

  it('skips sequence statements that declare no message', () => {
    const out = listConnections(
      ['sequenceDiagram', '  participant A', '  actor B', '  Note right of A: thinking', '  loop every day', '  A->>B: hi', '  end'].join('\n'),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ from: 'A', to: 'B', line: 6 });
  });

  it('returns nothing for diagram types it cannot parse', () => {
    expect(listConnections('classDiagram\n Animal <|-- Duck')).toEqual([]);
    expect(listConnections('stateDiagram-v2\n [*] --> Still')).toEqual([]);
  });
});
