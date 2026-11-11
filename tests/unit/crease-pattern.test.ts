import { describe, expect, it } from 'vitest';
import { creasePattern } from '../../src/content/crease-pattern';
import { projects } from '../../src/content/demo/projects';
import { palette } from '../../src/lib/exposure';

const numbers = (svg: string, attr: string): number[] =>
  [...svg.matchAll(new RegExp(`${attr}="(-?[\\d.]+)"`, 'g'))].map((m) => Number(m[1]));

describe('creasePattern', () => {
  it('is deterministic for a seed', () => {
    expect(creasePattern(11)).toBe(creasePattern(11));
    expect(creasePattern(11, 640, 400)).toBe(creasePattern(11, 640, 400));
  });

  it('does not carry PRNG state between calls', () => {
    const first = creasePattern(23);
    creasePattern(37);
    creasePattern(51);
    expect(creasePattern(23)).toBe(first);
  });

  it('differs across the four project seeds', () => {
    const patterns = projects.map((p) => creasePattern(p.seed));
    expect(new Set(patterns).size).toBe(projects.length);
  });

  it('uses ink hairlines only, never the accent', () => {
    for (const p of projects) {
      const svg = creasePattern(p.seed);
      expect(svg).not.toContain(palette.crease);
      expect(svg.toLowerCase()).not.toContain('#e2400f');
      expect(svg).not.toMatch(/rgb\(/i);
      const colours = [...svg.matchAll(/(?:stroke|fill)="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1] ?? '');
      expect(colours.length).toBeGreaterThan(0);
      for (const c of colours) expect(c.toUpperCase()).toBe(palette.ink.toUpperCase());
    }
  });

  it('declares the requested viewBox and intrinsic size', () => {
    const svg = creasePattern(11, 480, 300);
    expect(svg).toContain('viewBox="0 0 480 300"');
    expect(svg).toContain('width="480"');
    expect(svg).toContain('height="300"');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('always draws the sheet outline', () => {
    for (const p of projects) {
      expect(creasePattern(p.seed)).toContain('<rect');
    }
  });

  it('keeps every coordinate inside the viewBox', () => {
    const w = 480;
    const h = 300;
    for (const p of projects) {
      const svg = creasePattern(p.seed, w, h);
      for (const attr of ['x', 'x1', 'x2', 'cx']) {
        for (const v of numbers(svg, attr)) {
          expect(v).toBeGreaterThanOrEqual(-0.001);
          expect(v).toBeLessThanOrEqual(w + 0.001);
        }
      }
      for (const attr of ['y', 'y1', 'y2', 'cy']) {
        for (const v of numbers(svg, attr)) {
          expect(v).toBeGreaterThanOrEqual(-0.001);
          expect(v).toBeLessThanOrEqual(h + 0.001);
        }
      }
      for (const d of [...svg.matchAll(/d="([^"]+)"/g)].flatMap((m) => m[1]!.split(/[ML\s]+/))) {
        const n = Number(d);
        if (Number.isFinite(n)) {
          expect(n).toBeGreaterThanOrEqual(-0.001);
          expect(n).toBeLessThanOrEqual(Math.max(w, h) + 0.001);
        }
      }
    }
  });

  it('distinguishes mountain from valley creases without colour', () => {
    const all = projects.map((p) => creasePattern(p.seed)).join('');
    expect(all).toContain('stroke-dasharray');
    const withoutDash = all.replace(/stroke-dasharray="[^"]*"/g, '');
    expect(withoutDash).toContain('<line');
  });

  it('references nothing external', () => {
    for (const p of projects) {
      const svg = creasePattern(p.seed);
      expect(svg).not.toMatch(/https?:\/\//);
      expect(svg).not.toContain('<image');
      expect(svg).not.toContain('xlink:href');
    }
  });

  it('stays a lightweight inline diagram', () => {
    for (const p of projects) expect(creasePattern(p.seed).length).toBeLessThan(4096);
  });
});
