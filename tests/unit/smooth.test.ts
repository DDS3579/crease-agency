import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initSmoothScroll } from '../../src/ui/smooth';
import type { Capabilities } from '../../src/lib/tier';

interface LenisStub {
  options: Record<string, unknown>;
  raf: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({ created: [] as unknown[] }));

vi.mock('lenis', () => ({
  default: class {
    options: Record<string, unknown>;
    raf = vi.fn();
    destroy = vi.fn();
    constructor(options: Record<string, unknown>) {
      this.options = options;
      h.created.push(this);
    }
  }
}));

const caps = (reducedMotion = false): Capabilities =>
  ({ reducedMotion }) as unknown as Capabilities;

function installRaf(): { pending: () => number; flush: (t?: number) => void } {
  const queue: { id: number; cb: FrameRequestCallback }[] = [];
  let nextId = 1;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      const id = nextId++;
      queue.push({ id, cb });
      return id;
    })
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      const i = queue.findIndex((e) => e.id === id);
      if (i >= 0) queue.splice(i, 1);
    })
  );
  return {
    pending: () => queue.length,
    flush(t = 16) {
      for (const cb of queue.splice(0).map((e) => e.cb)) cb(t);
    }
  };
}

let raf: ReturnType<typeof installRaf>;

beforeEach(() => {
  h.created.length = 0;
  raf = installRaf();
  vi.stubGlobal('window', {} as Window);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('initSmoothScroll', () => {
  it('is skipped entirely under reduced motion', () => {
    expect(initSmoothScroll(caps(true))).toBeNull();
    expect(h.created).toHaveLength(0);
    expect(raf.pending()).toBe(0);
  });

  it('creates one Lenis instance and publishes it as window.__lenis', () => {
    const smooth = initSmoothScroll(caps(false))!;
    expect(h.created).toHaveLength(1);
    expect(smooth.lenis).toBe(h.created[0]);
    expect(window.__lenis).toBe(smooth.lenis);
  });

  it('runs its own raf loop instead of Lenis autoRaf, and smooths anchors', () => {
    const smooth = initSmoothScroll(caps(false))!;
    expect(smooth.lenis.options.autoRaf).toBe(false);
    expect(smooth.lenis.options.anchors).toBe(true);
    expect(raf.pending()).toBe(1);
    raf.flush(32);
    expect(smooth.lenis.raf).toHaveBeenCalledWith(32);
    expect(raf.pending()).toBe(1);
  });

  it('destroy() stops the loop, unpublishes and tears Lenis down', () => {
    const smooth = initSmoothScroll(caps(false))!;
    expect(raf.pending()).toBe(1);
    smooth.destroy();
    expect(raf.pending()).toBe(0);
    expect(window.__lenis).toBeUndefined();
    expect(smooth.lenis.destroy).toHaveBeenCalledTimes(1);
  });
});
