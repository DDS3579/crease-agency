/**
 * Chrome trace at 4x CPU throttle while scrolling the journey. Reports long tasks
 * (>50ms) and writes the raw trace for inspection in DevTools.
 *
 *   pnpm trace
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve';
import { GL_ARGS } from '../playwright.config';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
mkdirSync(docs, { recursive: true });

interface TraceEvent { name: string; ph: string; ts: number; dur?: number; pid: number; tid: number }

const server = await serve();
const browser = await chromium.launch({ args: GL_ARGS });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1
});
const page = await context.newPage();
const client = await context.newCDPSession(page);

try {
  await page.goto(`${server.url}/?debug=1&perf=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__crease?.printLoaded === true, null, { timeout: 60_000 });
  await page.waitForTimeout(1500);

  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await client.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'blink.user_timing',
      'v8.execute'
    ].join(','),
    transferMode: 'ReturnAsStream',
    streamFormat: 'json'
  });

  const range = await page.evaluate(() => window.__crease!.geometry!.scrollRange);
  const startMark = Date.now();
  await page.mouse.move(20, 20);
  const steps = 90;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, range / steps);
    await page.waitForTimeout(16);
  }
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, -range / steps);
    await page.waitForTimeout(16);
  }
  const wallMs = Date.now() - startMark;

  const complete = new Promise<string>((resolve) => {
    client.once('Tracing.tracingComplete', (event: { stream?: string }) => {
      void (async () => {
        if (!event.stream) return resolve('[]');
        let out = '';
        for (;;) {
          const chunk = (await client.send('IO.read', {
            handle: event.stream,
            size: 1024 * 512
          })) as { data: string; eof: boolean };
          out += chunk.data;
          if (chunk.eof) break;
        }
        await client.send('IO.close', { handle: event.stream });
        resolve(out);
      })();
    });
  });
  await client.send('Tracing.end');
  const raw = await complete;
  await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const perf = await page.evaluate(() => window.__perf ?? null);
  const debugState = await page.evaluate(() => {
    const d = window.__crease!;
    return { ladder: d.ladder, renders: d.renders, drawCalls: d.drawCalls, triangles: d.triangles };
  });

  const tracePath = join(docs, 'journey-4x.trace.json');
  writeFileSync(tracePath, raw);

  let events: TraceEvent[] = [];
  try {
    const parsed = JSON.parse(raw) as { traceEvents?: TraceEvent[] } | TraceEvent[];
    events = Array.isArray(parsed) ? parsed : (parsed.traceEvents ?? []);
  } catch {
    events = [];
  }
  const longTasks = events
    .filter((e) => e.name === 'RunTask' && typeof e.dur === 'number' && e.dur > 50_000)
    .map((e) => Number((e.dur! / 1000).toFixed(1)))
    .sort((a, b) => b - a);

  const summary = {
    generatedAt: new Date().toISOString(),
    cpuThrottle: 4,
    viewport: { width: 1440, height: 900 },
    scrollWallMs: wallMs,
    longTasksOver50ms: longTasks.length,
    longestTaskMs: longTasks[0] ?? 0,
    topTasksMs: longTasks.slice(0, 10),
    perf,
    debug: debugState,
    traceFile: 'docs/journey-4x.trace.json',
    note:
      'Software GL (SwiftShader) inflates raster and GPU cost. Long tasks here bound the ' +
      'main-thread work only; real-device frame rate remains UNVERIFIED and is covered ' +
      'by the runtime ladder and on-demand rendering.'
  };
  writeFileSync(join(docs, 'TRACE_RESULTS.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (longTasks.length > 0) {
    console.warn(`${longTasks.length} long task(s) over 50ms during the journey`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
}
