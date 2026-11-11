import { expect, test } from '@playwright/test';
import { debug, guardConsole, openStage, scrollPass, settle } from '../harness/page';

test('the runtime ladder steps down under 6x CPU throttle and never back up', async ({ page }) => {
  const guard = guardConsole(page);
  await openStage(page, 'debug=1&perf=1');
  expect((await debug(page)).ladder).toBe('A0');

  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });

  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    await scrollPass(page, 40);
    seen.push((await debug(page)).ladder);
    if (seen[seen.length - 1] === 'poster') break;
  }
  await settle(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const final = await debug(page);
  expect(['A1', 'A2', 'poster']).toContain(final.ladder);

  // Monotonic descent: the rung index never decreases.
  const order = ['A0', 'A1', 'A2', 'poster'];
  let highest = 0;
  for (const level of seen) {
    const idx = order.indexOf(level);
    expect(idx).toBeGreaterThanOrEqual(highest);
    highest = idx;
  }

  if (final.ladder === 'poster') {
    await expect(page.locator('.stage canvas')).toHaveCount(0);
  } else {
    expect(final.triangles).toBeLessThanOrEqual(20_482);
    expect(final.drawCalls).toBeLessThanOrEqual(3);
  }

  const perf = await page.evaluate(() => window.__perf!);
  expect(perf.frames).toBeGreaterThan(0);
  expect(perf.p50).toBeGreaterThan(0);
  expect(perf.level).toBe(final.ladder);
  guard.assertClean();
});

test('noladder keeps full quality for deterministic capture', async ({ page }) => {
  await openStage(page, 'debug=1&noladder=1&perf=1');
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await scrollPass(page, 30);
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const d = await debug(page);
  expect(d.ladder).toBe('A0');
  expect(d.triangles).toBe(20_482);
});
