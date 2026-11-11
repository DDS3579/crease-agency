import { expect, test } from '@playwright/test';
import { guardConsole, newContext, openStage, shot } from '../harness/page';

const SIZES = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
] as const;

for (const size of SIZES) {
  test(`no horizontal overflow and no console errors at ${size.width}`, async ({ browser }) => {
    const ctx = await newContext(browser, {
      width: size.width,
      height: size.height,
      mobile: size.width < 768
    });
    const page = await ctx.newPage();
    const guard = guardConsole(page);
    await openStage(page);

    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      await page.evaluate((value) => window.__crease!.setP!(value), p);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        innerWidth: window.innerWidth
      }));
      expect(metrics.scrollWidth, `scrollWidth at P=${p}`).toBeLessThanOrEqual(metrics.innerWidth);
      expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.innerWidth);
    }

    // Below the journey too.
    await page.locator('#contact').scrollIntoViewIfNeeded();
    const after = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    }));
    expect(after.scrollWidth).toBeLessThanOrEqual(after.innerWidth);
    guard.assertClean();
    await ctx.close();
  });
}

test('derived numbers in the built HTML equal the data', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('.data-strip')).toHaveText('4 stages / 3 services / 4 projects');
  await expect(page.locator('.counter')).toHaveCount(4);
  const counters = await page.locator('.counter').allTextContents();
  expect(counters.map((c) => c.trim())).toEqual([
    'Stage 1 of 4', 'Stage 2 of 4', 'Stage 3 of 4', 'Stage 4 of 4'
  ]);
  await expect(page.locator('.service-row')).toHaveCount(3);
  await expect(page.locator('.work-row')).toHaveCount(4);
  await expect(page.locator('#f-type option')).toHaveCount(5);
  await expect(page.locator('[data-tick]')).toHaveCount(5);
});

test('missing [FILL] fields are surfaced and produce no dead links', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  const missing = await page.locator('html').getAttribute('data-missing');
  expect(missing).toBe('studio.domain,studio.email,studio.socials,studio.formEndpoint');
  await expect(page.locator('.contact-email')).toHaveCount(0);
  await expect(page.locator('.socials')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

  const hrefs = await page.locator('a[href]').evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('href') ?? '')
  );
  for (const href of hrefs) {
    expect(href.length).toBeGreaterThan(0);
    expect(href).not.toBe('#');
    if (href.startsWith('#')) {
      await expect(page.locator(href)).toHaveCount(1);
    }
  }
  const form = page.locator('[data-contact-form]');
  await expect(form).toHaveAttribute('data-endpoint', '');
  await expect(form).toHaveAttribute('data-mailto', '');
});

for (const width of [375, 1440]) {
  test(`section screenshots at ${width}`, async ({ browser }) => {
    const ctx = await newContext(browser, {
      width,
      height: width === 375 ? 812 : 900,
      mobile: width < 768
    });
    const page = await ctx.newPage();
    await openStage(page);
    for (const id of ['services', 'work', 'contact']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      await shot(page, `${id}-${width}`);
    }
    await ctx.close();
  });
}
