// Records assets/walkthrough.gif: the viewer in light mode stepping through
// examples/architecture/agentic-rag.mmd, then opening the source panel for the last steps.
//
// Needs a build (`npm run build`), Playwright's Chromium, and ffmpeg on PATH. See
// assets/README.md for a Docker one-liner that provides all three.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'assets/walkthrough.gif';
const DIAGRAM = 'agentic-rag';
const VIEWPORT = { width: 1280, height: 800 };
// The viewer's step animation runs for 1000 ms; capture a little past it.
const TRANSITION_MS = 1200;
const HOLD_MS = 2200;
// About 12 fps during transitions. Faster adds megabytes without looking smoother.
const FRAME_MS = 80;

function startServer() {
  const child = spawn('node', ['dist/cli/index.js', 'examples', '--no-open'], { stdio: 'pipe' });
  return new Promise((resolve, reject) => {
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(buffer);
      if (match) resolve({ url: match[0], child });
    });
    child.stderr.pipe(process.stderr);
    child.on('exit', (code) => reject(new Error(`Server exited early with code ${code}`)));
  });
}

const dir = await mkdtemp(join(tmpdir(), 'mermaid-docs-gif-'));
const { url, child } = await startServer();
const browser = await chromium.launch();
/** @type {{ file: string, seconds: number }[]} */
const frames = [];

try {
  const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('mermaid-docs:theme', 'light'));
  await page.goto(`${url}/#/${DIAGRAM}`);
  await page.locator('.mermaid-host.is-fitted').waitFor();
  // Park the pointer on empty sidebar space so no hover state shows up in the frames.
  await page.mouse.move(110, 700);
  await page.waitForTimeout(500);

  let shots = 0;
  const shoot = async () => {
    const file = join(dir, `${String(shots++).padStart(4, '0')}.png`);
    await page.screenshot({ path: file });
    return file;
  };
  const hold = async (ms) => frames.push({ file: await shoot(), seconds: ms / 1000 });
  // Each frame lasts until the next one was taken, so playback matches real time.
  const transition = async (key) => {
    await page.keyboard.press(key);
    const start = Date.now();
    let last = start;
    let file = await shoot();
    while (Date.now() - start < TRANSITION_MS) {
      await page.waitForTimeout(Math.max(0, FRAME_MS - (Date.now() - last)));
      const next = await shoot();
      const now = Date.now();
      frames.push({ file, seconds: (now - last) / 1000 });
      file = next;
      last = now;
    }
    frames.push({ file, seconds: HOLD_MS / 1000 });
  };

  await hold(HOLD_MS);
  for (let step = 1; step <= 3; step++) await transition('ArrowRight');
  await transition('`');
  for (let step = 4; step <= 5; step++) await transition('ArrowRight');
} finally {
  await browser.close();
  child.kill('SIGTERM');
}

const list = frames.map((f) => `file '${f.file}'\nduration ${f.seconds.toFixed(3)}`);
// The concat demuxer ignores the last entry's duration unless the file is listed again.
list.push(`file '${frames.at(-1).file}'`);
await writeFile(join(dir, 'frames.txt'), list.join('\n') + '\n');

execFileSync(
  'ffmpeg',
  [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', join(dir, 'frames.txt'),
    '-fps_mode', 'vfr',
    '-vf', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    '-loop', '0',
    OUT,
  ],
  { stdio: 'inherit' },
);
// KEEP_FRAMES=1 leaves the screenshots behind for checking a recording frame by frame.
if (process.env.KEEP_FRAMES) console.log(`Frames kept in ${dir}`);
else await rm(dir, { recursive: true, force: true });
console.log(`Wrote ${OUT} from ${frames.length} frames`);
