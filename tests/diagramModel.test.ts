import { describe, expect, it } from 'vitest';
import { buildDiagram, frontmatterTitle } from '../src/core/diagramModel.js';
import { computeCoverage, validateDiagram } from '../src/core/validate.js';
import { parseRegions } from '../src/core/markers.js';

const MMD = `flowchart TD
  %% @step:start user-entry
  User[User] --> Login[Login Page]
  %% @step:end user-entry

  %% @step:start token-issue
  Login --> Auth{Valid?}
  %% @step:end token-issue`;

const MD = `---
title: Authentication Flow
---

Overview prose.

## user-entry - User arrives

Body one.

## token-issue - Token is issued

Body two.
`;

describe('frontmatterTitle', () => {
  it('reads a title and strips quotes', () => {
    expect(frontmatterTitle('title: Plain')).toBe('Plain');
    expect(frontmatterTitle('title: "Quoted"')).toBe('Quoted');
    expect(frontmatterTitle('other: x')).toBeUndefined();
    expect(frontmatterTitle(undefined)).toBeUndefined();
  });
});

describe('buildDiagram', () => {
  it('joins steps to their regions in document order', () => {
    const d = buildDiagram({ id: 'auth/auth-flow.mmd', relPath: 'auth/auth-flow.mmd', mmd: MMD, md: MD });
    expect(d.title).toBe('Authentication Flow');
    expect(d.name).toBe('auth-flow');
    expect(d.group).toBe('auth');
    expect(d.overview).toBe('Overview prose.');
    expect(d.steps.map((s) => s.id)).toEqual(['user-entry', 'token-issue']);
    expect(d.steps[0]!.regions).toMatchObject([{ startLine: 3, endLine: 3 }]);
    expect(d.issues).toEqual([]);
  });

  it('still renders when the sibling .md is missing', () => {
    const d = buildDiagram({ id: 'a.mmd', relPath: 'a.mmd', mmd: MMD });
    expect(d.hasDocumentation).toBe(false);
    expect(d.steps).toEqual([]);
    expect(d.title).toBe('a');
    expect(d.group).toBe('');
  });

  it('keeps a documented step that has no region, with no region attached', () => {
    const md = MD + '\n## ghost - Not in the diagram\n\nBody.\n';
    const d = buildDiagram({ id: 'a.mmd', relPath: 'a.mmd', mmd: MMD, md });
    const ghost = d.steps.find((s) => s.id === 'ghost')!;
    expect(ghost.regions).toEqual([]);
    expect(d.issues).toContainEqual(expect.objectContaining({ code: 'orphan-section' }));
  });

  it('collects every region an id is marked with, in source order', () => {
    const mmd = [
      'flowchart TD',
      '%% @step:start auth',
      '  A --> B',
      '%% @step:end auth',
      '  B --> C',
      '%% @step:start auth',
      '  C --> D',
      '%% @step:end auth',
    ].join('\n');
    const d = buildDiagram({ id: 'a.mmd', relPath: 'a.mmd', mmd, md: '## auth - Auth\n\nBody.\n' });
    expect(d.steps[0]!.regions).toMatchObject([
      { startLine: 3, endLine: 3 },
      { startLine: 7, endLine: 7 },
    ]);
    expect(d.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('validateDiagram', () => {
  it('is clean when ids line up', () => {
    expect(validateDiagram(MMD, MD)).toEqual([]);
  });

  it('warns about a region with no documentation section', () => {
    const mmd = MMD + '\n%% @step:start extra\nAuth --> Done\n%% @step:end extra';
    expect(validateDiagram(mmd, MD)).toContainEqual(
      expect.objectContaining({ code: 'orphan-region', file: 'mmd' }),
    );
  });

  it('surfaces marker errors even with no .md', () => {
    expect(validateDiagram('flowchart TD\n%% @step:start a\nA --> B', undefined)).toMatchObject([
      { code: 'unclosed-region' },
    ]);
  });
});

describe('empty region detection', () => {
  it('warns when a region wraps only blank lines', () => {
    const mmd = 'flowchart TD\n  A --> B\n%% @step:start ghost\n\n%% @step:end ghost';
    expect(validateDiagram(mmd, undefined)).toContainEqual(
      expect.objectContaining({ code: 'empty-region' }),
    );
  });

  it('warns when a region wraps only comments', () => {
    const mmd = 'flowchart TD\n%% @step:start c\n%% just a note\n%% @step:end c';
    expect(validateDiagram(mmd, undefined)).toContainEqual(
      expect.objectContaining({ code: 'empty-region' }),
    );
  });

  it('stays quiet for a region with real content', () => {
    const mmd = 'flowchart TD\n%% @step:start ok\n  A --> B\n%% @step:end ok';
    expect(validateDiagram(mmd, undefined).filter((i) => i.code === 'empty-region')).toEqual([]);
  });
});

describe('computeCoverage', () => {
  const regions = (mmd: string) => parseRegions(mmd).regions;

  it('counts the connections a walkthrough explains', () => {
    expect(computeCoverage(MMD, regions(MMD))).toEqual({ total: 2, covered: 2, uncoveredLines: [] });
  });

  it('reports the lines no step covers', () => {
    const mmd = 'flowchart TD\n%% @step:start a\n  A --> B\n%% @step:end a\n  B --> C\n  C --> D';
    expect(computeCoverage(mmd, regions(mmd))).toEqual({ total: 3, covered: 1, uncoveredLines: [5, 6] });
  });

  it('reports nothing for a diagram type whose arrows cannot be located', () => {
    const mmd = 'erDiagram\n  USER ||--o{ SESSION : has';
    expect(computeCoverage(mmd, regions(mmd))).toEqual({ total: 0, covered: 0, uncoveredLines: [] });
  });
});

describe('coverage is reported, never warned about', () => {
  it('counts uncovered connections without raising an issue', () => {
    const mmd = 'flowchart TD\n%% @step:start a\n  A --> B\n%% @step:end a\n  B --> C\n  C --> D\n  A --> D';
    const md = '## a - A\n\nBody.\n';
    // Not every connection needs narrating, so a partly documented diagram is still valid.
    expect(validateDiagram(mmd, md)).toEqual([]);
    expect(computeCoverage(mmd, parseRegions(mmd).regions)).toMatchObject({
      total: 4,
      covered: 1,
      uncoveredLines: [5, 6, 7],
    });
  });
});
