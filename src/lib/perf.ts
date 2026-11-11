export interface PerfSummary {
  p50: number;
  p95: number;
  dropped: number;
  level: string;
  frames: number;
}

/** Sorted-ascending percentile, nearest-rank. */
export function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)));
  return sorted[i] ?? 0;
}

export function p75(values: readonly number[]): number {
  return percentile([...values].sort((a, b) => a - b), 0.75);
}

/** Rolling frame-delta recorder for `?perf=1`. Allocates only on summary. */
export class PerfRecorder {
  private deltas: number[] = [];

  constructor(
    private readonly capacity = 240,
    private readonly dropMs = 20
  ) {}

  push(dtMs: number): void {
    this.deltas.push(dtMs);
    if (this.deltas.length > this.capacity) this.deltas.shift();
  }

  get frames(): number {
    return this.deltas.length;
  }

  summary(level: string): PerfSummary {
    const sorted = [...this.deltas].sort((a, b) => a - b);
    let dropped = 0;
    for (const d of this.deltas) if (d > this.dropMs) dropped++;
    return {
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      dropped,
      level,
      frames: this.deltas.length
    };
  }

  reset(): void {
    this.deltas.length = 0;
  }
}
