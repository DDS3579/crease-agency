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
}

/** Mirrors the inline head script's conditions exactly, so first paint never shifts. */
export function detectCapabilities(win: Window = window): Capabilities {
  const nav = win.navigator as NavigatorLike;
  const saveData = Boolean(nav.connection?.saveData);
  const hasWebGL2 =
    typeof (win as Window & { WebGL2RenderingContext?: unknown }).WebGL2RenderingContext !==
    'undefined';
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
    mode === 'stacked' ? 'poster' : finePointer && width >= 768 && !lowHardware ? 'A' : 'B';

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

/** Rolling p75 over 30 moving frames; step down above 20ms, never back up. */
export function nextLadderLevel(current: LadderLevel, p75FrameMs: number): LadderLevel {
  if (p75FrameMs <= 20) return current;
  if (current === 'A0') return 'A1';
  if (current === 'A1') return 'A2';
  return 'poster';
}

export interface QualitySettings {
  dprCap: number;
  renderScale: number;
  mesh: [number, number];
  fibre: boolean;
  curl: boolean;
  msaa: boolean;
  /**
   * Crease band width. Widened on the coarse mesh so the band still spans at
   * least two cells: 0.04 / (2/128) = 2.56, 0.07 / (2/64) = 2.24. The crease
   * reads slightly softer on the degraded tiers, which is the intended trade.
   */
  bendWidth: number;
}

export function ladderSettings(level: LadderLevel, base: Tier): QualitySettings {
  if (level === 'poster' || base === 'poster') {
    // Below A2 on every axis, so the ladder never improves as it descends.
    return { dprCap: 1, renderScale: 0.75, mesh: [64, 40], fibre: false, curl: false, msaa: false, bendWidth: 0.07 };
  }
  if (base === 'B') {
    return { dprCap: 1.25, renderScale: 1, mesh: [64, 40], fibre: false, curl: false, msaa: false, bendWidth: 0.07 };
  }
  if (level === 'A0') {
    return { dprCap: 1.75, renderScale: 1, mesh: [128, 80], fibre: true, curl: true, msaa: true, bendWidth: 0.04 };
  }
  if (level === 'A1') {
    return { dprCap: 1.25, renderScale: 1, mesh: [128, 80], fibre: false, curl: false, msaa: true, bendWidth: 0.04 };
  }
  return { dprCap: 1.25, renderScale: 0.75, mesh: [64, 40], fibre: false, curl: false, msaa: true, bendWidth: 0.07 };
}
