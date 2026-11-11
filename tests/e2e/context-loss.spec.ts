import { expect, test } from '@playwright/test';
import { debug, guardConsole, openStage, setP } from '../harness/page';
import { instrumentGL } from '../harness/instrumentation';

test('a forced context loss recovers or falls to poster-swap', async ({ page }) => {
  await page.addInitScript(instrumentGL);
  const guard = guardConsole(page);
  await openStage(page);
  await setP(page, 0.5);
  const before = await page.evaluate(() => window.__gl!.live());

  await page.evaluate(() => {
    const canvas = document.querySelector('.stage canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2')!;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });

  await page.waitForFunction(
    () => {
      if (window.__crease?.ladder === 'poster') return true;
      const canvas = document.querySelector('.stage canvas') as HTMLCanvasElement | null;
      if (!canvas) return false;
      const gl = canvas.getContext('webgl2');
      return Boolean(gl) && !gl!.isContextLost() && (window.__crease?.renders ?? 0) > 0;
    },
    null,
    { timeout: 30_000 }
  );

  const d = await debug(page);
  if (d.ladder === 'poster') {
    await expect(page.locator('.stage canvas')).toHaveCount(0);
    await expect(page.locator('body')).toHaveAttribute('data-poster-swap', 'true');
    const alts = await page.locator('.stage-poster').evaluateAll((n) =>
      n.map((x) => (x as HTMLImageElement).alt)
    );
    expect(alts.every((a) => a.length > 20)).toBe(true);
  } else {
    await setP(page, 0.75);
    const after = await debug(page);
    expect(after.drawCalls).toBeLessThanOrEqual(3);
    expect(after.textureCount).toBeLessThanOrEqual(3);
    const live = await page.evaluate(() => window.__gl!.live());
    expect(live.Texture ?? 0).toBeLessThanOrEqual((before.Texture ?? 0) + 3);
    expect(live.Program ?? 0).toBeLessThanOrEqual((before.Program ?? 0) + 3);
  }
  guard.assertClean();
});

test('teardown disposes every GPU resource', async ({ page }) => {
  await page.addInitScript(instrumentGL);
  await openStage(page);
  await setP(page, 0.5);
  await page.evaluate(() => window.__crease!.gpuParity!([[0.1, 0.2]], 'build'));
  await page.evaluate(() => window.__crease!.dispose!());
  await page.waitForTimeout(300);

  const live = await page.evaluate(() => window.__gl!.live());
  for (const kind of ['Texture', 'Buffer', 'Program', 'VertexArray', 'Framebuffer']) {
    expect(live[kind] ?? 0, `${kind} after dispose`).toBe(0);
  }
  await expect(page.locator('.stage canvas')).toHaveCount(0);
  const renders = (await debug(page)).renders;
  await page.waitForTimeout(800);
  expect((await debug(page)).renders).toBe(renders);
});
