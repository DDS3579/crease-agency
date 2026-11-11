import { describe, expect, it } from 'vitest';
import {
  BEND_HALF, BEND_WIDTH, COMPOSITION_ORDER, LAYER_EPSILON, MAX_FOLDS, SHEET,
  ancestors, applyFolds, applyFoldsFull, applyFoldsNormal, baseFolds,
  cornerCurlFold, createFoldState, foldById, isMovingSide, localAreaScale,
  signedDistance, treeDepth, type Fold
} from '../../src/content/folds';
import {
  add3, degToRad, leftNormal2, mulberry32, norm2, rotateAboutAxis, scale3, sub3,
  type Vec2, type Vec3
} from '../../src/lib/math';
import { ladderSettings, type LadderLevel, type Tier } from '../../src/lib/tier';
import { nearRegionBoundary, randomSheetPoints } from '../harness/fixtures';

const close = (a: number, b: number, tol = 1e-9): void => expect(Math.abs(a - b)).toBeLessThan(tol);

/**
 * Independent closed form for a point beyond the bend band: a rigid rotation
 * about the flat axis plus a constant correction. Derived separately from the
 * engine's per-point phi / cn / ck formulation.
 */
function rigidPlusCorrection(p: Vec3, fold: Fold, theta: number, bendHalf: number): Vec3 {
  const dir = norm2(fold.axisDir);
  const n2 = leftNormal2(dir);
  const arcR = (2 * bendHalf) / theta;
  const cn = arcR * Math.sin(theta) - bendHalf * (1 + Math.cos(theta));
  const ck = arcR * (1 - Math.cos(theta)) - bendHalf * Math.sin(theta);
  const axis: Vec3 = [dir[0], dir[1], 0];
  const anchor: Vec3 = [fold.axisPoint[0], fold.axisPoint[1], 0];
  const rotated = add3(anchor, rotateAboutAxis(sub3(p, anchor), axis, theta));
  return add3(rotated, add3(scale3([n2[0], n2[1], 0], cn), scale3([0, 0, 1], ck)));
}

describe('fold tree', () => {
  it('reserves eight slots and seeds five folds', () => {
    expect(MAX_FOLDS).toBe(8);
    expect(baseFolds).toHaveLength(5);
    expect(baseFolds.length).toBeLessThanOrEqual(MAX_FOLDS);
    expect(baseFolds.map((f) => f.id)).toEqual(['f1', 'f2', 'f3', 'f4', 'curl']);
  });

  it('composes leaf to root, every fold exactly once', () => {
    expect([...COMPOSITION_ORDER].sort()).toEqual(baseFolds.map((f) => f.id).sort());
    const index = (id: string): number => COMPOSITION_ORDER.indexOf(id as never);
    for (const fold of baseFolds) {
      for (const ancestor of ancestors(baseFolds, fold)) {
        expect(index(fold.id)).toBeLessThan(index(ancestor.id));
      }
    }
  });

  it('nests the corner folds under the hinge and keeps the lip disjoint', () => {
    const state = createFoldState();
    expect(ancestors(state, foldById(state, 'f2')).map((f) => f.id)).toEqual(['f1']);
    expect(ancestors(state, foldById(state, 'f3')).map((f) => f.id)).toEqual(['f1']);
    expect(treeDepth(state, foldById(state, 'f2'))).toBe(1);
    expect(treeDepth(state, foldById(state, 'f1'))).toBe(0);
    expect(foldById(state, 'f4').parent).toBeNull();
  });

  it('points the moving side at the left normal of the axis', () => {
    const state = createFoldState();
    const hinge = foldById(state, 'f1');
    expect(signedDistance(hinge, [0, 0.5])).toBeGreaterThan(0);
    expect(signedDistance(hinge, [0, -0.5])).toBeLessThan(0);
    const lip = foldById(state, 'f4');
    expect(signedDistance(lip, [0, -0.5])).toBeGreaterThan(0);
    expect(signedDistance(lip, [0, 0.5])).toBeLessThan(0);
  });

  it('gates membership on every ancestor and excludes the axis itself', () => {
    const state = createFoldState();
    const f2 = foldById(state, 'f2');
    expect(isMovingSide(state, f2, [-1, 0.625])).toBe(true);
    expect(isMovingSide(state, f2, [0.9, 0.6])).toBe(false);
    expect(isMovingSide(state, foldById(state, 'f1'), [0.5, 0])).toBe(false);
  });

  it('throws on an unknown id rather than silently skipping', () => {
    expect(() => foldById(createFoldState(), 'nope')).toThrow(/Unknown fold/);
  });
});

describe('identity and single folds', () => {
  it('is the identity when every angle is zero', () => {
    const state = createFoldState();
    for (const p of randomSheetPoints(3, 60)) {
      const r = applyFoldsFull(p, state);
      expect(r.position).toEqual([p[0], p[1], 0]);
      expect(r.normal).toEqual([0, 0, 1]);
      expect(r.layer).toBe(0);
    }
  });

  it('leaves the static half untouched', () => {
    const state = createFoldState({ f1: 90 });
    expect(applyFolds([0.5, -0.3], state)).toEqual([0.5, -0.3, 0]);
    expect(applyFoldsNormal([0.5, -0.3], state)).toEqual([0, 0, 1]);
  });

  it('matches a hand-computed 90 degree hinge stand-up', () => {
    const state = createFoldState({ f1: 90 });
    const d = 0.3;
    const theta = Math.PI / 2;
    const arcR = (2 * BEND_HALF) / theta;
    // Beyond the band the cross-section lands at (arcR - bendHalf, d - bendHalf + arcR).
    const expectedY = arcR - BEND_HALF - LAYER_EPSILON;
    const expectedZ = d - BEND_HALF + arcR;
    const r = applyFoldsFull([0.5, d], state);
    close(r.position[0], 0.5);
    close(r.position[1], expectedY);
    close(r.position[2], expectedZ);
    close(r.normal[0], 0);
    close(r.normal[1], -1);
    close(r.normal[2], 0);
    expect(r.layer).toBe(1);
  });

  it('matches the independent rigid-plus-correction form beyond the band', () => {
    const state = createFoldState({ f1: 78, f4: -170 });
    for (const p of [[0.4, 0.5], [-0.7, 0.25], [0.9, -0.6], [-0.2, -0.55]] as Vec2[]) {
      const fold = p[1] > 0 ? foldById(state, 'f1') : foldById(state, 'f4');
      const theta = degToRad(fold.angle);
      const expected = add3(
        rigidPlusCorrection([p[0], p[1], 0], fold, theta, BEND_HALF),
        scale3(rotateAboutAxis([0, 0, 1], [norm2(fold.axisDir)[0], norm2(fold.axisDir)[1], 0], theta), LAYER_EPSILON)
      );
      const actual = applyFolds(p, state);
      for (let i = 0; i < 3; i++) close(actual[i]!, expected[i]!);
    }
  });

  it('preserves arc length across the bend band', () => {
    const state = createFoldState({ f1: 90 });
    const start = -BEND_HALF + 1e-6;
    const end = BEND_HALF;
    const n = 4000;
    let length = 0;
    let prev = applyFolds([0.5, start], state);
    for (let i = 1; i <= n; i++) {
      const d = start + ((end - start) * i) / n;
      const cur = applyFolds([0.5, d], state);
      length += Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]);
      prev = cur;
    }
    expect(Math.abs(length - (end - start))).toBeLessThan(1e-7);
  });

  it('rotates the normal analytically to unit length', () => {
    const rand = mulberry32(17);
    for (let i = 0; i < 60; i++) {
      const state = createFoldState({
        f1: rand() * 240 - 120,
        f2: rand() * 300 - 150,
        f4: rand() * -180
      });
      const n = applyFoldsNormal([rand() * 2 - 1, rand() * 1.25 - 0.625], state);
      close(Math.hypot(...n), 1, 1e-9);
    }
  });
});

describe('nested composition', () => {
  it('matches independent rigid composition for a corner inside the hinge', () => {
    const angles = { f1: 78, f2: 135 };
    const state = createFoldState(angles);
    const f1 = foldById(state, 'f1');
    const f2 = foldById(state, 'f2');
    const p: Vec2 = [-0.95, 0.6];

    // Both distances are well beyond the band, so the closed form applies.
    expect(signedDistance(f2, p)).toBeGreaterThan(BEND_HALF * 4);
    expect(signedDistance(f1, p)).toBeGreaterThan(BEND_HALF * 4);

    const t1 = degToRad(angles.f1);
    const t2 = degToRad(angles.f2);
    const ax1: Vec3 = [norm2(f1.axisDir)[0], norm2(f1.axisDir)[1], 0];
    const ax2: Vec3 = [norm2(f2.axisDir)[0], norm2(f2.axisDir)[1], 0];

    let expected = rigidPlusCorrection([p[0], p[1], 0], f2, t2, BEND_HALF);
    expected = rigidPlusCorrection(expected, f1, t1, BEND_HALF);
    const rigid = rotateAboutAxis(rotateAboutAxis([0, 0, 1], ax2, t2), ax1, t1);
    expected = add3(expected, scale3(rigid, LAYER_EPSILON * 2));

    const r = applyFoldsFull(p, state);
    for (let i = 0; i < 3; i++) close(r.position[i]!, expected[i]!);
    for (let i = 0; i < 3; i++) close(r.normal[i]!, rigid[i]!);
    expect(r.layer).toBe(2);
  });

  it('applies the parent only where the child does not reach', () => {
    const withCorner = createFoldState({ f1: 90, f2: 90 });
    const hingeOnly = createFoldState({ f1: 90 });
    const p: Vec2 = [0.5, 0.4]; // hinge region, outside the top-left corner
    expect(applyFolds(p, withCorner)).toEqual(applyFolds(p, hingeOnly));
  });

  it('keeps the lip independent of the hinge', () => {
    const both = createFoldState({ f1: 120, f4: -170 });
    const lipOnly = createFoldState({ f4: -170 });
    const p: Vec2 = [0.2, -0.55];
    const a = applyFolds(p, both);
    const b = applyFolds(p, lipOnly);
    for (let i = 0; i < 3; i++) close(a[i]!, b[i]!);
  });
});

describe('isometry', () => {
  it('keeps local area scale within 2% of 1 across random fold states', () => {
    const rand = mulberry32(7);
    let sampled = 0;
    let worst = 0;
    for (let trial = 0; trial < 40; trial++) {
      const state = createFoldState({
        f1: rand() * 240 - 120,
        f2: rand() * 300 - 150,
        f3: rand() * 300 - 150,
        f4: rand() * -180
      });
      for (const p of randomSheetPoints(100 + trial, 25)) {
        if (nearRegionBoundary(p, state)) continue;
        const scale = localAreaScale(p, state);
        worst = Math.max(worst, Math.abs(scale - 1));
        expect(Math.abs(scale - 1)).toBeLessThan(0.02);
        sampled++;
      }
    }
    expect(sampled).toBeGreaterThan(500);
    // A rigid per-region layer offset should leave this at float noise.
    expect(worst).toBeLessThan(1e-4);
  });

  it('stays isometric inside the bend band', () => {
    const state = createFoldState({ f1: 120 });
    for (const d of [-0.015, -0.005, 0, 0.005, 0.015]) {
      expect(Math.abs(localAreaScale([0.3, d], state) - 1)).toBeLessThan(1e-4);
    }
  });
});

describe('layer separation', () => {
  it('beats depth-buffer resolution at the far camera distance', () => {
    const near = 0.05;
    const far = 30;
    const z = 3.3;
    const resolution = (z * z * (1 / near - 1 / far)) / 2 ** 24;
    expect(LAYER_EPSILON).toBeGreaterThan(8 * resolution);
  });

  it('keeps the region-boundary step sub-pixel', () => {
    // Two stacked layers, at a generous 500 screen pixels per world unit.
    expect(LAYER_EPSILON * 2 * 500).toBeLessThan(0.5);
  });

  it('separates a folded layer along its own normal', () => {
    const flat = createFoldState();
    const folded = createFoldState({ f1: 120 });
    const p: Vec2 = [0.4, 0.4];
    const a = applyFoldsFull(p, flat).position;
    const b = applyFoldsFull(p, folded).position;
    expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])).toBeGreaterThan(0.1);
    expect(applyFoldsFull(p, folded).layer).toBe(1);
  });
});

describe('mesh resolution against the crease band', () => {
  const cases: [Tier, LadderLevel][] = [['A', 'A0'], ['A', 'A1'], ['A', 'A2'], ['B', 'A2'], ['poster', 'poster']];

  it.each(cases)('spans at least two cells on tier %s at %s', (tier, level) => {
    const s = ladderSettings(level, tier);
    const cell = Math.max(SHEET.width / s.mesh[0], SHEET.height / s.mesh[1]);
    expect(s.bendWidth / cell).toBeGreaterThanOrEqual(2);
  });

  it('defaults the CPU band to the Tier A width', () => {
    expect(BEND_WIDTH).toBe(ladderSettings('A0', 'A').bendWidth);
    expect(BEND_HALF).toBe(BEND_WIDTH / 2);
  });
});

describe('pointer curl fold', () => {
  it('cuts the named corner and leaves the sheet centre alone', () => {
    for (const corner of ['tl', 'tr', 'bl', 'br'] as const) {
      const fold = cornerCurlFold(corner, 14);
      const sx = corner === 'tl' || corner === 'bl' ? -1 : 1;
      const sy = corner === 'tl' || corner === 'tr' ? 1 : -1;
      expect(signedDistance(fold, [sx * SHEET.halfW, sy * SHEET.halfH])).toBeGreaterThan(0);
      expect(signedDistance(fold, [0, 0])).toBeLessThan(0);
    }
  });

  it('lifts the corner a little at the 14 degree maximum', () => {
    const state = createFoldState();
    const idx = state.findIndex((f) => f.id === 'curl');
    state[idx] = cornerCurlFold('tl', 14);
    const tip = applyFolds([-1, 0.625], state);
    expect(tip[2]).toBeGreaterThan(0);
    expect(tip[2]).toBeLessThan(0.1);
    expect(applyFolds([0, 0], state)).toEqual([0, 0, 0]);
  });

  it('is the identity at zero degrees', () => {
    const state = createFoldState();
    const idx = state.findIndex((f) => f.id === 'curl');
    state[idx] = cornerCurlFold('br', 0);
    expect(applyFolds([1, -0.625], state)).toEqual([1, -0.625, 0]);
  });
});
