/**
 * Records the measured byte comparison behind the renderer decision (raw WebGL2,
 * not ogl, not three.js). Writes docs/ENGINE.md. Anything it cannot measure is
 * labelled UNVERIFIED rather than estimated.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'dist', 'assets');

function measure(prefix: string): { file: string; raw: number; gzip: number } | null {
  if (!existsSync(assets)) return null;
  const file = readdirSync(assets).find((f) => f.startsWith(prefix) && f.endsWith('.js'));
  if (!file) return null;
  const buf = readFileSync(join(assets, file));
  return { file, raw: buf.byteLength, gzip: gzipSync(buf, { level: 9 }).byteLength };
}

/** Source subset ogl would need for one sheet, one program, one camera, one texture. */
const OGL_SUBSET = [
  'src/core/Renderer.mjs', 'src/core/Program.mjs', 'src/core/Geometry.mjs',
  'src/core/Mesh.mjs', 'src/core/Texture.mjs', 'src/core/Camera.mjs',
  'src/core/Transform.mjs', 'src/math/Mat4.mjs', 'src/math/Vec3.mjs',
  'src/math/Euler.mjs', 'src/math/functions/Color.mjs'
];

interface OglMeasurement { version: string; bytes: number | null; basis: string; verified: boolean }

async function measureOgl(): Promise<OglMeasurement> {
  const pkgDir = join(root, 'node_modules', 'ogl');
  if (existsSync(join(pkgDir, 'package.json'))) {
    const version = (JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as { version: string }).version;
    let bytes = 0;
    let found = 0;
    for (const rel of OGL_SUBSET) {
      const p = join(pkgDir, rel);
      if (existsSync(p)) { bytes += readFileSync(p).byteLength; found++; }
    }
    if (found > 0) {
      return {
        version, bytes, verified: true,
        basis: `raw source of ${found}/${OGL_SUBSET.length} modules ogl would need for this scene (pre-tree-shake, pre-minify)`
      };
    }
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://registry.npmjs.org/ogl/latest', { signal: ctrl.signal });
    clearTimeout(t);
    const json = (await res.json()) as { version: string; dist?: { unpackedSize?: number } };
    return {
      version: json.version,
      bytes: json.dist?.unpackedSize ?? null,
      verified: false,
      basis: 'registry unpackedSize for the whole package — an upper bound, not a tree-shaken bundle'
    };
  } catch {
    return { version: 'unknown', bytes: null, verified: false, basis: 'UNVERIFIED — ogl not installed and the registry was unreachable' };
  }
}

const scene = measure('scene-');
const main = measure('main-');
const ogl = await measureOgl();

const kb = (n: number | null): string => (n === null ? 'UNVERIFIED' : `${(n / 1024).toFixed(2)} KB`);

const md = `# Engine decision

**Raw WebGL2.** No three.js, no ogl.

## Measured

| item | file | raw | gzip |
|---|---|---|---|
| initial entry | ${main?.file ?? 'not built'} | ${kb(main?.raw ?? null)} | ${kb(main?.gzip ?? null)} |
| scene chunk (engine + shaders + fold engine + print) | ${scene?.file ?? 'not built'} | ${kb(scene?.raw ?? null)} | ${kb(scene?.gzip ?? null)} |

${main ? '' : '> Run `pnpm build` before `pnpm engine-choice` to populate this table.\n'}
## ogl comparison

- version: ${ogl.version}
- bytes: ${kb(ogl.bytes)}
- basis: ${ogl.basis}
- status: ${ogl.verified ? 'MEASURED (source subset)' : 'UNVERIFIED (upper bound only)'}

## Why raw

The scene is one subdivided sheet, one baked contact-shadow plane, a small uniform
fold array and two custom shaders. There is no scene graph, no material system, no
loaders, no controls and no post-processing. Every abstraction a wrapper provides
would be unused, and its bytes would land in the scene chunk that has an 80 KB
gzip ceiling.

Raw WebGL2 also makes the engineering contracts direct and testable:

- GPU/CPU parity renders 64 points to an RGBA32F target and reads them back; with
  a wrapper the fold math would still be ours, but the resource lifetime would not
  be inspectable.
- Draw calls, triangles, textures and GPU memory are counted by wrapping
  \`gl.create*\` / \`gl.delete*\`. A wrapper adds indirection between our code and
  those counts.
- Context loss and restore, and disposal on every ladder step, are explicit.

three.js is excluded outright: one sheet does not pay for its bytes.

## Consequence

The renderer is ~${kb(scene?.gzip ?? null)} gzip including the fold engine, the print
generator, the camera math and both shader pairs. The parity, budget and leak tests
in \`tests/\` assert against the live GL context rather than a wrapper's bookkeeping.
`;

writeFileSync(join(root, 'docs', 'ENGINE.md'), md);
console.log(md);
