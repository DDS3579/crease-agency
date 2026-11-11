import { expect, test } from '@playwright/test';
import { guardConsole } from '../harness/page';
import { copy } from '../../src/content/demo/copy';

async function fill(page: import('@playwright/test').Page, email = 'founder@example.com'): Promise<void> {
  await page.locator('#f-name').fill('Ada Founder');
  await page.locator('#f-email').fill(email);
  await page.locator('#f-type').selectOption('websites');
  await page.locator('#f-message').fill('We need a storefront that loads fast.');
}

test('inline validation names every field and focuses the first invalid one', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('[data-submit]').click();

  for (const id of ['f-name', 'f-email', 'f-type', 'f-message']) {
    await expect(page.locator(`#${id}`)).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await page.locator(`#${id}`).getAttribute('aria-describedby');
    expect(describedBy).toBe(`${id}-error`);
    await expect(page.locator(`#${describedBy}`)).toBeVisible();
    await expect(page.locator(`#${describedBy}`)).not.toBeEmpty();
  }
  await expect(page.locator('#f-name-error')).toHaveText(copy.contact.validation.name);
  await expect(page.locator('#f-email-error')).toHaveText(copy.contact.validation.email);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('f-name');
  guard.assertClean();
});

test('the email rule rejects a dotless domain', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await fill(page, 'founder@example');
  await page.locator('[data-submit]').click();
  await expect(page.locator('#f-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#f-name')).not.toHaveAttribute('aria-invalid', 'true');

  await page.locator('#f-email').fill('founder@example.com');
  await expect(page.locator('#f-email')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#f-email-error')).toBeHidden();
});

test('a valid submission reports honestly through a live region', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto('/', { waitUntil: 'load' });
  await fill(page);
  const status = page.locator('[data-form-status]');
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toHaveAttribute('role', 'status');

  await page.locator('[data-submit]').click();
  await expect(status).toHaveText(copy.contact.fields.demoSuccess, { timeout: 10_000 });
  await expect(page.locator('#f-name')).toHaveValue('');
  await expect(page.locator('[data-submit]')).toBeEnabled();
  await expect(page.locator('[data-submit]')).toHaveText(copy.contact.fields.submit);
  guard.assertClean();
});

test('the submit button is disabled and the form marked busy while sending', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await fill(page);
  await page.locator('[data-submit]').click();
  await expect(page.locator('[data-submit]')).toBeDisabled();
  await expect(page.locator('[data-submit]')).toHaveText(copy.contact.fields.submitting);
  await expect(page.locator('[data-contact-form]')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-contact-form]')).not.toHaveAttribute('aria-busy', 'true', { timeout: 10_000 });
});

test('the honeypot accepts silently and sends nothing', async ({ page }) => {
  let posts = 0;
  await page.route('**/*', (route) => {
    if (route.request().method() === 'POST') posts++;
    return route.continue();
  });
  await page.goto('/', { waitUntil: 'load' });
  await fill(page);
  await page.locator('#f-company').fill('Bot Co');
  await page.locator('[data-submit]').click();
  await expect(page.locator('[data-form-status]')).toHaveText(copy.contact.fields.success);
  expect(posts).toBe(0);
  const hp = page.locator('#f-company');
  await expect(hp).toHaveAttribute('tabindex', '-1');
  expect(await hp.evaluate((n) => n.getBoundingClientRect().left)).toBeLessThan(-1000);
});

test('the mailto fallback runs when an email is configured', async ({ page }) => {
  let posts = 0;
  await page.route('**/*', (route) => {
    if (route.request().method() === 'POST') posts++;
    return route.continue();
  });
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => {
    document.querySelector('[data-contact-form]')!.setAttribute('data-mailto', 'studio@example.com');
  });
  await fill(page);
  await page.locator('[data-submit]').click();
  await expect(page.locator('[data-form-status]')).toHaveText(copy.contact.fields.success);
  expect(posts).toBe(0);
});

test('a configured endpoint receives the payload without the honeypot', async ({ page }) => {
  let body: Record<string, unknown> | null = null;
  await page.route('https://forms.example.com/crease', async (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => {
    document.querySelector('[data-contact-form]')!.setAttribute('data-endpoint', 'https://forms.example.com/crease');
  });
  await fill(page);
  await page.locator('#f-company').fill('');
  await page.locator('[data-submit]').click();
  await expect(page.locator('[data-form-status]')).toHaveText(copy.contact.fields.success);
  expect(body).not.toBeNull();
  expect(body!.name).toBe('Ada Founder');
  expect(body!.type).toBe('websites');
  expect('company' in body!).toBe(false);
});

test('a failing endpoint reports the error state and re-enables the form', async ({ page }) => {
  await page.route('https://forms.example.com/crease', (route) => route.fulfill({ status: 500 }));
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => {
    document.querySelector('[data-contact-form]')!.setAttribute('data-endpoint', 'https://forms.example.com/crease');
  });
  await fill(page);
  await page.locator('[data-submit]').click();
  await expect(page.locator('[data-form-status]')).toHaveText(copy.contact.fields.error);
  await expect(page.locator('[data-submit]')).toBeEnabled();
  await expect(page.locator('#f-name')).toHaveValue('Ada Founder');
});

test('the Start a project CTAs scroll to the form and focus its first field', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.locator('.hero-cta [data-start-project]').click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('f-name');
  expect(page.url()).toContain('#contact');
  const top = await page.locator('#contact').evaluate((n) => n.getBoundingClientRect().top);
  expect(Math.abs(top)).toBeLessThan(140);
});
