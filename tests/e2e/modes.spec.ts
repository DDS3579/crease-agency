import { expect, test } from '@playwright/test';
import { debug, guardConsole, newContext, openStage, scrollToP, setP, settle, shot } from '../harness/page';
import { keyframes } from '../../src/content/journey';

test('stacked mode without JavaScript renders the complete, readable page', async ({ browser }) => {
  const ctx = await newContext(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/', { waitUntil: 'load' });

  await expect(page.locator('html')).toHaveAttribute('data-mode', 'stacked');
  await expect(page.locator('html')).not.toHaveAttribute('data-js', '1');
  await expect(page.locator('h1')).toContainText('Every');
  await expect(page.locator('.stage canvas')).toHaveCount(0);

  for (const id of ['process', 'design', 'build', 'launch']) {
    await expect(page.locator(`#${id} h2`)).toBeVisible();
  }
  // Nothing is hidden by an enhancement that never ran.
  for (const el of await page.locator('.reveal').all()) {
    await expect(el).toBeVisible();
    expect(await el.evaluate((n) => Number(getComputedStyle(n).opacity))).toBe(1);
  }
  const posters = page.locator('.panel-poster img');
  await expect(posters).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await expect(posters.nth(i)).toBeVisible();
    expect(await posters.nth(i).evaluate((n) => (n as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.locator('.service-row')).toHaveCount(3);
  await expect(page.locator('.work-row')).toHaveCount(4);
  await expect(page.locator('[data-contact-form]')).toBeVisible();
  await shot(page, 'stacked-no-js-1440');
  await ctx.close();
});

test('saveData forces stacked mode before first paint', async ({ browser }) => {
  const ctx = await newContext(browser, {
    init: "Object.defineProperty(navigator,'connection',{configurable:true,value:{saveData:true}});"
  });
  const page = await ctx.newPage();
  const guard = guardConsole(page);
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'stacked');
  await expect(page.locator('.stage canvas')).toHaveCount(0);
  await expect(page.locator('.panel-poster img').first()).toBeVisible();
  guard.assertClean();
  await ctx.close();
});

test('a missing WebGL2 API forces stacked mode', async ({ browser }) => {
  const ctx = await newContext(browser, { init: 'delete window.WebGL2RenderingContext;' });
  const page = await ctx.newPage();
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'stacked');
  await expect(page.locator('.stage canvas')).toHaveCount(0);
  await ctx.close();
});

test('context creation failure falls to poster-swap with real alt text and no shift', async ({ browser }) => {
  const ctx = await newContext(browser, {
    init: `const g = HTMLCanvasElement.prototype.getContext;
           HTMLCanvasElement.prototype.getContext = function (type) {
             if (type === 'webgl2') return null;
             return g.apply(this, arguments);
           };`
  });
  const page = await ctx.newPage();
  const guard = guardConsole(page);
  await page.goto('/?debug=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__crease?.ladder === 'poster', null, { timeout: 30_000 });

  await expect(page.locator('html')).toHaveAttribute('data-mode', 'stage');
  await expect(page.locator('body')).toHaveAttribute('data-poster-swap', 'true');
  await expect(page.locator('.stage canvas')).toHaveCount(0);
  await expect(page.locator('[data-stage]')).toHaveAttribute('aria-hidden', 'false');

  const alts = await page.locator('.stage-poster').evaluateAll((nodes) =>
    nodes.map((n) => (n as HTMLImageElement).alt)
  );
  expect(alts.every((a) => a.length > 20)).toBe(true);
  expect(new Set(alts).size).toBe(5);

  // Same sticky geometry: the stage still fills the viewport and nothing moved.
  const box = await page.locator('[data-stage]').boundingBox();
  expect(box?.height).toBeCloseTo(900, 0);

  await scrollToP(page, 0.75);
  const d = await debug(page);
  expect(d.stage).toBe(3);
  expect(d.triangles).toBe(0);
  guard.assertClean();
  await shot(page, 'poster-swap-build-1440');
  await ctx.close();
});

test('reduced motion jumps to keyframes, with no scrub, drift, curl or glow', async ({ browser }) => {
  const ctx = await newContext(browser, { reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const guard = guardConsole(page);
  await openStage(page, 'debug=1&noladder=1');

  const d0 = await debug(page);
  expect(d0.reducedMotion).toBe(true);

  await scrollToP(page, 0.5);
  const d = await debug(page);
  expect(d.stage).toBe(2);
  for (const id of ['f1', 'f2', 'f3', 'f4'] as const) {
    expect(Math.abs(d.folds[id]! - keyframes[2]!.folds[id])).toBeLessThan(0.01);
  }
  expect(d.camera.az).toBeCloseTo(keyframes[2]!.camera.az, 6);
  expect(d.activity.every((a) => a === 0)).toBe(true);

  // Pointer movement must not wake the ticker: no curl on this path.
  await scrollToP(page, 0);
  const before = (await debug(page)).renders;
  await page.mouse.move(1180, 300);
  await page.mouse.move(1200, 320);
  await page.waitForTimeout(900);
  expect((await debug(page)).renders).toBe(before);
  guard.assertClean();
  await ctx.close();
});

test('Tier A lifts the free corner under the pointer in the hero only', async ({ page }) => {
  const guard = guardConsole(page);
  await openStage(page);
  await setP(page, 0);
  const before = (await debug(page)).renders;

  // The top-right sheet corner sits near x 0.95, y 0.30 of the stage at 1440x900.
  await page.mouse.move(1370, 280);
  await page.waitForTimeout(120);
  await page.mouse.move(1372, 282);
  await page.waitForTimeout(400);
  const during = await debug(page);
  expect(during.renders).toBeGreaterThan(before);

  // Away from the hero the curl must not run.
  await setP(page, 0.5);
  const mid = (await debug(page)).renders;
  await page.mouse.move(700, 400);
  await page.mouse.move(704, 404);
  await page.waitForTimeout(700);
  await settle(page);
  expect((await debug(page)).renders).toBeLessThanOrEqual(mid + 2);
  guard.assertClean();
});

test('coarse pointer selects Tier B: coarse mesh, no fibre, no curl', async ({ browser }) => {
  const ctx = await newContext(browser, { width: 375, height: 812, mobile: true });
  const page = await ctx.newPage();
  const guard = guardConsole(page);
  await openStage(page);
  const d = await debug(page);
  expect(d.tier).toBe('B');
  expect(d.caps?.finePointer).toBe(false);
  expect(d.triangles).toBeLessThanOrEqual(5122);
  expect(d.drawCalls).toBeLessThanOrEqual(2);
  guard.assertClean();
  await shot(page, 'tier-b-hero-375');
  await ctx.close();
});
