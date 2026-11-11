import { clamp01, degToRad, easeInOutCubic, lerp, shortestArcDeg } from '../lib/math';

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

/**
 * FINAL TUNED KEYFRAMES.
 *
 * The brief's seed distances (3.3 / 3.0 / 2.7 / 2.9) were solved against the
 * composition rule rather than kept: at 1440x900 they put the sheet 64-185px
 * inside the text column at every stage, and clipped it off-screen at strategy,
 * design and build. Distances below are the smallest that clear the text column
 * and the viewport by >=12px at 1024x768, 1280x800, 1440x900 and 1920x1080,
 * plus a 4% safety margin. Panels are 5 of 12 columns (brief allows up to 6).
 * Fold angles, azimuths, elevations, ink and centreX are the seed values: they
 * define the stage reading and needed no change.
 */
export const keyframes: readonly Keyframe[] = [
  {
    key: 'hero',
    folds: { f1: 0, f2: 0, f3: 0, f4: 0 },
    ink: [0, 0, 0],
    camera: { az: -28, el: 34, dist: 4.7 },
    panel: 'left',
    centreX: 0.7
  },
  {
    key: 'strategy',
    folds: { f1: 120, f2: 0, f3: 0, f4: 0 },
    ink: [1, 0, 0],
    camera: { az: 18, el: 42, dist: 5.2 },
    panel: 'right',
    centreX: 0.3
  },
  {
    key: 'design',
    folds: { f1: 105, f2: 150, f3: 150, f4: -90 },
    ink: [1, 1, 0],
    camera: { az: -32, el: 30, dist: 4.62 },
    panel: 'left',
    centreX: 0.7
  },
  {
    key: 'build',
    folds: { f1: 78, f2: 0, f3: 0, f4: -170 },
    ink: [1, 1, 1],
    camera: { az: 0, el: 14, dist: 5.26 },
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
const SHEET_HALF_H = 0.625;

export interface JourneyGeometry {
  keyP: readonly number[];
  dwellEndP: readonly number[];
}

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
  /** 0..1 over the last 30% of the unfold: drives the shader ink fade. */
  launchInkFade: number;
  /** 0..1 across the whole Launch ramp: shadow fade, fibre off, DOM handoff. */
  launchT: number;
}

const focal = (fovDeg: number): number => 1 / Math.tan(degToRad(fovDeg) / 2);

/** Top-down distance at which the flat sheet covers the viewport on both axes. */
export function coverDistance(aspect: number, fovDeg = CAMERA_FOV_DEG): number {
  const f = focal(fovDeg);
  return Math.min(f / Math.max(aspect, 0.05), f * SHEET_HALF_H) * 0.985;
}

/**
 * Width fit. The margin is 1.25, not 1.06: azimuth rotates the sheet in plan, so
 * its projected bounding box is wider than the unrotated 2.0 units. At 1.06 the
 * strategy stage clipped 22px off a 375px viewport.
 */
export function fitDistance(aspect: number, fovDeg = CAMERA_FOV_DEG, margin = 1.25): number {
  const f = focal(fovDeg);
  return f * Math.max(1 / Math.max(aspect, 0.05), SHEET_HALF_H) * margin;
}

/**
 * Portrait height floor. Width fit alone lets the object grow to 0.52 of a short
 * viewport's height, pushing it into the bottom text band. The tallest stage
 * (hero, flat sheet plus contact shadow at az -28 / el 34) has a projected world
 * height of ~1.72; 7.6 holds every stage at or under 0.50 of the viewport height
 * with the object centre at 0.30. Measured at 375x667 through 900x1200.
 */
export const PORTRAIT_HEIGHT_FLOOR = 7.6;

export function rampFoldValue(from: number, to: number, t: number, index: number, count: number): number {
  if (Math.abs(to - from) < 1e-6) return to;
  if (count === 1) return lerp(from, to, easeInOutCubic(t));
  const duration = 0.55;
  const start = (index * (1 - duration)) / (count - 1);
  return lerp(from, to, easeInOutCubic(clamp01((t - start) / duration)));
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
  const fit = fitDistance(aspect);

  const resolveDist = (d: number | 'cover'): number =>
    d === 'cover' ? cover : portrait ? Math.max(d, fit, PORTRAIT_HEIGHT_FLOOR) : Math.max(d, fit);
  const centreX = (key: StageKey, x: number): number => (key === 'launch' || portrait ? 0.5 : x);
  const centreY = (key: StageKey): number => (key === 'launch' ? 0.5 : portrait ? 0.3 : 0.5);

  let stage = 0;
  for (let i = 0; i < g.keyP.length; i++) {
    if (p >= (g.keyP[i] ?? 0) - 1e-6) stage = i;
  }
  stage = Math.min(stage, keyframes.length - 1);

  const kf = keyframes[stage]!;
  const folds: Record<string, number> = { ...kf.folds, curl: 0 };
  let az = kf.camera.az;
  let el = kf.camera.el;
  let dist = resolveDist(kf.camera.dist);
  let cx = centreX(kf.key, kf.centreX);
  let cy = centreY(kf.key);

  const keyP = g.keyP[stage] ?? 0;
  const dwellEnd = g.dwellEndP[stage] ?? keyP;
  if (dwellEnd > keyP && p >= keyP && p <= dwellEnd && kf.key !== 'launch') {
    const t = clamp01((p - keyP) / (dwellEnd - keyP));
    az += Math.sin(Math.PI * t) * 2 * (stage % 2 === 0 ? 1 : -1);
  }

  if (stage < keyframes.length - 1) {
    const rampStart = g.dwellEndP[stage] ?? keyP;
    const rampEnd = g.keyP[stage + 1] ?? 1;
    if (p > rampStart && p < rampEnd) {
      const t = clamp01((p - rampStart) / Math.max(1e-6, rampEnd - rampStart));
      const from = keyframes[stage]!;
      const to = keyframes[stage + 1]!;

      const changed = FOLD_IDS.filter((id) => Math.abs(to.folds[id] - from.folds[id]) > 1e-6);
      changed.forEach((id, i) => {
        folds[id] = rampFoldValue(from.folds[id], to.folds[id], t, i, changed.length);
      });

      az = lerp(from.camera.az, shortestArcDeg(from.camera.az, to.camera.az), t);
      el = lerp(from.camera.el, to.camera.el, t);
      dist = lerp(resolveDist(from.camera.dist), resolveDist(to.camera.dist), t);
      cx = lerp(centreX(from.key, from.centreX), centreX(to.key, to.centreX), t);
      cy = lerp(centreY(from.key), centreY(to.key), t);

      if (to.key === 'launch') {
        const fade = clamp01((t - 0.7) / 0.3);
        const keep = 1 - fade;
        return {
          P: p, stage, key: from.key, folds,
          ink: [from.ink[0] * keep, from.ink[1] * keep, from.ink[2] * keep],
          camera: { az, el, dist, centreX: cx, centreY: cy },
          launchInkFade: fade, launchT: t
        };
      }
      return {
        P: p, stage, key: from.key, folds,
        ink: [lerp(from.ink[0], to.ink[0], t), lerp(from.ink[1], to.ink[1], t), lerp(from.ink[2], to.ink[2], t)],
        camera: { az, el, dist, centreX: cx, centreY: cy },
        launchInkFade: 0, launchT: 0
      };
    }
  }

  const atLaunch = kf.key === 'launch';
  return {
    P: p, stage, key: kf.key, folds, ink: kf.ink,
    camera: { az, el, dist, centreX: cx, centreY: cy },
    launchInkFade: atLaunch ? 1 : 0,
    launchT: atLaunch ? 1 : 0
  };
}

export function keyframeState(key: StageKey, aspect = 1.6, portrait = false): SceneState {
  const i = keyframes.findIndex((k) => k.key === key);
  return stateAt(i / (keyframes.length - 1), { aspect, portrait });
}
