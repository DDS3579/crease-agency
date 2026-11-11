/**
 * Scroll scalar spring. Semi-implicit Euler with fixed substeps: a single step at
 * dt = 50ms with damping 25 would be unstable (c*dt > 1), so the interval is split
 * into <= 8ms substeps. Frame-rate independent, no overshoot at zeta = 1.
 */
export class Spring {
  x = 0;
  v = 0;

  constructor(
    public stiffness = 160,
    public damping = 25.3
  ) {}

  step(target: number, dt: number): boolean {
    const clamped = Math.min(0.05, Math.max(0, dt));
    const steps = Math.max(1, Math.ceil(clamped / 0.008));
    const h = clamped / steps;
    for (let i = 0; i < steps; i++) {
      const a = this.stiffness * (target - this.x) - this.damping * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    if (Math.abs(target - this.x) < 1e-5 && Math.abs(this.v) < 1e-5) {
      this.x = target;
      this.v = 0;
      return false;
    }
    return true;
  }

  jump(value: number): void {
    this.x = value;
    this.v = 0;
  }
}
