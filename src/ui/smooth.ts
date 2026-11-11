import Lenis from 'lenis';
import type { Capabilities } from '../lib/tier';

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

/** Lenis's default programmatic easing, kept explicit for tuning. */
const easeOutExpo = (t: number): number => Math.min(1, 1.001 - Math.pow(2, -10 * t));

export interface SmoothScroll {
  lenis: Lenis;
  destroy(): void;
}

/**
 * Buttery wheel scrolling for the whole page. Lenis animates real window
 * scroll, so the sticky stage, the scroll listeners and the scroll-scalar
 * spring keep working unchanged; the spring stays the single source of truth
 * for the scene's P. Touch and keyboard remain native, and reduced-motion
 * users get the site's own static path instead.
 */
export function initSmoothScroll(caps: Capabilities): SmoothScroll | null {
  if (caps.reducedMotion) return null;

  const lenis = new Lenis({
    // Wheel input chases the pointer with the default lerp; programmatic
    // scrolls (anchor links) take the eased duration path.
    duration: 0.9,
    easing: easeOutExpo,
    anchors: true,
    autoRaf: false
  });
  window.__lenis = lenis;

  let rafId = requestAnimationFrame(raf);
  function raf(time: number): void {
    lenis.raf(time);
    rafId = requestAnimationFrame(raf);
  }

  return {
    lenis,
    destroy() {
      cancelAnimationFrame(rafId);
      delete window.__lenis;
      lenis.destroy();
    }
  };
}
