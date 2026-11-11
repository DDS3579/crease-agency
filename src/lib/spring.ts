export class Spring {
  x = 0;
  v = 0;
  constructor(public stiffness = 120, public damping = 30) {}
  step(target: number, dt: number): boolean {
    const a = this.stiffness * (target - this.x) - this.damping * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
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
