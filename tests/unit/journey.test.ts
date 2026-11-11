import { describe, expect, it } from 'vitest';
import {
  CAMERA_FOV_DEG, FOLD_IDS, coverDistance, defaultGeometry, evalTrack,
  fitDistance, keyframeState, keyframes, rampFoldValue, rampSpecs, stateAt,
  type Track
} from '../../src/content/journey';
import {
  clamp01, easeInOutCubic, easeInOutQuint, lerp, smoothstep
} from '../../src/lib/math';

const focal = 1 / Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
const at = (p: number): ReturnType<typeof stateAt> => stateAt(p, { aspect: 1.6, portrait: false });
const rampP = (stage: number, t: number): number => {
  const start = defaultGeometry.dwellEndP[stage]!;
  const end = defaultGeometry.keyP[stage + 1]!;
  return start + (end - start) * t;
};

describe('evalTrack', () => {
  const tr: Track = [[0, 0], [0.4, 10], [1, 20]];

  it('clamps to the first and last keys outside the span', () => {
    expect(evalTrack(tr, -0.5)).toBe(0);
    expect(evalTrack(tr, 1.5)).toBe(20);
  });

  it('eases inside each segment and is continuous across keys', () => {
    expect(evalTrack(tr, 0.2)).toBeCloseTo(lerp(0, 10, easeInOutCubic(0.5)), 9);
    expect(evalTrack(tr, 0.7)).toBeCloseTo(lerp(10, 20, easeInOutCubic(0.5)), 9);
    expect(evalTrack(tr, 0.4)).toBeCloseTo(10, 9);
  });

  it('accepts a custom ease and a single-key track', () => {
    expect(evalTrack(tr, 0.2, easeInOutQuint)).toBeCloseTo(lerp(0, 10, easeInOutQuint(0.5)), 9);
    expect(evalTrack([[0, 7]] as Track, 0.5)).toBe(7);
    expect(evalTrack([] as unknown as Track, 0.5)).toBe(0);
  });

  it('starts and ends every ramp spec on its keyframe values', () => {
    rampSpecs.forEach((spec, stage) => {
      const from = keyframes[stage]!;
      const to = keyframes[stage + 1]!;
      for (const id of FOLD_IDS) {
        const track = spec.folds[id];
        if (!track) continue;
        expect(evalTrack(track, 0)).toBeCloseTo(from.folds[id], 6);
        expect(evalTrack(track, 1)).toBeCloseTo(to.folds[id], 6);
      }
      spec.ink.forEach((track, i) => {
        const inkFrom = from.ink[i] ?? 0;
        const inkTo = to.ink[i] ?? 0;
        expect(evalTrack(track, 0)).toBeCloseTo(inkFrom, 6);
        expect(evalTrack(track, 1)).toBeCloseTo(inkTo, 6);
      });
    });
  });
});

describe('keyframe table', () => {
  it('holds five stages in journey order', () => {
    expect(keyframes.map((k) => k.key)).toEqual(['hero', 'strategy', 'design', 'build', 'launch']);
  });

  it('earns ink stage by stage and ends blank', () => {
    expect(keyframes[0]!.ink).toEqual([0, 0, 0]);
    expect(keyframes[1]!.ink).toEqual([1, 0, 0]);
    expect(keyframes[2]!.ink).toEqual([1, 1, 0]);
    expect(keyframes[3]!.ink).toEqual([1, 1, 1]);
    expect(keyframes[4]!.ink).toEqual([0, 0, 0]);
  });

  it('gives Launch no panel and a centred object', () => {
    expect(keyframes[4]!.panel).toBe('none');
    expect(keyframes[4]!.centreX).toBe(0.5);
    expect(keyframes[4]!.camera.el).toBe(90);
    expect(keyframes[4]!.camera.dist).toBe('cover');
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

describe('ramp choreography', () => {
  it('scores the first crease before the paper moves, then snaps and settles', () => {
    // Marking finishes at t 0.28 while the fold has only begun its ~0.1deg
    // anticipation (it does not commit until t 0.40).
    const scored = at(rampP(0, 0.3));
    expect(scored.score.f1).toBeCloseTo(1, 9);
    expect(Math.abs(scored.folds.f1 ?? 0)).toBeLessThan(1);

    // The scored line draws on across the sheet, then lifts as the fold turns.
    const drawing = at(rampP(0, 0.14));
    expect(drawing.score.f1).toBeGreaterThan(0);
    expect(drawing.score.f1).toBeLessThan(1);

    // Anticipation, snap past the target, settle back onto the keyframe.
    expect(at(rampP(0, 0.40)).folds.f1).toBeCloseTo(-4, 9);
    expect(at(rampP(0, 0.86)).folds.f1).toBeCloseTo(122, 6);
    expect(at(rampP(0, 1)).folds.f1).toBeCloseTo(120, 9);
  });

  it('turns the corners one after another, then re-seats the hinge', () => {
    // At t 0.30: f2 is well underway, f3 has just begun, f4 has not started,
    // and the hinge is still seated at 120.
    const early = at(rampP(1, 0.3));
    expect(early.folds.f2).toBeGreaterThan(0);
    expect(early.folds.f3).toBeGreaterThan(0);
    expect(early.folds.f4).toBeCloseTo(0, 9);
    expect(early.folds.f1).toBeCloseTo(120, 9);

    // By t 0.9 the corners are seated and the hinge is easing to 105.
    const late = at(rampP(1, 0.9));
    expect(late.folds.f2).toBeCloseTo(150, 6);
    expect(late.folds.f3).toBeCloseTo(150, 6);
    expect(late.folds.f4).toBeCloseTo(-90, 6);
    expect(late.folds.f1).toBeLessThan(120);
    expect(late.folds.f1).toBeGreaterThan(105);
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

  it('eases the first fold with easeInOutQuint across its move', () => {
    const t = 0.6;
    const expected = lerp(-4, 122, easeInOutQuint((t - 0.4) / 0.46));
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
  it('keeps the settled ink levels while the next layer draws on', () => {
    const s = at(rampP(1, 0.5));
    expect(s.ink[0]).toBeCloseTo(1, 9);
    // Type ink is mid-draw at t 0.5: track [0.28 -> 0.86] with easeInOutCubic.
    expect(s.ink[1]).toBeCloseTo(easeInOutCubic((0.5 - 0.28) / 0.58), 9);
    expect(s.ink[2]).toBeCloseTo(0, 9);
  });

  it('rotates the camera early, then drops elevation and distance on beats', () => {
    const s = at(rampP(0, 0.5));
    // Azimuth has fully taken its shortest arc by t 0.34.
    expect(s.camera.az).toBeCloseTo(shortestAz(-28, 18), 9);
    // Elevation is mid-beat at 0.35 of the blend.
    expect(s.camera.el).toBeCloseTo(lerp(34, 42, 0.35), 9);
    // Distance is mid-beat: its track blends 0.55 -> 1 over t 0.45..1.
    const [d0, d1] = [keyframes[0]!.camera.dist, keyframes[1]!.camera.dist] as [number, number];
    const distMix = lerp(0.55, 1, easeInOutCubic((0.5 - 0.45) / 0.55));
    expect(s.camera.dist).toBeCloseTo(lerp(d0, d1, distMix), 6);
    expect(s.camera.centreX).toBeCloseTo(lerp(0.7, 0.3, easeInOutCubic(0.5 / 0.6)), 6);
  });

  it('takes the shortest azimuth arc and never leaves the keyframe span', () => {
    for (let i = 0; i <= 40; i++) {
      const s = at(rampP(1, i / 40));
      expect(s.camera.az).toBeLessThanOrEqual(18 + 1e-9);
      expect(s.camera.az).toBeGreaterThanOrEqual(-32 - 1e-9);
    }
  });
});

function shortestAz(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return from + d;
}

describe('Launch handoff', () => {
  it('holds the sheet fully inked early in the unfold', () => {
    expect(at(rampP(3, 0.02)).ink).toEqual([1, 1, 1]);
  });

  it('dissolves ink interface -> type -> structure across the beats', () => {
    // At t 0.5 the interface layer is gone, the type layer is mid-dissolve and
    // the structure layer is still fully printed.
    const mid = at(rampP(3, 0.5));
    expect(mid.ink[0]).toBeCloseTo(1, 9);
    expect(mid.ink[1]).toBeCloseTo(1 - easeInOutCubic(0.625), 9);
    expect(mid.ink[2]).toBeCloseTo(0, 9);
  });

  it('gates the fibre normal with a smoothstep handoff over 60%..86%', () => {
    expect(at(rampP(3, 0.5)).launchInkFade).toBeCloseTo(0, 9);
    const t = 0.7;
    expect(at(rampP(3, t)).launchInkFade).toBeCloseTo(smoothstep(0.60, 0.86, t), 9);
    const late = at(rampP(3, 0.85));
    expect(late.launchInkFade).toBeCloseTo(smoothstep(0.60, 0.86, 0.85), 9);
    // By t 0.85 every layer has dissolved before the camera covers.
    expect(late.ink[0]).toBeLessThan(0.01);
    expect(late.ink[1]).toBeCloseTo(0, 9);
    expect(late.ink[2]).toBeCloseTo(0, 9);
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
    expect(stateAt(0, { aspect: 1.6, portrait: false }).camera.dist).toBeCloseTo(
      keyframes[0]!.camera.dist as number,
      9
    );
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
      const ink = forward[i]!.ink;
      s.ink.forEach((v, j) => expect(v).toBeCloseTo(ink[j]!, 9));
      const cam = forward[i]!.camera;
      expect(s.camera.az).toBeCloseTo(cam.az, 9);
      expect(s.camera.el).toBeCloseTo(cam.el, 9);
      expect(s.camera.dist).toBeCloseTo(cam.dist, 9);
      expect(s.camera.centreX).toBeCloseTo(cam.centreX, 9);
      expect(s.camera.centreY).toBeCloseTo(cam.centreY, 9);
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
