import { expect, test } from '@playwright/test';
import {
  debug, guardConsole, openStage, scrollPass, scrollToP, setP, settle, shot
} from '../harness/page';
import {
  instrumentGL, instrumentHtmlStyle, instrumentLayoutReads
} from '../harness/instrumentation';
import { FOLD_IDS, keyframes } from '../../src/content/journey';
import { paritySamples } from '../harness/fixtures';

test('zero renders over a two second idle', async ({ page }) => {
  await page.addInitScript(instrumentLayoutReads);
  const guard = guardConsole(page);
  await openStage(page);
  const before = (await debug(page)).renders;
  await page.waitForTimeout(2000);
  const after = (await debug(page)).renders;
  expect(after).toBe(before);
  guard.assertClean();
});

test('each dwell centre reproduces its keyframe exactly', async ({ page }) => {
  await openStage(page);
  const g = (await debug(page)).geometry!;
  for (let i = 0; i < keyframes.length; i++) {
    const keyP = g.keyP[i]!;
    const dwellEnd = g.dwellEndP[i]!;
    const centre = i === keyframes.length - 1 ? 1 : (keyP + dwellEnd) / 2;
    await setP(page, centre);
    const d = await debug(page);
    expect(d.stage).toBe(i);
    for (const id of FOLD_IDS) {
      expect(Math.abs(d.folds[id]! - keyframes[i]!.folds[id]), `${id} at stage ${i}`)
        .toBeLessThan(0.01);
    }
    expect(d.ink).toEqual(keyframes[i]!.ink);
    expect(d.camera.el).toBeCloseTo(keyframes[i]!.camera.el, 3);
    expect(Math.abs(d.camera.az - keyframes[i]!.camera.az)).toBeLessThanOrEqual(2.001);
    const dist = keyframes[i]!.camera.dist;
    if (dist !== 'cover') expect(d.camera.dist).toBeCloseTo(dist, 3);
    await shot(page, `dwell-${keyframes[i]!.key}-1440`);
  }
});

test('P is monotonic and the fold vector is reversible', async ({ page }) => {
  await openStage(page);
  const forward: number[][] = [];
  const probe = [0, 0.12, 0.25, 0.37, 0.5, 0.63, 0.75, 0.88, 1];
  let lastP = -1;
  for (const p of probe) {
    await setP(page, p);
    const d = await debug(page);
    expect(d.P).toBeGreaterThanOrEqual(lastP);
    lastP = d.P;
    forward.push(FOLD_IDS.map((id) => d.folds[id]!));
  }
  for (let i = probe.length - 1; i >= 0; i--) {
    await setP(page, probe[i]!);
    const d = await debug(page);
    FOLD_IDS.forEach((id, j) => {
      expect(Math.abs(d.folds[id]! - forward[i]![j]!), `reverse ${id} at ${probe[i]}`)
        .toBeLessThan(1e-3);
    });
  }
});

test('GPU parity with the CPU reference is within 1e-4 at every keyframe', async ({ page }) => {
  await openStage(page);
  const points = paritySamples();
  const available = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    const gl = c?.getContext('webgl2');
    return Boolean(gl?.getExtension('EXT_color_buffer_float'));
  });
  test.skip(!available, 'EXT_color_buffer_float unavailable in this GL backend');

  for (const kf of keyframes) {
    const result = await page.evaluate(
      ([pts, key]) => window.__crease!.gpuParity!(pts as [number, number][], key as string),
      [points, kf.key] as const
    );
    expect(result.maxError, `${kf.key} parity`).toBeLessThan(1e-4);
    expect(result.gpu.length).toBe(points.length * 3);
  }
});

test('draw calls, triangles, textures and GPU memory stay inside budget', async ({ page }) => {
  await page.addInitScript(instrumentGL);
  const guard = guardConsole(page);
  await openStage(page);
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    await setP(page, p);
    const d = await debug(page);
    expect(d.drawCalls, `draw calls at ${p}`).toBeLessThanOrEqual(3);
    expect(d.triangles, `triangles at ${p}`).toBeLessThanOrEqual(25_000);
    expect(d.textureCount, `textures at ${p}`).toBeLessThanOrEqual(3);
    expect(d.gpuMemoryMB, `GPU MB at ${p}`).toBeLessThan(32);
  }
  const live = await page.evaluate(() => window.__gl!.live());
  expect(live.Texture ?? 0).toBeLessThanOrEqual(3);
  expect(live.Program ?? 0).toBeLessThanOrEqual(3);
  expect(live.Buffer ?? 0).toBeLessThanOrEqual(4);
  expect(live.VertexArray ?? 0).toBeLessThanOrEqual(2);
  guard.assertClean();
});

test('three full scroll passes leak no GPU resources', async ({ page }) => {
  await page.addInitScript(instrumentGL);
  const guard = guardConsole(page);
  await openStage(page);
  await settle(page);
  const baseline = await page.evaluate(() => window.__gl!.live());
  const baseDraws = await page.evaluate(() => window.__gl!.draws);

  for (let i = 0; i < 3; i++) await scrollPass(page);
  await settle(page);

  const after = await page.evaluate(() => window.__gl!.live());
  for (const kind of Object.keys(baseline)) {
    expect(after[kind] ?? 0, `${kind} after three passes`).toBe(baseline[kind] ?? 0);
  }
  const draws = await page.evaluate(() => window.__gl!.draws);
  const d = await debug(page);
  expect(draws - baseDraws).toBeGreaterThan(0);
  expect(d.drawCalls).toBeLessThanOrEqual(3);
  guard.assertClean();
});

test('no layout reads inside animation frames while scrolling', async ({ page }) => {
  await page.addInitScript(instrumentLayoutReads);
  const guard = guardConsole(page);
  await openStage(page);
  await page.evaluate(() => {
    window.__layout!.inFrameCount = 0;
    window.__layout!.byApi = {};
  });
  await scrollPass(page, 48);
  await settle(page);
  const layout = await page.evaluate(() => window.__layout!);
  expect(layout.inFrameCount, `layout reads in rAF: ${JSON.stringify(layout.byApi)}`).toBe(0);
  guard.assertClean();
});

test('zero style mutations on <html> while scrolling', async ({ page }) => {
  await page.addInitScript(instrumentHtmlStyle);
  const guard = guardConsole(page);
  await openStage(page);
  await page.evaluate(() => {
    window.__htmlStyle!.count = 0;
    window.__htmlStyle!.samples = [];
  });
  await scrollPass(page, 48);
  const mutations = await page.evaluate(() => window.__htmlStyle!);
  expect(mutations.count, mutations.samples.join('\n')).toBe(0);
  guard.assertClean();
});

test('the progress rail tracks P, marks the active tick and announces it', async ({ page }) => {
  await openStage(page);
  await scrollToP(page, 0.5);
  const tick = page.locator('[data-tick="2"]');
  await expect(tick).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('[data-tick][aria-current]')).toHaveCount(1);
  const scale = await page.locator('[data-rail-fill]').evaluate((n) => getComputedStyle(n).transform);
  expect(scale).toMatch(/^matrix\(/);
  await expect(page.locator('[data-rail-live]')).toContainText('Stage 2 of 4: Design');
  await expect(page.locator('body')).toHaveAttribute('data-journey', 'true');
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await expect(page.locator('body')).toHaveAttribute('data-journey', 'false');
});

test('native anchor navigation lands below the fixed nav', async ({ page }) => {
  await page.goto('/?debug=1', { waitUntil: 'load' });
  await page.locator('.nav-links a[href="#services"]').click();
  await page.waitForTimeout(400);
  const top = await page.locator('#services').evaluate((n) => n.getBoundingClientRect().top);
  const navHeight = await page.locator('.nav').evaluate((n) => n.getBoundingClientRect().height);
  expect(top).toBeGreaterThanOrEqual(-2);
  expect(top).toBeLessThan(navHeight + 80);
});
