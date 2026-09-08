import { describe, expect, it } from 'vitest';
import { findRegion, isMarkerLine, parseRegions, removeRegion, setRegion } from '../src/core/markers.js';

const SIMPLE = `flowchart TD
  %% @step:start user-entry
  User[User] --> Login[Login Page]
  %% @step:end user-entry

  %% @step:start token-issue
  Login --> Auth{Valid?}
  Auth -->|yes| Token[Issue JWT]
  %% @step:end token-issue

  Token --> App[App Shell]`;

describe('isMarkerLine', () => {
  it('accepts markers with varied spacing and indentation', () => {
    expect(isMarkerLine('%% @step:start a')).toBe(true);
    expect(isMarkerLine('    %%   @step:end   a-b_c  ')).toBe(true);
  });

  it('rejects ordinary comments and inline markers', () => {
    expect(isMarkerLine('%% just a comment')).toBe(false);
    expect(isMarkerLine('A --> B %% @step:start a')).toBe(false);
    expect(isMarkerLine('%% @step:start')).toBe(false);
  });
});

describe('parseRegions', () => {
  it('reports line ranges that exclude the marker lines themselves', () => {
    const { regions, issues } = parseRegions(SIMPLE);
    expect(issues).toEqual([]);
    expect(regions.map((r) => [r.id, r.startLine, r.endLine])).toEqual([
      ['user-entry', 3, 3],
      ['token-issue', 7, 8],
    ]);
  });

  it('supports nested and overlapping regions', () => {
    const src = [
      'flowchart TD',
      '%% @step:start outer',
      'A --> B',
      '%% @step:start inner',
      'B --> C',
      '%% @step:end outer',
      'C --> D',
      '%% @step:end inner',
    ].join('\n');
    const { regions, issues } = parseRegions(src);
    expect(issues).toEqual([]);
    expect(regions.find((r) => r.id === 'outer')).toMatchObject({ startLine: 3, endLine: 5 });
    expect(regions.find((r) => r.id === 'inner')).toMatchObject({ startLine: 5, endLine: 7 });
  });

  it('flags an unclosed region', () => {
    const { issues } = parseRegions('flowchart TD\n%% @step:start a\nA --> B');
    expect(issues).toMatchObject([{ code: 'unclosed-region', line: 2, file: 'mmd' }]);
  });

  it('flags a close with no open', () => {
    const { issues } = parseRegions('flowchart TD\nA --> B\n%% @step:end ghost');
    expect(issues).toMatchObject([{ code: 'unopened-region', line: 3 }]);
  });

  it('lets an id be marked in several places', () => {
    const src = 'flowchart TD\n%% @step:start a\nA --> B\n%% @step:end a\n%% @step:start a\nB --> C\n%% @step:end a';
    const { regions, issues } = parseRegions(src);
    expect(issues).toEqual([]);
    expect(regions).toMatchObject([
      { id: 'a', startLine: 3, endLine: 3 },
      { id: 'a', startLine: 6, endLine: 6 },
    ]);
  });

  it('still flags an id reopened before it closes', () => {
    const src = 'flowchart TD\n%% @step:start a\nA --> B\n%% @step:start a\nB --> C\n%% @step:end a';
    const { issues } = parseRegions(src);
    expect(issues).toMatchObject([{ code: 'duplicate-region' }]);
  });
});

describe('setRegion', () => {
  it('wraps the requested lines and matches their indentation', () => {
    const src = 'flowchart TD\n  A --> B\n  B --> C';
    const out = setRegion(src, 'pair', 2, 3);
    expect(out).toBe(
      ['flowchart TD', '  %% @step:start pair', '  A --> B', '  B --> C', '  %% @step:end pair'].join('\n'),
    );
    expect(findRegion(out, 'pair')).toMatchObject({ startLine: 3, endLine: 4 });
  });

  it('rebases line numbers when replacing an existing region above the new range', () => {
    // `user-entry` sits above `token-issue`; moving it must not shift the caller's
    // understanding of where `token-issue` lives.
    const moved = setRegion(SIMPLE, 'user-entry', 11, 11);
    const region = findRegion(moved, 'user-entry')!;
    const line = moved.split('\n')[region.startLine - 1];
    expect(line).toContain('Token --> App');
    // The untouched region still wraps exactly the lines it did before.
    const other = findRegion(moved, 'token-issue')!;
    const body = moved.split('\n').slice(other.startLine - 1, other.endLine).join('\n');
    expect(body).toContain('Login --> Auth');
    expect(body).toContain('Auth -->|yes| Token');
  });

  it('round-trips through remove', () => {
    const out = setRegion(SIMPLE, 'extra', 11, 11);
    expect(removeRegion(out, 'extra')).toBe(SIMPLE);
  });

  it('rejects invalid ids and inverted ranges', () => {
    expect(() => setRegion(SIMPLE, 'has space', 1, 2)).toThrow(/Invalid step id/);
    expect(() => setRegion(SIMPLE, 'a', 5, 2)).toThrow(/ends .* before it starts/);
    expect(() => setRegion(SIMPLE, 'a', 1, 999)).toThrow(/outside the diagram/);
  });
});

describe('setRegions batch insertion', () => {
  const src = 'flowchart TD\n  A --> B\n  B --> C\n  C --> D';

  it('nests markers correctly when regions share a boundary', async () => {
    const { setRegions } = await import('../src/core/markers.js');
    // `outer` spans the whole body; `inner` sits inside it and shares no boundary.
    const out = setRegions(src, [
      { id: 'outer', startLine: 2, endLine: 4 },
      { id: 'inner', startLine: 3, endLine: 3 },
    ]);
    expect(out.split('\n')).toEqual([
      'flowchart TD',
      '  %% @step:start outer',
      '  A --> B',
      '  %% @step:start inner',
      '  B --> C',
      '  %% @step:end inner',
      '  C --> D',
      '  %% @step:end outer',
    ]);
    expect(parseRegions(out).issues).toEqual([]);
  });

  it('opens the widest region first and closes the narrowest first on a shared line', async () => {
    const { setRegions } = await import('../src/core/markers.js');
    const out = setRegions(src, [
      { id: 'narrow', startLine: 2, endLine: 3 },
      { id: 'wide', startLine: 2, endLine: 4 },
    ]);
    const lines = out.split('\n');
    expect(lines.indexOf('  %% @step:start wide')).toBeLessThan(lines.indexOf('  %% @step:start narrow'));
    expect(lines.indexOf('  %% @step:end narrow')).toBeLessThan(lines.indexOf('  %% @step:end wide'));
    expect(parseRegions(out).issues).toEqual([]);
  });

  it('handles overlapping regions that are not nested', async () => {
    const { setRegions } = await import('../src/core/markers.js');
    const out = setRegions(src, [
      { id: 'first', startLine: 2, endLine: 3 },
      { id: 'second', startLine: 3, endLine: 4 },
    ]);
    const { regions, issues } = parseRegions(out);
    expect(issues).toEqual([]);
    const body = (id: string) => {
      const r = regions.find((x) => x.id === id)!;
      return out.split('\n').slice(r.startLine - 1, r.endLine).join('\n');
    };
    expect(body('first')).toContain('A --> B');
    expect(body('first')).toContain('B --> C');
    expect(body('second')).toContain('C --> D');
  });
});
