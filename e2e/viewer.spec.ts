import { expect, test } from './fixtures.js';
import type { Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const AUTH = 'auth-flow';

/**
 * A point on a link, in client coordinates.
 *
 * A vertical link's bounding box is zero-wide, which Playwright reads as invisible, so
 * connections are clicked by geometry rather than through locator actionability.
 *
 * `getScreenCTM` is not used: it does not account for the CSS transform the pan/zoom
 * library puts on an ancestor, so it reports where the link would be at 100%. Comparing
 * the element's own `getBBox` and `getBoundingClientRect` gives the real mapping, and
 * `elementFromPoint` confirms it, which also waits out the canvas's fit animation.
 */
async function linkPoint(page: Page, edgeId: string): Promise<{ x: number; y: number }> {
  return page.evaluate(async (id) => {
    let previous = '';
    let settled = 0;

    for (let attempt = 0; attempt < 200; attempt++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      // Re-queried every time: re-rendering the diagram replaces these elements, and a
      // reference held across that becomes detached and never matches the hit test again.
      const path = document.querySelector<SVGPathElement>(`.mermaid-host [data-hit-id="${id}"]`);
      if (!path) continue;

      const rect = path.getBoundingClientRect();
      const key = `${rect.x},${rect.y},${rect.width},${rect.height}`;
      settled = key === previous ? settled + 1 : 0;
      previous = key;
      // The canvas animates itself to fit on load. A point taken mid-animation passes the
      // hit test and is then somewhere else entirely by the time the click is dispatched,
      // so the link has to have stopped moving first.
      if (settled < 10) continue;

      const box = path.getBBox();
      const scale = box.height > 0 ? rect.height / box.height : rect.width / box.width;
      if (!Number.isFinite(scale) || scale <= 0) continue;

      const length = path.getTotalLength();
      // Elbowed links bend away from the midpoint, so try a few places along the line.
      for (const fraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
        const at = path.getPointAtLength(length * fraction);
        const x = rect.x + (at.x - box.x) * scale;
        const y = rect.y + (at.y - box.y) * scale;
        if (document.elementFromPoint(x, y) === path) return { x, y };
      }
    }
    throw new Error(`Could not find ${id} on screen`);
  }, edgeId);
}

async function clickLink(page: Page, edgeId: string): Promise<void> {
  const { x, y } = await linkPoint(page, edgeId);
  await page.mouse.click(x, y);
}

/** The source panel is off by default, so tests about it have to ask for it. */
async function openSource(page: Page): Promise<void> {
  await page.getByLabel('View Source').check();
  await expect(page.getByTestId('source-panel')).toBeVisible();
}

test.describe('viewer', () => {
  test('renders a diagram and its steps', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    await expect(page.getByTestId('diagram-title')).toHaveText('Authentication Flow');
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await expect(page.getByTestId('step-item')).toHaveCount(4);
    // Step 0 is the overview.
    await expect(page.getByTestId('step-counter')).toHaveText('Overview');
  });

  test('serves the app icon for the header and the favicon', async ({ page, baseURL, request }) => {
    await page.goto(baseURL);
    // A broken <img> still lays out, so check the bitmap actually decoded.
    await expect
      .poll(() => page.getByTestId('brand-mark').evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);

    const favicon = await request.get(`${baseURL}/favicon.ico`);
    expect(favicon.status()).toBe(200);
    expect(favicon.headers()['content-type']).toBe('image/x-icon');
  });

  test('next and previous move through the walkthrough', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    await page.getByTestId('next-step').click();
    await expect(page.getByTestId('step-counter')).toHaveText('Step 1 of 4');
    await expect(page.getByTestId('step-title')).toHaveText('User arrives');
    await expect(page.getByTestId('docs-body')).toContainText('unauthenticated request');

    await page.getByTestId('next-step').click();
    await expect(page.getByTestId('step-title')).toHaveText('Credentials are checked');

    await page.getByTestId('prev-step').click();
    await expect(page.getByTestId('step-title')).toHaveText('User arrives');
  });

  test('previous is disabled on the overview and next on the last step', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    await expect(page.getByTestId('prev-step')).toBeDisabled();
    // Wait for the steps: stepping is a no-op until the diagram has loaded.
    await expect(page.getByTestId('step-item')).toHaveCount(4);
    await page.keyboard.press('End');
    await expect(page.getByTestId('step-counter')).toHaveText('Step 4 of 4');
    await expect(page.getByTestId('next-step')).toBeDisabled();
  });

  test('highlights exactly the step source lines', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}/credential-check`);
    await openSource(page);
    // credential-check wraps lines 7-8 of the .mmd.
    const highlighted = page.locator('.source-line[data-highlighted="true"]');
    await expect(highlighted).toHaveCount(2);
    await expect(highlighted.first()).toContainText('Credentials valid?');
    await expect(highlighted.last()).toContainText('Auth -->|no| Login');
  });

  test('emphasises the connections a step draws and fades the rest', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}/credential-check`);
    // Cold load: hash navigation masks the pan/zoom library recreating the SVG subtree.
    await page.reload();
    await expect(page.locator('.mermaid-host svg')).toBeVisible();

    // credential-check wraps lines 7-8: Login --> Auth, and Auth -->|no| Login.
    await expect(page.locator('.mermaid-host path[data-id="L_Login_Auth_0"].is-active')).toHaveCount(1);
    await expect(page.locator('.mermaid-host path[data-id="L_Auth_Login_0"].is-active')).toHaveCount(1);
    await expect(page.locator('.mermaid-host path.flowchart-link.is-active')).toHaveCount(2);
    await expect(page.locator('.mermaid-host path.flowchart-link.is-muted')).toHaveCount(4);
    // The "no" label belongs to the step; "yes" does not.
    await expect(page.locator('.mermaid-host .edgeLabel.is-active')).toHaveCount(2);
  });

  test('emphasis survives a zoom, which recreates the SVG subtree', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}/app-entry`);
    await page.reload();
    await expect(page.locator('.mermaid-host path[data-id="L_Token_App_0"].is-active')).toHaveCount(1);

    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByTestId('fit-button').click();
    await expect(page.locator('.mermaid-host path[data-id="L_Token_App_0"].is-active')).toHaveCount(1);
    await expect(page.locator('.mermaid-host path.flowchart-link.is-muted')).toHaveCount(5);
  });

  test('the overview leaves the diagram alone', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}`);
    await page.reload();
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await expect(page.locator('.mermaid-host .is-active, .mermaid-host .is-muted')).toHaveCount(0);
  });

  test('a diagram type with no addressable connections is left alone', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/schema`);
    await openSource(page);
    await page.locator('.source-line[data-line="3"]').click();
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await expect(page.locator('.mermaid-host .is-muted')).toHaveCount(0);
  });

  test('emphasises sequence messages too', async ({ page, baseURL, root }) => {
    await writeFile(
      join(root, 'calls.mmd'),
      [
        'sequenceDiagram',
        '  App->>Api: request',
        '  %% @step:start work',
        '  Api->>Db: query',
        '  Db-->>Api: rows',
        '  %% @step:end work',
        '  Api-->>App: response',
      ].join('\n'),
    );
    await writeFile(join(root, 'calls.md'), '# Calls\n\n## work - Does the work\n\nThe database round trip.\n');

    await page.goto(`${baseURL}/#/calls/work`);
    await page.reload();
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await expect(page.locator('.mermaid-host .messageText.is-active')).toHaveCount(2);
    await expect(page.locator('.mermaid-host .messageText.is-muted')).toHaveCount(2);
    // The lines themselves, not just their labels.
    await expect(page.locator('.mermaid-host .messageLine0.is-active, .mermaid-host .messageLine1.is-active')).toHaveCount(2);
    await expect(page.locator('.mermaid-host .messageLine0.is-muted, .mermaid-host .messageLine1.is-muted')).toHaveCount(2);
  });

  test('highlights the right lines on a cold load of any step', async ({ page, baseURL }) => {
    for (const [step, lines] of [
      ['credential-check', [7, 8]],
      ['token-issue', [12, 13]],
      ['app-entry', [17]],
    ] as const) {
      await page.goto(`${baseURL}/#/${AUTH}/${step}`);
      await page.reload();
      await openSource(page);
      const highlighted = page.locator('.source-line[data-highlighted="true"]');
      await expect(highlighted).toHaveCount(lines.length);
      for (const line of lines) {
        await expect(page.locator(`.source-line[data-line="${line}"].hl`)).toHaveCount(1);
      }
    }
  });

  test('keyboard navigation works', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    await expect(page.getByTestId('step-item')).toHaveCount(4);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('step-counter')).toHaveText('Step 1 of 4');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('step-counter')).toHaveText('Step 2 of 4');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('step-counter')).toHaveText('Step 1 of 4');
    await page.keyboard.press('Home');
    await expect(page.getByTestId('step-counter')).toHaveText('Overview');
  });

  test('clicking a line moves to the step that draws it', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}/user-entry`);
    await openSource(page);
    await expect(page.locator('.source-line[data-line="3"].hl')).toHaveCount(1);

    // Line 17 is `Token --> App[App Shell]`, which the app-entry step documents.
    await page.locator('.source-line[data-line="17"]').click();
    await expect(page.getByTestId('step-title')).toHaveText('The app shell renders');
    await expect(page.getByTestId('step-counter')).toHaveText('Step 4 of 4');
    await expect(page).toHaveURL(new RegExp('/app-entry$'));
    await expect(page.locator('.source-line[data-line="17"].selected')).toHaveCount(1);
    await expect(page.locator('.source-line[data-line="3"].hl')).toHaveCount(0);
  });

  test('a line inside the current step is marked without dropping the region', async ({ page, baseURL }) => {
    // credential-check wraps lines 7-8, so clicking one of them stays on the step.
    await page.goto(`${baseURL}/#/${AUTH}/credential-check`);
    await openSource(page);
    await page.locator('.source-line[data-line="8"]').click();
    await expect(page.getByTestId('step-counter')).toHaveText('Step 2 of 4');
    await expect(page.locator('.source-line[data-line="8"].selected')).toHaveCount(1);
    await expect(page.locator('.source-line[data-highlighted="true"]')).toHaveCount(2);
  });

  test('a line no step covers is focused on its own', async ({ page, baseURL }) => {
    // schema.mmd has no documentation, so no line belongs to a step.
    await page.goto(`${baseURL}/#/schema`);
    await openSource(page);
    await page.locator('.source-line[data-line="3"]').click();
    await expect(page.locator('.source-line[data-line="3"].selected')).toHaveCount(1);
    await expect(page.locator('.source-line[data-highlighted="true"]')).toHaveCount(1);
  });

  test('a selected line clears on Escape, on re-click, and on step change', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}/credential-check`);
    await openSource(page);

    await page.locator('.source-line[data-line="8"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.source-line.selected')).toHaveCount(0);
    await expect(page.locator('.source-line[data-highlighted="true"]')).toHaveCount(2);

    await page.locator('.source-line[data-line="8"]').click();
    await page.locator('.source-line[data-line="8"]').click();
    await expect(page.locator('.source-line.selected')).toHaveCount(0);

    await page.locator('.source-line[data-line="8"]').click();
    await page.getByTestId('next-step').click();
    await expect(page.locator('.source-line.selected')).toHaveCount(0);
  });

  test('marker and blank lines are not selectable', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}/user-entry`);
    await openSource(page);
    // Selecting a line that draws nothing would blank the diagram.
    await expect(page.locator('.source-line[data-line="2"]')).toBeDisabled();
    await expect(page.locator('.source-line[data-line="5"]')).toBeDisabled();
    await expect(page.locator('.source-line[data-line="3"]')).toBeEnabled();
  });

  test('a deep link restores the step', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}/token-issue`);
    await expect(page.getByTestId('step-title')).toHaveText('A token is issued');
    await expect(page.getByTestId('step-counter')).toHaveText('Step 3 of 4');
  });

  test('renders a JSON block in the documentation as highlighted code', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}/token-issue`);
    const code = page.locator('.docs-body code.language-json');
    await expect(code).toBeVisible();
    await expect(code).toContainText('"scope"');
    // rehype-highlight tokenises the block rather than leaving it plain text.
    await expect(code.locator('.hljs-attr').first()).toBeVisible();
  });

  test('zooms to 800%', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    const zoomIn = page.getByLabel('Zoom in');
    const readout = page.getByTestId('zoom-level');
    // Each zoom step animates, so clicks have to be spaced or they interrupt each other.
    for (let i = 0; i < 30; i++) {
      if ((await readout.textContent()) === '800%') break;
      await zoomIn.click();
      await page.waitForTimeout(120);
    }
    await expect(readout).toHaveText('800%');
  });

  test('the source scrolls to the step, however the panel got there', async ({ page, baseURL, root }) => {
    // Long enough that the step is far off-screen unless it is scrolled to.
    const body = Array.from({ length: 60 }, (_, i) => `  N${i} --> N${i + 1}`);
    body.splice(50, 0, '  %% @step:start deep', '  N50 --> Far', '  %% @step:end deep');
    await writeFile(join(root, 'long.mmd'), ['flowchart TD', ...body, ''].join('\n'));
    await writeFile(join(root, 'long.md'), '# Long\n\n## deep - Far down the file\n\nDeep in the source.\n');

    // How far the step's first line sits from the middle of the scroll box.
    const offCentre = () =>
      page.evaluate(() => {
        const box = document.querySelector('.source-lines')!.getBoundingClientRect();
        const line = document.querySelector('.source-line[data-highlighted]')!.getBoundingClientRect();
        return Math.abs((line.top + line.bottom) / 2 - (box.top + box.bottom) / 2);
      });

    // Opened while already on the step: the panel is still sizing when it first scrolls.
    await page.goto(`${baseURL}/#/long/deep`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await openSource(page);
    await expect.poll(offCentre).toBeLessThan(30);

    // And the other way round: panel already open, moved to the overview and back.
    await page.goto(`${baseURL}/#/long`);
    await expect(page.locator('.source-line[data-highlighted]')).toHaveCount(0);
    await page.goto(`${baseURL}/#/long/deep`);
    await expect.poll(offCentre).toBeLessThan(30);
  });

  test('non-flowchart diagrams support line selection too', async ({ page, baseURL }) => {
    // Line highlighting is renderer-independent, so an ER diagram behaves like any other.
    await page.goto(`${baseURL}/#/schema`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await openSource(page);
    await page.locator('.source-line[data-line="2"]').click();
    await expect(page.locator('.source-line[data-line="2"].selected')).toHaveCount(1);
  });

  test('switches diagrams from the header picker', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    await page.getByTestId('diagram-select').selectOption('schema');
    await expect(page.getByTestId('diagram-title')).toHaveText('schema');
    await expect(page).toHaveURL(/#\/schema$/);
  });

  test('the picker lists every diagram by name and marks undocumented ones', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    const options = page.getByTestId('diagram-select').locator('option');
    // Flat and name-only: the folder a diagram lives in is not part of its identity.
    await expect(options).toHaveText(['auth-flow', 'schema (undocumented)']);
  });

  test('a step marked in several places highlights all of them', async ({ page, baseURL, root }) => {
    // One step, two occurrences: the auth check that runs before each request.
    await writeFile(
      join(root, 'repeat.mmd'),
      [
        'sequenceDiagram',
        '  %% @step:start auth',
        '  App->>Api: authenticate',
        '  %% @step:end auth',
        '  Api->>Db: query',
        '  %% @step:start auth',
        '  App->>Api: authenticate again',
        '  %% @step:end auth',
        '  Api->>Db: query again',
      ].join('\n'),
    );
    await writeFile(join(root, 'repeat.md'), '# Repeat\n\n## auth - Authenticates\n\nRuns before every request.\n');

    await page.goto(`${baseURL}/#/repeat/auth`);
    await page.reload();
    await expect(page.locator('.mermaid-host svg')).toBeVisible();

    // Both occurrences light up, and only they do.
    await expect(page.locator('.mermaid-host .messageText.is-active')).toHaveCount(2);
    await expect(page.locator('.mermaid-host .messageText.is-muted')).toHaveCount(2);

    await openSource(page);
    // Lines 3 and 7 are the two marked messages.
    await expect(page.locator('.source-line[data-highlighted="true"]')).toHaveCount(2);
    await expect(page.locator('.source-line[data-line="3"].hl')).toHaveCount(1);
    await expect(page.locator('.source-line[data-line="7"].hl')).toHaveCount(1);
    await expect(page.getByTestId('step-item')).toHaveCount(1);
  });

  test('a diagram is addressed by its bare name, whatever folder it is in', async ({ page, baseURL }) => {
    // auth-flow.mmd lives in examples/auth/, and the folder appears nowhere in the URL.
    await page.goto(`${baseURL}/#/auth-flow/token-issue`);
    await expect(page.getByTestId('step-title')).toHaveText('A token is issued');

    await page.getByTestId('next-step').click();
    await expect(page).toHaveURL(/#\/auth-flow\/app-entry$/);

    // A name on its own opens the overview.
    await page.goto(`${baseURL}/#/schema`);
    await expect(page.getByTestId('diagram-title')).toHaveText('schema');
  });

  test('stepping does not bury the back button', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    await expect(page.getByTestId('step-item')).toHaveCount(4);
    await page.getByTestId('diagram-select').selectOption('auth-flow');

    for (let i = 0; i < 3; i++) await page.getByTestId('next-step').click();
    await expect(page.getByTestId('step-counter')).toHaveText('Step 3 of 4');
    await expect(page).toHaveURL(/#\/auth-flow\/token-issue$/);

    // Three steps added no history: one Back leaves the diagram entirely.
    await page.goBack();
    await expect(page).not.toHaveURL(/token-issue/);
  });

  test('groups steps by phase and tags the step header', async ({ page, baseURL, root }) => {
    await writeFile(
      join(root, 'phased.mmd'),
      [
        'flowchart TD',
        '%% @step:start one',
        '  A --> B',
        '%% @step:end one',
        '%% @step:start two',
        '  B --> C',
        '%% @step:end two',
        '%% @step:start three',
        '  C --> D',
        '%% @step:end three',
      ].join('\n'),
    );
    // Setup is not contiguous: a phase tags a step, it does not reorder the walkthrough.
    await writeFile(
      join(root, 'phased.md'),
      [
        '---',
        'title: Phased',
        '---',
        '',
        'How it works.',
        '',
        '## one - First',
        '<!-- @phase Setup -->',
        '',
        'Body one.',
        '',
        '## two - Second',
        '<!-- @phase Teardown -->',
        '',
        'Body two.',
        '',
        '## three - Third',
        '<!-- @phase Setup -->',
        '',
        'Body three.',
      ].join('\n'),
    );

    await page.goto(`${baseURL}/#/phased`);
    await expect(page.getByTestId('step-item')).toHaveCount(3);
    await expect(page.getByTestId('step-phase')).toHaveText(['Setup', 'Teardown', 'Setup']);

    // The marker is lifted out of the prose rather than rendered in it.
    await expect(page.getByTestId('docs-body')).toContainText('How it works.');
    await expect(page.getByTestId('docs-body')).not.toContainText('@phase');

    await page.getByTestId('step-item').first().click();
    await expect(page.getByTestId('phase-tag')).toHaveText('Setup');
    await expect(page.getByTestId('docs-body')).not.toContainText('@phase');
    await page.getByTestId('step-item').nth(1).click();
    await expect(page.getByTestId('phase-tag')).toHaveText('Teardown');
  });

  test('lists only the first of two diagrams claiming the same name', async ({ page, baseURL, root }) => {
    // Only one file can answer to "twin", so the picker offers only that one rather than
    // a second entry that silently resolves to the first. `validate` reports the clash.
    await writeFile(join(root, 'auth', 'twin.mmd'), 'flowchart TD\n  A --> B\n');
    await writeFile(join(root, 'data', 'twin.mmd'), 'flowchart TD\n  C --> D\n');

    await page.goto(baseURL);
    const twins = page.getByTestId('diagram-select').locator('option').filter({ hasText: 'twin' });
    await expect(twins).toHaveCount(1);
    await expect(twins).toHaveText('twin (undocumented)');
  });

  test('shows which workspace it is serving', async ({ page, baseURL, root }) => {
    await page.goto(baseURL);
    // Several viewers on several ports otherwise look identical. Shown tail-first, since
    // that is the identifying part, with the whole path on hover.
    const shown = page.getByTestId('workspace-root');
    await expect(shown).toHaveAttribute('title', root);
    await expect(shown).toContainText(root.split('/').pop()!);
  });

  test('ignores diagrams nested more than one folder deep', async ({ page, baseURL, root }) => {
    await mkdir(join(root, 'auth', 'deeper'), { recursive: true });
    await writeFile(join(root, 'auth', 'deeper', 'buried.mmd'), 'flowchart TD\n  A --> B\n');
    await writeFile(join(root, 'top.mmd'), 'flowchart TD\n  A --> B\n');

    await page.goto(baseURL);
    const options = page.getByTestId('diagram-select').locator('option');
    // The root-level one appears; the two-deep one does not.
    await expect(options.filter({ hasText: 'top' })).toHaveCount(1);
    await expect(options.filter({ hasText: 'buried' })).toHaveCount(0);
  });

  test('the sidebar is the walkthrough, not a diagram list', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    await expect(page.getByTestId('diagram-item')).toHaveCount(0);
    // schema.mmd has no sibling .md yet, so switching to it empties the walkthrough.
    await page.getByTestId('diagram-select').selectOption('schema');
    await expect(page.getByTestId('step-list')).toContainText('No steps yet');
  });

  test('the progress bar tracks the walkthrough', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}`);
    const fill = page.locator('.step-progress-fill');
    await expect(fill).toHaveAttribute('style', 'width: 0%;');
    await page.keyboard.press('End');
    await expect(fill).toHaveAttribute('style', 'width: 100%;');
  });

  test('zoom to step frames the step on a sequence diagram', async ({ page, baseURL, root }) => {
    // Sequence diagrams have no addressable nodes, so the step's own messages are framed.
    // Without that the canvas silently falls back to fitting the whole diagram.
    await writeFile(
      join(root, 'seq.mmd'),
      [
        'sequenceDiagram',
        '  participant A',
        '  participant B',
        '  %% @step:start greet',
        '  A->>B: hello',
        '  %% @step:end greet',
        ...Array.from({ length: 20 }, (_, i) => `  A->>B: filler ${i}`),
        '  %% @step:start bye',
        '  A->>B: goodbye',
        '  %% @step:end bye',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(root, 'seq.md'),
      ['# Seq', '', '## greet - Say hello', '', 'Opens.', '', '## bye - Say goodbye', '', 'Closes.', ''].join('\n'),
    );

    const scale = () =>
      page.evaluate(() => {
        const el = document.querySelector('.canvas-content') as HTMLElement;
        return new DOMMatrixReadOnly(getComputedStyle(el).transform).a;
      });

    await page.goto(`${baseURL}/#/seq`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await expect(page.locator('.mermaid-host.is-fitted')).toHaveCount(1);
    const overview = await scale();

    await page.getByTestId('step-item').first().click();
    await expect(page.getByTestId('step-title')).toHaveText('Say hello');
    // Mermaid puts a `data-id` on sequence lines that is not an edge id; matching on it
    // muted every line and highlighted none.
    await expect(page.locator('.mermaid-host .messageLine0.is-active')).toHaveCount(1);
    await page.waitForTimeout(500);
    // A tall diagram fits at well under 1x; framing one message zooms past that.
    expect(await scale()).toBeGreaterThan(overview * 1.5);
  });

  test('clicking a sequence message moves to the step that documents it', async ({ page, baseURL, root }) => {
    await writeFile(
      join(root, 'seq2.mmd'),
      [
        'sequenceDiagram',
        '  participant A',
        '  participant B',
        '  %% @step:start greet',
        '  A->>B: hello',
        '  %% @step:end greet',
        '  %% @step:start bye',
        '  A->>B: goodbye',
        '  %% @step:end bye',
        '',
      ].join('\n'),
    );
    await writeFile(
      join(root, 'seq2.md'),
      ['# Seq2', '', '## greet - Say hello', '', 'Opens.', '', '## bye - Say goodbye', '', 'Closes.', ''].join('\n'),
    );

    await page.goto(`${baseURL}/#/seq2`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();

    // The second message, clicked at the midpoint of its line.
    const point = await page.evaluate(() => {
      const line = document.querySelectorAll('.mermaid-host .messageLine0')[1]!.getBoundingClientRect();
      return { x: line.left + line.width / 2, y: line.top + line.height / 2 };
    });
    await page.mouse.click(point.x, point.y);
    await expect(page.getByTestId('step-title')).toHaveText('Say goodbye');

    // Mermaid scopes its styles by svg id, and `#id line` outranks any class selector:
    // the hit targets get pinned back to 2px and become unclickable when zoomed out.
    const stroke = await page.evaluate(
      () => getComputedStyle(document.querySelector('line.mmdocs-hit')!).strokeWidth,
    );
    expect(stroke).toBe('14px');
  });

  test('a line selected from the diagram is brought into view in the source', async ({ page, baseURL, root }) => {
    // Comment padding keeps the diagram small enough to stay fully visible while pushing
    // the documented message far down the file.
    const padding = Array.from({ length: 60 }, (_, i) => `  %% filler ${i}`);
    await writeFile(
      join(root, 'far.mmd'),
      [
        'sequenceDiagram',
        '  participant A',
        '  participant B',
        '  A->>B: first',
        ...padding,
        '  %% @step:start last',
        '  A->>B: the last one',
        '  %% @step:end last',
        '',
      ].join('\n'),
    );
    await writeFile(join(root, 'far.md'), '# Far\n\n## last - The last message\n\nAt the end of the file.\n');

    await page.goto(`${baseURL}/#/far`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await openSource(page);
    expect(await page.evaluate(() => document.querySelector('.source-lines')!.scrollTop)).toBe(0);

    // The documented message, which is line 66 - well below the visible source.
    const point = await page.evaluate(() => {
      const lines = [...document.querySelectorAll('.mermaid-host .messageLine0')];
      const r = lines[lines.length - 1]!.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(point.x, point.y);

    await expect(page.getByTestId('step-title')).toHaveText('The last message');
    await expect(page.locator('.source-line.selected')).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const box = document.querySelector('.source-lines')!.getBoundingClientRect();
          const r = document.querySelector('.source-line.selected')!.getBoundingClientRect();
          return r.top >= box.top && r.bottom <= box.bottom;
        }),
      )
      .toBe(true);
  });

  test('fullscreen can be entered and left', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    const button = page.getByTestId('fullscreen-toggle');
    await expect(button).toHaveAttribute('aria-label', 'Enter fullscreen');
    await button.click();
    await expect(button).toHaveAttribute('aria-label', 'Leave fullscreen');
    expect(await page.evaluate(() => document.fullscreenElement?.className)).toBe('app');
    await button.click();
    await expect(button).toHaveAttribute('aria-label', 'Enter fullscreen');
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
  });

  test('clicking a connection moves to the step that documents it', async ({ page, baseURL }) => {
    // From the overview: on a step, zoom-to-step frames that step and the rest is off-screen.
    await page.goto(`${baseURL}/#/${AUTH}`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();

    // Line 17, Token --> App, belongs to the app-entry step.
    await clickLink(page, 'L_Token_App_0');
    await expect(page.getByTestId('step-title')).toHaveText('The app shell renders');
    await expect(page).toHaveURL(new RegExp('/app-entry$'));
    await expect(page.locator('.mermaid-host path[data-id="L_Token_App_0"].is-active')).toHaveCount(1);
    // Opened afterwards: resizing the canvas would move the link out from under the click.
    await openSource(page);
    await expect(page.locator('.source-line[data-line="17"].selected')).toHaveCount(1);
  });

  test('dragging the diagram does not count as clicking a connection', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    const { x, y } = await linkPoint(page, 'L_Token_App_0');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y + 60, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('step-counter')).toHaveText('Overview');
  });

  test('the steps panel collapses and comes back', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    const panelWidth = () =>
      page.evaluate(() => Math.round(document.querySelector('.sidebar-panel')!.getBoundingClientRect().width));
    expect(await panelWidth()).toBeGreaterThan(80);

    await page.getByTestId('collapse-steps').click();
    await expect(page.getByTestId('expand-steps')).toBeVisible();
    expect(await panelWidth()).toBe(0);

    await page.getByTestId('expand-steps').click();
    await expect(page.getByTestId('expand-steps')).toHaveCount(0);
    expect(await panelWidth()).toBeGreaterThan(80);

    // The header collapses it too, so the corner button is not the only way.
    await page.getByTestId('collapse-steps-header').click();
    expect(await panelWidth()).toBe(0);
  });

  test('the theme can be switched and is remembered', async ({ page, baseURL }) => {
    await page.goto(baseURL);
    // The default follows the OS, so this asserts the switch, not a particular start.
    const initial = await page.locator('html').getAttribute('data-theme');
    expect(initial === 'dark' || initial === 'light').toBe(true);
    const flipped = initial === 'dark' ? 'light' : 'dark';

    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped);
    // Mermaid owns the diagram's palette, so it has to re-render, not just recolour.
    await expect(page.locator('.mermaid-host svg')).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', flipped);
  });

  test('the participant row stays in view while panning a sequence diagram', async ({ page, baseURL, root }) => {
    // Tall enough that the participant row would scroll away without the sticky header,
    // and that a pan cannot carry the whole diagram past the viewport - the row is only
    // held for as far as the diagram itself reaches.
    await writeFile(
      join(root, 'tall.mmd'),
      [
        'sequenceDiagram',
        '  autonumber',
        '  participant A',
        '  participant B',
        ...Array.from({ length: 150 }, (_, i) => `  A->>B: message ${i}`),
        '',
      ].join('\n'),
    );

    await page.goto(`${baseURL}/#/tall`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();

    const geometry = async () =>
      page.evaluate(() => {
        const actor = document.querySelector('rect.actor-top')!.getBoundingClientRect();
        const viewport = document.querySelector('.canvas-viewport')!.getBoundingClientRect();
        const svg = document.querySelector('.mermaid-host svg')!.getBoundingClientRect();
        return { actorTop: actor.top, viewportTop: viewport.top, svgTop: svg.top };
      });

    const before = await geometry();
    expect(before.actorTop).toBeGreaterThan(before.viewportTop);

    // Drag the diagram up far enough that the participant row would otherwise leave.
    const box = (await page.locator('.canvas-viewport').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 20, { steps: 10 });
    await page.mouse.up();

    const after = await geometry();
    // The diagram really moved, and the row stayed at the top instead of going with it.
    expect(after.svgTop).toBeLessThan(before.svgTop - 50);
    expect(after.actorTop).toBeGreaterThanOrEqual(before.viewportTop - 2);
    expect(after.actorTop).toBeLessThan(before.viewportTop + 30);
  });

  test('fit centres the diagram whatever its proportions', async ({ page, baseURL, root }) => {
    // Far taller than it is wide, which is where a fit that measures the wrapper rather
    // than the diagram leaves it off-centre.
    await writeFile(
      join(root, 'narrow.mmd'),
      [
        'sequenceDiagram',
        '  participant A',
        '  participant B',
        ...Array.from({ length: 80 }, (_, i) => `  A->>B: m${i}`),
        '',
      ].join('\n'),
    );

    await page.goto(`${baseURL}/#/narrow`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await page.getByTestId('fit-button').click();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const area = document.querySelector('.canvas-viewport')!.getBoundingClientRect();
          const svg = document.querySelector('.mermaid-host svg')!.getBoundingClientRect();
          return {
            offCentreX: Math.round(Math.abs(svg.left - area.left - (area.right - svg.right))),
            offCentreY: Math.round(Math.abs(svg.top - area.top - (area.bottom - svg.bottom))),
            contained: svg.width <= area.width + 2 && svg.height <= area.height + 2,
          };
        }),
      )
      .toEqual({ offCentreX: 0, offCentreY: expect.any(Number), contained: true });
  });

  test('the participant row is not frozen on a flowchart', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/#/${AUTH}`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await expect(page.locator('.mmdocs-actor-backdrop')).toHaveCount(0);
  });

  test('the autonumber discs sit on top of the lifelines', async ({ page, baseURL, root }) => {
    await writeFile(
      join(root, 'numbered.mmd'),
      [
        'sequenceDiagram',
        '  autonumber',
        '  participant A',
        '  participant B',
        ...Array.from({ length: 12 }, (_, i) => `  A->>B: message ${i}`),
        '',
      ].join('\n'),
    );

    await page.goto(`${baseURL}/#/numbered`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();

    // Each lifeline shares a group with its actor box, which the sticky header keeps last,
    // so without intervention every number is painted over.
    const covered = () =>
      page.evaluate(() => {
        const svg = document.querySelector('.mermaid-host svg')!;
        const lifelines = [...svg.querySelectorAll('.actor-line')];
        return [...svg.querySelectorAll('text.sequenceNumber')].filter((n) =>
          lifelines.some((l) => Boolean(n.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING)),
        ).length;
      });
    await expect.poll(covered).toBe(0);

    // The lifelines are still drawn, and the actor row still ends up on top.
    await expect(page.locator('.mermaid-host .actor-line')).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => document.querySelector('.mermaid-host svg')!.lastElementChild!.tagName)).toBe('g');
  });

  test('a diagram added on disk appears without a page reload', async ({ page, baseURL, root }) => {
    await page.goto(baseURL);
    const options = page.getByTestId('diagram-select').locator('option');
    // examples/ ships auth-flow and schema; wait for the list before adding to it.
    await expect(options).toHaveCount(2);
    await writeFile(join(root, 'auth', 'later.mmd'), 'flowchart TD\n  A --> B\n', 'utf8');
    await expect(options).toHaveCount(3);
    await expect(options.filter({ hasText: 'later' })).toHaveCount(1);
  });

  test('live reloads when a file changes on disk', async ({ page, baseURL, root }) => {
    await page.goto(`${baseURL}/#/${AUTH}`);
    await expect(page.getByTestId('step-item')).toHaveCount(4);

    const docPath = join(root, 'auth', 'auth-flow.md');
    const md = await readFile(docPath, 'utf8');
    await writeFile(docPath, `${md}\n## added-live - Added while open\n\nWritten by the test.\n`, 'utf8');

    await expect(page.getByTestId('step-item')).toHaveCount(5);
    await expect(page.getByTestId('step-list')).toContainText('Added while open');
  });

  test('shows a validation banner instead of failing to render', async ({ page, baseURL, root }) => {
    await writeFile(
      join(root, 'auth', 'auth-flow.mmd'),
      'flowchart TD\n%% @step:start broken\n  A --> B\n',
      'utf8',
    );
    await page.goto(`${baseURL}/#/${AUTH}`);
    // Collapsed by default: a summary, not a wall of text over the diagram.
    await expect(page.getByTestId('issue-summary')).toContainText('1 problem');
    await expect(page.getByTestId('issue-banner').locator('li')).toHaveCount(0);

    await page.getByTestId('issue-summary').click();
    await expect(page.getByTestId('issue-banner')).toContainText('never closed');

    // The diagram still renders despite the unbalanced marker.
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
  });

  test('a partly documented diagram is not flagged as a problem', async ({ page, baseURL, root }) => {
    // Not every connection needs narrating, so coverage is never a warning.
    await writeFile(
      join(root, 'partial.mmd'),
      ['flowchart TD', '%% @step:start one', '  A --> B', '%% @step:end one', '  B --> C', '  C --> D'].join('\n'),
    );
    await writeFile(join(root, 'partial.md'), '# Partial\n\n## one - First hop\n\nBody.\n');

    await page.goto(`${baseURL}/#/partial`);
    await expect(page.locator('.mermaid-host svg')).toBeVisible();
    await expect(page.getByTestId('issue-banner')).toHaveCount(0);
  });
});
