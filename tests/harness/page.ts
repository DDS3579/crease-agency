import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DESK: readonly [number, number, number] = [230, 227, 219];
export const PAPER: readonly [number, number, number] = [244, 242, 236];
export const SHOTS = join(process.cwd(), 'docs', 'screenshots');

export interface ConsoleGuard {
  errors: string[];
  warnings: string[];
  assertClean(): void;
}

/** External-protocol notices are expected when the mailto fallback is exercised. */
const IGNORED = [/scheme does not have a registered handler/i, /Not allowed to launch/i];

export function guardConsole(page: Page): ConsoleGuard {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (IGNORED.some((re) => re.test(text))) return;
    if (msg.type() === 'error') errors.push(text);
    if (msg.type() === 'warning') warnings.push(text);
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return {
    errors,
    warnings,
    assertClean() {
      expect(errors, `console errors:\n${errors.join('\n')}`).toHaveLength(0);
    }
  };
}

export async function newContext(
  browser: Browser,
  opts: {
    width?: number;
    height?: number;
    mobile?: boolean;
    reducedMotion?: 'reduce' | 'no-preference';
    javaScriptEnabled?: boolean;
    init?: string;
  } = {}
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 },
    deviceScaleFactor: 1,
    isMobile: opts.mobile ?? false,
    hasTouch: opts.mobile ?? false,
    reducedMotion: opts.reducedMotion ?? 'no-preference',
    javaScriptEnabled: opts.javaScriptEnabled ?? true
  });
  if (opts.init) await ctx.addInitScript(opts.init);
  return ctx;
}

/** Opens the live scene with debug hooks and waits for the print texture. */
export async function openStage(page: Page, params = 'debug=1&noladder=1'): Promise<void> {
  await page.goto(`/?${params}`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__crease?.setP === 'function', null, { timeout: 45_000 });
  await page.waitForFunction(() => window.__crease?.printLoaded === true, null, { timeout: 45_000 });
  await settle(page);
}

/** Waits until the render counter has been stable for four consecutive polls. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__probe = { lastR: -1, stable: 0 };
  });
  await page.waitForFunction(
    () => {
      const probe = window.__probe!;
      const r = window.__crease?.renders ?? 0;
      if (r === probe.lastR) probe.stable++;
      else {
        probe.lastR = r;
        probe.stable = 0;
      }
      return probe.stable >= 4;
    },
    null,
    { timeout: 45_000, polling: 250 }
  );
}

export async function setP(page: Page, p: number): Promise<void> {
  await page.evaluate((value) => window.__crease!.setP!(value), p);
  await settle(page);
}

export async function scrollToP(page: Page, p: number): Promise<void> {
  await page.evaluate((value) => {
    const g = window.__crease!.geometry!;
    window.scrollTo(0, g.journeyTop + value * g.scrollRange);
  }, p);
  await settle(page);
}

export async function debug(page: Page): Promise<NonNullable<Window['__crease']>> {
  return page.evaluate(() => {
    const d = window.__crease!;
    return JSON.parse(JSON.stringify(d)) as NonNullable<Window['__crease']>;
  });
}

export interface Rect { x: number; y: number; width: number; height: number; label: string }

/**
 * Tight glyph rects, not container boxes: a block-level headline spans the whole
 * column while its glyphs do not. Ranges give the actual printed line boxes.
 */
export async function visibleTextRects(page: Page): Promise<Rect[]> {
  return page.evaluate(() => {
    const out: { x: number; y: number; width: number; height: number; label: string }[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const push = (r: DOMRect, label: string): void => {
      if (r.width < 3 || r.height < 3) return;
      if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) return;
      out.push({ x: r.x, y: r.y, width: r.width, height: r.height, label });
    };
    for (const panel of document.querySelectorAll('.panel-inner')) {
      const style = window.getComputedStyle(panel);
      if (style.visibility === 'hidden' || Number(style.opacity) < 0.05) continue;
      const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const text = node.textContent ?? '';
        if (text.trim()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) push(r, text.trim().slice(0, 48));
          range.detach();
        }
        node = walker.nextNode();
      }
      for (const btn of panel.querySelectorAll('.btn')) {
        push(btn.getBoundingClientRect(), btn.textContent?.trim().slice(0, 48) ?? 'button');
      }
    }
    return out;
  });
}

/** Samples a 3x3 inset grid inside every rect. */
export function rectProbePoints(rects: readonly Rect[]): { x: number; y: number; label: string }[] {
  const out: { x: number; y: number; label: string }[] = [];
  for (const r of rects) {
    for (const fx of [0.12, 0.5, 0.88]) {
      for (const fy of [0.2, 0.5, 0.8]) {
        out.push({ x: r.x + r.width * fx, y: r.y + r.height * fy, label: r.label });
      }
    }
  }
  return out;
}

/**
 * The canvas is transparent over the desk and premultiplied, so compositing is
 * src.rgb + desk * (1 - alpha). This is what the visitor actually sees.
 */
export async function sampleComposited(
  page: Page,
  points: readonly { x: number; y: number }[]
): Promise<number[][]> {
  const raw = await page.evaluate(
    (pts) => window.__crease!.samplePixels!(pts.map((p) => ({ x: p.x, y: p.y }))),
    points as { x: number; y: number }[]
  );
  return raw.map((px) => {
    const a = (px[3] ?? 0) / 255;
    const k = 1 - a;
    return [
      (px[0] ?? 0) + DESK[0] * k,
      (px[1] ?? 0) + DESK[1] * k,
      (px[2] ?? 0) + DESK[2] * k,
      px[3] ?? 0
    ];
  });
}

/** Hides DOM overlays through CSSOM so a stage screenshot matches a poster. */
export async function hideOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    const sel = '.panel, .nav, .rail, .section, .footer, .skip-link';
    for (const el of document.querySelectorAll(sel)) {
      (el as HTMLElement).style.visibility = 'hidden';
    }
  });
}

export async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(SHOTS, { recursive: true });
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  return path;
}

/** One real scroll pass down the journey and back, driven by wheel events. */
export async function scrollPass(page: Page, steps = 36): Promise<void> {
  const range = await page.evaluate(() => window.__crease!.geometry!.scrollRange);
  await page.mouse.move(20, 20);
  const delta = range / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(24);
  }
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, -delta);
    await page.waitForTimeout(24);
  }
}
