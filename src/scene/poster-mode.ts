import { clamp01 } from '../lib/math';
import type { Rail } from '../ui/rail';
import { copy } from '../content/demo/copy';
import { keyframeState, type StageKey } from '../content/journey';
import type { CreaseDebug } from './debug';

export const POSTER_KEYS = ['hero', 'strategy', 'design', 'build', 'launch'] as const;
export type PosterKey = (typeof POSTER_KEYS)[number];

/** Meaningful alt text, used whenever posters become content (poster-swap / stacked). */
export const POSTER_ALTS: readonly string[] = POSTER_KEYS.map((k) => copy.posters[k]);

export interface PosterActivateOptions {
  revealAll?: boolean;
  alts?: readonly string[];
}

/** Pure DOM activation: writes `hidden`, `class` and optionally `alt`. Never style. */
export function setPosterActive(stage: Element, index: number, opts: PosterActivateOptions = {}): void {
  const imgs = stage.querySelectorAll<HTMLImageElement>('.stage-poster');
  imgs.forEach((img, i) => {
    const active = i === index;
    img.hidden = opts.revealAll ? false : !active;
    img.classList.toggle('is-active', active);
    if (opts.alts) img.alt = opts.alts[i] ?? '';
  });
}

export interface PosterSwapGeometry { journeyTop: number; scrollRange: number }

export interface PosterSwapOptions {
  stage: HTMLElement;
  rail: Rail;
  geometry: () => PosterSwapGeometry;
  debug: boolean;
  onStage?: (index: number, p: number) => void;
}

export interface PosterSwap { update(): void; dispose(): void }

/**
 * Poster-swap tier: identical sticky geometry, five committed posters crossfading
 * by chapter, no canvas. Entered on context-creation failure, unrecoverable context
 * loss, or when the runtime ladder bottoms out. Publishes a full debug record so
 * the harness can inspect this path exactly like the live one.
 */
export function createPosterSwap(opts: PosterSwapOptions): PosterSwap {
  const { stage, rail, geometry, debug } = opts;
  let last = -1;
  let launch = false;

  document.body.dataset.posterSwap = 'true';
  document.body.dataset.sceneReady = 'false';
  delete document.body.dataset.launchDone;
  stage.setAttribute('aria-hidden', 'false');
  setPosterActive(stage, 0, { revealAll: true, alts: POSTER_ALTS });

  const publish = (p: number, idx: number): void => {
    if (!debug) return;
    const key: StageKey = POSTER_KEYS[idx] ?? 'hero';
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const state = keyframeState(key, aspect, aspect < 0.85 || window.innerWidth < 768);
    const prev = window.__crease;
    const record: CreaseDebug = {
      ...prev,
      P: p,
      stage: idx,
      key,
      folds: state.folds,
      ink: state.ink,
      camera: state.camera,
      tier: 'poster',
      ladder: 'poster',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      renders: prev?.renders ?? 0,
      drawCalls: 0,
      triangles: 0,
      textureCount: 0,
      gpuMemoryMB: 0,
      activity: [0, 0, 0, 0, 0, 0, 0, 0],
      printLoaded: false
    };
    window.__crease = record;
  };

  const update = (): void => {
    const g = geometry();
    const p = clamp01((window.scrollY - g.journeyTop) / Math.max(1, g.scrollRange));
    const idx = Math.min(POSTER_KEYS.length - 1, Math.round(p * (POSTER_KEYS.length - 1)));
    if (idx !== last) {
      last = idx;
      setPosterActive(stage, idx, { revealAll: true, alts: POSTER_ALTS });
      opts.onStage?.(idx, p);
    }
    rail.update(p, idx);
    const l = p > 0.995;
    if (l !== launch) {
      launch = l;
      rail.setLaunch(l);
    }
    publish(p, idx);
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();

  return {
    update,
    dispose() {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    }
  };
}
