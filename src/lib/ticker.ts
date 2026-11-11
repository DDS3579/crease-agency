export type TickFn = (dt: number, now: number) => boolean | void;

interface Sub { fn: TickFn; priority: number; id: number }

export class Ticker {
  private subs: Sub[] = [];
  private raf = 0;
  private last = 0;
  private nextId = 1;
  private active = true;
  public onFrame: ((dt: number) => void) | null = null;

  add(fn: TickFn, priority = 0): () => void {
    const sub = { fn, priority, id: this.nextId++ };
    this.subs.push(sub);
    this.subs.sort((a, b) => b.priority - a.priority || a.id - b.id);
    this.request();
    return () => {
      this.subs = this.subs.filter((s) => s.id !== sub.id);
      if (this.subs.length === 0) this.sleep();
    };
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.sleep();
    else this.request();
  }

  request(): void {
    if (!this.active || this.raf) return;
    this.raf = requestAnimationFrame((t) => this.tick(t));
  }

  private sleep(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.last = 0;
  }

  private tick(now: number): void {
    this.raf = 0;
    if (!this.active) return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    this.onFrame?.(dt);
    let keep = false;
    for (const sub of this.subs) {
      if (sub.fn(dt, now) === true) keep = true;
    }
    if (keep) this.raf = requestAnimationFrame((t) => this.tick(t));
    else this.last = 0;
  }

  dispose(): void {
    this.sleep();
    this.subs = [];
  }
}
