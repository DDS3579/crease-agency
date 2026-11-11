/**
 * Scroll scalar spring. Semi-implicit Euler with fixed substeps: at dt = 50ms a
 * single step with damping 30 would be unstable (c*dt = 1.5), so the interval is
 * split into <= 8ms substeps. Behaviour is frame-rate independent.
 */
export class Spring {
  x = 0;
  v = 0;

  constructor(
    public stiffness = 120,
    public damping = 30
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
    // Snap inside a sub-pixel deadband so a settled sheet stops rendering.
    if (Math.abs(target - this.x) < 1e-3 && Math.abs(this.v) < 1e-3) {
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
