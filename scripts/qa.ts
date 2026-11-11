/**
 * Runs the whole harness against the built static site and writes
 * docs/QA_RESULTS.json with measured values. Anything a software-rendered CI
 * cannot prove is recorded as UNVERIFIED, never estimated.
 *
 *   pnpm qa                # build if needed, unit, size, e2e, report
 *   pnpm qa --skip-build
 *   pnpm qa --skip-e2e
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyframes } from '../src/content/journey';
import { ladderSettings } from '../src/lib/tier';
import { contrastChecks } from '../src/lib/exposure';
import { modeScriptBytes } from '../src/lib/mode';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const dist = join(root, 'dist');
mkdirSync(docs, { recursive: true });

const argv = process.argv.slice(2);
const skipBuild = argv.includes('--skip-build');
const skipE2E = argv.includes('--skip-e2e');

interface Step { name: string; status: 'pass' | 'fail' | 'skipped'; detail: string }
const steps: Step[] = [];

function run(name: string, args: string[], env: Record<string, string> = {}): Step {
  const result = spawnSync('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env }
  });
  const step: Step = {
    name,
    status: result.status === 0 ? 'pass' : 'fail',
    detail: `exit ${result.status ?? 'signal'}`
  };
  steps.push(step);
  return step;
}

function sumGlob(dir: string, match: (name: string) => boolean): { files: string[]; raw: number; gzip: number } {
  if (!existsSync(dir)) return { files: [], raw: 0, gzip: 0 };
  const files = readdirSync(dir).filter(match);
  let raw = 0;
  let gzip = 0;
  for (const f of files) {
    const buf = readFileSync(join(dir, f));
    raw += buf.byteLength;
    gzip += gzipSync(buf, { level: 9 }).byteLength;
  }
  return { files, raw, gzip };
}

// ---- build ---------------------------------------------------------------
if (!skipBuild || !existsSync(join(dist, 'index.html'))) {
  run('build', ['build']);
} else {
  steps.push({ name: 'build', status: 'skipped', detail: 'reusing dist' });
}

// ---- measured bytes ------------------------------------------------------
const assets = join(dist, 'assets');
const initial = sumGlob(assets, (n) => /^main-.*\.js$/.test(n));
const scene = sumGlob(assets, (n) => /^scene-.*\.js$/.test(n));
const css = sumGlob(assets, (n) => n.endsWith('.css'));
const fonts = sumGlob(join(root, 'public', 'fonts'), (n) => n.endsWith('.woff2'));

const posterDir = join(root, 'public', 'posters');
const posters: Record<string, number> = {};
if (existsSync(posterDir)) {
  for (const f of readdirSync(posterDir)) posters[f] = statSync(join(posterDir, f)).size;
}
const ogPath = join(root, 'public', 'og', 'crease-hero.avif');
const ogBytes = existsSync(ogPath) ? statSync(ogPath).size : 0;

const budgets = [
  { name: 'initial JS (gzip)', value: initial.gzip, limit: 12 * 1024 },
  { name: 'scene chunk (gzip)', value: scene.gzip, limit: 80 * 1024 },
  { name: 'CSS (gzip)', value: css.gzip, limit: 18 * 1024 },
  { name: 'fonts (transfer)', value: fonts.raw, limit: 120 * 1024 },
  { name: 'mode script', value: modeScriptBytes(), limit: 399 },
  { name: 'OG image', value: ogBytes, limit: 120 * 1024 }
];
for (const kf of keyframes) {
  budgets.push({
    name: `poster ${kf.key} desktop`,
    value: posters[`${kf.key}-desktop.avif`] ?? 0,
    limit: 55 * 1024
  });
  budgets.push({
    name: `poster ${kf.key} mobile`,
    value: posters[`${kf.key}-mobile.avif`] ?? 0,
    limit: 40 * 1024
  });
}

// ---- unit + size ---------------------------------------------------------
run('unit tests', ['test']);
run('size-limit', ['size']);

// ---- e2e -----------------------------------------------------------------
const e2eJson = join(docs, 'playwright-results.json');
let e2e: { passed: number; failed: number; skipped: number; failures: string[] } = {
  passed: 0, failed: 0, skipped: 0, failures: []
};
if (skipE2E) {
  steps.push({ name: 'e2e', status: 'skipped', detail: '--skip-e2e' });
} else {
  run('e2e', ['exec', 'playwright', 'test', '--reporter=json'], {
    PLAYWRIGHT_JSON_OUTPUT_NAME: e2eJson
  });
  if (existsSync(e2eJson)) {
    const parsed = JSON.parse(readFileSync(e2eJson, 'utf8')) as {
      stats?: { expected: number; unexpected: number; skipped: number };
      suites?: unknown[];
    };
    const failures: string[] = [];
    const walk = (suite: Record<string, unknown>): void => {
      for (const spec of (suite.specs as Record<string, unknown>[]) ?? []) {
        for (const test of (spec.tests as Record<string, unknown>[]) ?? []) {
          if (test.status !== 'expected') {
            failures.push(String(spec.title));
          }
        }
      }
      for (const child of (suite.suites as Record<string, unknown>[]) ?? []) walk(child);
    };
    for (const suite of (parsed.suites as Record<string, unknown>[]) ?? []) walk(suite);
    e2e = {
      passed: parsed.stats?.expected ?? 0,
      failed: parsed.stats?.unexpected ?? failures.length,
      skipped: parsed.stats?.skipped ?? 0,
      failures
    };
  }
}

// ---- report --------------------------------------------------------------
const a0 = ladderSettings('A0', 'A');
const b = ladderSettings('A2', 'B');
const report = {
  generatedAt: new Date().toISOString(),
  steps,
  bytes: {
    initialJS: { files: initial.files, raw: initial.raw, gzip: initial.gzip },
    sceneChunk: { files: scene.files, raw: scene.raw, gzip: scene.gzip },
    css: { files: css.files, raw: css.raw, gzip: css.gzip },
    fonts: { files: fonts.files, total: fonts.raw },
    posters,
    og: ogBytes
  },
  budgets: budgets.map((x) => ({ ...x, pass: x.value > 0 && x.value <= x.limit })),
  contrast: contrastChecks(),
  renderBudget: {
    tierA: { mesh: a0.mesh, triangles: a0.mesh[0] * a0.mesh[1] * 2 + 2, bendWidth: a0.bendWidth, dprCap: a0.dprCap },
    tierB: { mesh: b.mesh, triangles: b.mesh[0] * b.mesh[1] * 2 + 2, bendWidth: b.bendWidth, dprCap: b.dprCap },
    limits: { drawCalls: 3, triangles: 25000, textures: 3, gpuMemoryMB: 32 }
  },
  keyframes: keyframes.map((k) => ({
    key: k.key, folds: k.folds, ink: k.ink, camera: k.camera, panel: k.panel, centreX: k.centreX
  })),
  e2e,
  unverified: [
    'Real-device 60fps. CI renders through SwiftShader; the guarantee is the runtime ladder (rolling p75 over 30 moving frames, step down above 20ms, never up) plus on-demand rendering with zero idle frames.',
    'INP <= 150ms. Interaction to Next Paint is a field metric; Lighthouse lab runs cannot produce it. TBT is measured instead.',
    'Lighthouse LCP / CLS / TBT are produced separately by `pnpm lhci` and `pnpm lhci:desktop` into docs/lighthouse.',
    'JS-simulation-plus-draw <= 3ms per frame on target hardware; the trace from `pnpm trace` reports long tasks under 4x CPU throttle, not device GPU cost.'
  ]
};

writeFileSync(join(docs, 'QA_RESULTS.json'), JSON.stringify(report, null, 2));

const failedBudgets = report.budgets.filter((x) => !x.pass);
const failedSteps = steps.filter((s) => s.status === 'fail');

console.log('\n--- QA summary ---');
for (const s of steps) console.log(`${s.status.toUpperCase().padEnd(7)} ${s.name} (${s.detail})`);
console.log(`e2e: ${e2e.passed} passed, ${e2e.failed} failed, ${e2e.skipped} skipped`);
for (const x of report.budgets) {
  console.log(`${x.pass ? 'OK  ' : 'OVER'} ${x.name}: ${x.value} / ${x.limit}`);
}
console.log('report: docs/QA_RESULTS.json');

if (failedSteps.length || failedBudgets.length || e2e.failed > 0) process.exitCode = 1;
