import { describe, expect, it } from 'vitest';
import { extractRegionElements, parseEdgeId } from '../src/core/mermaidIds.js';

const ids = (src: string) => [...extractRegionElements(src.split('\n')).nodeIds].sort();
const edges = (src: string) => extractRegionElements(src.split('\n')).edges;

describe('extractRegionElements', () => {
  it('reads both ends of a simple edge, ignoring shape labels', () => {
    expect(ids('User[User] --> Login[Login Page]')).toEqual(['Login', 'User']);
    expect(edges('User[User] --> Login[Login Page]')).toEqual([['User', 'Login']]);
  });

  it('handles every edge operator form', () => {
    for (const op of ['-->', '---', '-.->', '==>', '--x', '--o', '<-->', '~~~']) {
      expect(ids(`A ${op} B`)).toEqual(['A', 'B']);
    }
  });

  it('ignores pipe edge labels', () => {
    expect(ids('Auth -->|yes| Token')).toEqual(['Auth', 'Token']);
    expect(edges('Auth -->|yes| Token')).toEqual([['Auth', 'Token']]);
  });

  it('is not confused by an arrow inside a quoted label', () => {
    expect(ids('A["send a --> b"] --> B')).toEqual(['A', 'B']);
  });

  it('reads chained edges', () => {
    expect(edges('A --> B --> C')).toEqual([
      ['A', 'B'],
      ['B', 'C'],
    ]);
  });

  it('handles the various node shapes', () => {
    expect(ids('Auth{Valid?} --> Store[(Database)]')).toEqual(['Auth', 'Store']);
    expect(ids('R((circle)) --> S>flag]')).toEqual(['R', 'S']);
  });

  it('keeps underscores and hyphens in ids', () => {
    expect(ids('auth_one-test --> b_two')).toEqual(['auth_one-test', 'b_two']);
  });

  it('picks up bare node declarations', () => {
    expect(ids('Login[Login Page]')).toEqual(['Login']);
  });

  it('records subgraphs', () => {
    const out = extractRegionElements(['subgraph backend', 'A --> B', 'end']);
    expect([...out.subgraphs]).toEqual(['backend']);
    expect(out.nodeIds.has('backend')).toBe(true);
  });

  it('skips step markers, comments and keyword statements', () => {
    const out = extractRegionElements([
      '%% @step:start a',
      '%% a plain comment',
      'classDef big fill:#f00',
      'A --> B %% trailing comment',
      '%% @step:end a',
    ]);
    expect([...out.nodeIds].sort()).toEqual(['A', 'B']);
  });
});

describe('parseEdgeId', () => {
  it('resolves a simple edge id', () => {
    expect(parseEdgeId('mermaid-1-L_A_B_0', new Set(['A', 'B']))).toEqual(['A', 'B']);
  });

  it('disambiguates node ids containing underscores', () => {
    const known = new Set(['auth_one', 'token_two']);
    expect(parseEdgeId('d-L_auth_one_token_two_0', known)).toEqual(['auth_one', 'token_two']);
  });

  it('returns undefined when neither split matches a known node', () => {
    expect(parseEdgeId('d-L_A_B_0', new Set(['X']))).toBeUndefined();
    expect(parseEdgeId('not-an-edge', new Set(['A']))).toBeUndefined();
  });
});

describe('nodeIdFromElementId', () => {
  it('recovers the source node id from a rendered element id', async () => {
    const { nodeIdFromElementId } = await import('../src/core/mermaidIds.js');
    expect(nodeIdFromElementId('mmdocs-1-flowchart-User-0')).toBe('User');
  });

  it('keeps hyphens in the node id', async () => {
    const { nodeIdFromElementId } = await import('../src/core/mermaidIds.js');
    expect(nodeIdFromElementId('mmdocs-3-flowchart-auth-one-test-0')).toBe('auth-one-test');
  });

  it('returns undefined for anything else', async () => {
    const { nodeIdFromElementId } = await import('../src/core/mermaidIds.js');
    expect(nodeIdFromElementId('mmdocs-1-L_A_B_0')).toBeUndefined();
    expect(nodeIdFromElementId('')).toBeUndefined();
  });
});
