import { expect, test } from './fixtures.js';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

for (const [name, prefix] of [
  ['default', ''],
  ['directive override', '%%{init: {"securityLevel": "loose"}}%%\n'],
  ['frontmatter override', '---\nconfig:\n  securityLevel: loose\n---\n'],
]) {
  test(`blocks executable diagram links with ${name}`, async ({ page, baseURL, root }) => {
    await writeFile(join(root, 'security.mmd'), `${prefix}flowchart TD
  Start[Start] --> End[End]
  click Start href "javascript:document.body.dataset.diagramScript='executed'"
`);
    await page.goto(`${baseURL}/#/security`);
    const diagram = page.locator('.mermaid-host svg');
    await expect(diagram).toBeVisible();
    await expect(diagram).toContainText('Start');
    const unsafeLinks = await diagram.evaluate((svg) => [...svg.querySelectorAll('a')].filter((link) => {
      const href = link.getAttribute('href') ?? link.getAttribute('xlink:href') ?? '';
      return /^\s*(javascript|vbscript|data):/i.test(href);
    }).length);
    expect(unsafeLinks).toBe(0);
    await expect(page.locator('body')).not.toHaveAttribute('data-diagram-script', 'executed');
  });
}

// A violation can block something without breaking a visible feature, so count them.
test('renders every example under the content security policy without a violation', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    (window as unknown as { cspViolations: string[] }).cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { cspViolations: string[] }).cspViolations.push(
        `${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
  const response = await page.goto(`${baseURL}/`);
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  for (const name of ['agentic-rag', 'auth-flow', 'messaging']) {
    await page.goto(`${baseURL}/#/${name}`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
  }
  expect(await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)).toEqual([]);
});