import {
  add3,
  cross3,
  degToRad,
  dot2,
  leftNormal2,
  norm2,
  rotateAboutAxis,
  scale3,
  sub2,
  sub3,
  type Vec2,
  type Vec3
} from '../lib/math';

export const SHEET = { width: 2, height: 1.25, halfW: 1, halfH: 0.625 } as const;
export const BEND_WIDTH = 0.04;
export const BEND_HALF = BEND_WIDTH / 2;
/**
 * Layer separation. Must beat depth-buffer precision, and must stay small enough
 * that the step at a region boundary is sub-pixel. At the far camera distance
 * (3.3) with near 0.05 / far 30 and a 24-bit depth buffer, resolution is ~1.3e-5,
 * so 0.0002 is ~15x. Two stacked layers step 0.0004 world units, ~0.2px at 500px
 * per unit. Applied as a rigid per-region translation so it cannot stretch.
 */
export const LAYER_EPSILON = 0.0002;
export const MAX_FOLDS = 8;

export interface Fold {
  id: string;
  axisPoint: Vec2;
  axisDir: Vec2;
  parent: string | null;
  angle: number;
}
export type FoldState = readonly Fold[];

const diag = Math.SQRT1_2;

export const baseFolds: readonly Fold[] = [
  { id: 'f1', axisPoint: [0, 0], axisDir: [1, 0], parent: null, angle: 0 },
  { id: 'f2', axisPoint: [-0.775, 0.4], axisDir: [diag, diag], parent: 'f1', angle: 0 },
  { id: 'f3', axisPoint: [0.775, 0.4], axisDir: [diag, -diag], parent: 'f1', angle: 0 },
  { id: 'f4', axisPoint: [0, -0.44], axisDir: [-1, 0], parent: null, angle: 0 },
  { id: 'curl', axisPoint: [-0.825, 0.45], axisDir: [diag, diag], parent: null, angle: 0 }
];

/** Leaf to root. Child regions lie inside their parent's, so this composition is exact. */
export const COMPOSITION_ORDER = ['f2', 'f3', 'f1', 'f4', 'curl'] as const;

export function createFoldState(angles: Readonly<Record<string, number>> = {}): Fold[] {
  return baseFolds.map((f) => ({ ...f, angle: angles[f.id] ?? 0 }));
}

export function foldById(state: FoldState, id: string): Fold {
  const f = state.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown fold ${id}`);
  return f;
}

export function signedDistance(fold: Fold, point: Vec2): number {
  return dot2(sub2(point, fold.axisPoint), leftNormal2(norm2(fold.axisDir)));
}

export function ancestors(state: FoldState, fold: Fold): Fold[] {
  const out: Fold[] = [];
  let p = fold.parent;
  while (p) {
    const a = foldById(state, p);
    out.push(a);
    p = a.parent;
  }
  return out;
}

/** Strict moving-side membership (excludes the bend band). */
export function isMovingSide(state: FoldState, fold: Fold, point: Vec2): boolean {
  if (signedDistance(fold, point) <= 0) return false;
  return ancestors(state, fold).every((a) => signedDistance(a, point) > 0);
}

export function treeDepth(state: FoldState, fold: Fold): number {
  return ancestors(state, fold).length;
}

export interface FoldedPoint {
  position: Vec3;
  normal: Vec3;
  layer: number;
}

/**
 * CPU source of truth. Mirrored exactly by `FOLD_GLSL` in scene/shaders.ts.
 *
 * Crease model: a cylindrical bend band of width 2*bendHalf centred on the axis.
 * The cross-section is unit-speed, so arc length is preserved and the mapping is
 * an isometry: within the band it is a circular arc, beyond it a rigid rotation
 * plus a constant correction.
 *
 * Layer separation: a rigid translation of the whole moving region along the
 * region's fully-folded normal. Constant per region, therefore zero stretch.
 * A varying weight would add a first-order gradient of epsilon/bendHalf and
 * break the isometry floor; the constant weight costs only a sub-pixel step at
 * the region boundary.
 */
export function applyFoldsFull(
  flatPoint: Vec2,
  state: FoldState,
  bendHalf = BEND_HALF,
  epsilon = LAYER_EPSILON
): FoldedPoint {
  let pos: Vec3 = [flatPoint[0], flatPoint[1], 0];
  let normal: Vec3 = [0, 0, 1];
  let rigid: Vec3 = [0, 0, 1];
  let weight = 0;
  let layer = 0;

  for (const id of COMPOSITION_ORDER) {
    const fold = foldById(state, id);
    const dir = norm2(fold.axisDir);
    const n2 = leftNormal2(dir);
    const d = dot2(sub2(flatPoint, fold.axisPoint), n2);
    const anc = ancestors(state, fold);
    const inside = d > -bendHalf && anc.every((a) => signedDistance(a, flatPoint) > -bendHalf);
    if (!inside) continue;

    const theta = degToRad(fold.angle);
    if (Math.abs(theta) < 1e-9) continue;

    if (d > 0) layer += 1;
    weight += 1;

    const phi = theta * Math.min(1, Math.max(0, (d + bendHalf) / (2 * bendHalf)));
    const k = theta / (2 * bendHalf);
    const extra = Math.max(d - bendHalf, 0);
    const f = -bendHalf + Math.sin(phi) / k + extra * Math.cos(theta);
    const g = (1 - Math.cos(phi)) / k + extra * Math.sin(theta);
    const cn = f - d * Math.cos(phi);
    const ck = g - d * Math.sin(phi);

    const axis3: Vec3 = [dir[0], dir[1], 0];
    const n3: Vec3 = [n2[0], n2[1], 0];
    const anchor: Vec3 = [fold.axisPoint[0], fold.axisPoint[1], 0];
    const v = sub3(pos, anchor);
    const rotated = rotateAboutAxis(v, axis3, phi);
    pos = add3(add3(anchor, rotated), add3(scale3(n3, cn), scale3([0, 0, 1], ck)));
    normal = rotateAboutAxis(normal, axis3, phi);
    rigid = rotateAboutAxis(rigid, axis3, theta);
  }

  pos = add3(pos, scale3(rigid, epsilon * weight));
  return { position: pos, normal, layer };
}

export function applyFolds(point: Vec2, state: FoldState, bendHalf = BEND_HALF): Vec3 {
  return applyFoldsFull(point, state, bendHalf).position;
}

export function applyFoldsNormal(point: Vec2, state: FoldState, bendHalf = BEND_HALF): Vec3 {
  return applyFoldsFull(point, state, bendHalf).normal;
}

/** Local area scale via forward differences; 1.0 means perfectly isometric. */
export function localAreaScale(point: Vec2, state: FoldState, h = 1e-4, bendHalf = BEND_HALF): number {
  const p = applyFolds(point, state, bendHalf);
  const px = applyFolds([point[0] + h, point[1]], state, bendHalf);
  const py = applyFolds([point[0], point[1] + h], state, bendHalf);
  const dx = sub3(px, p);
  const dy = sub3(py, p);
  return Math.hypot(...cross3(dx, dy)) / (h * h);
}

/**
 * Reserved virtual fold for the pointer curl. Only ever active while every real
 * fold is under 5 degrees, so its root-level composition cannot conflict with f1.
 */
export function cornerCurlFold(corner: 'tl' | 'tr' | 'bl' | 'br', angle: number): Fold {
  const sx = corner === 'tl' || corner === 'bl' ? -1 : 1;
  const sy = corner === 'tl' || corner === 'tr' ? 1 : -1;
  const cut = 0.35;
  const axisPoint: Vec2 = [sx * (1 - cut / 2), sy * (SHEET.halfH - cut / 2)];
  // The corner must be the moving region, so the axis' left normal has to point
  // at it: leftNormal(dir) = (sx, sy) gives dir = (sy, -sx).
  const axisDir = norm2([sy * cut, -sx * cut]);
  return { id: 'curl', axisPoint, axisDir, parent: null, angle };
}
