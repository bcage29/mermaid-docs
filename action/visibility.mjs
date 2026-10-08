// Run by action.yml before anything is built or uploaded. Plain JavaScript, because it runs
// from the action's checkout in the user's workflow, where nothing has been compiled.

/**
 * Whether publishing this repository's walkthroughs exposes something that was private.
 *
 * A Pages site from a private or internal repository is public on every plan except
 * GitHub Enterprise Cloud, which can restrict it to people who can read the repository.
 * The Pages API reports which one a site is; when it cannot say - Pages not yet enabled,
 * or the token not allowed to ask - the site is assumed public, and publishing has to be
 * confirmed.
 *
 * @param {{ visibility?: string, pagesPublic?: boolean, confirmed: boolean }} facts
 * @returns {{ level: 'ok' | 'notice' | 'warning' | 'error', message?: string }}
 */
export function decide({ visibility, pagesPublic, confirmed }) {
  if (visibility === 'public') return { level: 'ok' };

  const repo = visibility ? `This repository is ${visibility}` : "This repository's visibility could not be read";
  if (pagesPublic === false) {
    return {
      level: 'notice',
      message: `${repo}, and its GitHub Pages site is restricted to people who can read the repository.`,
    };
  }

  const site =
    pagesPublic === true
      ? 'its GitHub Pages site is public'
      : 'its GitHub Pages site will be public unless access to it is restricted (GitHub Enterprise Cloud only)';
  const exposure = 'every diagram and walkthrough in the folder can be read by anyone on the internet';
  if (confirmed) {
    return { level: 'warning', message: `${repo}, but ${site}: ${exposure}. Published because confirm-public-site is true.` };
  }
  return {
    level: 'error',
    message:
      `${repo}, but ${site}: ${exposure}. Nothing was published. ` +
      'If that is intended, set "confirm-public-site: true" on the mermaid-docs step.',
  };
}

async function getJson(fetchImpl, url, token) {
  try {
    const res = await fetchImpl(url, {
      headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    return res.ok ? await res.json() : undefined;
  } catch {
    return undefined;
  }
}

/** Workflow commands are one line each; these are the characters they reserve. */
function escapeCommand(text) {
  return text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/**
 * Read the facts from GitHub, report the decision, and say whether to carry on.
 *
 * @param {{ env: Record<string, string | undefined>, fetch: typeof fetch, write: (line: string) => void, summary: (text: string) => void }} io
 * @returns {Promise<boolean>}
 */
export async function run({ env, fetch: fetchImpl, write, summary }) {
  const api = env.GITHUB_API_URL ?? 'https://api.github.com';
  const repo = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN ?? '';

  const repoInfo = repo ? await getJson(fetchImpl, `${api}/repos/${repo}`, token) : undefined;
  const visibility = repoInfo?.visibility ?? (env.EVENT_VISIBILITY || undefined);
  const pages =
    visibility && visibility !== 'public' && repo ? await getJson(fetchImpl, `${api}/repos/${repo}/pages`, token) : undefined;

  const { level, message } = decide({
    visibility,
    pagesPublic: typeof pages?.public === 'boolean' ? pages.public : undefined,
    confirmed: env.CONFIRM_PUBLIC_SITE === 'true',
  });
  if (message) {
    write(`::${level}::${escapeCommand(message)}`);
    if (level !== 'notice') summary(`> [!${level === 'error' ? 'CAUTION' : 'WARNING'}]\n> ${message}\n`);
  }
  return level !== 'error';
}

const { pathToFileURL } = await import('node:url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { appendFileSync } = await import('node:fs');
  const ok = await run({
    env: process.env,
    fetch,
    write: (line) => process.stdout.write(`${line}\n`),
    summary: (text) => {
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
    },
  });
  if (!ok) process.exitCode = 1;
}
