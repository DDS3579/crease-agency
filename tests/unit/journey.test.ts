import { describe, expect, it } from 'vitest';
import {
  CAMERA_FOV_DEG, FOLD_IDS, coverDistance, defaultGeometry, fitDistance,
  keyframeState, keyframes, rampFoldValue, stateAt
} from '../../src/content/journey';
import { clamp01, easeInOutCubic, lerp } from '../../src/lib/math';

const focal = 1 / Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
const at = (p: number): ReturnType<typeof stateAt> => stateAt(p, { aspect: 1.6, portrait: false });
const rampP = (stage: number, t: number): number => {
  const start = defaultGeometry.dwellEndP[stage]!;
  const end = defaultGeometry.keyP[stage + 1]!;
  return start + (end - start) * t;
};

describe('keyframe table', () => {
  it('holds five stages in journey order', () => {
    expect(keyframes.map((k) => k.key)).toEqual(['hero', 'strategy', 'design', 'build', 'launch']);
  });

  it('earns ink stage by stage and ends blank', () => {
    expect(keyframes[0].ink).toEqual([0, 0, 0]);
    expect(keyframes[1].ink).toEqual([1, 0, 0]);
    expect(keyframes[2].ink).toEqual([1, 1, 0]);
    expect(keyframes[3].ink).toEqual([1, 1, 1]);
    expect(keyframes[4].ink).toEqual([0, 0, 0]);
  });

  it('gives Launch no panel and a centred object', () => {
    expect(keyframes[4].panel).toBe('none');
    expect(keyframes[4].centreX).toBe(0.5);
    expect(keyframes[4].camera.el).toBe(90);
    expect(keyframes[4].camera.dist).toBe('cover');
  });

  it('alternates the panel side against the object', () => {
    for (let i = 0; i < 4; i++) {
      const k = keyframes[i]!;
      if (k.panel === 'left') expect(k.centreX).toBeGreaterThan(0.5);
      if (k.panel === 'right') expect(k.centreX).toBeLessThan(0.5);
    }
  });
});

describe('stateAt at the keyframes', () => {
  it('reproduces every keyframe fold vector exactly', () => {
    defaultGeometry.keyP.forEach((p, i) => {
      const s = at(p);
      expect(s.stage).toBe(i);
      expect(s.key).toBe(keyframes[i]!.key);
      for (const id of FOLD_IDS) {
        expect(Math.abs(s.folds[id]! - keyframes[i]!.folds[id])).toBeLessThan(0.01);
      }
      expect(s.ink).toEqual(keyframes[i]!.ink);
    });
  });

  it('holds the camera at the keyframe with no drift', () => {
    defaultGeometry.keyP.forEach((p, i) => {
      const s = at(p);
      const cam = keyframes[i]!.camera;
      expect(s.camera.az).toBeCloseTo(cam.az, 9);
      expect(s.camera.el).toBeCloseTo(cam.el, 9);
      if (cam.dist !== 'cover') expect(s.camera.dist).toBeCloseTo(cam.dist, 9);
    });
  });

  it('clamps P and reports it back monotonically', () => {
    expect(at(-1).P).toBe(0);
    expect(at(2).P).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const p = i / 200;
      const s = at(p);
      expect(s.P).toBeGreaterThanOrEqual(prev);
      prev = s.P;
    }
  });
});

describe('dwell drift', () => {
  it('is zero at both ends and never exceeds two degrees', () => {
    for (let stage = 0; stage < 4; stage++) {
      const key = defaultGeometry.keyP[stage]!;
      const end = defaultGeometry.dwellEndP[stage]!;
      const base = keyframes[stage]!.camera.az;
      expect(at(key).camera.az).toBeCloseTo(base, 9);
      expect(at(end).camera.az).toBeCloseTo(base, 9);
      for (let i = 1; i < 20; i++) {
        const p = key + ((end - key) * i) / 20;
        expect(Math.abs(at(p).camera.az - base)).toBeLessThanOrEqual(2 + 1e-9);
      }
    }
  });

  it('peaks at the middle of the dwell and alternates direction', () => {
    const mid = (defaultGeometry.dwellEndP[0]! + defaultGeometry.keyP[0]!) / 2;
    expect(at(mid).camera.az).toBeCloseTo(keyframes[0]!.camera.az + 2, 6);
    const mid1 = (defaultGeometry.dwellEndP[1]! + defaultGeometry.keyP[1]!) / 2;
    expect(at(mid1).camera.az).toBeCloseTo(keyframes[1]!.camera.az - 2, 6);
  });

  it('holds the folds still through a dwell', () => {
    for (let i = 1; i < 10; i++) {
      const p = defaultGeometry.keyP[1]! + ((defaultGeometry.dwellEndP[1]! - defaultGeometry.keyP[1]!) * i) / 10;
      expect(at(p).folds.f1).toBeCloseTo(120, 9);
    }
  });

  it('does not drift at Launch', () => {
    expect(at(1).camera.az).toBe(0);
  });
});

describe('ramp staggering', () => {
  it('gives a single changed fold the whole ramp', () => {
    expect(rampFoldValue(0, 120, 0.5, 0, 1)).toBeCloseTo(60, 9);
    const s = at(rampP(0, 0.5));
    expect(s.folds.f1).toBeCloseTo(60, 9);
    expect(s.folds.f2).toBe(0);
  });

  it('runs changed folds in id order over 55% each, staggered across 45%', () => {
    const early = at(rampP(1, 0.1));
    expect(early.folds.f1).not.toBe(120);
    expect(early.folds.f2).toBeGreaterThan(0);
    expect(early.folds.f3).toBe(0);
    expect(early.folds.f4).toBe(0);

    const mid = at(rampP(1, 0.35));
    const progress = (id: 'f1' | 'f2' | 'f3' | 'f4'): number => {
      const from = keyframes[1]!.folds[id];
      const to = keyframes[2]!.folds[id];
      return Math.abs((mid.folds[id]! - from) / (to - from));
    };
    expect(progress('f1')).toBeGreaterThan(progress('f2'));
    expect(progress('f2')).toBeGreaterThan(progress('f3'));
    expect(progress('f3')).toBeGreaterThanOrEqual(progress('f4'));
  });

  it('starts and ends every ramp exactly on its keyframes', () => {
    for (let stage = 0; stage < 4; stage++) {
      const start = at(rampP(stage, 0));
      const end = at(rampP(stage, 1));
      for (const id of FOLD_IDS) {
        expect(start.folds[id]).toBeCloseTo(keyframes[stage]!.folds[id], 6);
        expect(end.folds[id]).toBeCloseTo(keyframes[stage + 1]!.folds[id], 6);
      }
    }
  });

  it('eases each fold with easeInOutCubic', () => {
    const t = 0.27;
    const expected = lerp(0, 120, easeInOutCubic(t));
    expect(at(rampP(0, t)).folds.f1).toBeCloseTo(expected, 9);
  });

  it('leaves unchanged folds alone', () => {
    expect(rampFoldValue(30, 30, 0.4, 1, 4)).toBe(30);
    const s = at(rampP(0, 0.6));
    expect(s.folds.f2).toBe(0);
    expect(s.folds.f3).toBe(0);
    expect(s.folds.f4).toBe(0);
  });
});

describe('ink and camera across ramps', () => {
  it('interpolates ink over the whole ramp, not the fold stagger', () => {
    const s = at(rampP(1, 0.5));
    expect(s.ink[0]).toBeCloseTo(1, 9);
    expect(s.ink[1]).toBeCloseTo(0.5, 9);
    expect(s.ink[2]).toBeCloseTo(0, 9);
  });

  it('interpolates camera and offset over the whole ramp', () => {
    const s = at(rampP(0, 0.5));
    expect(s.camera.az).toBeCloseTo(lerp(-28, 18, 0.5), 9);
    expect(s.camera.el).toBeCloseTo(lerp(34, 42, 0.5), 9);
    expect(s.camera.dist).toBeCloseTo(lerp(3.3, 3.0, 0.5), 9);
    expect(s.camera.centreX).toBeCloseTo(lerp(0.7, 0.3, 0.5), 9);
  });

  it('takes the shortest azimuth arc and never leaves the keyframe span', () => {
    for (let i = 0; i <= 40; i++) {
      const s = at(rampP(1, i / 40));
      expect(s.camera.az).toBeLessThanOrEqual(18 + 1e-9);
      expect(s.camera.az).toBeGreaterThanOrEqual(-32 - 1e-9);
    }
  });
});

describe('Launch handoff', () => {
  it('fades ink only over the last 30% of the unfold', () => {
    expect(at(rampP(3, 0.5)).ink).toEqual([1, 1, 1]);
    expect(at(rampP(3, 0.7)).launchInkFade).toBeCloseTo(0, 9);
    const late = at(rampP(3, 0.85));
    expect(late.launchInkFade).toBeCloseTo(0.5, 6);
    for (const level of late.ink) expect(level).toBeCloseTo(0.5, 6);
  });

  it('ramps launchT across the whole unfold and pins it at 1 on the keyframe', () => {
    expect(at(0).launchT).toBe(0);
    expect(at(rampP(3, 0.25)).launchT).toBeCloseTo(0.25, 6);
    const end = at(1);
    expect(end.launchT).toBe(1);
    expect(end.launchInkFade).toBe(1);
    expect(end.ink).toEqual([0, 0, 0]);
    for (const id of FOLD_IDS) expect(end.folds[id]).toBe(0);
  });

  it('dollies to a cover-fit top-down view that fills the viewport', () => {
    for (const aspect of [1.6, 1.7778, 0.75, 0.4618]) {
      const dist = coverDistance(aspect);
      const halfH = dist / focal;
      const halfW = halfH * aspect;
      expect(halfH).toBeLessThanOrEqual(0.625 + 1e-9);
      expect(halfW).toBeLessThanOrEqual(1 + 1e-9);
      const s = stateAt(1, { aspect, portrait: aspect < 0.85 });
      expect(s.camera.dist).toBeCloseTo(dist, 9);
      expect(s.camera.el).toBe(90);
      expect(s.camera.centreX).toBe(0.5);
      expect(s.camera.centreY).toBe(0.5);
    }
  });
});

describe('portrait composition', () => {
  it('fits the whole sheet on a narrow phone instead of cropping it', () => {
    const aspect = 375 / 812;
    const dist = fitDistance(aspect);
    const halfH = dist / focal;
    expect(halfH * aspect).toBeGreaterThanOrEqual(1);
    expect(halfH).toBeGreaterThanOrEqual(0.625);
    const s = stateAt(0, { aspect, portrait: true });
    expect(s.camera.dist).toBeCloseTo(dist, 9);
  });

  it('centres the sheet horizontally and holds it at y 0.30', () => {
    for (const p of defaultGeometry.keyP.slice(0, 4)) {
      const s = stateAt(p, { aspect: 0.4618, portrait: true });
      expect(s.camera.centreX).toBe(0.5);
      expect(s.camera.centreY).toBeCloseTo(0.3, 9);
    }
  });

  it('leaves the desktop tuning untouched where the sheet already fits', () => {
    expect(fitDistance(1.6)).toBeLessThan(3.3);
    expect(stateAt(0, { aspect: 1.6, portrait: false }).camera.dist).toBeCloseTo(3.3, 9);
  });
});

describe('purity and reversibility', () => {
  it('returns the same fold vector on the way back', () => {
    const forward = Array.from({ length: 201 }, (_, i) => at(i / 200));
    const backward = Array.from({ length: 201 }, (_, i) => at(1 - i / 200));
    backward.reverse().forEach((s, i) => {
      for (const id of FOLD_IDS) {
        expect(Math.abs(s.folds[id]! - forward[i]!.folds[id]!)).toBeLessThan(1e-3);
      }
      expect(s.ink).toEqual(forward[i]!.ink);
      expect(s.camera).toEqual(forward[i]!.camera);
    });
  });

  it('does not mutate the keyframe table', () => {
    const snapshot = JSON.stringify(keyframes);
    for (let i = 0; i <= 100; i++) at(i / 100);
    expect(JSON.stringify(keyframes)).toBe(snapshot);
  });

  it('exposes keyframeState as the same state as stateAt at that P', () => {
    keyframes.forEach((k, i) => {
      const a = keyframeState(k.key, 1.6, false);
      const b = at(defaultGeometry.keyP[i]!);
      expect(a.folds).toEqual(b.folds);
      expect(a.ink).toEqual(b.ink);
      expect(a.camera).toEqual(b.camera);
    });
  });

  it('accepts measured geometry rather than hard-coded percentages', () => {
    const geometry = {
      keyP: [0, 0.2, 0.45, 0.7, 1],
      dwellEndP: [0.15, 0.38, 0.63, 0.9, 1]
    };
    const s = stateAt(0.45, { aspect: 1.6, geometry });
    expect(s.stage).toBe(2);
    expect(s.folds.f2).toBeCloseTo(150, 6);
    expect(clamp01(s.P)).toBe(0.45);
  });
});
