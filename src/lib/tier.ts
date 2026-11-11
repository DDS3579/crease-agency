export type Mode = 'stage' | 'stacked';
export type Tier = 'A' | 'B' | 'poster';
export type LadderLevel = 'A0' | 'A1' | 'A2' | 'poster';

export interface Capabilities {
  mode: Mode;
  tier: Tier;
  reducedMotion: boolean;
  finePointer: boolean;
  width: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  saveData: boolean;
}

interface NavigatorLike {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgent?: string;
}

export function detectCapabilities(win: Window = window): Capabilities {
  const nav = win.navigator as NavigatorLike;
  const saveData = Boolean(nav.connection?.saveData);
  const hasWebGL2 = typeof (win as Window & { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext !== 'undefined';
  const mode: Mode = hasWebGL2 && !saveData ? 'stage' : 'stacked';
  const finePointer = win.matchMedia('(pointer: fine)').matches;
  const reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const width = win.innerWidth;
  const deviceMemory = nav.deviceMemory;
  const hardwareConcurrency = nav.hardwareConcurrency;
  const lowHardware =
    (deviceMemory !== undefined && deviceMemory <= 4) ||
    (hardwareConcurrency !== undefined && hardwareConcurrency <= 4);
  const tier: Tier =
    mode === 'stacked'
      ? 'poster'
      : finePointer && width >= 768 && !lowHardware
        ? 'A'
        : 'B';
  return {
    mode,
    tier,
    reducedMotion,
    finePointer,
    width,
    ...(deviceMemory !== undefined ? { deviceMemory } : {}),
    ...(hardwareConcurrency !== undefined ? { hardwareConcurrency } : {}),
    saveData
  };
}

export function nextLadderLevel(current: LadderLevel, p75FrameMs: number): LadderLevel {
  if (p75FrameMs <= 20) return current;
  if (current === 'A0') return 'A1';
  if (current === 'A1') return 'A2';
  return 'poster';
}

export function ladderSettings(level: LadderLevel, base: Tier): {
  dprCap: number;
  renderScale: number;
  mesh: [number, number];
  fibre: boolean;
  curl: boolean;
  msaa: boolean;
} {
  if (level === 'poster' || base === 'poster') {
    return { dprCap: 1, renderScale: 1, mesh: [64, 40], fibre: false, curl: false, msaa: false };
  }
  if (base === 'B') {
    return { dprCap: 1.25, renderScale: 1, mesh: [64, 40], fibre: false, curl: false, msaa: false };
  }
  if (level === 'A0') {
    return { dprCap: 1.75, renderScale: 1, mesh: [128, 80], fibre: true, curl: true, msaa: true };
  }
  if (level === 'A1') {
    return { dprCap: 1.25, renderScale: 1, mesh: [128, 80], fibre: false, curl: false, msaa: true };
  }
  return { dprCap: 1.25, renderScale: 0.75, mesh: [64, 40], fibre: false, curl: false, msaa: true };
}
