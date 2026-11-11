import { describe, expect, it } from 'vitest';
import {
  PRINT_MAX, drawPrint, layerRects, printContent, printLayout, type PrintRect
} from '../../src/content/print';
import { printTextureBytes, printTextureSize } from '../../src/scene/print-texture';
import { copy } from '../../src/content/demo/copy';
import { studio } from '../../src/content/demo/studio';
import { recordingContext } from '../harness/fixtures';

const SIZE = { width: PRINT_MAX.width, height: PRINT_MAX.height };
const inside = (r: PrintRect, w: number, h: number): boolean =>
  r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= w + 1e-9 && r.y + r.h <= h + 1e-9;

describe('print content', () => {
  it('derives everything from the content model', () => {
    expect(printContent.wordmark).toBe(studio.name);
    expect(printContent.stages).toEqual(copy.chapters.map((c) => c.name));
    expect(printContent.nav).toEqual(copy.nav.links.map((l) => l.label));
    expect(printContent.stages).toHaveLength(4);
  });
});

describe('print layout', () => {
  it('keeps every rectangle inside the canvas at both texture sizes', () => {
    for (const size of [SIZE, { width: 1024, height: 640 }]) {
      for (const rects of Object.values(layerRects(printLayout(size)))) {
        for (const r of rects) expect(inside(r, size.width, size.height)).toBe(true);
      }
    }
  });

  it('puts type and interface on the future screen half', () => {
    const layout = printLayout(SIZE);
    const { type, interface: ui } = layerRects(layout);
    for (const r of [...type, ...ui]) {
      expect(r.y + r.h).toBeLessThanOrEqual(SIZE.height * 0.5);
    }
  });

  it('puts structure and the stage index on the future deck half', () => {
    const layout = printLayout(SIZE);
    for (const r of layerRects(layout).structure) {
      expect(r.y).toBeGreaterThanOrEqual(SIZE.height * 0.5);
    }
  });

  it('scales proportionally with the texture', () => {
    const full = printLayout(SIZE);
    const half = printLayout({ width: SIZE.width / 2, height: SIZE.height / 2 });
    expect(half.wordmark.x).toBeCloseTo(full.wordmark.x / 2, 9);
    expect(half.grid.h).toBeCloseTo(full.grid.h / 2, 9);
  });

  it('does not overlap the screen blocks with each other', () => {
    const L = printLayout(SIZE);
    expect(L.wordmark.x + L.wordmark.w).toBeLessThanOrEqual(L.stages.x);
    expect(L.block.y + L.block.h).toBeLessThanOrEqual(L.button.y);
    expect(L.nav.y + L.nav.h).toBeLessThanOrEqual(L.wordmark.y);
  });
});

describe('texture budget', () => {
  it('uses explicit sizes per tier', () => {
    expect(printTextureSize(false)).toEqual({ width: 2048, height: 1280 });
    expect(printTextureSize(true)).toEqual({ width: 1024, height: 640 });
  });

  it('accounts for the mip chain and stays inside the GPU memory budget', () => {
    const full = printTextureBytes(printTextureSize(false));
    expect(full).toBe(Math.round(2048 * 1280 * 3 * (4 / 3)));
    expect(full / 1048576).toBeLessThan(32);
    expect(printTextureBytes(printTextureSize(true))).toBeLessThan(full);
  });
});

describe('drawPrint', () => {
  it('is pure: identical inputs produce an identical command stream', () => {
    const a = recordingContext();
    const b = recordingContext();
    drawPrint(a.ctx, SIZE, printContent);
    drawPrint(b.ctx, SIZE, printContent);
    expect(a.ops.length).toBeGreaterThan(50);
    expect(a.ops).toEqual(b.ops);
  });

  it('packs the three layers into separate channels with lighter compositing', () => {
    const { ops } = recordingContext();
    const { ctx } = { ctx: null as never };
    void ctx;
    const rec = recordingContext();
    drawPrint(rec.ctx, SIZE, printContent);
    const drawn = rec.ops.filter((o) => o.op !== 'save' && o.op !== 'restore');
    expect(drawn.every((o) => o.composite === 'lighter')).toBe(true);
    const colours = new Set(
      rec.ops.filter((o) => o.op === 'stroke' || o.op === 'fillText').map((o) =>
        o.op === 'fillText' ? o.fillStyle : o.strokeStyle
      )
    );
    expect([...colours].sort()).toEqual(['#0000ff', '#00ff00', '#ff0000']);
    void ops;
  });

  it('clears to black so unprinted channels stay at zero', () => {
    const { ctx, ops } = recordingContext();
    drawPrint(ctx, SIZE, printContent);
    const clear = ops.find((o) => o.op === 'fillRect');
    expect(clear?.fillStyle).toBe('#000');
    expect(clear?.args).toEqual([0, 0, SIZE.width, SIZE.height]);
  });

  it('draws the stage index derived from the data, not a literal', () => {
    const { ctx, ops } = recordingContext();
    drawPrint(ctx, SIZE, printContent);
    const index = ops.find((o) => o.op === 'fillText' && String(o.args[0]).includes('/'));
    const total = String(printContent.stages.length).padStart(2, '0');
    expect(index?.args[0]).toBe(`${total} / ${total}`);
    expect(index?.fillStyle).toBe('#ff0000');
  });

  it('sets the wordmark and every stage name in the type channel', () => {
    const { ctx, ops } = recordingContext();
    drawPrint(ctx, SIZE, printContent);
    const typeText = ops.filter((o) => o.op === 'fillText' && o.fillStyle === '#00ff00');
    const strings = typeText.map((o) => String(o.args[0]));
    expect(strings).toContain(studio.name);
    for (const name of printContent.stages) expect(strings).toContain(name);
    expect(typeText.every((o) => o.font.includes('Funnel Display'))).toBe(true);
  });

  it('draws a 12-column grid in the structure channel', () => {
    const { ctx, ops } = recordingContext();
    drawPrint(ctx, SIZE, printContent);
    const grid = printLayout(SIZE).grid;
    const verticals = ops.filter(
      (o) => o.op === 'moveTo' && o.strokeStyle === '#ff0000' && Number(o.args[1]) === grid.y
    );
    expect(verticals.length).toBeGreaterThanOrEqual(13);
  });

  it('never reads pixels or serialises the canvas', () => {
    const { ctx, ops } = recordingContext();
    drawPrint(ctx, SIZE, printContent);
    const forbidden = ['getImageData', 'toDataURL', 'drawImage', 'createPattern'];
    expect(ops.some((o) => forbidden.includes(o.op))).toBe(false);
  });

  it('restores the context it was given', () => {
    const { ctx, ops } = recordingContext();
    drawPrint(ctx, SIZE, printContent);
    expect(ops[0]?.op).toBe('save');
    expect(ops[ops.length - 1]?.op).toBe('restore');
  });

  it('responds to different content without touching layout', () => {
    const a = recordingContext();
    const b = recordingContext();
    drawPrint(a.ctx, SIZE, { wordmark: 'Other', stages: ['One', 'Two'], nav: ['A'] });
    drawPrint(b.ctx, SIZE, printContent);
    const count = (ops: typeof a.ops): number => ops.filter((o) => o.op === 'fillText').length;
    expect(count(a.ops)).toBeLessThan(count(b.ops));
  });
});
