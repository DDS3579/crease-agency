import { $$ } from '../lib/dom';

export function initContactCta(): void {
  $$('[data-start-project]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById('contact');
      target?.scrollIntoView({ behavior: 'auto', block: 'start' });
      const first = document.getElementById('f-name') as HTMLInputElement | null;
      first?.focus({ preventScroll: true });
      history.replaceState(null, '', '#contact');
    });
  });
}
