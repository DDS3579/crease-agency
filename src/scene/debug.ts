import type { SceneState } from '../content/journey';
import type { Capabilities, LadderLevel } from '../lib/tier';
import type { RenderStats } from './renderer';

export interface CreaseDebug {
  P: number;
  stage: number;
  key: string;
  folds: Record<string, number>;
  ink: readonly [number, number, number];
  camera: SceneState['camera'];
  tier: string;
  ladder: LadderLevel;
  reducedMotion: boolean;
  renders: number;
  drawCalls: number;
  triangles: number;
  textureCount: number;
  gpuMemoryMB: number;
  activity: number[];
  posterReady?: boolean;
  geometry?: { keyP: readonly number[]; dwellEndP: readonly number[]; scrollRange: number; journeyTop: number };
  caps?: Capabilities;
  setP?: (p: number) => void;
  gpuParity?: (points: [number, number][], key: string) => { maxError: number; cpu: number[]; gpu: number[] };
  forceRender?: () => void;
  dispose?: () => void;
}

declare global {
  interface Window {
    __crease?: CreaseDebug;
    __perf?: { p50: number; p95: number; dropped: number; level: string; frames: number };
  }
}

export function publishDebug(state: SceneState, stats: RenderStats, tier: string, ladder: LadderLevel, activity: Float32Array, caps: Capabilities): void {
  const prev = window.__crease;
  window.__crease = {
    ...prev,
    P: state.P,
    stage: state.stage,
    key: state.key,
    folds: state.folds,
    ink: state.ink,
    camera: state.camera,
    tier,
    ladder,
    reducedMotion: caps.reducedMotion,
    renders: stats.renders,
    drawCalls: stats.drawCalls,
    triangles: stats.triangles,
    textureCount: stats.textureCount,
    gpuMemoryMB: stats.gpuMemoryMB,
    activity: Array.from(activity),
    caps
  };
}
