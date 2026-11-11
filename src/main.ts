import { Ticker } from './lib/ticker';
import { detectCapabilities } from './lib/tier';
import { idle } from './lib/dom';
import { initNav } from './ui/nav';
import { initReveals } from './ui/reveals';
import { initForm } from './ui/form';
import { initContactCta } from './ui/contact-cta';
import { initRail } from './ui/rail';
import { initSmoothScroll } from './ui/smooth';

const caps = detectCapabilities();
document.documentElement.dataset.reducedMotion = String(caps.reducedMotion);

initNav();
initReveals();
initForm();
initContactCta();
const rail = initRail();
initSmoothScroll(caps);

if (caps.mode === 'stage') {
  const ticker = new Ticker();

  // Visibility is observed, never measured: no layout reads on scroll or resize.
  let onscreen = true;
  const sync = (): void => ticker.setActive(!document.hidden && onscreen);
  const journey = document.querySelector('[data-journey]');
  if (journey && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) onscreen = e.isIntersecting;
        sync();
      },
      { threshold: 0 }
    );
    io.observe(journey);
  }
  document.addEventListener('visibilitychange', sync);
  sync();

  const start = (): void => {
    void import('./scene/loader').then((m) => m.loadScene({ ticker, rail, caps }));
  };
  if (new URLSearchParams(location.search).has('poster')) start();
  else requestAnimationFrame(() => requestAnimationFrame(() => idle(start)));
} else {
  rail.setJourneyActive(false);
}

if (import.meta.env.DEV) {
  const missing = document.documentElement.dataset.missing;
  if (missing) {
    console.warn(`[crease] DEMO [FILL] fields missing: ${missing}. Omitted from the page.`);
  }
}
