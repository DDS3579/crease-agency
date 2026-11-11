import { $$, debounce } from '../lib/dom';

export function initNav(): void {
  let scrolled: boolean | null = null;
  const onScroll = (): void => {
    const next = window.scrollY > 40;
    if (next === scrolled) return;
    scrolled = next;
    document.body.dataset.scrolled = String(next);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const links = $$<HTMLAnchorElement>('.nav-links a');
  if (!('IntersectionObserver' in window)) return;

  const map = new Map<string, HTMLAnchorElement>();
  for (const a of links) {
    const id = a.getAttribute('href')?.slice(1);
    if (id) map.set(id, a);
  }

  let current: string | null = null;
  const setCurrent = debounce((id: string) => {
    if (id === current) return;
    current = id;
    for (const a of links) a.removeAttribute('aria-current');
    map.get(id)?.setAttribute('aria-current', 'true');
  }, 120);

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) setCurrent((e.target as HTMLElement).id);
      }
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
  );
  for (const id of map.keys()) {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  }
}
