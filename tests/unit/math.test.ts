import { describe, expect, it } from 'vitest';
import {
  clamp, clamp01, cross3, degToRad, dot3, easeInOutCubic, easeInOutQuart,
  easeInOutQuint, easeOutCubic, leftNormal2, lerp, mulberry32, norm2, normalize3,
  radToDeg, rotateAboutAxis, shortestArcDeg, smoothstep
} from '../../src/lib/math';

const close = (a: number, b: number, tol = 1e-12): void => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('scalar helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
  });

  it('lerps and converts angles', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    close(degToRad(180), Math.PI);
    close(radToDeg(Math.PI / 2), 90);
  });

});

describe('fold-choreography easings', () => {
  it.each([easeOutCubic, easeInOutQuart, easeInOutQuint] as const)(
    'clamps and keeps fixed endpoints: %s',
    (ease) => {
      expect(ease(-1)).toBe(0);
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(2)).toBe(1);
      let prev = 0;
      for (let i = 1; i <= 100; i++) {
        const v = ease(i / 100);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  );

  it('eases out fast at the start and slow at the end', () => {
    expect(easeOutCubic(0.25)).toBeCloseTo(1 - Math.pow(0.75, 3), 12);
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.5);
    expect(easeOutCubic(0.75)).toBeCloseTo(1 - Math.pow(0.25, 3), 12);
  });

  it('matches the closed forms of the symmetric quart and quint', () => {
    expect(easeInOutQuart(0.25)).toBeCloseTo(8 * Math.pow(0.25, 4), 12);
    expect(easeInOutQuart(0.75)).toBeCloseTo(1 - Math.pow(-2 * 0.75 + 2, 4) / 2, 12);
    expect(easeInOutQuint(0.25)).toBeCloseTo(16 * Math.pow(0.25, 5), 12);
    expect(easeInOutQuint(0.75)).toBeCloseTo(1 - Math.pow(-2 * 0.75 + 2, 5) / 2, 12);
  });

  it('smoothsteps between two edges and clamps outside them', () => {
    expect(smoothstep(0.6, 0.86, 0.6)).toBe(0);
    expect(smoothstep(0.6, 0.86, 0.86)).toBe(1);
    expect(smoothstep(0.6, 0.86, 0.5)).toBe(0);
    expect(smoothstep(0.6, 0.86, 0.9)).toBe(1);
    const t = (0.73 - 0.6) / 0.26;
    expect(smoothstep(0.6, 0.86, 0.73)).toBeCloseTo(t * t * (3 - 2 * t), 12);
  });

  it('keeps a unit edge pair and a reversed pair well-defined', () => {
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(1, 0, 0.5)).toBe(0.5);
    expect(smoothstep(2, 2, 0.5)).toBe(0);
  });
});

describe('shortestArcDeg', () => {
  const cases: [number, number, number][] = [
    [350, 10, 370],
    [10, 350, -10],
    [0, 180, 180],
    [0, -180, -180],
    [18, -32, -32],
    [-28, 18, 18],
    [-170, 170, -190]
  ];

  it.each(cases)('%s -> %s takes the short way to %s', (from, to, expected) => {
    expect(shortestArcDeg(from, to)).toBeCloseTo(expected, 9);
  });

  it('never travels more than half a turn and lands on an equivalent angle', () => {
    const rand = mulberry32(4);
    for (let i = 0; i < 500; i++) {
      const from = rand() * 1440 - 720;
      const to = rand() * 1440 - 720;
      const result = shortestArcDeg(from, to);
      expect(Math.abs(result - from)).toBeLessThanOrEqual(180 + 1e-9);
      const delta = (((result - to) % 360) + 540) % 360 - 180;
      close(delta, 0, 1e-9);
    }
  });
});

describe('vector helpers', () => {
  it('takes the left normal, so +x points at +y', () => {
    expect(leftNormal2([1, 0])).toEqual([0, 1]);
    expect(leftNormal2([0, 1])).toEqual([-1, 0]);
  });

  it('normalises, falling back to unity for a zero vector', () => {
    const n = norm2([3, 4]);
    close(Math.hypot(n[0], n[1]), 1);
    expect(norm2([0, 0])).toEqual([0, 0]);
    const m = normalize3([0, 0, 5]);
    expect(m).toEqual([0, 0, 1]);
  });

  it('produces a right-handed cross product', () => {
    expect(cross3([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    close(dot3([1, 2, 3], [4, 5, 6]), 32);
  });
});

describe('rotateAboutAxis', () => {
  it('rotates a quarter turn about +z', () => {
    const r = rotateAboutAxis([1, 0, 0], [0, 0, 1], Math.PI / 2);
    close(r[0], 0, 1e-12);
    close(r[1], 1, 1e-12);
    close(r[2], 0, 1e-12);
  });

  it('stands the top half up about +x: +y goes to +z, +z goes to -y', () => {
    const up = rotateAboutAxis([0, 1, 0], [1, 0, 0], Math.PI / 2);
    close(up[2], 1, 1e-12);
    const face = rotateAboutAxis([0, 0, 1], [1, 0, 0], Math.PI / 2);
    close(face[1], -1, 1e-12);
  });

  it('preserves length and leaves axis-parallel vectors alone', () => {
    const rand = mulberry32(9);
    for (let i = 0; i < 200; i++) {
      const v: [number, number, number] = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
      const axis = normalize3([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]);
      const r = rotateAboutAxis(v, axis, rand() * 6 - 3);
      close(Math.hypot(...r), Math.hypot(...v), 1e-12);
      const parallel = rotateAboutAxis(axis, axis, 1.234);
      close(parallel[0], axis[0], 1e-12);
      close(parallel[1], axis[1], 1e-12);
      close(parallel[2], axis[2], 1e-12);
    }
  });
});

describe('mulberry32', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = mulberry32(11);
    const b = mulberry32(11);
    const c = mulberry32(12);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    const seqC = Array.from({ length: 20 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('stays in [0, 1)', () => {
    const rand = mulberry32(2026);
    for (let i = 0; i < 5000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
