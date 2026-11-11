import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ticker } from '../../src/lib/ticker';
import { RafController } from '../harness/fixtures';

let raf: RafController;

beforeEach(() => {
  raf = new RafController();
  raf.install();
});

afterEach(() => {
  raf.restore();
});

describe('Ticker', () => {
  it('runs subscribers in priority order, highest first', () => {
    const t = new Ticker();
    const order: string[] = [];
    t.add(() => { order.push('low'); return false; }, 1);
    t.add(() => { order.push('high'); return false; }, 10);
    t.add(() => { order.push('mid'); return false; }, 5);
    raf.flush();
    expect(order).toEqual(['high', 'mid', 'low']);
    t.dispose();
  });

  it('sleeps when nothing is moving: zero idle frames', () => {
    const t = new Ticker();
    let calls = 0;
    t.add(() => { calls++; return false; });
    raf.flush();
    expect(calls).toBe(1);
    expect(raf.pending).toBe(0);
    for (let i = 0; i < 120; i++) raf.flush();
    expect(calls).toBe(1);
    t.dispose();
  });

  it('keeps ticking only while a subscriber asks for it', () => {
    const t = new Ticker();
    let n = 0;
    t.add(() => { n++; return n < 3; });
    raf.flush();
    expect(raf.pending).toBe(1);
    raf.flush();
    expect(raf.pending).toBe(1);
    raf.flush();
    expect(raf.pending).toBe(0);
    expect(n).toBe(3);
    t.dispose();
  });

  it('pauses when inactive and resumes on demand', () => {
    const t = new Ticker();
    let n = 0;
    t.add(() => { n++; return true; });
    raf.flush();
    expect(raf.pending).toBe(1);
    t.setActive(false);
    expect(raf.pending).toBe(0);
    for (let i = 0; i < 10; i++) raf.flush();
    expect(n).toBe(1);
    t.setActive(true);
    expect(raf.pending).toBe(1);
    raf.flush();
    expect(n).toBe(2);
    t.dispose();
  });

  it('reports the first frame as 1/60 and clamps later deltas to 50ms', () => {
    const t = new Ticker();
    const dts: number[] = [];
    t.onFrame = (dt) => dts.push(dt);
    t.add(() => true);
    raf.flush(1000 / 60);
    raf.flush(100);
    raf.flush(1000 / 60);
    expect(dts[0]).toBeCloseTo(1 / 60, 9);
    expect(dts[1]).toBeCloseTo(0.05, 9);
    expect(dts[2]).toBeCloseTo(1 / 60, 9);
    t.dispose();
  });

  it('unsubscribes and sleeps when the last subscriber leaves', () => {
    const t = new Ticker();
    const remove = t.add(() => true);
    raf.flush();
    expect(raf.pending).toBe(1);
    remove();
    expect(raf.pending).toBe(0);
    t.dispose();
  });

  it('does not double-schedule when several subscribers request a frame', () => {
    const t = new Ticker();
    t.add(() => false);
    t.add(() => false);
    t.request();
    t.request();
    expect(raf.pending).toBe(1);
    t.dispose();
  });

  it('dispose cancels the pending frame and drops subscribers', () => {
    const t = new Ticker();
    let n = 0;
    t.add(() => { n++; return true; });
    raf.flush();
    t.dispose();
    expect(raf.pending).toBe(0);
    for (let i = 0; i < 10; i++) raf.flush();
    expect(n).toBe(1);
  });
});
