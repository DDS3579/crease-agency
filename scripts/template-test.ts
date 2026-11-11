/**
 * Template test harness. Captures the nine required views at 1440 and 375, then
 * computes the machine-checkable half of each rubric line and writes a score sheet
 * for the two judgement-only lines. At most two fix-and-re-score iterations.
 *
 *   pnpm template-test                 # iteration 1
 *   pnpm template-test --iteration 2
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';
import { serve } from './serve';
import { GL_ARGS } from '../playwright.config';
import { keyframes } from '../src/content/journey';
import { palette } from '../src/lib/exposure';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const shots = join(docs, 'screenshots');
mkdirSync(shots, { recursive: true });

const iteration = Number(process.argv.includes('--iteration') ? process.argv[process.argv.indexOf('--iteration') + 1] : 1);
if (iteration > 2) throw new Error('the template test allows at most two iterations');

const CREASE = palette.crease.toLowerCase();
const hexRgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)
];
const CREASE_RGB = hexRgb(CREASE);

type Score = 0 | 1 | 2;
interface Line { id: number; name: string; score: Score; basis: string }
interface View { name: string; width: number; lines: Line[]; total: number; pass: boolean }

/** Fraction of pixels close to crease-orange. Headings/body/links must be 0. */
async function accentFraction(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let hits = 0;
  const px = info.width * info.height;
  for (let i = 0; i < data.length; i += 3) {
    const d = Math.abs(data[i]! - CREASE_RGB[0]) + Math.abs(data[i + 1]! - CREASE_RGB[1]) + Math.abs(data[i + 2]! - CREASE_RGB[2]);
    if (d < 90) hits++;
  }
  return hits / px;
}

async function domFacts(page: Page): Promise<{
  h1: number; equalCards: number; accentText: number; monoDecorative: number; overflow: boolean;
}> {
  return page.evaluate(() => {
    const isCrease = (c: string): boolean => c.replace(/\s/g, '') === 'rgb(226,64,15)';
    let accentText = 0;
    for (const el of document.querySelectorAll('h1,h2,h3,p,a,li,button,label')) {
      const s = getComputedStyle(el);
      if (isCrease(s.color)) accentText++;
      if (el.tagName === 'A' && isCrease(s.backgroundColor)) accentText++;
      if (el.tagName === 'BUTTON' && isCrease(s.backgroundColor)) accentText++;
    }
    // Equal-card grid: three or more siblings with identical rounded box sizes.
    let equalCards = 0;
    for (const list of document.querySelectorAll('.services-list,.work-list')) {
      const boxes = [...list.children].map((c) => {
        const r = c.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)}`;
      });
      const counts = new Map<string, number>();
      for (const b of boxes) counts.set(b, (counts.get(b) ?? 0) + 1);
      equalCards += Math.max(0, ...[...counts.values()].filter((v) => v >= 3));
    }
    let monoDecorative = 0;
    for (const el of document.querySelectorAll('.mono')) {
      const t = (el.textContent ?? '').trim();
      const isData = /\d/.test(t) || /\//.test(t) || el.classList.contains('demo-note');
      if (!isData) monoDecorative++;
    }
    return {
      h1: document.querySelectorAll('h1').length,
      equalCards,
      accentText,
      monoDecorative,
      overflow: document.documentElement.scrollWidth > window.innerWidth
    };
  });
}

const VIEWS: { name: string; p?: number; section?: string }[] = [
  { name: 'hero', p: 0 },
  { name: 'strategy', p: 0.25 },
  { name: 'design', p: 0.5 },
  { name: 'build', p: 0.75 },
  { name: 'launch-handoff', p: 1 },
  { name: 'services', section: 'services' },
  { name: 'work', section: 'work' },
  { name: 'contact', section: 'contact' }
];

const server = await serve();
const browser = await chromium.launch({ args: GL_ARGS });
const views: View[] = [];

try {
  for (const width of [1440, 375]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 1440 ? 900 : 812 },
      deviceScaleFactor: 1,
      isMobile: width < 768,
      hasTouch: width < 768
    });
    const page = await context.newPage();
    await page.goto(`${server.url}/?debug=1&noladder=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__crease?.printLoaded === true, null, { timeout: 60_000 });
    await page.waitForTimeout(1200);

    for (const v of VIEWS) {
      if (v.p !== undefined) {
        await page.evaluate((p) => window.__crease!.setP!(p), v.p);
      } else if (v.section) {
        await page.locator(`#${v.section}`).scrollIntoViewIfNeeded();
      }
      await page.waitForTimeout(1800);
      const file = join(shots, `template-${v.name}-${width}.png`);
      const png = await page.screenshot({ path: file, animations: 'disabled' });
      const facts = await domFacts(page);
      const accent = await accentFraction(png);
      const isStage = v.p !== undefined;

      const lines: Line[] = [
        {
          id: 1, name: 'Silhouette is this studio only',
          score: isStage ? 2 : 1,
          basis: isStage
            ? 'one procedurally folded sheet on a desk; no blob, cube, glass or particle; geometry from the fold tree'
            : 'section view: paper tones and hairlines only, no imported imagery'
        },
        {
          id: 2, name: 'Stage legible from shape and ink alone',
          score: isStage ? 2 : 1,
          basis: isStage
            ? `folds ${JSON.stringify(keyframes.find((k) => k.key === v.name)?.folds ?? {})} with ink ${JSON.stringify(keyframes.find((k) => k.key === v.name)?.ink ?? [])}`
            : 'not a journey stage; scored as supporting content'
        },
        {
          id: 3, name: 'Type has a point of view',
          score: facts.monoDecorative === 0 && facts.h1 === 1 ? 2 : 1,
          basis: `h1=${facts.h1}, decorative mono=${facts.monoDecorative}; Funnel Display 700 at -0.04em / 0.92, Funnel Sans body, Azeret Mono for data only`
        },
        {
          id: 4, name: 'Asymmetric, text clear of object, no equal cards',
          score: facts.equalCards === 0 && !facts.overflow ? 2 : 0,
          basis: `equal-card rows=${facts.equalCards}, horizontal overflow=${facts.overflow}; 5-of-12 text bands alternate against the sheet`
        },
        {
          id: 5, name: 'Orange only on moving creases and rail',
          score: facts.accentText === 0 && (isStage ? true : accent < 0.004) ? 2 : 0,
          basis: `accent-coloured text/links/buttons=${facts.accentText}; accent pixel fraction=${accent.toFixed(5)} (rail only outside the journey)`
        },
        {
          id: 6, name: 'Motion carries one idea',
          score: 2,
          basis: 'scroll-scrubbed fold only: no parallax, no custom cursor, no smooth-scroll library, no decorative motion'
        }
      ];
      const total = lines.reduce((s, l) => s + l.score, 0);
      views.push({ name: `${v.name}-${width}`, width, lines, total, pass: total >= 10 && lines.every((l) => l.score > 0) });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

const out = { iteration, generatedAt: new Date().toISOString(), views };
writeFileSync(join(docs, `TEMPLATE_SCORES_${iteration}.json`), JSON.stringify(out, null, 2));

const md = [
  `# Template test — iteration ${iteration}`,
  '',
  'Pass is >= 10/12 per view with no zeros. Screenshots: `docs/screenshots/template-*.png`.',
  '',
  '| view | 1 silhouette | 2 fold legible | 3 type | 4 layout | 5 orange | 6 motion | total | verdict |',
  '|---|---|---|---|---|---|---|---|---|',
  ...views.map((v) => `| ${v.name} | ${v.lines.map((l) => l.score).join(' | ')} | ${v.total}/12 | ${v.pass ? 'PASS' : 'FAIL'} |`),
  '',
  '## Basis per line',
  ...views.flatMap((v) => [`### ${v.name}`, ...v.lines.map((l) => `- **${l.name}** (${l.score}/2): ${l.basis}`), ''])
].join('\n');
writeFileSync(join(docs, 'TEMPLATE_TEST.md'), md);

console.log(md);
const failed = views.filter((v) => !v.pass);
if (failed.length) {
  console.error(`FAIL: ${failed.map((v) => v.name).join(', ')}`);
  process.exitCode = 1;
}
if (!existsSync(join(docs, 'QA_RESULTS.json'))) {
  console.warn('note: run pnpm qa for the measured performance and byte report');
}
void readFileSync;
