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