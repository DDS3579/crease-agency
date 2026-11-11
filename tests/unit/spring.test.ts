import { describe, expect, it } from 'vitest';
import { Spring } from '../../src/lib/spring';

function settle(spring: Spring, target: number, dt: number, seconds: number): number {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) spring.step(target, dt);
  return spring.x;
}

describe('Spring', () => {
  it('jumps without velocity', () => {
    const s = new Spring();
    s.jump(0.42);
    expect(s.x).toBe(0.42);
    expect(s.v).toBe(0);
  });

  it('converges and reports settled exactly', () => {
    const s = new Spring(120, 30);
    let moving = true;
    for (let i = 0; i < 1000 && moving; i++) moving = s.step(1, 1 / 60);
    expect(moving).toBe(false);
    expect(s.x).toBe(1);
    expect(s.v).toBe(0);
  });

  it('is overdamped: approaches the target without overshoot', () => {
    const s = new Spring(120, 30);
    let prev = 0;
    for (let i = 0; i < 400; i++) {
      s.step(1, 1 / 60);
      expect(s.x).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(s.x).toBeLessThanOrEqual(1 + 1e-9);
      prev = s.x;
    }
  });

  it('stays stable at the ticker dt clamp of 50ms', () => {
    // A single explicit Euler step at dt 0.05 with damping 30 gives c*dt = 1.5
    // and diverges. Substepping must keep it bounded and monotone.
    const s = new Spring(120, 30);
    let prev = 0;
    for (let i = 0; i < 200; i++) {
      s.step(1, 0.05);
      expect(Number.isFinite(s.x)).toBe(true);
      expect(s.x).toBeLessThanOrEqual(1 + 1e-9);
      expect(s.x).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = s.x;
    }
    expect(s.x).toBeCloseTo(1, 6);
  });

  it('is frame-rate independent over one second', () => {
    const at60 = settle(new Spring(120, 30), 1, 1 / 60, 1);
    const at30 = settle(new Spring(120, 30), 1, 1 / 30, 1);
    const at20 = settle(new Spring(120, 30), 1, 0.05, 1);
    expect(Math.abs(at60 - at30)).toBeLessThan(0.005);
    expect(Math.abs(at60 - at20)).toBeLessThan(0.005);
  });

  it('clamps dt, so a background-tab stall cannot teleport the sheet', () => {
    const a = new Spring(120, 30);
    const b = new Spring(120, 30);
    a.step(1, 5);
    b.step(1, 0.05);
    expect(a.x).toBeCloseTo(b.x, 12);
  });

  it('ignores non-positive dt', () => {
    const s = new Spring(120, 30);
    s.jump(0.3);
    expect(s.step(1, 0)).toBe(true);
    expect(s.step(1, -1)).toBe(true);
    expect(s.x).toBe(0.3);
    expect(s.v).toBe(0);
  });

  it('is reversible: forward then back returns to the origin', () => {
    const s = new Spring(120, 30);
    settle(s, 1, 1 / 60, 2);
    settle(s, 0, 1 / 60, 2);
    // The deadband is 1e-5, so a 2s settle ends sub-pixel rather than snapping.
    expect(Math.abs(s.x)).toBeLessThan(1e-3);
    expect(Math.abs(s.v)).toBeLessThan(1e-3);
  });
});
