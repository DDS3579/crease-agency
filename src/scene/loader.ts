import { $, $$, debounce } from '../lib/dom';
import { clamp01 } from '../lib/math';
import { Spring } from '../lib/spring';
import { nextLadderLevel, type Capabilities, type LadderLevel } from '../lib/tier';
import type { Ticker } from '../lib/ticker';
import type { Rail } from '../ui/rail';
import { applyFolds, createFoldState } from '../content/folds';
import {
  FOLD_IDS, defaultGeometry, keyframeState, keyframes, stateAt,
  type JourneyGeometry, type StageKey
} from '../content/journey';
import { copy } from '../content/demo/copy';
import { SceneRenderer } from './renderer';
import { publishDebug, type CreaseDebug, type SamplePoint } from './debug';

export interface LoadOptions { ticker: Ticker; rail: Rail; caps: Capabilities }
interface GeometryCache extends JourneyGeometry { scrollRange: number; journeyTop: number }

const POSTER_KEYS: readonly StageKey[] = ['hero', 'strategy', 'design', 'build', 'launch'];
const POSTER_ALTS: readonly string[] = POSTER_KEYS.map((k) => copy.posters[k]);
const LAUNCH_PANEL_YIELD = 0.97;
const LAUNCH_HANDOFF = 0.995;

function p75(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.75))] ?? 0;
}

export async function loadScene(opts: LoadOptions): Promise<void> {
  const { ticker, rail, caps } = opts;
  const stage = $<HTMLElement>('[data-stage]');
  const journey = $<HTMLElement>('[data-journey]');
  if (!stage || !journey) return;

  const params = new URLSearchParams(location.search);
  const posterKey = params.get('poster') as StageKey | null;
  const debugOn = params.has('debug') || posterKey !== null;
  const perfOn = params.has('perf');
  const noLadder = params.has('noladder') || posterKey !== null;

  let renderer: SceneRenderer | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let posterSwap = false;
  let ladder: LadderLevel = caps.tier === 'A' ? 'A0' : 'A2';
  let disposed = false;
  let contextLost = false;

  const spring = new Spring(160, 25.3);
  let targetP = 0;
  let currentP = 0;

  let needsRender = true;
  let activityAlive = false;
  let lastRenderedP = -1;
  let lastRenderedCurl = -1;
  let lastRenderedCorner = '';

  let pointer: { x: number; y: number } | null = null;
  let curlAngle = 0;
  let curlCorner: 'tl' | 'tr' | 'bl' | 'br' = 'tl';

  let geometry: GeometryCache = { ...defaultGeometry, scrollRange: 1, journeyTop: 0 };
  // Cached stage box. The frame loop and pointer handler never read layout.
  let box = { left: 0, top: 0, width: 1, height: 1 };
  let aspect = 1.6;
  let portrait = false;

  let shownPoster = 0;
  let launchDone = false;
  const frameSamples: number[] = [];
  const perfDeltas: number[] = [];
  const cleanups: (() => void)[] = [];

  const measure = (): void => {
    const jr = journey.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    box = { left: sr.left, top: sr.top, width: sr.width, height: sr.height };
    aspect = sr.width / Math.max(1, sr.height);
    portrait = aspect < 0.85 || window.innerWidth < 768;

    const journeyTop = jr.top + window.scrollY;
    const scrollRange = Math.max(1, jr.height - window.innerHeight);
    const panels = $$('.panel', journey);
    const keyP: number[] = [0];
    const dwellEndP: number[] = [];

    panels.forEach((panel, i) => {
      const r = panel.getBoundingClientRect();
      const top = r.top + window.scrollY - journeyTop;
      const h = r.height;
      if (i === 0) {
        dwellEndP.push(clamp01(h / scrollRange));
      } else {
        const ramp = Math.max(0, h - window.innerHeight);
        keyP.push(clamp01((top + ramp) / scrollRange));
        dwellEndP.push(clamp01((top + h) / scrollRange));
      }
    });
    while (keyP.length < keyframes.length) keyP.push(1);
    while (dwellEndP.length < keyframes.length) dwellEndP.push(1);

    geometry = { keyP, dwellEndP, scrollRange, journeyTop };
    targetP = clamp01((window.scrollY - journeyTop) / scrollRange);
    renderer?.resize(box.width, box.height);
    needsRender = true;
    if (window.__crease) window.__crease.geometry = geometry;
    ticker.request();
  };

  const setPosterActive = (index: number, revealAll: boolean, withAlts: boolean): void => {
    $$('.stage-poster', stage).forEach((node, i) => {
      const img = node as HTMLImageElement;
      const active = i === index;
      img.hidden = revealAll ? false : !active;
      img.classList.toggle('is-active', active);
      if (withAlts) img.alt = POSTER_ALTS[i] ?? '';
    });
  };

  const setLaunchDone = (value: boolean): void => {
    if (value === launchDone) return;
    launchDone = value;
    if (value) document.body.dataset.launchDone = 'true';
    else delete document.body.dataset.launchDone;
  };

  const showPoster = (index: number): void => {
    if (index === shownPoster) return;
    shownPoster = index;
    setPosterActive(index, false, false);
  };

  const enterPosterSwap = (): void => {
    if (posterSwap || disposed) return;
    posterSwap = true;
    renderer?.dispose();
    renderer = null;
    canvas?.remove();
    canvas = null;
    document.body.dataset.posterSwap = 'true';
    document.body.dataset.sceneReady = 'false';
    delete document.body.dataset.launchDone;
    stage.setAttribute('aria-hidden', 'false');
    setPosterActive(0, true, true);

    let last = -1;
    const update = (): void => {
      const p = clamp01((window.scrollY - geometry.journeyTop) / geometry.scrollRange);
      const idx = Math.min(POSTER_KEYS.length - 1, Math.round(p * (POSTER_KEYS.length - 1)));
      if (idx !== last) {
        last = idx;
        setPosterActive(idx, true, true);
      }
      rail.update(p, idx);
      rail.setLaunch(p > LAUNCH_HANDOFF);
      if (debugOn) {
        const state = keyframeState(POSTER_KEYS[idx] ?? 'hero', aspect, portrait);
        publishDebug(state, { renders: 0, drawCalls: 0, triangles: 0, textureCount: 0, gpuMemoryMB: 0 },
          'poster', 'poster', new Float32Array(8), caps, false);
        window.__crease!.P = p;
        window.__crease!.stage = idx;
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    cleanups.push(() => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    });
    update();
  };

  const createRenderer = (): void => {
    canvas?.remove();
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.touchAction = 'pan-y';
    stage.appendChild(canvas);

    renderer = new SceneRenderer(canvas, caps.tier === 'poster' ? 'B' : caps.tier, ladder);
    renderer.glowEnabled = !caps.reducedMotion;
    renderer.resize(box.width, box.height);

    void renderer.loadPrint().then(() => {
      needsRender = true;
      ticker.request();
      if (posterKey) finishPoster();
    }).catch(() => { /* a blank sheet is a valid state */ });

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      contextLost = true;
      // Capture the extension while the context is alive: getExtension returns
      // null once lost.
      const ext = renderer?.gl.getExtension('WEBGL_lose_context') ?? null;
      setTimeout(() => {
        if (disposed || !contextLost) return;
        try { ext?.restoreContext(); } catch { enterPosterSwap(); }
      }, 100);
      setTimeout(() => {
        if (disposed || !contextLost) return;
        if (!renderer || renderer.gl.isContextLost()) enterPosterSwap();
      }, 1600);
    });

    canvas.addEventListener('webglcontextrestored', () => {
      contextLost = false;
      if (disposed) return;
      try {
        renderer?.dispose();
        createRenderer();
        needsRender = true;
        ticker.request();
      } catch { enterPosterSwap(); }
    });
  };

  const finishPoster = (): void => {
    if (!renderer || !posterKey || !renderer.printLoaded) return;
    const i = keyframes.findIndex((k) => k.key === posterKey);
    const p = i / (keyframes.length - 1);
    const state = stateAt(p, { aspect, portrait });
    renderer.resetActivity();
    renderer.render(state, null, 0);
    document.body.dataset.sceneReady = 'true';
    publishDebug(state, renderer.stats, caps.tier, ladder, renderer.activity, caps, true);
    if (window.__crease) window.__crease.posterReady = true;
  };

  // ---- boot ---------------------------------------------------------------
  const sr = stage.getBoundingClientRect();
  box = { left: sr.left, top: sr.top, width: sr.width, height: sr.height };
  aspect = box.width / Math.max(1, box.height);
  portrait = aspect < 0.85 || window.innerWidth < 768;

  try {
    createRenderer();
  } catch {
    measure();
    enterPosterSwap();
    if (debugOn) exposeDebug();
    return;
  }

  measure();
  void document.fonts.ready.then(measure);
  const ro = new ResizeObserver(debounce(measure, 80));
  ro.observe(journey);
  cleanups.push(() => ro.disconnect());

  const onResize = (): void => measure();
  window.addEventListener('resize', onResize, { passive: true });
  cleanups.push(() => window.removeEventListener('resize', onResize));

  if (posterKey) {
    document.body.dataset.posterMode = 'true';
    const i = keyframes.findIndex((k) => k.key === posterKey);
    currentP = i / (keyframes.length - 1);
    targetP = currentP;
    spring.jump(currentP);
    finishPoster();
    exposeDebug();
    return;
  }

  const nearestStage = (p: number): number => {
    let best = 0;
    let bestD = Infinity;
    geometry.keyP.forEach((k, i) => {
      const d = Math.abs(p - k);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  const onScroll = (): void => {
    targetP = clamp01((window.scrollY - geometry.journeyTop) / geometry.scrollRange);
    if (caps.reducedMotion) rail.update(targetP, nearestStage(targetP));
    ticker.request();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => window.removeEventListener('scroll', onScroll));
  onScroll();

  if (caps.reducedMotion) {
    const panels = $$('.panel', journey);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = panels.indexOf(e.target as HTMLElement);
          const p = geometry.keyP[i] ?? 0;
          currentP = p;
          targetP = p;
          spring.jump(p);
          needsRender = true;
          ticker.request();
        }
      },
      { threshold: 0.35 }
    );
    panels.forEach((p) => io.observe(p));
    cleanups.push(() => io.disconnect());
  }

  if (caps.tier === 'A' && caps.finePointer && !caps.reducedMotion) {
    // Cached box: no getBoundingClientRect per pointer event.
    const onPointer = (e: PointerEvent): void => {
      pointer = { x: e.clientX - box.left, y: e.clientY - box.top };
      ticker.request();
    };
    const onLeave = (): void => { pointer = null; ticker.request(); };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerleave', onLeave, { passive: true });
    window.addEventListener('blur', onLeave);
    cleanups.push(() => {
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    });
  }

  // ---- frame --------------------------------------------------------------
  const tick = (dt: number): boolean => {
    if (disposed || !renderer || posterSwap) return false;

    let moving = false;
    if (!caps.reducedMotion) {
      moving = spring.step(targetP, dt);
      currentP = spring.x;
    } else {
      currentP = targetP;
    }

    const state = stateAt(currentP, { aspect, portrait, geometry });

    const curlEnabled =
      caps.tier === 'A' && caps.finePointer && !caps.reducedMotion && renderer.level === 'A0';
    const flatHero =
      state.key === 'hero' && FOLD_IDS.every((id) => Math.abs(state.folds[id] ?? 0) < 5);

    let targetAngle = 0;
    if (curlEnabled && flatHero && pointer) {
      const t = renderer.curlTarget(pointer.x, pointer.y, state);
      if (t) { curlCorner = t.corner; targetAngle = t.angle; }
    }
    const prevCurl = curlAngle;
    curlAngle += (targetAngle - curlAngle) * 0.08;
    if (Math.abs(curlAngle) < 0.005) curlAngle = 0;
    const curlAnimating = Math.abs(curlAngle - prevCurl) > 0.002;

    // Change gate: idle means zero renders.
    const pChanged = Math.abs(currentP - lastRenderedP) > 1e-5;
    const curlChanged =
      Math.abs(curlAngle - lastRenderedCurl) > 0.002 ||
      (curlAngle > 0 && curlCorner !== lastRenderedCorner);
    const shouldRender = needsRender || pChanged || curlChanged || activityAlive;

    if (shouldRender) {
      activityAlive = renderer.render(
        state,
        curlAngle > 0.001 ? { corner: curlCorner, angle: curlAngle } : null,
        dt
      );
      lastRenderedP = currentP;
      lastRenderedCurl = curlAngle;
      lastRenderedCorner = curlCorner;
      needsRender = false;
      if (debugOn) {
        publishDebug(state, renderer.stats, caps.tier, ladder, renderer.activity, caps, renderer.printLoaded);
      }
    }

    rail.update(currentP, state.stage);
    rail.setLaunch(currentP > LAUNCH_PANEL_YIELD);
    showPoster(state.stage === keyframes.length - 1 ? keyframes.length - 1 : 0);
    setLaunchDone(currentP > LAUNCH_HANDOFF);

    if (!noLadder && moving && shouldRender) {
      frameSamples.push(dt * 1000);
      if (frameSamples.length >= 30) {
        const value = p75(frameSamples);
        frameSamples.length = 0;
        const next = nextLadderLevel(ladder, value);
        if (next !== ladder) {
          ladder = next;
          if (next === 'poster') { enterPosterSwap(); return false; }
          renderer.setLevel(next);
          needsRender = true;
        }
      }
    }

    return moving || curlAnimating || activityAlive || needsRender;
  };

  cleanups.push(ticker.add(tick, 10));

  ticker.onFrame = (dt) => {
    if (!perfOn) return;
    perfDeltas.push(dt * 1000);
    if (perfDeltas.length > 240) perfDeltas.shift();
    const s = [...perfDeltas].sort((a, b) => a - b);
    window.__perf = {
      p50: s[Math.floor(s.length * 0.5)] ?? 0,
      p95: s[Math.floor(s.length * 0.95)] ?? 0,
      dropped: perfDeltas.filter((d) => d > 20).length,
      level: ladder,
      frames: perfDeltas.length
    };
  };

  ticker.request();

  function exposeDebug(): void {
    const api: Partial<CreaseDebug> = {
      geometry,
      setP(p: number) {
        targetP = clamp01(p);
        currentP = targetP;
        spring.jump(targetP);
        needsRender = true;
        ticker.request();
      },
      forceRender() { needsRender = true; ticker.request(); },
      samplePixels(points: SamplePoint[]) {
        if (!renderer) throw new Error('no renderer');
        const state = stateAt(currentP, { aspect, portrait, geometry });
        renderer.render(state, null, 0);
        const gl = renderer.gl;
        const sx = renderer.canvas.width / Math.max(1, box.width);
        const sy = renderer.canvas.height / Math.max(1, box.height);
        const px = new Uint8Array(4);
        return points.map((p) => {
          const x = Math.min(renderer!.canvas.width - 1, Math.max(0, Math.round(p.x * sx)));
          const y = Math.min(renderer!.canvas.height - 1, Math.max(0,
            renderer!.canvas.height - 1 - Math.round(p.y * sy)));
          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return [px[0]!, px[1]!, px[2]!, px[3]!];
        });
      },
      gpuParity(points, key) {
        if (!renderer) throw new Error('no renderer');
        const state = keyframeState(key as StageKey, aspect, portrait);
        const gpu = renderer.gpuParity(points, state);
        const foldState = createFoldState(state.folds);
        const cpu: number[] = [];
        let maxError = 0;
        points.forEach((p, i) => {
          const c = applyFolds(p, foldState);
          cpu.push(c[0], c[1], c[2]);
          for (let j = 0; j < 3; j++) {
            maxError = Math.max(maxError, Math.abs(c[j]! - gpu[i * 3 + j]!));
          }
        });
        return { maxError, cpu, gpu: Array.from(gpu) };
      },
      dispose() {
        disposed = true;
        for (const fn of cleanups) fn();
        cleanups.length = 0;
        renderer?.dispose();
        renderer = null;
        canvas?.remove();
        canvas = null;
        ticker.onFrame = null;
        ticker.dispose();
      }
    };
    window.__crease = { ...window.__crease, ...api } as CreaseDebug;
  }

  if (debugOn) exposeDebug();

  requestAnimationFrame(() => {
    if (renderer && !posterSwap && !disposed) document.body.dataset.sceneReady = 'true';
  });
}
