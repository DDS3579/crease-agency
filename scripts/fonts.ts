import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public/fonts');
mkdirSync(out, { recursive: true });

const families = [
  { pkg: 'funnel-display', family: 'Funnel Display', weight: '300 800' },
  { pkg: 'funnel-sans', family: 'Funnel Sans', weight: '300 800' },
  { pkg: 'azeret-mono', family: 'Azeret Mono', weight: '100 900' }
] as const;

let total = 0;
const report: string[] = [];
const faces: string[] = [];

for (const f of families) {
  const src = join(root, 'node_modules/@fontsource-variable', f.pkg, 'files', `${f.pkg}-latin-wght-normal.woff2`);
  const dest = join(out, `${f.pkg}-latin-wght-normal.woff2`);
  copyFileSync(src, dest);
  const bytes = readFileSync(dest).byteLength;
  total += bytes;
  const font = fontkit.openSync(dest);
  const axes = Object.entries(font.variationAxes ?? {})
    .map(([tag, a]) => `${tag} ${a.min}..${a.max}`)
    .join(', ');
  report.push(`${f.family}: ${bytes} bytes, axes ${axes}`);
  const fallback =
    f.pkg === 'azeret-mono'
      ? `font-family: "${f.family} Fallback"; src: local("Courier New"); size-adjust: 92%; ascent-override: 94%; descent-override: 23%; line-gap-override: 0%;`
      : `font-family: "${f.family} Fallback"; src: local("Arial"); size-adjust: 96%; ascent-override: 100%; descent-override: 25%; line-gap-override: 0%;`;
  faces.push(
    `@font-face { font-family: "${f.family}"; src: url("/fonts/${f.pkg}-latin-wght-normal.woff2") format("woff2"); font-weight: ${f.weight}; font-style: normal; font-display: swap; }`,
    `@font-face { ${fallback} }`
  );
}

if (total > 120 * 1024) throw new Error(`Font transfer ${total} exceeds 120KB`);
const css = `/* Self-hosted Fontsource Latin subsets. Verified axes: ${report.join(' | ')} */\n${faces.join('\n')}\n`;
writeFileSync(join(root, 'src/styles/fonts.css'), css);
writeFileSync(join(root, 'docs/FONTS.md'), `# Fonts\n\nTotal: ${total} bytes (<= 120KB)\n\n${report.map((r) => `- ${r}`).join('\n')}\n`);
console.log(`fonts: ${total} bytes`);
