import { copy } from './demo/copy';
import { studio } from './demo/studio';

export type PrintLayer = 'structure' | 'type' | 'interface';

export const PRINT_MAX = { width: 2048, height: 1280 } as const;

export interface PrintContent {
  wordmark: string;
  stages: readonly string[];
  nav: readonly string[];
}

export const printContent: PrintContent = {
  wordmark: studio.name,
  stages: copy.chapters.map((c) => c.name),
  nav: copy.nav.links.map((l) => l.label)
};

export interface PrintRect { x: number; y: number; w: number; h: number }

export interface PrintLayout {
  wordmark: PrintRect;
  stages: PrintRect;
  nav: PrintRect;
  block: PrintRect;
  button: PrintRect;
  field: PrintRect;
  grid: PrintRect;
  index: PrintRect;
}

/**
 * The top half of the sheet becomes the laptop screen (type + interface); the
 * bottom half becomes the deck (structure grid + stage index). Every rect is
 * fully inside its half so the Build reading holds up.
 */
export function printLayout(size: { width: number; height: number }): PrintLayout {
  const w = size.width;
  const h = size.height;
  return {
    wordmark: { x: 0.06 * w, y: 0.1 * h, w: 0.42 * w, h: 0.14 * h },
    stages: { x: 0.56 * w, y: 0.08 * h, w: 0.38 * w, h: 0.34 * h },
    nav: { x: 0.06 * w, y: 0.035 * h, w: 0.8 * w, h: 0.04 * h },
    block: { x: 0.06 * w, y: 0.27 * h, w: 0.4 * w, h: 0.14 * h },
    button: { x: 0.06 * w, y: 0.435 * h, w: 0.16 * w, h: 0.045 * h },
    field: { x: 0.56 * w, y: 0.435 * h, w: 0.36 * w, h: 0.045 * h },
    grid: { x: 0.06 * w, y: 0.56 * h, w: 0.88 * w, h: 0.36 * h },
    index: { x: 0.78 * w, y: 0.93 * h, w: 0.16 * w, h: 0.04 * h }
  };
}

/** Which rects belong to which channel. Used by the layout unit tests. */
export function layerRects(layout: PrintLayout): Record<PrintLayer, PrintRect[]> {
  return {
    structure: [layout.grid, layout.index],
    type: [layout.wordmark, layout.stages],
    interface: [layout.nav, layout.block, layout.button, layout.field]
  };
}

const CHANNEL: Record<PrintLayer, string> = {
  structure: '#ff0000',
  type: '#00ff00',
  interface: '#0000ff'
};

function setFont(ctx: CanvasRenderingContext2D, family: string, weight: number, px: number): void {
  ctx.font = `${weight} ${px}px "${family}", sans-serif`;
}

function drawStructure(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  content: PrintContent
): void {
  const L = printLayout(size);
  const g = L.grid;
  ctx.strokeStyle = CHANNEL.structure;
  ctx.fillStyle = CHANNEL.structure;
  ctx.lineWidth = Math.max(1, size.width / 1024);

  for (let i = 0; i <= 12; i++) {
    const x = g.x + (g.w * i) / 12;
    ctx.beginPath();
    ctx.moveTo(x, g.y);
    ctx.lineTo(x, g.y + g.h);
    ctx.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    const y = g.y + (g.h * i) / 4;
    ctx.beginPath();
    ctx.moveTo(g.x, y);
    ctx.lineTo(g.x + g.w, y);
    ctx.stroke();
  }

  const m = 0.03 * size.width;
  const len = 0.025 * size.width;
  for (const [cx, cy] of [
    [m, m],
    [size.width - m, m],
    [m, size.height - m],
    [size.width - m, size.height - m]
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx - len, cy);
    ctx.lineTo(cx + len, cy);
    ctx.moveTo(cx, cy - len);
    ctx.lineTo(cx, cy + len);
    ctx.stroke();
  }

  // Derived from data, never hard-coded.
  const total = String(content.stages.length).padStart(2, '0');
  setFont(ctx, 'Azeret Mono', 500, 0.026 * size.height);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${total} / ${total}`, L.index.x + L.index.w, L.index.y + L.index.h);
}

function drawType(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  content: PrintContent
): void {
  const L = printLayout(size);
  ctx.fillStyle = CHANNEL.type;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  setFont(ctx, 'Funnel Display', 700, 0.115 * size.height);
  ctx.fillText(content.wordmark, L.wordmark.x, L.wordmark.y);
  setFont(ctx, 'Funnel Display', 700, 0.052 * size.height);
  content.stages.forEach((name, i) => {
    ctx.fillText(name, L.stages.x, L.stages.y + i * 0.085 * size.height);
  });
}

function drawInterface(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  content: PrintContent
): void {
  const L = printLayout(size);
  ctx.strokeStyle = CHANNEL.interface;
  ctx.fillStyle = CHANNEL.interface;
  ctx.lineWidth = Math.max(1, size.width / 1024);
  setFont(ctx, 'Azeret Mono', 500, 0.02 * size.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let x = L.nav.x;
  for (const label of content.nav) {
    ctx.fillText(label, x, L.nav.y);
    x += ctx.measureText(label).width + 0.035 * size.width;
  }

  ctx.strokeRect(L.block.x, L.block.y, L.block.w, L.block.h);
  ctx.strokeRect(L.button.x, L.button.y, L.button.w, L.button.h);
  ctx.strokeRect(L.field.x, L.field.y, L.field.w, L.field.h);
  ctx.beginPath();
  ctx.moveTo(L.block.x, L.block.y + L.block.h * 0.5);
  ctx.lineTo(L.block.x + L.block.w, L.block.y + L.block.h * 0.5);
  ctx.stroke();
}

/**
 * Pure with respect to its inputs. Draws all three layers channel-packed into one
 * canvas: R structure, G type, B interface. Called once, in idle time, after
 * document.fonts.ready. Never per frame.
 */
export function drawPrint(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  content: PrintContent = printContent
): void {
  ctx.save();
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.globalCompositeOperation = 'lighter';
  drawStructure(ctx, size, content);
  drawType(ctx, size, content);
  drawInterface(ctx, size, content);
  ctx.restore();
}
