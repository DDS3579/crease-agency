import { Ticker } from './lib/ticker';
import { detectCapabilities } from './lib/tier';
import { idle } from './lib/dom';
import { initNav } from './ui/nav';
import { initReveals } from './ui/reveals';
import { initForm } from './ui/form';
import { initContactCta } from './ui/contact-cta';
import { initRail } from './ui/rail';

const caps = detectCapabilities();
document.documentElement.dataset.reducedMotion = String(caps.reducedMotion);
initNav();
initReveals();
initForm();
initContactCta();
const rail = initRail();
const ticker = new Ticker();

const syncActive = (): void => {
  const journey = document.querySelector('[data-journey]');
  const rect = journey?.getBoundingClientRect();
  const onscreen = rect ? rect.bottom > 0 && rect.top < window.innerHeight : false;
  ticker.setActive(!document.hidden && onscreen);
};
document.addEventListener('visibilitychange', syncActive);
window.addEventListener('resize', syncActive, { passive: true });
window.addEventListener('scroll', syncActive, { passive: true });
syncActive();

if (import.meta.env.DEV) {
  const missing = document.documentElement.dataset.missing;
  if (missing) console.warn(`[crease] DEMO [FILL] fields missing: ${missing}. Omitted from the page.`);
}

if (caps.mode === 'stage') {
  const start = (): void => {
    void import('./scene/loader').then((m) => m.loadScene({ ticker, rail, caps }));
  };
  if (new URLSearchParams(location.search).has('poster')) start();
  else requestAnimationFrame(() => requestAnimationFrame(() => idle(start)));
} else {
  rail.setJourneyActive(false);
}
