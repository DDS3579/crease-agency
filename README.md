# Crease

A demo landing page for a fictional web studio in Valencia. One sheet of paper on a
pale desk folds through four project stages as you scroll, stands as a laptop, then
unfolds into the page you are reading.

**Everything here is demo data.** See `docs/REPORT.md` for the full replacement list.

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium
pnpm dev            # http://localhost:5173
```

`pnpm dev` shows 404s for `/posters/*.avif` until you generate them:

```bash
pnpm build && pnpm posters --skip-build
```

## What is where

| path | role |
|---|---|
| `src/content/` | typed content, Zod-validated at build; `demo/` holds every fictional fact |
| `src/content/folds.ts` | fold tree + CPU reference (source of truth) |
| `src/content/journey.ts` | final keyframes, ramps, camera, portrait fit |
| `src/scene/` | raw WebGL2 renderer, shaders, mesh, camera, print texture, poster-swap |
| `src/lib/` | ticker, spring, tier gate, ladder, exposure calibration, math |
| `src/ui/` | nav, reveals, rail, form, CTA focus |
| `scripts/` | HTML render, fonts, posters, static server, QA, trace, template test |
| `tests/` | unit (Vitest) and e2e (Playwright + axe) |
| `docs/` | plan, report, engine decision, fonts, posters, scores |

## Modes

- **Stage** — JS + WebGL2 + no saveData. Sticky stage, scroll-scrubbed sheet.
- **Tier A** — desktop, fine pointer, good hardware: 128×80 mesh, DPR ≤1.75, MSAA,
  fibre normal, pointer curl.
- **Tier B** — coarse pointer, <768px, or ≤4 GB / ≤4 cores: 64×40, DPR ≤1.25.
- **Poster-swap** — context failure or ladder bottom: five committed posters, same
  geometry, no canvas.
- **Stacked** — no JS, saveData, or no WebGL2 API: complete readable server HTML with
  art-directed posters.
- **Reduced motion** — no scrub, curl, drift or glow; the scene jumps to each keyframe.

## Commands

```bash
pnpm test           # unit suites
pnpm test:e2e       # browser contracts
pnpm qa             # everything + docs/QA_RESULTS.json
pnpm lhci           # Lighthouse mobile
pnpm trace          # 4x CPU throttle trace
pnpm template-test  # jury-lens scoring
pnpm serve          # dist under the real CSP
```

Debug query params: `?debug=1`, `?perf=1`, `?poster=<hero|strategy|design|build|launch>`,
`?noladder=1`.

## Constraints worth knowing

- No three.js, no downloaded models or textures, no analytics, no third-party requests.
- One accent (`--crease`) and it only appears on a crease that is currently moving
  and on the progress rail. Never on text, links or button fills.
- Native scrolling only. One sticky stage, no scroll-jacking, no smooth-scroll library.
- Renders on demand. Idle means zero renders.
- Read `docs/REPORT.md` before quoting any number: it separates measured from UNVERIFIED.
