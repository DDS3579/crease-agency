import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { guardConsole, newContext, openStage, setP } from '../harness/page';

const AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const width of [375, 1440]) {
  test(`axe reports no serious or critical violations at ${width}`, async ({ browser }) => {
    const ctx = await newContext(browser, {
      width,
      height: width === 375 ? 812 : 900,
      mobile: width < 768
    });
    const page = await ctx.newPage();
    await openStage(page);
    for (const p of [0, 0.5, 1]) {
      await setP(page, p);
      const results = await new AxeBuilder({ page }).withTags(AA_TAGS).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );
      expect(
        blocking,
        blocking.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`).join('\n')
      ).toHaveLength(0);
    }
    await ctx.close();
  });
}

test('axe passes in stacked mode without JavaScript', async ({ browser }) => {
  const ctx = await newContext(browser, { javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/', { waitUntil: 'load' });
  const results = await new AxeBuilder({ page }).withTags(AA_TAGS).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(blocking.map((v) => v.id)).toHaveLength(0);
  await ctx.close();
});

test('every interactive element is reachable by keyboard with a visible ink ring', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto('/?debug=1', { waitUntil: 'load' });
  await page.locator('body').click({ position: { x: 5, y: 400 } });

  const seen: string[] = [];
  let focusedSkip = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        key: `${el.tagName.toLowerCase()}#${el.id || ''}.${el.className || ''}`,
        tag: el.tagName.toLowerCase(),
        outlineWidth: parseFloat(style.outlineWidth) || 0,
        outlineColor: style.outlineColor,
        inStage: Boolean(el.closest('[data-stage]')),
        onScreen: rect.bottom > 0 && rect.top < window.innerHeight,
        text: (el.textContent ?? '').trim().slice(0, 24)
      };
    });
    if (!info) continue;
    if (info.text === 'Skip to content') focusedSkip = true;
    expect(info.inStage, 'focus must never land inside the aria-hidden stage').toBe(false);
    expect(info.outlineWidth, `focus ring on ${info.key}`).toBeGreaterThanOrEqual(2);
    expect(info.outlineColor).toBe('rgb(20, 19, 15)');
    if (seen.includes(info.key) && seen.length > 6) break;
    seen.push(info.key);
  }
  expect(focusedSkip).toBe(true);
  const joined = seen.join('\n');
  for (const needle of ['wordmark', 'nav-links', 'nav-cta', 'btn-solid', 'f-name', 'f-email', 'f-type', 'f-message', 'data-submit']) {
    expect(joined, `missing focusable: ${needle}`).toContain(needle);
  }
  guard.assertClean();
});

test('the skip link moves focus to main', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.className)).toContain('skip-link');
  const visible = await page.locator('.skip-link').evaluate((n) => n.getBoundingClientRect().top);
  expect(visible).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  expect(page.url()).toContain('#main');
});

test('rail ticks are keyboard operable and never trap focus', async ({ page }) => {
  await openStage(page);
  await setP(page, 0.25);
  const tick = page.locator('[data-tick="3"]');
  await tick.focus();
  await expect(tick).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  expect(page.url()).toContain('#build');
  const rect = await page.locator('[data-tick="3"]').evaluate((n) => {
    const r = n.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  expect(rect.w).toBeGreaterThanOrEqual(44);
  expect(rect.h).toBeGreaterThanOrEqual(44);
});

for (const width of [375, 1440]) {
  test(`touch targets are at least 44px at ${width}`, async ({ browser }) => {
    const ctx = await newContext(browser, {
      width,
      height: width === 375 ? 812 : 900,
      mobile: width < 768
    });
    const page = await ctx.newPage();
    await page.goto('/', { waitUntil: 'load' });
    await page.locator('#contact').scrollIntoViewIfNeeded();
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const sel = 'a[href], button, input:not([tabindex="-1"]), select, textarea';
      for (const el of document.querySelectorAll(sel)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        if (rect.left < -1000) continue;
        if (rect.width < 44 || rect.height < 44) {
          out.push(`${el.tagName.toLowerCase()}#${el.id || el.className} ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}`);
        }
      }
      return out;
    });
    expect(small, small.join('\n')).toHaveLength(0);
    await ctx.close();
  });
}

test('landmarks, headings and the aria-hidden stage are correct', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('header.nav')).toHaveCount(1);
  await expect(page.locator('main#main')).toHaveCount(1);
  await expect(page.locator('footer')).toHaveCount(1);
  await expect(page.locator('nav[aria-label="Primary"]')).toHaveCount(1);
  await expect(page.locator('[data-stage]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.stage canvas')).toHaveCount(0);

  const labelled = await page.locator('section[aria-labelledby]').evaluateAll((nodes) =>
    nodes.map((n) => ({
      id: n.id,
      target: n.getAttribute('aria-labelledby'),
      exists: Boolean(document.getElementById(n.getAttribute('aria-labelledby') ?? ''))
    }))
  );
  expect(labelled.length).toBeGreaterThanOrEqual(7);
  expect(labelled.every((l) => l.exists)).toBe(true);

  const decorative = await page.locator('.work-thumb').evaluateAll((nodes) =>
    nodes.every((n) => n.getAttribute('aria-hidden') === 'true')
  );
  expect(decorative).toBe(true);
});

test('state is never carried by colour alone', async ({ page }) => {
  await openStage(page);
  await setP(page, 0.5);
  await expect(page.locator('[data-tick][aria-current="step"]')).toHaveCount(1);
  await expect(page.locator('[data-rail-live]')).not.toBeEmpty();
  const tickWidths = await page.locator('.tick-mark').evaluateAll((nodes) =>
    nodes.map((n) => n.getBoundingClientRect().width)
  );
  const active = Math.max(...tickWidths);
  const resting = Math.min(...tickWidths);
  expect(active).toBeGreaterThan(resting);
});
