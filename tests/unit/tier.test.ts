import { describe, expect, it } from 'vitest';
import { detectCapabilities, ladderSettings, nextLadderLevel, type LadderLevel } from '../../src/lib/tier';
import { MODE_SCRIPT, assertModeScript, modeScriptBytes } from '../../src/lib/mode';
import { fakeWindow } from '../harness/fixtures';

describe('capability gate', () => {
  it('chooses the stage when WebGL2 exists and saveData is off', () => {
    const caps = detectCapabilities(fakeWindow());
    expect(caps.mode).toBe('stage');
    expect(caps.tier).toBe('A');
  });

  it('falls to stacked without the WebGL2 API', () => {
    const caps = detectCapabilities(fakeWindow({ webgl2: false }));
    expect(caps.mode).toBe('stacked');
    expect(caps.tier).toBe('poster');
  });

  it('falls to stacked on saveData even with WebGL2', () => {
    const caps = detectCapabilities(fakeWindow({ saveData: true }));
    expect(caps.mode).toBe('stacked');
    expect(caps.saveData).toBe(true);
  });

  it('drops to Tier B for coarse pointer, narrow width or low hardware', () => {
    expect(detectCapabilities(fakeWindow({ finePointer: false })).tier).toBe('B');
    expect(detectCapabilities(fakeWindow({ width: 375 })).tier).toBe('B');
    expect(detectCapabilities(fakeWindow({ deviceMemory: 4 })).tier).toBe('B');
    expect(detectCapabilities(fakeWindow({ hardwareConcurrency: 4 })).tier).toBe('B');
    expect(detectCapabilities(fakeWindow({ deviceMemory: 8, hardwareConcurrency: 8 })).tier).toBe('A');
  });

  it('treats the 768px boundary as desktop', () => {
    expect(detectCapabilities(fakeWindow({ width: 767 })).tier).toBe('B');
    expect(detectCapabilities(fakeWindow({ width: 768 })).tier).toBe('A');
  });

  it('carries reduced motion through', () => {
    expect(detectCapabilities(fakeWindow({ reducedMotion: true })).reducedMotion).toBe(true);
    expect(detectCapabilities(fakeWindow()).reducedMotion).toBe(false);
  });

  it('omits optional hardware fields rather than reporting undefined', () => {
    const caps = detectCapabilities(fakeWindow());
    expect('deviceMemory' in caps).toBe(false);
    expect(caps.hardwareConcurrency).toBe(8);
  });
});

describe('mode script', () => {
  it('stays under the 400 byte pre-paint budget', () => {
    expect(modeScriptBytes()).toBeLessThan(400);
    expect(() => assertModeScript()).not.toThrow();
  });

  it('tests the same two conditions as detectCapabilities', () => {
    expect(MODE_SCRIPT).toContain('saveData');
    expect(MODE_SCRIPT).toContain('WebGL2RenderingContext');
    expect(MODE_SCRIPT).toContain("?'stacked':'stage'");
  });
});

describe('runtime ladder', () => {
  it('holds while the rolling p75 is at or under 20ms', () => {
    for (const level of ['A0', 'A1', 'A2'] as LadderLevel[]) {
      expect(nextLadderLevel(level, 16.7)).toBe(level);
      expect(nextLadderLevel(level, 20)).toBe(level);
    }
  });

  it('steps down one rung at a time and never back up', () => {
    expect(nextLadderLevel('A0', 21)).toBe('A1');
    expect(nextLadderLevel('A1', 30)).toBe('A2');
    expect(nextLadderLevel('A2', 40)).toBe('poster');
    expect(nextLadderLevel('poster', 4)).toBe('poster');
    expect(nextLadderLevel('A1', 8)).toBe('A1');
  });
});

describe('quality settings', () => {
  it('gives Tier A the full sheet within the triangle budget', () => {
    const s = ladderSettings('A0', 'A');
    expect(s.mesh).toEqual([128, 80]);
    expect(s.mesh[0] * s.mesh[1] * 2 + 2).toBeLessThanOrEqual(25000);
    expect(s.dprCap).toBe(1.75);
    expect(s.fibre).toBe(true);
    expect(s.curl).toBe(true);
    expect(s.msaa).toBe(true);
    expect(s.renderScale).toBe(1);
  });

  it('A1 drops pixel ratio, fibre and curl but keeps the mesh', () => {
    const s = ladderSettings('A1', 'A');
    expect(s.dprCap).toBe(1.25);
    expect(s.fibre).toBe(false);
    expect(s.curl).toBe(false);
    expect(s.mesh).toEqual([128, 80]);
  });

  it('A2 drops render scale and rebuilds the coarse mesh', () => {
    const s = ladderSettings('A2', 'A');
    expect(s.renderScale).toBe(0.75);
    expect(s.mesh).toEqual([64, 40]);
    expect(s.fibre).toBe(false);
    expect(s.curl).toBe(false);
  });

  it('gives Tier B the coarse path at every rung', () => {
    for (const level of ['A0', 'A1', 'A2'] as LadderLevel[]) {
      const s = ladderSettings(level, 'B');
      expect(s.mesh).toEqual([64, 40]);
      expect(s.dprCap).toBe(1.25);
      expect(s.msaa).toBe(false);
      expect(s.fibre).toBe(false);
      expect(s.curl).toBe(false);
      expect(s.mesh[0] * s.mesh[1] * 2).toBe(5120);
    }
  });

  it('never improves quality as the ladder descends', () => {
    const order: LadderLevel[] = ['A0', 'A1', 'A2', 'poster'];
    let prevPixels = Infinity;
    let prevTriangles = Infinity;
    for (const level of order) {
      const s = ladderSettings(level, 'A');
      const pixels = s.dprCap * s.renderScale;
      const triangles = s.mesh[0] * s.mesh[1] * 2;
      expect(pixels).toBeLessThanOrEqual(prevPixels);
      expect(triangles).toBeLessThanOrEqual(prevTriangles);
      prevPixels = pixels;
      prevTriangles = triangles;
    }
  });
});
