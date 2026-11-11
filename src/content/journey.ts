import {
  clamp01,
  degToRad,
  easeInOutCubic,
  easeInOutQuart,
  easeInOutQuint,
  lerp,
  shortestArcDeg,
  smoothstep
} from '../lib/math';

export type StageKey = 'hero' | 'strategy' | 'design' | 'build' | 'launch';
export type InkLevels = readonly [number, number, number];
export type FoldId = 'f1' | 'f2' | 'f3' | 'f4';

export interface Keyframe {
  key: StageKey;
  folds: Readonly<Record<FoldId, number>>;
  ink: InkLevels;
  camera: { az: number; el: number; dist: number | 'cover' };
  panel: 'left' | 'right' | 'none';
  centreX: number;
}

/**
 * FINAL TUNED KEYFRAMES.
 * Distances were solved against the composition rule: the brief's seeds
 * (3.3 / 3.0 / 2.7 / 2.9) put the sheet inside the text column at every stage and
 * clipped it off-screen at strategy / design / build. These are the smallest that
 * clear the text column and viewport by >=12px at 1024x768 .. 1920x1080, +4%.
 * Panels are 5 of 12 columns. Angles, azimuths, elevations, ink and centreX are
 * the seed values.
 */
export const keyframes: readonly Keyframe[] = [
  { key: 'hero',     folds: { f1: 0,   f2: 0,   f3: 0,   f4: 0    }, ink: [0, 0, 0], camera: { az: -28, el: 34, dist: 4.7   }, panel: 'left',  centreX: 0.7 },
  { key: 'strategy', folds: { f1: 120, f2: 0,   f3: 0,   f4: 0    }, ink: [1, 0, 0], camera: { az: 18,  el: 42, dist: 5.2   }, panel: 'right', centreX: 0.3 },
  { key: 'design',   folds: { f1: 105, f2: 150, f3: 150, f4: -90  }, ink: [1, 1, 0], camera: { az: -32, el: 30, dist: 4.62  }, panel: 'left',  centreX: 0.7 },
  { key: 'build',    folds: { f1: 78,  f2: 0,   f3: 0,   f4: -170 }, ink: [1, 1, 1], camera: { az: 0,   el: 14, dist: 5.26  }, panel: 'right', centreX: 0.3 },
  { key: 'launch',   folds: { f1: 0,   f2: 0,   f3: 0,   f4: 0    }, ink: [0, 0, 0], camera: { az: 0,   el: 90, dist: 'cover' }, panel: 'none', centreX: 0.5 }
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
  /** Per-fold crease marking, 0..1. Draws the hairline before the paper moves. */
  score: Record<string, number>;
  ink: InkLevels;
  camera: { az: number; el: number; dist: number; centreX: number; centreY: number };
  /** Fibre-normal gate for the Launch ramp; 1 once the sheet must read as paper. */
  launchInkFade: number;
  /** 0..1 across the whole Launch ramp. */
  launchT: number;
}

/* ---------------------------------------------------------------- tracks --- */

/** Piecewise keyframe track: [t, value] pairs, t ascending in 0..1. */
export type Track = readonly (readonly [number, number])[];

export function evalTrack(
  track: Track,
  t: number,
  ease: (u: number) => number = easeInOutCubic
): number {
  if (track.length === 0) return 0;
  const first = track[0]!;
  if (t <= first[0]) return first[1];
  const last = track[track.length - 1]!;
  if (t >= last[0]) return last[1];
  for (let i = 0; i < track.length - 1; i++) {
    const a = track[i]!;
    const b = track[i + 1]!;
    if (t >= a[0] && t <= b[0]) {
      const u = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return lerp(a[1], b[1], ease(u));
    }
  }
  return last[1];
}

export interface RampSpec {
  /** Absolute degrees. */
  folds: Partial<Record<FoldId, Track>>;
  /** Absolute 0..1 crease marking. */
  score: Partial<Record<FoldId, Track>>;
  /** Absolute 0..1 ink levels: structure, type, interface. */
  ink: readonly [Track, Track, Track];
  /** Blend factors 0..1 between the resolved from/to camera values. */
  camera: { az: Track; el: Track; dist: Track; cx: Track; cy: Track };
  foldEase?: (u: number) => number;
}

const HOLD: Track = [[0, 0], [1, 0]];
const FULL: Track = [[0, 1], [1, 1]];
const LINEAR: Track = [[0, 0], [1, 1]];

/**
 * Beat choreography. Every ramp starts and ends on its keyframe values, so the
 * whole journey stays a pure, reversible function of P.
 *
 * 0 hero -> strategy   "Find the first crease": mark, anticipate, snap, settle.
 * 1 strategy -> design "Fold it into form": corners are marked and turned one
 *                      after another, then the lip, then the hinge re-seats.
 * 2 design -> build    "Make it stand up": no new marks. Corners release, the lip
 *                      tucks under, the hinge opens, the camera drops last.
 * 3 build -> launch    "Unfold it to the world": front flap releases, screen lays
 *                      down, last flap flattens, then the camera covers. Ink goes
 *                      interface -> type -> structure, so the UI dissolves before
 *                      the object does.
 */
export const rampSpecs: readonly RampSpec[] = [
  {
    foldEase: easeInOutQuint,
    folds: { f1: [[0, 0], [0.26, 0], [0.40, -4], [0.86, 122], [1, 120]] },
    score: { f1: [[0, 0], [0.28, 1], [0.60, 1], [0.78, 0]] },
    ink: [[[0, 0], [0.34, 0], [0.88, 1], [1, 1]], HOLD, HOLD],
    camera: {
      az: [[0, 0], [0.34, 1], [1, 1]],
      el: [[0, 0], [0.50, 0.35], [1, 1]],
      dist: [[0, 0], [0.45, 0.55], [1, 1]],
      cx: [[0, 0], [0.60, 1], [1, 1]],
      cy: LINEAR
    }
  },
  {
    folds: {
      f2: [[0, 0], [0.12, 0], [0.50, 152], [0.60, 150]],
      f3: [[0, 0], [0.20, 0], [0.58, 152], [0.68, 150]],
      f4: [[0, 0], [0.32, 0], [0.74, -92], [0.84, -90]],
      f1: [[0, 120], [0.54, 120], [0.96, 105], [1, 105]]
    },
    score: {
      f2: [[0, 0], [0.14, 1], [0.40, 1], [0.52, 0]],
      f3: [[0.06, 0], [0.22, 1], [0.46, 1], [0.60, 0]],
      f4: [[0.16, 0], [0.34, 1], [0.62, 1], [0.76, 0]]
    },
    ink: [FULL, [[0, 0], [0.28, 0], [0.86, 1], [1, 1]], HOLD],
    camera: {
      az: LINEAR,
      el: [[0, 0], [0.50, 0.40], [1, 1]],
      dist: LINEAR,
      cx: [[0, 0], [0.45, 0.50], [1, 1]],
      cy: LINEAR
    }
  },
  {
    folds: {
      f2: [[0, 150], [0.04, 150], [0.34, 0], [1, 0]],
      f3: [[0, 150], [0.10, 150], [0.40, 0], [1, 0]],
      f4: [[0, -90], [0.22, -90], [0.64, -172], [0.76, -170]],
      f1: [[0, 105], [0.44, 105], [0.90, 77], [1, 78]]
    },
    score: {},
    ink: [FULL, FULL, [[0, 0], [0.48, 0], [0.94, 1], [1, 1]]],
    camera: {
      az: [[0, 0], [0.60, 1], [1, 1]],
      el: [[0, 0], [0.30, 0.15], [0.92, 1], [1, 1]],
      dist: LINEAR,
      cx: [[0, 0], [0.50, 0.50], [1, 1]],
      cy: LINEAR
    }
  },
  {
    foldEase: easeInOutQuart,
    folds: {
      f4: [[0, -170], [0.03, -170], [0.26, -102], [0.52, -98], [0.80, -3], [0.88, 0]],
      f1: [[0, 78], [0.18, 78], [0.32, 72], [0.62, 4], [0.72, 0]],
      f2: [[0, 0], [1, 0]],
      f3: [[0, 0], [1, 0]]
    },
    score: {},
    ink: [
      [[0, 1], [0.56, 1], [0.86, 0], [1, 0]],
      [[0, 1], [0.30, 1], [0.62, 0], [1, 0]],
      [[0, 1], [0.06, 1], [0.24, 0], [1, 0]]
    ],
    camera: {
      az: [[0, 0], [0.45, 1], [1, 1]],
      el: [[0, 0], [0.20, 0.10], [0.58, 0.45], [0.88, 1], [1, 1]],
      dist: [[0, 0], [0.55, 0.08], [1, 1]],
      cx: [[0, 0], [0.55, 0], [1, 1]],
      cy: [[0, 0], [0.55, 0], [1, 1]]
    }
  }
];

/* --------------------------------------------------------------- camera --- */

const focal = (fovDeg: number): number => 1 / Math.tan(degToRad(fovDeg) / 2);

export function coverDistance(aspect: number, fovDeg = CAMERA_FOV_DEG): number {
  const f = focal(fovDeg);
  return Math.min(f / Math.max(aspect, 0.05), f * SHEET_HALF_H) * 0.985;
}

/** Margin 1.25: azimuth rotates the sheet in plan, so its bbox is wider than 2.0. */
export function fitDistance(aspect: number, fovDeg = CAMERA_FOV_DEG, margin = 1.25): number {
  const f = focal(fovDeg);
  return f * Math.max(1 / Math.max(aspect, 0.05), SHEET_HALF_H) * margin;
}

/** Keeps every portrait stage at or under 0.50 of the viewport height. */
export const PORTRAIT_HEIGHT_FLOOR = 7.6;

/** Legacy staggering helper, still used when a ramp has no track for a fold. */
export function rampFoldValue(from: number, to: number, t: number, index: number, count: number): number {
  if (Math.abs(to - from) < 1e-6) return to;
  if (count === 1) return lerp(from, to, easeInOutCubic(t));
  const duration = 0.55;
  const start = (index * (1 - duration)) / (count - 1);
  return lerp(from, to, easeInOutCubic(clamp01((t - start) / duration)));
}

/* --------------------------------------------------------------- stateAt --- */

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
  const score: Record<string, number> = { f1: 0, f2: 0, f3: 0, f4: 0, curl: 0 };
  let az = kf.camera.az;
  let el = kf.camera.el;
  let dist = resolveDist(kf.camera.dist);
  let cx = centreX(kf.key, kf.centreX);
  let cy = centreY(kf.key);

  // Dwell drift: scroll-driven only, <= +/-2deg, zero at both ends.
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
      const spec = rampSpecs[stage];
      const fe = spec?.foldEase ?? easeInOutCubic;

      for (const id of FOLD_IDS) {
        const tr = spec?.folds[id];
        folds[id] = tr ? evalTrack(tr, t, fe) : rampFoldValue(from.folds[id], to.folds[id], t, 0, 1);
        const sc = spec?.score[id];
        score[id] = sc ? clamp01(evalTrack(sc, t)) : 0;
      }

      const mix = (tr: Track | undefined): number => (tr ? clamp01(evalTrack(tr, t)) : t);
      const cm = spec?.camera;
      az = lerp(from.camera.az, shortestArcDeg(from.camera.az, to.camera.az), mix(cm?.az));
      el = lerp(from.camera.el, to.camera.el, mix(cm?.el));
      dist = lerp(resolveDist(from.camera.dist), resolveDist(to.camera.dist), mix(cm?.dist));
      cx = lerp(centreX(from.key, from.centreX), centreX(to.key, to.centreX), mix(cm?.cx));
      cy = lerp(centreY(from.key), centreY(to.key), mix(cm?.cy));

      const ink: InkLevels = [
        clamp01(evalTrack(spec?.ink[0] ?? [[0, from.ink[0]], [1, to.ink[0]]], t)),
        clamp01(evalTrack(spec?.ink[1] ?? [[0, from.ink[1]], [1, to.ink[1]]], t)),
        clamp01(evalTrack(spec?.ink[2] ?? [[0, from.ink[2]], [1, to.ink[2]]], t))
      ];

      const toLaunch = to.key === 'launch';
      return {
        P: p, stage, key: from.key, folds, score, ink,
        camera: { az, el, dist, centreX: cx, centreY: cy },
        launchInkFade: toLaunch ? smoothstep(0.60, 0.86, t) : 0,
        launchT: toLaunch ? t : 0
      };
    }
  }

  const atLaunch = kf.key === 'launch';
  return {
    P: p, stage, key: kf.key, folds, score, ink: kf.ink,
    camera: { az, el, dist, centreX: cx, centreY: cy },
    launchInkFade: atLaunch ? 1 : 0,
    launchT: atLaunch ? 1 : 0
  };
}

export function keyframeState(key: StageKey, aspect = 1.6, portrait = false): SceneState {
  const i = keyframes.findIndex((k) => k.key === key);
  return stateAt(i / (keyframes.length - 1), { aspect, portrait });
}
