export const $ = <T extends Element = Element>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);
export const $$ = <T extends Element = Element>(sel: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(sel));

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function idle(cb: () => void): void {
  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(cb, { timeout: 1200 });
  } else {
    setTimeout(cb, 1);
  }
}
