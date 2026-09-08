import { describe, expect, it } from 'vitest';
import {
  parseDoc,
  parseHeading,
  removeSection,
  reorderSections,
  serializeDoc,
  setSection,
  validateDoc,
} from '../src/core/docFormat.js';

const DOC = `---
title: Authentication Flow
---

How auth works end to end.

## user-entry - User arrives

The user hits \`/login\`.

### Edge cases

Already-authenticated users are redirected.

## token-issue - Token is issued

A short-lived JWT is minted.
`;

describe('parseHeading', () => {
  it('splits on the first " - " so ids may contain hyphens', () => {
    expect(parseHeading('## auth-one-test - Authentication')).toEqual({
      id: 'auth-one-test',
      title: 'Authentication',
    });
  });

  it('keeps hyphens in the title too', () => {
    expect(parseHeading('## token-refresh - Refreshing an expired JWT')).toEqual({
      id: 'token-refresh',
      title: 'Refreshing an expired JWT',
    });
  });

  it('falls back to the id when there is no title', () => {
    expect(parseHeading('## overview')).toEqual({ id: 'overview', title: 'overview' });
  });

  it('ignores heading levels other than h2', () => {
    expect(parseHeading('# top')).toBeUndefined();
    expect(parseHeading('### sub - Sub')).toBeUndefined();
  });
});

describe('parseDoc', () => {
  it('separates frontmatter, overview and sections', () => {
    const doc = parseDoc(DOC);
    expect(doc.frontmatter).toBe('title: Authentication Flow');
    expect(doc.overview).toBe('How auth works end to end.');
    expect(doc.sections.map((s) => s.id)).toEqual(['user-entry', 'token-issue']);
  });

  it('keeps h3 subsections inside the step body', () => {
    const doc = parseDoc(DOC);
    expect(doc.sections[0]!.body).toContain('### Edge cases');
    expect(doc.sections[0]!.body).toContain('Already-authenticated users');
  });

  it('does not treat "## " inside a fenced code block as a heading', () => {
    const md = [
      '## step-one - First',
      '',
      '```bash',
      '## this is a shell comment',
      '```',
      '',
      'still step one',
    ].join('\n');
    const doc = parseDoc(md);
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]!.body).toContain('still step one');
  });

  it('handles a document with no frontmatter and no overview', () => {
    const doc = parseDoc('## a - A\n\nbody\n');
    expect(doc.frontmatter).toBeUndefined();
    expect(doc.overview).toBe('');
    expect(doc.sections[0]!.body).toBe('body');
  });
});

describe('phases', () => {
  const PHASED = [
    '---',
    'title: Flow',
    '---',
    '',
    'Overview prose.',
    '',
    '## sign-in - Sign in',
    '<!-- @phase Authentication -->',
    '',
    'Body one.',
    '',
    '## search - Search',
    '<!-- @phase Discovery -->',
    '',
    'Body two.',
    '',
    '## verify - Verify',
    '<!-- @phase Authentication -->',
    '',
    'Body three.',
  ].join('\n');

  it('tags a step wherever it sits, with no regard to order', () => {
    // Authentication is not contiguous: a phase is a label, not a hierarchy.
    expect(parseDoc(PHASED).sections.map((s) => [s.id, s.phase])).toEqual([
      ['sign-in', 'Authentication'],
      ['search', 'Discovery'],
      ['verify', 'Authentication'],
    ]);
  });

  it('lifts the marker out of the prose', () => {
    const doc = parseDoc(PHASED);
    expect(doc.overview).toBe('Overview prose.');
    expect(doc.sections[0]!.body).toBe('Body one.');
  });

  it('leaves steps unphased when there is no marker', () => {
    expect(parseDoc('## a - A\n\nbody\n').sections[0]!.phase).toBeUndefined();
  });

  it('ignores a marker inside a fenced block', () => {
    const doc = parseDoc('## a - A\n\n```md\n<!-- @phase Nope -->\n```\n');
    expect(doc.sections[0]!.phase).toBeUndefined();
    expect(doc.sections[0]!.body).toContain('@phase Nope');
  });

  it('round-trips', () => {
    const out = serializeDoc(parseDoc(PHASED));
    expect(parseDoc(out).sections.map((s) => s.phase)).toEqual([
      'Authentication',
      'Discovery',
      'Authentication',
    ]);
    expect(serializeDoc(parseDoc(out))).toBe(out);
  });

  it('retags a step without touching its body or position', () => {
    const doc = setSection(parseDoc(PHASED), 'search', { phase: 'Admission' });
    expect(doc.sections.map((s) => s.id)).toEqual(['sign-in', 'search', 'verify']);
    expect(doc.sections[1]).toMatchObject({ phase: 'Admission', body: 'Body two.' });
  });
});

describe('serializeDoc round-trip', () => {
  const corpus = [
    DOC,
    '## a - A\n\nbody\n',
    '---\ntitle: T\n---\n\nintro\n\n## only\n',
    'just an overview, no steps\n',
    '## a - A\n\n```json\n{ "k": [1, 2] }\n```\n',
    '# Phase\n\n## a - A\n\nbody\n',
  ];

  it.each(corpus)('serialize(parse(x)) preserves content for case %#', (input) => {
    const once = serializeDoc(parseDoc(input));
    // Serialising is idempotent: a second pass changes nothing.
    expect(serializeDoc(parseDoc(once))).toBe(once);
    // And no prose is lost.
    const doc = parseDoc(input);
    for (const section of doc.sections) expect(once).toContain(section.body.trim());
    if (doc.overview) expect(once).toContain(doc.overview);
  });

  it('preserves a JSON code block verbatim', () => {
    const md = '## cfg - Config\n\n```json\n{\n  "a": 1\n}\n```\n';
    const body = parseDoc(md).sections[0]!.body;
    expect(body).toBe('```json\n{\n  "a": 1\n}\n```');
  });
});

describe('setSection', () => {
  it('updates an existing section in place without reordering', () => {
    const doc = setSection(parseDoc(DOC), 'user-entry', { body: 'new body' });
    expect(doc.sections.map((s) => s.id)).toEqual(['user-entry', 'token-issue']);
    expect(doc.sections[0]!.body).toBe('new body');
    expect(doc.sections[0]!.title).toBe('User arrives');
  });

  it('appends a new section by default', () => {
    const doc = setSection(parseDoc(DOC), 'done', { title: 'Done', body: 'x' });
    expect(doc.sections.map((s) => s.id)).toEqual(['user-entry', 'token-issue', 'done']);
  });

  it('inserts after a named section', () => {
    const doc = setSection(parseDoc(DOC), 'mid', { after: 'user-entry' });
    expect(doc.sections.map((s) => s.id)).toEqual(['user-entry', 'mid', 'token-issue']);
  });

  it('inserts first when after is empty', () => {
    const doc = setSection(parseDoc(DOC), 'first', { after: '' });
    expect(doc.sections.map((s) => s.id)).toEqual(['first', 'user-entry', 'token-issue']);
  });

  it('rejects an invalid id', () => {
    expect(() => setSection(parseDoc(DOC), 'bad id', {})).toThrow(/Invalid step id/);
  });
});

describe('removeSection / reorderSections / validateDoc', () => {
  it('removes by id', () => {
    expect(removeSection(parseDoc(DOC), 'user-entry').sections.map((s) => s.id)).toEqual(['token-issue']);
  });

  it('reorders and keeps unnamed sections at the end', () => {
    const doc = reorderSections(parseDoc(DOC), ['token-issue']);
    expect(doc.sections.map((s) => s.id)).toEqual(['token-issue', 'user-entry']);
  });

  it('flags a duplicated step id', () => {
    const issues = validateDoc(parseDoc('## a - A\n\nx\n\n## a - Again\n\ny\n'));
    expect(issues).toMatchObject([{ code: 'duplicate-section' }]);
  });
});
