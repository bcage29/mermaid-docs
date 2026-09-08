import { describe, expect, it } from 'vitest';
import { deleteStep, reorderSteps, setStep, setSteps } from '../src/core/mutate.js';
import { parseRegions } from '../src/core/markers.js';
import { parseDoc } from '../src/core/docFormat.js';

const MMD = `flowchart TD
  A --> B
  B --> C
  C --> D`;

const files = { mmd: MMD };

/** Body lines a region actually wraps, for asserting the arithmetic landed right. */
function regionBody(mmd: string, id: string): string {
  const region = parseRegions(mmd).regions.find((r) => r.id === id)!;
  return mmd.split('\n').slice(region.startLine - 1, region.endLine).join('\n');
}

describe('setStep', () => {
  it('writes a region and a documentation section together', () => {
    const out = setStep(files, { stepId: 'first', title: 'First', body: 'Body.', startLine: 2, endLine: 2 });
    expect(regionBody(out.mmd, 'first')).toBe('  A --> B');
    expect(out.md).toContain('## first - First');
    expect(out.md).toContain('Body.');
  });

  it('scaffolds documentation when the .md does not exist', () => {
    const out = setStep(files, { stepId: 'a', body: 'x' }, 'My Diagram');
    expect(out.md).toContain('title: My Diagram');
  });

  it('updates only what it is given', () => {
    const first = setStep(files, { stepId: 'a', title: 'A', body: 'one', startLine: 2, endLine: 2 });
    const second = setStep(first, { stepId: 'a', body: 'two' });
    const section = parseDoc(second.md!).sections[0]!;
    expect(section.title).toBe('A');
    expect(section.body).toBe('two');
    // Region untouched when no line range is supplied.
    expect(regionBody(second.mmd, 'a')).toBe('  A --> B');
  });
});

describe('setSteps line arithmetic', () => {
  it('keeps every region on its intended lines when writing several at once', () => {
    const out = setSteps(files, [
      { stepId: 'one', title: 'One', body: '1', startLine: 2, endLine: 2 },
      { stepId: 'two', title: 'Two', body: '2', startLine: 3, endLine: 3 },
      { stepId: 'three', title: 'Three', body: '3', startLine: 4, endLine: 4 },
    ]);
    expect(regionBody(out.mmd, 'one')).toBe('  A --> B');
    expect(regionBody(out.mmd, 'two')).toBe('  B --> C');
    expect(regionBody(out.mmd, 'three')).toBe('  C --> D');
    expect(parseRegions(out.mmd).issues).toEqual([]);
  });

  it('keeps documentation in caller order, not the bottom-up write order', () => {
    const out = setSteps(files, [
      { stepId: 'one', startLine: 2, endLine: 2 },
      { stepId: 'two', startLine: 3, endLine: 3 },
      { stepId: 'three', startLine: 4, endLine: 4 },
    ]);
    expect(parseDoc(out.md!).sections.map((s) => s.id)).toEqual(['one', 'two', 'three']);
  });

  it('handles a multi-line region spanning the whole diagram body', () => {
    const out = setSteps(files, [
      { stepId: 'all', startLine: 2, endLine: 4 },
      { stepId: 'inner', startLine: 3, endLine: 3 },
    ]);
    expect(regionBody(out.mmd, 'inner')).toBe('  B --> C');
    expect(regionBody(out.mmd, 'all')).toContain('A --> B');
    expect(regionBody(out.mmd, 'all')).toContain('C --> D');
  });
});

describe('deleteStep / reorderSteps', () => {
  it('removes both the region and the section', () => {
    const withStep = setStep(files, { stepId: 'gone', body: 'x', startLine: 2, endLine: 2 });
    const out = deleteStep(withStep, 'gone');
    expect(out.mmd).toBe(MMD);
    expect(parseDoc(out.md!).sections).toHaveLength(0);
  });

  it('reorders documentation without touching the diagram', () => {
    const two = setSteps(files, [
      { stepId: 'one', startLine: 2, endLine: 2 },
      { stepId: 'two', startLine: 3, endLine: 3 },
    ]);
    const out = reorderSteps(two, ['two', 'one']);
    expect(parseDoc(out.md!).sections.map((s) => s.id)).toEqual(['two', 'one']);
    expect(out.mmd).toBe(two.mmd);
  });
});
