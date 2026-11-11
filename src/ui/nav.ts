import { $, $$, debounce } from '../lib/dom';

export function initNav(): void {
  const onScroll = (): void => {
    document.body.dataset.scrolled = String(window.scrollY > 40);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const links = $$<HTMLAnchorElement>('.nav-links a');
  const map = new Map<string, HTMLAnchorElement>();
  for (const a of links) {
    const id = a.getAttribute('href')?.slice(1);
    if (id) map.set(id, a);
  }
  const setCurrent = debounce((id: string) => {
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
