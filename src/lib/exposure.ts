import { normalize3, type Vec3 } from './math';

export const palette = {
  desk: '#E6E3DB',
  paper: '#F4F2EC',
  raised: '#FBFAF7',
  ink: '#14130F',
  muted: '#56534A',
  back: '#2B2924',
  crease: '#E2400F'
} as const;

export const LIGHT_DIR: Vec3 = normalize3([-0.45, 0.55, 0.75]);
export const WRAP = 0.35;
export const DIFFUSE_WEIGHT = 0.72;
export const AMBIENT_WEIGHT = 0.28;

export function flatLightFactor(): number {
  const ndl = LIGHT_DIR[2];
  const diffuse = Math.min(1, Math.max(0, (ndl + WRAP) / (1 + WRAP)));
  const hemi = 1;
  return DIFFUSE_WEIGHT * diffuse + AMBIENT_WEIGHT * hemi;
}

export function calibratedExposure(): number {
  return 1 / flatLightFactor();
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastCheck {
  pair: string;
  ratio: number;
  required: number;
  pass: boolean;
}

export function contrastChecks(): ContrastCheck[] {
  const textPairs: [string, string, string, number][] = [
    ['ink/desk', palette.ink, palette.desk, 4.5],
    ['ink/paper', palette.ink, palette.paper, 4.5],
    ['ink/raised', palette.ink, palette.raised, 4.5],
    ['muted/desk', palette.muted, palette.desk, 4.5],
    ['muted/paper', palette.muted, palette.paper, 4.5],
    ['muted/raised', palette.muted, palette.raised, 4.5],
    ['crease/desk', palette.crease, palette.desk, 3],
    ['crease/paper', palette.crease, palette.paper, 3]
  ];
  return textPairs.map(([pair, a, b, required]) => {
    const ratio = contrastRatio(a, b);
    return { pair, ratio, required, pass: ratio >= required };
  });
}
