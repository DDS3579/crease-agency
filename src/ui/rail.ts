import { $, $$, debounce } from '../lib/dom';

export interface Rail {
  update(P: number, stage: number): void;
  setJourneyActive(active: boolean): void;
  setLaunch(active: boolean): void;
}

export function initRail(): Rail {
  const fill = $('[data-rail-fill]') as HTMLElement | null;
  const ticks = $$('[data-tick]');
  const live = $('[data-rail-live]');
  const labels = ['Start', 'Strategy', 'Design', 'Build', 'Launch'];
  let current = -1;
  const announce = debounce((stage: number) => {
    if (live) live.textContent = `Stage ${stage} of 4: ${labels[stage] ?? ''}`;
  }, 300);

  const journeyIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        document.body.dataset.journey = String(e.isIntersecting);
      }
    },
    { threshold: 0 }
  );
  const journey = $('[data-journey]');
  if (journey) journeyIO.observe(journey);

  return {
    update(P, stage) {
      if (fill) fill.style.transform = `scaleY(${Math.min(1, Math.max(0, P))})`;
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
      document.body.dataset.journey = String(active);
    },
    setLaunch(active) {
      document.body.dataset.launch = String(active);
    }
  };
}
