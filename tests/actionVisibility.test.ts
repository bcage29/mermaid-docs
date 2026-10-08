import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain JavaScript run by action.yml, with no declarations
import { decide, run } from '../action/visibility.mjs';

describe('action visibility gate', () => {
  it('lets a public repository publish without a word', () => {
    expect(decide({ visibility: 'public', confirmed: false })).toEqual({ level: 'ok' });
  });

  it('refuses a private repository until publishing is confirmed', () => {
    const refused = decide({ visibility: 'private', pagesPublic: true, confirmed: false });
    expect(refused.level).toBe('error');
    expect(refused.message).toContain('This repository is private, but its GitHub Pages site is public');
    expect(refused.message).toContain('confirm-public-site: true');

    const confirmed = decide({ visibility: 'private', pagesPublic: true, confirmed: true });
    expect(confirmed.level).toBe('warning');
    expect(confirmed.message).toContain('anyone on the internet');
  });

  it('treats an internal repository like a private one', () => {
    expect(decide({ visibility: 'internal', confirmed: false }).level).toBe('error');
  });

  it('assumes a site it cannot ask about is public', () => {
    const refused = decide({ visibility: 'private', confirmed: false });
    expect(refused.level).toBe('error');
    expect(refused.message).toContain('will be public unless access to it is restricted');
  });

  it('fails closed when the repository cannot be read either', () => {
    expect(decide({ confirmed: false }).level).toBe('error');
  });

  it('needs no confirmation for a site restricted to repository readers', () => {
    expect(decide({ visibility: 'private', pagesPublic: false, confirmed: false }).level).toBe('notice');
  });
});

describe('action visibility run', () => {
  const env = { GITHUB_REPOSITORY: 'acme/app', GITHUB_API_URL: 'https://api.test', GITHUB_TOKEN: 't' };

  function respond(routes: Record<string, unknown>) {
    return async (url: string) =>
      url in routes ? new Response(JSON.stringify(routes[url])) : new Response('{}', { status: 404 });
  }

  it('stops, and says why, for a private repository whose site is public', async () => {
    const lines: string[] = [];
    const summaries: string[] = [];
    const ok = await run({
      env,
      fetch: respond({
        'https://api.test/repos/acme/app': { visibility: 'private' },
        'https://api.test/repos/acme/app/pages': { public: true },
      }),
      write: (line: string) => lines.push(line),
      summary: (text: string) => summaries.push(text),
    });
    expect(ok).toBe(false);
    expect(lines[0]).toMatch(/^::error::This repository is private/);
    expect(summaries[0]).toContain('[!CAUTION]');
  });

  it('carries on for a restricted site without asking', async () => {
    const lines: string[] = [];
    const ok = await run({
      env,
      fetch: respond({
        'https://api.test/repos/acme/app': { visibility: 'private' },
        'https://api.test/repos/acme/app/pages': { public: false },
      }),
      write: (line: string) => lines.push(line),
      summary: () => undefined,
    });
    expect(ok).toBe(true);
    expect(lines[0]).toMatch(/^::notice::/);
  });

  it('falls back to the event payload when the API will not answer', async () => {
    const ok = await run({
      env: { ...env, EVENT_VISIBILITY: 'public' },
      fetch: respond({}),
      write: () => undefined,
      summary: () => undefined,
    });
    expect(ok).toBe(true);
  });
});
