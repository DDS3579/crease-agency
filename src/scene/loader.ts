import { $, $$, debounce } from '../lib/dom';
import { clamp01 } from '../lib/math';
import { Spring } from '../lib/spring';
import { nextLadderLevel, type Capabilities, type LadderLevel } from '../lib/tier';
import type { Ticker } from '../lib/ticker';
import type { Rail } from '../ui/rail';
import { applyFolds, createFoldState } from '../content/folds';
import { defaultGeometry, keyframeState, keyframes, stateAt, type JourneyGeometry, type StageKey } from '../content/journey';
import { SceneRenderer } from './renderer';
import { publishDebug, type CreaseDebug } from './debug';

export interface LoadOptions {
  ticker: Ticker;
  rail: Rail;
  caps: Capabilities;
}

interface GeometryCache extends JourneyGeometry {
  scrollRange: number;
  journeyTop: number;
}

export async function loadScene(opts: LoadOptions): Promise<void> {
  const { ticker, rail, caps } = opts;
  const stage = $('[data-stage]');
  const journey = $('[data-journey]');
  if (!stage || !journey) return;
  const params = new URLSearchParams(location.search);
  const posterKey = params.get('poster') as StageKey | null;
  const debugOn = params.has('debug') || posterKey !== null;
  const perfOn = params.has('perf');
  const noLadder = params.has('noladder') || posterKey !== null;

  let renderer: SceneRenderer | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let ladder: LadderLevel = caps.tier === 'A' ? 'A0' : 'A1';
  let disposed = false;
  let posterSwapActive = false;
  const spring = new Spring(120, 30);
  let targetP = 0;
  let currentP = 0;
  let needsRender = true;
  let pointer: { x: number; y: number } | null = null;
  let curlAngle = 0;
  let curlCorner: 'tl' | 'tr' | 'bl' | 'br' = 'tl';
  let geometry: GeometryCache = { ...defaultGeometry, scrollRange: 1, journeyTop: 0 };
  const frameSamples: number[] = [];
  const perfDeltas: number[] = [];

  const measure = (): void => {
    const jr = journey.getBoundingClientRect();
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
    while (keyP.length < 5) keyP.push(1);
    while (dwellEndP.length < 5) dwellEndP.push(1);
    geometry = { keyP, dwellEndP, scrollRange, journeyTop };
    targetP = clamp01((window.scrollY - journeyTop) / scrollRange);
    needsRender = true;
    if (window.__crease) window.__crease.geometry = geometry;
  };

  const activatePoster = (index: number): void => {
    $$('.stage-poster', stage).forEach((img, i) => {
      const active = i === index;
      img.classList.toggle('is-active', active);
      (img as HTMLImageElement).hidden = !active;
      if (active && i > 0) img.setAttribute('alt', posterAlt(i));
    });
  };

  const posterAlt = (i: number): string =>
    ['hero', 'strategy', 'design', 'build', 'launch'].map((k) => k)[i] ?? '';

  const enterPosterSwap = (): void => {
    if (posterSwapActive) return;
    posterSwapActive = true;
    renderer?.dispose();
    renderer = null;
    canvas?.remove();
    canvas = null;
    document.body.dataset.posterSwap = 'true';
    document.body.dataset.sceneReady = 'false';
    stage.setAttribute('aria-hidden', 'false');
    const update = (): void => {
      const p = clamp01((window.scrollY - geometry.journeyTop) / geometry.scrollRange);
      const idx = Math.min(4, Math.round(p * 4));
      activatePoster(idx);
      rail.update(p, idx);
      rail.setLaunch(p > 0.92);
      if (debugOn && window.__crease) {
        window.__crease.P = p;
        window.__crease.stage = idx;
        window.__crease.ladder = 'poster';
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  };

  const createRenderer = (): void => {
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.touchAction = 'pan-y';
    stage.appendChild(canvas);
    renderer = new SceneRenderer(canvas, caps.tier === 'poster' ? 'B' : caps.tier, ladder);
    renderer.resize(stage.clientWidth, stage.clientHeight);
    void renderer.loadPrint().then(() => {
      needsRender = true;
      ticker.request();
      if (posterKey) finishPoster();
    });
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      const gl = renderer?.gl;
      const ext = gl?.getExtension('WEBGL_lose_context');
      setTimeout(() => {
        try {
          ext?.restoreContext();
        } catch {
          enterPosterSwap();
        }
      }, 100);
      setTimeout(() => {
        if (gl?.isContextLost()) enterPosterSwap();
      }, 1600);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        renderer?.dispose();
        createRenderer();
        needsRender = true;
        ticker.request();
      } catch {
        enterPosterSwap();
      }
    });
  };

  const finishPoster = (): void => {
    if (!renderer || !posterKey) return;
    const i = keyframes.findIndex((k) => k.key === posterKey);
    const p = i / (keyframes.length - 1);
    const state = stateAt(p, { aspect: stage!.clientWidth / stage!.clientHeight, portrait: caps.width < 768 });
    renderer.render(state, null, 1 / 60);
    document.body.dataset.sceneReady = 'true';
    publishDebug(state, renderer.stats, caps.tier, ladder, renderer.activity, caps);
    if (window.__crease) window.__crease.posterReady = true;
  };

  try {
    createRenderer();
  } catch {
    enterPosterSwap();
    return;
  }

  measure();
  void document.fonts.ready.then(measure);
  const ro = new ResizeObserver(debounce(measure, 80));
  ro.observe(journey);
  window.addEventListener('resize', measure, { passive: true });

  if (posterKey) {
    document.body.dataset.posterMode = 'true';
    // deterministic: no spring, no pointer, no ladder
    const i = keyframes.findIndex((k) => k.key === posterKey);
    currentP = i / (keyframes.length - 1);
    spring.jump(currentP);
    targetP = currentP;
    finishPoster();
    if (debugOn) exposeDebug();
    return;
  }

  const onScroll = (): void => {
    targetP = clamp01((window.scrollY - geometry.journeyTop) / geometry.scrollRange);
    if (caps.reducedMotion) {
      // IO drives jumps; still update rail fill from scroll position.
      rail.update(targetP, Math.min(4, Math.round(targetP * 4)));
    }
    ticker.request();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (caps.reducedMotion) {
    const panels = $$('.panel', journey);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const i = panels.indexOf(e.target as HTMLElement);
            const p = geometry.keyP[i] ?? 0;
            currentP = p;
            spring.jump(p);
            targetP = p;
            needsRender = true;
            ticker.request();
          }
        }
      },
      { threshold: 0.35 }
    );
    panels.forEach((p) => io.observe(p));
  }

  if (caps.tier === 'A' && caps.finePointer && !caps.reducedMotion) {
    window.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      ticker.request();
    }, { passive: true });
    window.addEventListener('pointerleave', () => {
      pointer = null;
      ticker.request();
    });
  }

  const tick = (dt: number): boolean => {
    if (disposed || !renderer || posterSwapActive) return false;
    let moving = false;
    if (!caps.reducedMotion) {
      moving = spring.step(targetP, dt);
      currentP = spring.x;
    }
    const aspect = stage!.clientWidth / Math.max(1, stage!.clientHeight);
    const state = stateAt(currentP, { aspect, portrait: caps.width < 768, geometry });
    const s = renderer.level;
    const curlEnabled = caps.tier === 'A' && caps.finePointer && !caps.reducedMotion && s === 'A0';
    let curl: { corner: 'tl' | 'tr' | 'bl' | 'br'; angle: number } | null = null;
    const flatHero = state.key === 'hero' && Object.values(state.folds).every((a) => Math.abs(a) < 5);
    if (curlEnabled && flatHero && pointer) {
      const t = renderer.curlTarget(pointer.x, pointer.y, state);
      if (t) {
        curlCorner = t.corner;
        curlAngle += (t.angle - curlAngle) * 0.08;
      } else {
        curlAngle += (0 - curlAngle) * 0.08;
      }
    } else {
      curlAngle += (0 - curlAngle) * 0.08;
    }
    if (Math.abs(curlAngle) > 0.01) {
      curl = { corner: curlCorner, angle: curlAngle };
      moving = true;
    }
    const activityActive = renderer.render(state, curl, dt);
    rail.update(currentP, state.stage);
    rail.setLaunch(currentP > 0.92);
    if (debugOn) publishDebug(state, renderer.stats, caps.tier, ladder, renderer.activity, caps);
    needsRender = false;

    if (!noLadder && moving) {
      frameSamples.push(dt * 1000);
      if (frameSamples.length >= 30) {
        const sorted = [...frameSamples].sort((a, b) => a - b);
        const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
        frameSamples.length = 0;
        const next = nextLadderLevel(ladder, p75);
        if (next !== ladder) {
          ladder = next;
          if (next === 'poster') {
            enterPosterSwap();
            return false;
          }
          renderer.setLevel(next);
          needsRender = true;
        }
      }
    }
    return moving || activityActive || needsRender;
  };

  ticker.add(tick, 10);
  ticker.onFrame = (dt) => {
    if (!perfOn) return;
    perfDeltas.push(dt * 1000);
    if (perfDeltas.length > 240) perfDeltas.shift();
    const sorted = [...perfDeltas].sort((a, b) => a - b);
    window.__perf = {
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
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
      forceRender() {
        needsRender = true;
        ticker.request();
      },
      gpuParity(points, key) {
        if (!renderer) throw new Error('no renderer');
        const state = keyframeState(key as StageKey, stage!.clientWidth / stage!.clientHeight, caps.width < 768);
        const gpu = renderer.gpuParity(points, state);
        const cpu: number[] = [];
        let maxError = 0;
        points.forEach((p, i) => {
          const c = applyFolds(p, createFoldStateFor(state));
          cpu.push(c[0], c[1], c[2]);
          for (let j = 0; j < 3; j++) {
            maxError = Math.max(maxError, Math.abs(c[j]! - gpu[i * 3 + j]!));
          }
        });
        return { maxError, cpu, gpu: Array.from(gpu) };
      },
      dispose() {
        disposed = true;
        renderer?.dispose();
        ticker.dispose();
      }
    };
    window.__crease = { ...window.__crease, ...api } as CreaseDebug;
  }
  if (debugOn) exposeDebug();

  // first frame crossfade
  requestAnimationFrame(() => {
    if (renderer && !posterSwapActive) {
      document.body.dataset.sceneReady = 'true';
    }
  });
}

function createFoldStateFor(state: ReturnType<typeof stateAt>): ReturnType<typeof createFoldState> {
  return createFoldState(state.folds);
}
