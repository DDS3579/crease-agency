import { expect, test } from '@playwright/test';
import {
  DESK, PAPER, debug, guardConsole, newContext, openStage, rectProbePoints,
  sampleComposited, setP, shot, visibleTextRects
} from '../harness/page';
import { keyframes } from '../../src/content/journey';

const TEXT_TOLERANCE = 3;

for (const size of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`canvas is desk-coloured under every text rect at ${size.width}`, async ({ browser }) => {
    const ctx = await newContext(browser, {
      width: size.width,
      height: size.height,
      mobile: size.width < 768
    });
    const page = await ctx.newPage();
    const guard = guardConsole(page);
    await openStage(page);

    const offenders: string[] = [];
    for (let i = 0; i < keyframes.length; i++) {
      await setP(page, i / (keyframes.length - 1));
      const rects = await visibleTextRects(page);
      if (i === keyframes.length - 1) {
        // Launch has no panel: the sheet owns the whole viewport.
        expect(rects.length, 'launch panel must be gone').toBe(0);
        continue;
      }
      expect(rects.length, `text rects at stage ${i}`).toBeGreaterThan(0);
      const probes = rectProbePoints(rects);
      const pixels = await sampleComposited(page, probes);
      pixels.forEach((px, k) => {
        const drift = Math.max(
          Math.abs(px[0]! - DESK[0]),
          Math.abs(px[1]! - DESK[1]),
          Math.abs(px[2]! - DESK[2])
        );
        if (drift > TEXT_TOLERANCE) {
          const probe = probes[k]!;
          offenders.push(
            `${keyframes[i]!.key} "${probe.label}" at (${probe.x.toFixed(0)},${probe.y.toFixed(0)}) ` +
            `rgb(${px.slice(0, 3).map((v) => v.toFixed(0)).join(',')}) drift ${drift.toFixed(1)}`
          );
        }
      });
    }
    expect(offenders, `sheet or shadow intrudes on text:\n${offenders.slice(0, 20).join('\n')}`)
      .toHaveLength(0);
    guard.assertClean();
    await ctx.close();
  });
}

test('at the end of Launch the canvas equals --paper within 2 per channel', async ({ page }) => {
  const guard = guardConsole(page);
  await openStage(page);
  await setP(page, 1);
  const d = await debug(page);
  expect(d.key).toBe('launch');
  expect(d.ink).toEqual([0, 0, 0]);
  expect(d.camera.el).toBe(90);

  const size = page.viewportSize()!;
  const points: { x: number; y: number }[] = [];
  for (const fx of [0.002, 0.1, 0.25, 0.5, 0.75, 0.9, 0.998]) {
    for (const fy of [0.002, 0.1, 0.25, 0.5, 0.75, 0.9, 0.998]) {
      points.push({ x: fx * (size.width - 1), y: fy * (size.height - 1) });
    }
  }
  const raw = await page.evaluate(
    (pts) => window.__crease!.samplePixels!(pts),
    points
  );
  const offenders: string[] = [];
  raw.forEach((px, i) => {
    if ((px[3] ?? 0) !== 255) offenders.push(`point ${i} alpha ${px[3]}`);
    for (let c = 0; c < 3; c++) {
      if (Math.abs((px[c] ?? 0) - PAPER[c]!) > 2) {
        offenders.push(`point ${i} channel ${c}: ${px[c]} vs ${PAPER[c]}`);
      }
    }
  });
  expect(offenders, offenders.slice(0, 12).join('\n')).toHaveLength(0);
  guard.assertClean();
});

test('the handoff is one opacity transition onto the same paper colour', async ({ page }) => {
  await openStage(page);
  for (const [name, p] of [['handoff-a', 0.94], ['handoff-b', 0.985], ['handoff-c', 1]] as const) {
    await setP(page, p);
    await shot(page, `${name}-1440`);
  }
  await expect(page.locator('body')).toHaveAttribute('data-launch-done', 'true');
  await expect(page.locator('.stage-poster[data-poster="launch"]')).toHaveClass(/is-active/);

  const canvasOpacity = await page.locator('.stage canvas').evaluate((n) => getComputedStyle(n).opacity);
  const posterOpacity = await page.locator('.stage-poster.is-active').evaluate((n) => getComputedStyle(n).opacity);
  expect(Number(canvasOpacity)).toBeLessThan(0.05);
  expect(Number(posterOpacity)).toBeGreaterThan(0.95);

  // The DOM that follows sits on the identical colour: no seam at the boundary.
  const sectionBg = await page.locator('#services').evaluate((n) => getComputedStyle(n).backgroundColor);
  expect(sectionBg).toBe('rgb(244, 242, 236)');

  // Reversible: scrolling back re-arms the canvas.
  await setP(page, 0.75);
  await expect(page.locator('body')).not.toHaveAttribute('data-launch-done', 'true');
});

test('the launch panel yields only at the very end of the unfold', async ({ page }) => {
  await openStage(page);
  await setP(page, 0.93);
  await expect(page.locator('body')).not.toHaveAttribute('data-launch', 'true');
  const early = await page.locator('.panel-launch').evaluate((n) => Number(getComputedStyle(n).opacity));
  expect(early).toBeGreaterThan(0.9);
  await setP(page, 1);
  await expect(page.locator('body')).toHaveAttribute('data-launch', 'true');
});
