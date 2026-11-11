import { clamp, clamp01, easeInOutCubic, lerp, shortestArcDeg } from '../lib/math';

export type StageKey = 'hero' | 'strategy' | 'design' | 'build' | 'launch';
export type InkLevels = readonly [number, number, number];

export interface Keyframe {
  key: StageKey;
  folds: Readonly<Record<'f1' | 'f2' | 'f3' | 'f4', number>>;
  ink: InkLevels;
  camera: { az: number; el: number; dist: number | 'cover' };
  panel: 'left' | 'right' | 'none';
  centreX: number;
}

// Final tuned keyframes. Angles in degrees; ink = structure / type / interface.
export const keyframes: readonly Keyframe[] = [
  {
    key: 'hero',
    folds: { f1: 0, f2: 0, f3: 0, f4: 0 },
    ink: [0, 0, 0],
    camera: { az: -28, el: 34, dist: 3.3 },
    panel: 'left',
    centreX: 0.7
  },
  {
    key: 'strategy',
    folds: { f1: 120, f2: 0, f3: 0, f4: 0 },
    ink: [1, 0, 0],
    camera: { az: 18, el: 42, dist: 3.0 },
    panel: 'right',
    centreX: 0.3
  },
  {
    key: 'design',
    folds: { f1: 105, f2: 150, f3: 150, f4: -90 },
    ink: [1, 1, 0],
    camera: { az: -32, el: 30, dist: 2.7 },
    panel: 'left',
    centreX: 0.7
  },
  {
    key: 'build',
    folds: { f1: 78, f2: 0, f3: 0, f4: -170 },
    ink: [1, 1, 1],
    camera: { az: 0, el: 14, dist: 2.9 },
    panel: 'right',
    centreX: 0.3
  },
  {
    key: 'launch',
    folds: { f1: 0, f2: 0, f3: 0, f4: 0 },
    ink: [0, 0, 0],
    camera: { az: 0, el: 90, dist: 'cover' },
    panel: 'none',
    centreX: 0.5
  }
];

export const FOLD_IDS = ['f1', 'f2', 'f3', 'f4'] as const;
export const CAMERA_FOV_DEG = 35;

export interface JourneyGeometry {
  keyP: readonly number[];
  dwellEndP: readonly number[];
}

// Default normalized geometry for a 100svh hero + four 150svh chapters over a 600svh scroll range.
export const defaultGeometry: JourneyGeometry = {
  keyP: [0, 0.25, 0.5, 0.75, 1],
  dwellEndP: [100 / 600, 250 / 600, 400 / 600, 550 / 600, 1]
};

export interface SceneState {
  P: number;
  stage: number;
  key: StageKey;
  folds: Record<string, number>;
  ink: InkLevels;
  camera: { az: number; el: number; dist: number; centreX: number; centreY: number };
  launchInkFade: number;
}

export function coverDistance(aspect: number, fovDeg = CAMERA_FOV_DEG): number {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360);
  return Math.min(f / Math.max(aspect, 0.05), f * 0.625) * 0.985;
}

export function rampFoldValue(from: number, to: number, t: number, index: number, count: number): number {
  if (Math.abs(to - from) < 1e-6) return to;
  if (count === 1) return lerp(from, to, easeInOutCubic(t));
  const duration = 0.55;
  const start = (index * (1 - duration)) / (count - 1);
  const local = clamp01((t - start) / duration);
  return lerp(from, to, easeInOutCubic(local));
}

export function stateAt(
  P: number,
  opts: { aspect?: number; portrait?: boolean; geometry?: JourneyGeometry } = {}
): SceneState {
  const p = clamp01(P);
  const aspect = opts.aspect ?? 1.6;
  const portrait = opts.portrait ?? aspect < 0.85;
  const g = opts.geometry ?? defaultGeometry;
  const cover = coverDistance(aspect);

  const resolveDist = (d: number | 'cover'): number => (d === 'cover' ? cover : d);
  const centreY = (key: StageKey): number => (key === 'launch' ? 0.5 : portrait ? 0.3 : 0.5);

  let stage = 0;
  for (let i = 0; i < g.keyP.length; i++) {
    if (p >= (g.keyP[i] ?? 0) - 1e-6) stage = i;
  }

  const kf = keyframes[stage]!;
  const baseFolds = { ...kf.folds, curl: 0 };
  const baseInk: InkLevels = kf.ink;
  let az = kf.camera.az;
  let el = kf.camera.el;
  let dist = resolveDist(kf.camera.dist);
  let cx = kf.centreX;
  let cy = centreY(kf.key);
  let launchInkFade = 0;

  // Dwell drift: scroll-driven only, <= +/-2deg, zero at key and dwell end.
  const dwellEnd = g.dwellEndP[stage] ?? g.keyP[stage] ?? 1;
  const keyP = g.keyP[stage] ?? 0;
  if (dwellEnd > keyP && p >= keyP && p <= dwellEnd && kf.key !== 'launch') {
    const t = clamp01((p - keyP) / (dwellEnd - keyP));
    az += Math.sin(Math.PI * t) * 2 * (stage % 2 === 0 ? 1 : -1);
  }

  // Ramp to next keyframe.
  if (stage < keyframes.length - 1) {
    const rampStart = g.dwellEndP[stage] ?? keyP;
    const rampEnd = g.keyP[stage + 1] ?? 1;
    if (p > rampStart && p < rampEnd) {
      const t = clamp01((p - rampStart) / (rampEnd - rampStart));
      const from = keyframes[stage]!;
      const to = keyframes[stage + 1]!;
      const changed = FOLD_IDS.filter((id) => Math.abs(to.folds[id] - from.folds[id]) > 1e-6);
      changed.forEach((id, i) => {
        baseFolds[id] = rampFoldValue(from.folds[id], to.folds[id], t, i, changed.length);
      });
      const toDist = resolveDist(to.camera.dist);
      const fromDist = resolveDist(from.camera.dist);
      az = lerp(from.camera.az, shortestArcDeg(from.camera.az, to.camera.az), t);
      el = lerp(from.camera.el, to.camera.el, t);
      dist = lerp(fromDist, toDist, t);
      cx = lerp(from.centreX, to.centreX, t);
      cy = lerp(centreY(from.key), centreY(to.key), t);
      if (to.key === 'launch') {
        launchInkFade = clamp01((t - 0.7) / 0.3);
        const keep = 1 - launchInkFade;
        return {
          P: p,
          stage,
          key: from.key,
          folds: baseFolds,
          ink: [from.ink[0] * keep, from.ink[1] * keep, from.ink[2] * keep],
          camera: { az, el, dist, centreX: cx, centreY: cy },
          launchInkFade
        };
      }
      return {
        P: p,
        stage,
        key: from.key,
        folds: baseFolds,
        ink: [
          lerp(from.ink[0], to.ink[0], t),
          lerp(from.ink[1], to.ink[1], t),
          lerp(from.ink[2], to.ink[2], t)
        ],
        camera: { az, el, dist, centreX: cx, centreY: cy },
        launchInkFade
      };
    }
  }

  return {
    P: p,
    stage,
    key: kf.key,
    folds: baseFolds,
    ink: baseInk,
    camera: { az, el, dist, centreX: cx, centreY: cy },
    launchInkFade
  };
}

export function keyframeState(key: StageKey, aspect = 1.6, portrait = false): SceneState {
  const i = keyframes.findIndex((k) => k.key === key);
  return stateAt(i / (keyframes.length - 1), { aspect, portrait });
}
