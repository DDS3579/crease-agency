/**
 * Init scripts. Each function is self-contained: Playwright serialises it with
 * toString(), so it must not close over module scope.
 */

export function instrumentLayoutReads(): void {
  const w = window as unknown as Record<string, unknown>;
  const state = { inFrame: 0, total: 0, inFrameCount: 0, byApi: {} as Record<string, number> };
  w.__layout = state;

  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  w.requestAnimationFrame = function (cb: FrameRequestCallback): number {
    return raf(function (t: number) {
      state.inFrame++;
      try {
        cb(t);
      } finally {
        state.inFrame--;
      }
    });
  };
  w.cancelAnimationFrame = caf;

  function bump(name: string): void {
    state.total++;
    if (state.inFrame > 0) {
      state.inFrameCount++;
      state.byApi[name] = (state.byApi[name] ?? 0) + 1;
    }
  }

  function wrap(proto: object, name: string): void {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc) return;
    const original = desc.value as ((...a: unknown[]) => unknown) | undefined;
    if (typeof original === 'function') {
      Object.defineProperty(proto, name, {
        configurable: true,
        writable: true,
        value: function (this: unknown) {
          bump(name);
          return original.apply(this, arguments as unknown as unknown[]);
        }
      });
    } else if (typeof desc.get === 'function') {
      const getter = desc.get;
      Object.defineProperty(proto, name, {
        configurable: true,
        enumerable: desc.enumerable,
        get: function (this: unknown) {
          bump(name);
          return getter.call(this);
        }
      });
    }
  }

  wrap(Element.prototype, 'getBoundingClientRect');
  wrap(Element.prototype, 'getClientRects');
  wrap(Element.prototype, 'clientWidth');
  wrap(Element.prototype, 'clientHeight');
  wrap(Element.prototype, 'scrollTop');
  wrap(Element.prototype, 'scrollHeight');
  wrap(HTMLElement.prototype, 'offsetWidth');
  wrap(HTMLElement.prototype, 'offsetHeight');
  wrap(HTMLElement.prototype, 'offsetTop');
  wrap(HTMLElement.prototype, 'offsetLeft');
}

export function instrumentGL(): void {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (window as unknown as { WebGL2RenderingContext?: { prototype: object } })
    .WebGL2RenderingContext;
  const counts: Record<string, number> = {};
  const api = {
    counts,
    draws: 0,
    live(): Record<string, number> {
      const out: Record<string, number> = {};
      for (const key of Object.keys(counts)) {
        if (key.indexOf('create') === 0) {
          const kind = key.slice(6);
          out[kind] = (counts[key] ?? 0) - (counts['delete' + kind] ?? 0);
        }
      }
      return out;
    }
  };
  w.__gl = api;
  if (!Ctor) return;

  function owner(name: string): object | null {
    let p: object | null = Ctor!.prototype;
    while (p) {
      if (Object.getOwnPropertyDescriptor(p, name)) return p;
      p = Object.getPrototypeOf(p) as object | null;
    }
    return null;
  }

  function patch(name: string, after: (result: unknown) => void): void {
    const proto = owner(name);
    if (!proto) return;
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    const original = desc?.value as ((...a: unknown[]) => unknown) | undefined;
    if (typeof original !== 'function') return;
    Object.defineProperty(proto, name, {
      configurable: true,
      writable: true,
      value: function (this: unknown) {
        counts[name] = (counts[name] ?? 0) + 1;
        const result = original.apply(this, arguments as unknown as unknown[]);
        after(result);
        return result;
      }
    });
  }

  const kinds = [
    'Texture', 'Buffer', 'Program', 'Shader', 'VertexArray',
    'Framebuffer', 'Renderbuffer', 'Sampler', 'Query', 'TransformFeedback'
  ];
  for (const kind of kinds) {
    patch('create' + kind, () => undefined);
    patch('delete' + kind, () => undefined);
  }
  patch('drawElements', () => { api.draws++; });
  patch('drawArrays', () => { api.draws++; });
  patch('drawArraysInstanced', () => { api.draws++; });
  patch('drawElementsInstanced', () => { api.draws++; });
}

export function instrumentHtmlStyle(): void {
  const w = window as unknown as Record<string, unknown>;
  const state = { count: 0, samples: [] as string[] };
  w.__htmlStyle = state;
  const mo = new MutationObserver(function (records) {
    for (const r of records) {
      if (r.target !== document.documentElement) continue;
      if (r.attributeName !== 'style') continue;
      state.count++;
      if (state.samples.length < 10) {
        state.samples.push(String(document.documentElement.getAttribute('style')));
      }
    }
  });
  mo.observe(document, { attributes: true, attributeFilter: ['style'], subtree: true });
}
