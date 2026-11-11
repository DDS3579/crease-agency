import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { hideOverlays, newContext, openStage, setP } from '../harness/page';
import { keyframes } from '../../src/content/journey';

const POSTERS = join(process.cwd(), 'public', 'posters');

interface Diff { mean: number; p95: number; max: number }

async function compare(png: Buffer, avifPath: string): Promise<Diff> {
  const a = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(readFileSync(avifPath))
    .resize(a.info.width, a.info.height, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(b.info.width).toBe(a.info.width);
  expect(b.info.height).toBe(a.info.height);

  const deltas: number[] = [];
  let sum = 0;
  let max = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i]! - b.data[i]!);
    deltas.push(d);
    sum += d;
    if (d > max) max = d;
  }
  deltas.sort((x, y) => x - y);
  return {
    mean: sum / deltas.length,
    p95: deltas[Math.floor(deltas.length * 0.95)] ?? 0,
    max
  };
}

const VARIANTS = [
  { name: 'desktop', width: 1600, height: 1000, mobile: false },
  { name: 'mobile', width: 900, height: 1200, mobile: true }
] as const;

for (const variant of VARIANTS) {
  for (let i = 0; i < keyframes.length; i++) {
    const kf = keyframes[i]!;
    test(`${kf.key} ${variant.name} poster matches the live render`, async ({ browser }) => {
      const ctx = await newContext(browser, {
        width: variant.width,
        height: variant.height,
        mobile: variant.mobile
      });
      const page = await ctx.newPage();
      await openStage(page);
      await setP(page, i / (keyframes.length - 1));
      await hideOverlays(page);
      await page.waitForTimeout(500);

      const png = await page.locator('[data-stage]').screenshot({ type: 'png', animations: 'disabled' });
      const diff = await compare(png, join(POSTERS, `${kf.key}-${variant.name}.avif`));
      // AVIF is lossy; the sheet is flat paper so the error should be tiny.
      expect(diff.mean, `${kf.key} ${variant.name} mean ${diff.mean.toFixed(2)}`).toBeLessThan(4);
      expect(diff.p95, `${kf.key} ${variant.name} p95 ${diff.p95}`).toBeLessThan(18);
      await ctx.close();
    });
  }
}

test('every committed poster is inside its byte budget', async () => {
  const { statSync } = await import('node:fs');
  for (const variant of VARIANTS) {
    const budget = variant.name === 'desktop' ? 55 * 1024 : 40 * 1024;
    for (const kf of keyframes) {
      const path = join(POSTERS, `${kf.key}-${variant.name}.avif`);
      const bytes = statSync(path).size;
      expect(bytes, `${path} is ${bytes}B`).toBeLessThanOrEqual(budget);
    }
  }
  const og = statSync(join(process.cwd(), 'public', 'og', 'crease-hero.avif')).size;
  expect(og).toBeLessThanOrEqual(120 * 1024);
});
