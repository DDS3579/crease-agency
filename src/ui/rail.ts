import { $, $$, debounce } from '../lib/dom';
import { copy } from '../content/demo/copy';

export interface Rail {
  update(P: number, stage: number): void;
  setJourneyActive(active: boolean): void;
  setLaunch(active: boolean): void;
}

export function initRail(): Rail {
  const fill = $<HTMLElement>('[data-rail-fill]');
  const ticks = $$('[data-tick]');
  const live = $('[data-rail-live]');

  const labels = copy.rail.ticks;
  const stageCount = copy.chapters.length;

  let current = -1;
  let lastFill = -1;
  let journeyActive: boolean | null = null;
  let launch: boolean | null = null;

  const announce = debounce((stage: number) => {
    if (!live) return;
    const label = labels[stage] ?? '';
    // Colour is never the only signal: the tick carries aria-current and this
    // debounced region spells the position out.
    live.textContent = stage === 0 ? label : `Stage ${stage} of ${stageCount}: ${label}`;
  }, 300);

  const setJourney = (active: boolean): void => {
    if (active === journeyActive) return;
    journeyActive = active;
    document.body.dataset.journey = String(active);
  };

  const journey = $('[data-journey]');
  if (journey && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setJourney(e.isIntersecting);
      },
      { threshold: 0 }
    );
    io.observe(journey);
  }

  return {
    update(P, stage) {
      const p = Math.min(1, Math.max(0, P));
      if (fill && Math.abs(p - lastFill) > 0.0005) {
        lastFill = p;
        fill.style.transform = `scaleY(${p})`;
      }
      if (stage !== current) {
        current = stage;
        ticks.forEach((t, i) => {
          if (i === stage) t.setAttribute('aria-current', 'step');
          else t.removeAttribute('aria-current');
        });
        announce(stage);
      }
    },
    setJourneyActive(active) {
      setJourney(active);
    },
    setLaunch(active) {
      if (active === launch) return;
      launch = active;
      document.body.dataset.launch = String(active);
    }
  };
}
