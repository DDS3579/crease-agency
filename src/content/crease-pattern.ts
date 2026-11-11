import { baseFolds, SHEET } from './folds';
import { mulberry32, norm2, leftNormal2, type Vec2 } from '../lib/math';

const INK = '#14130F';

function clipAxisToSheet(axisPoint: Vec2, axisDir: Vec2): [Vec2, Vec2] | null {
  const d = norm2(axisDir);
  const n = leftNormal2(d);
  // line: p = axisPoint + t*d, bounds x +/-1, y +/-0.625
  let tMin = -Infinity;
  let tMax = Infinity;
  const bounds: [number, number, number][] = [
    [d[0], axisPoint[0], SHEET.halfW],
    [d[1], axisPoint[1], SHEET.halfH]
  ];
  for (const [dv, pv, lim] of bounds) {
    if (Math.abs(dv) < 1e-9) {
      if (Math.abs(pv) > lim) return null;
      continue;
    }
    const t1 = (-lim - pv) / dv;
    const t2 = (lim - pv) / dv;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (tMin > tMax) return null;
  void n;
  return [
    [axisPoint[0] + tMin * d[0], axisPoint[1] + tMin * d[1]],
    [axisPoint[0] + tMax * d[0], axisPoint[1] + tMax * d[1]]
  ];
}

export function creasePattern(seed: number, width = 480, height = 300): string {
  const rand = mulberry32(seed);
  const pad = 18;
  const sx = (width - pad * 2) / SHEET.width;
  const sy = (height - pad * 2) / SHEET.height;
  const s = Math.min(sx, sy);
  const ox = width / 2;
  const oy = height / 2;
  const X = (x: number): number => ox + x * s;
  const Y = (y: number): number => oy - y * s;

  const parts: string[] = [];
  parts.push(
    `<rect x="${X(-1)}" y="${Y(0.625)}" width="${2 * s}" height="${1.25 * s}" fill="none" stroke="${INK}" stroke-opacity="0.55" stroke-width="1"/>`
  );

  for (const fold of baseFolds) {
    if (fold.id === 'curl') continue;
    const active = rand() > 0.25;
    if (!active) continue;
    const seg = clipAxisToSheet(fold.axisPoint, fold.axisDir);
    if (!seg) continue;
    const mountain = rand() > 0.5;
    const dash = mountain ? ' stroke-dasharray="6 5"' : '';
    parts.push(
      `<line x1="${X(seg[0][0])}" y1="${Y(seg[0][1])}" x2="${X(seg[1][0])}" y2="${Y(seg[1][1])}" stroke="${INK}" stroke-opacity="0.7" stroke-width="1"${dash}/>`
    );
    if (fold.parent === 'f1' && rand() > 0.4) {
      const corner: Vec2 = fold.id === 'f2' ? [-1, 0.625] : [1, 0.625];
      parts.push(
        `<path d="M ${X(seg[0][0])} ${Y(seg[0][1])} L ${X(corner[0])} ${Y(corner[1])} L ${X(seg[1][0])} ${Y(seg[1][1])}" fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="1"/>`
      );
    }
  }

  const ticks = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < ticks; i++) {
    const x = -0.8 + rand() * 1.6;
    const y = -0.5 + rand();
    parts.push(
      `<circle cx="${X(x)}" cy="${Y(y)}" r="1.5" fill="${INK}" fill-opacity="0.5"/>`
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="none">${parts.join('')}</svg>`;
}
