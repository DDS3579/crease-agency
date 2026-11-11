import {
  add3,
  clamp01,
  cross3,
  degToRad,
  dot2,
  dot3,
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
export const LAYER_EPSILON = 0.0015;
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

export function applyFoldsFull(
  flatPoint: Vec2,
  state: FoldState,
  bendHalf = BEND_HALF,
  epsilon = LAYER_EPSILON
): FoldedPoint {
  let pos: Vec3 = [flatPoint[0], flatPoint[1], 0];
  let normal: Vec3 = [0, 0, 1];
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

    const phi = theta * clamp01((d + bendHalf) / (2 * bendHalf));
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
  }

  pos = add3(pos, scale3(normal, epsilon * layer));
  return { position: pos, normal, layer };
}

export function applyFolds(point: Vec2, state: FoldState): Vec3 {
  return applyFoldsFull(point, state).position;
}

export function applyFoldsNormal(point: Vec2, state: FoldState): Vec3 {
  return applyFoldsFull(point, state).normal;
}

export function localAreaScale(point: Vec2, state: FoldState, h = 1e-4): number {
  const p = applyFolds(point, state);
  const px = applyFolds([point[0] + h, point[1]], state);
  const py = applyFolds([point[0], point[1] + h], state);
  const dx = sub3(px, p);
  const dy = sub3(py, p);
  return Math.hypot(...cross3(dx, dy)) / (h * h);
}

export function cornerCurlFold(corner: 'tl' | 'tr' | 'bl' | 'br', angle: number): Fold {
  const sx = corner === 'tl' || corner === 'bl' ? -1 : 1;
  const sy = corner === 'tl' || corner === 'tr' ? 1 : -1;
  const cut = 0.35;
  const axisPoint: Vec2 = [sx * (1 - cut / 2), sy * (SHEET.halfH - cut / 2)];
  const axisDir = norm2([-sx * cut, sy * cut]);
  return { id: 'curl', axisPoint, axisDir, parent: null, angle };
}
