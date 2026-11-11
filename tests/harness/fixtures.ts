import { SHEET, signedDistance, type FoldState } from '../../src/content/folds';
import { mulberry32, type Vec2 } from '../../src/lib/math';

/** 8x8 grid of flat-space samples, inset from the sheet edge. Used for GPU parity. */
export function paritySamples(): [number, number][] {
  const out: [number, number][] = [];
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 8; i++) {
      const x = -0.9 + (1.8 * i) / 7;
      const y = -0.55 + (1.1 * j) / 7;
      out.push([x, y]);
    }
  }
  return out;
}

export function randomSheetPoints(seed: number, count: number): Vec2[] {
  const rand = mulberry32(seed);
  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    out.push([
      (rand() * 2 - 1) * SHEET.halfW,
      (rand() * 2 - 1) * SHEET.halfH
    ]);
  }
  return out;
}

/**
 * The layer offset is a rigid per-region translation, so it steps by epsilon at
 * a region boundary. Finite differences straddling that step are not meaningful;
 * isometry sampling stays clear of it.
 */
export function nearRegionBoundary(p: Vec2, state: FoldState, margin = 1e-3): boolean {
  return state.some((f) => Math.abs(signedDistance(f, p) + 0.02) < margin);
}

export interface FakeWindowOptions {
  webgl2?: boolean;
  saveData?: boolean;
  finePointer?: boolean;
  reducedMotion?: boolean;
  width?: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export function fakeWindow(o: FakeWindowOptions = {}): Window {
  const navigator: Record<string, unknown> = {
    connection: { saveData: o.saveData ?? false },
    hardwareConcurrency: o.hardwareConcurrency ?? 8
  };
  if (o.deviceMemory !== undefined) navigator.deviceMemory = o.deviceMemory;

  const win: Record<string, unknown> = {
    innerWidth: o.width ?? 1440,
    navigator,
    matchMedia: (query: string) => ({
      media: query,
      matches: query.includes('pointer: fine')
        ? (o.finePointer ?? true)
        : query.includes('reduce')
          ? (o.reducedMotion ?? false)
          : false,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    })
  };
  if (o.webgl2 !== false) win.WebGL2RenderingContext = function WebGL2RenderingContext(): void {};
  return win as unknown as Window;
}

export interface RecordedOp {
  op: string;
  args: unknown[];
  fillStyle: string;
  strokeStyle: string;
  font: string;
  composite: string;
  lineWidth: number;
}

/** Minimal 2D context that records every draw call, for print purity assertions. */
export function recordingContext(): { ctx: CanvasRenderingContext2D; ops: RecordedOp[] } {
  const ops: RecordedOp[] = [];
  const ctx: Record<string, unknown> = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalCompositeOperation: 'source-over'
  };
  const record = (op: string, args: unknown[] = []): void => {
    ops.push({
      op,
      args,
      fillStyle: String(ctx.fillStyle),
      strokeStyle: String(ctx.strokeStyle),
      font: String(ctx.font),
      composite: String(ctx.globalCompositeOperation),
      lineWidth: Number(ctx.lineWidth)
    });
  };
  ctx.save = () => record('save');
  ctx.restore = () => record('restore');
  ctx.clearRect = (...a: unknown[]) => record('clearRect', a);
  ctx.fillRect = (...a: unknown[]) => record('fillRect', a);
  ctx.strokeRect = (...a: unknown[]) => record('strokeRect', a);
  ctx.beginPath = () => record('beginPath');
  ctx.moveTo = (...a: unknown[]) => record('moveTo', a);
  ctx.lineTo = (...a: unknown[]) => record('lineTo', a);
  ctx.stroke = () => record('stroke');
  ctx.fillText = (...a: unknown[]) => record('fillText', a);
  ctx.measureText = (t: string) => ({ width: t.length * 10 });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

/** Deterministic rAF driver. No vitest import, so e2e can reuse this module. */
export class RafController {
  private queue = new Map<number, FrameRequestCallback>();
  private nextId = 1;
  private time = 0;
  private saved: { raf?: unknown; caf?: unknown } = {};

  install(): void {
    const g = globalThis as Record<string, unknown>;
    this.saved = { raf: g.requestAnimationFrame, caf: g.cancelAnimationFrame };
    g.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      const id = this.nextId++;
      this.queue.set(id, cb);
      return id;
    };
    g.cancelAnimationFrame = (id: number): void => {
      this.queue.delete(id);
    };
  }

  restore(): void {
    const g = globalThis as Record<string, unknown>;
    if (this.saved.raf === undefined) delete g.requestAnimationFrame;
    else g.requestAnimationFrame = this.saved.raf;
    if (this.saved.caf === undefined) delete g.cancelAnimationFrame;
    else g.cancelAnimationFrame = this.saved.caf;
    this.queue.clear();
  }

  get pending(): number {
    return this.queue.size;
  }

  /** Runs the currently scheduled callbacks; newly scheduled ones wait for the next flush. */
  flush(dtMs = 1000 / 60): number {
    this.time += dtMs;
    const batch = [...this.queue.values()];
    this.queue.clear();
    for (const cb of batch) cb(this.time);
    return batch.length;
  }
}
