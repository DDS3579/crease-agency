import { describe, expect, it } from 'vitest';
import {
  AMBIENT_WEIGHT, DIFFUSE_WEIGHT, LIGHT_DIR, WRAP, calibratedExposure,
  contrastChecks, contrastRatio, flatLightFactor, luminance, palette
} from '../../src/lib/exposure';

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
];

/** Replicates the fragment shader for a flat, front-facing, unprinted sheet. */
function shaderFlatPaper(): [number, number, number] {
  const n: [number, number, number] = [0, 0, 1];
  const ndl = n[0] * LIGHT_DIR[0] + n[1] * LIGHT_DIR[1] + n[2] * LIGHT_DIR[2];
  const diffuse = Math.min(1, Math.max(0, (ndl + WRAP) / (1 + WRAP)));
  const hemi = 0.5 + 0.5 * n[2];
  const light = DIFFUSE_WEIGHT * diffuse + AMBIENT_WEIGHT * hemi;
  const ao = 1;
  return rgb(palette.paper).map((c) => Math.round((c / 255) * light * calibratedExposure() * ao * 255)) as [number, number, number];
}

describe('light rig', () => {
  it('normalises the key light and points it from the upper left', () => {
    expect(Math.hypot(...LIGHT_DIR)).toBeCloseTo(1, 12);
    expect(LIGHT_DIR[0]).toBeLessThan(0);
    expect(LIGHT_DIR[1]).toBeGreaterThan(0);
    expect(LIGHT_DIR[2]).toBeGreaterThan(0);
  });

  it('weights diffuse and ambient to one', () => {
    expect(DIFFUSE_WEIGHT + AMBIENT_WEIGHT).toBeCloseTo(1, 12);
  });
});

describe('exposure calibration', () => {
  it('inverts the flat light factor exactly', () => {
    expect(flatLightFactor() * calibratedExposure()).toBeCloseTo(1, 12);
  });

  it('renders a flat top-down sheet as --paper within 2 per channel', () => {
    const actual = shaderFlatPaper();
    const expected = rgb(palette.paper);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(actual[i]! - expected[i]!)).toBeLessThanOrEqual(2);
    }
  });

  it('lands exactly on paper at 8-bit precision, so the handoff has no seam', () => {
    expect(shaderFlatPaper()).toEqual(rgb(palette.paper));
  });
});

describe('luminance and contrast', () => {
  it('anchors black and white', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 12);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 12);
  });

  it('is symmetric and bounded', () => {
    const a = contrastRatio(palette.ink, palette.paper);
    const b = contrastRatio(palette.paper, palette.ink);
    expect(a).toBeCloseTo(b, 12);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(contrastRatio(palette.paper, palette.paper)).toBeCloseTo(1, 12);
  });

  it('passes every required pair', () => {
    for (const check of contrastChecks()) {
      expect(check.pass, `${check.pair} at ${check.ratio.toFixed(2)}:1`).toBe(true);
      expect(check.ratio).toBeGreaterThanOrEqual(check.required);
    }
  });

  it('holds muted text near 6:1 on the desk', () => {
    const ratio = contrastRatio(palette.muted, palette.desk);
    expect(ratio).toBeGreaterThan(5.8);
    expect(ratio).toBeLessThan(6.2);
  });

  it('holds the accent as a non-text graphic at 3:1 or better', () => {
    expect(contrastRatio(palette.crease, palette.desk)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(palette.crease, palette.paper)).toBeGreaterThanOrEqual(3);
  });

  it('keeps body ink well beyond AA on every surface', () => {
    for (const surface of [palette.desk, palette.paper, palette.raised]) {
      expect(contrastRatio(palette.ink, surface)).toBeGreaterThan(12);
    }
  });

  it('covers all eight required pairs', () => {
    expect(contrastChecks().map((c) => c.pair)).toEqual([
      'ink/desk', 'ink/paper', 'ink/raised',
      'muted/desk', 'muted/paper', 'muted/raised',
      'crease/desk', 'crease/paper'
    ]);
  });
});

describe('palette', () => {
  it('keeps the paper tones ordered from desk to raised', () => {
    expect(luminance(palette.desk)).toBeLessThan(luminance(palette.paper));
    expect(luminance(palette.paper)).toBeLessThan(luminance(palette.raised));
  });

  it('keeps the underside graphite, distinct from body ink', () => {
    expect(luminance(palette.back)).toBeLessThan(luminance(palette.muted));
    expect(palette.back).not.toBe(palette.ink);
  });
});
