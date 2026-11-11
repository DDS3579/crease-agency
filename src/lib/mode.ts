/**
 * Single source of truth for the pre-paint script.
 * `scripts/render-html.ts` inlines this verbatim and derives the CSP hash from it.
 *
 * `data-js` gates every progressive-enhancement style that hides content, so the
 * server HTML is fully readable with scripts disabled.
 */
export const MODE_SCRIPT =
  "document.documentElement.dataset.js='1';document.documentElement.dataset.mode=(navigator.connection&&navigator.connection.saveData)||!('WebGL2RenderingContext' in window)?'stacked':'stage';";

export const MODE_SCRIPT_LIMIT = 400;

export function modeScriptBytes(): number {
  return new TextEncoder().encode(MODE_SCRIPT).length;
}

export function assertModeScript(): void {
  const bytes = modeScriptBytes();
  if (bytes >= MODE_SCRIPT_LIMIT) {
    throw new Error(`mode script is ${bytes} bytes; limit is ${MODE_SCRIPT_LIMIT}`);
  }
}
