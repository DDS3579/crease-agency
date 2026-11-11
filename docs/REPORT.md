# Crease — final report

Demo build. Every fictional fact lives in `src/content/demo/` under a
`DEMO DATA: replace before launch` banner. Nothing fabricated ships outside it.

## Assumptions

1. **Domain, email, socials and form endpoint are `[FILL]`.** Omitted from the page:
   no canonical link, no sitemap, no `mailto:` link, no social list, no empty boxes.
   Listed in `html[data-missing]` and warned once in dev.
2. **Form with no endpoint and no email** completes as a local demo submission with
   an honest `aria-live` status ("Demo form: validated locally…"). Validation and
   honeypot still run. Setting `PUBLIC_FORM_ENDPOINT` switches to a real POST and
   widens `connect-src`; setting `studio.email` enables the `mailto:` fallback.
3. **Keyframe distances were retuned, not kept.** The brief's seeds
   (3.3 / 3.0 / 2.7 / 2.9) failed the composition rule: measured at 1440×900 the
   sheet sat 64–185 px inside the text column at every stage and clipped
   off-screen at strategy, design and build. Final distances are the smallest that
   clear the text column and viewport by ≥12 px at 1024×768, 1280×800, 1440×900 and
   1920×1080, plus 4%. Fold angles, azimuths, elevations, ink and `centreX` are
   unchanged from the seeds.
4. **Text panels are 5 of 12 columns**, not 6. The brief sets 6 as a maximum for the
   headline. Five gives symmetric 819 px channels at 1440 and 575 px at 1024.
5. **Contact shadow is 1.02 × 0.64 half-extents** (2% beyond the flat sheet). The
   first pass at 1.08 × 0.70 was the largest single cause of shadow intrusion.
6. **Portrait uses a width-fit margin of 1.25 and a height floor of 7.6.** Azimuth
   rotates the sheet in plan, so a 1.06 margin clipped 22 px off a 375 px viewport;
   width fit alone let the object reach 0.52 of a short viewport's height.
7. **Layer separation is a rigid per-region translation**, ε = 0.0002. A weight that
   varied across the bend band added ε/bendHalf = 7.5% first-order stretch and broke
   the ≤2% isometry floor.
8. **Crease band widens to 0.07 on the 64×40 mesh** so it still spans ≥2 cells
   (2.24 vs 2.56 on 128×80). The crease reads slightly softer on Tier B.
9. **Package versions are the repository's existing pins.** No registry was reachable
   in this session, so nothing was re-pinned from memory. Re-check before launch.
10. **Software GL only.** No browser ran here. Frame rate on real hardware is
    UNVERIFIED; the guarantee is the runtime ladder plus on-demand rendering.

## Full `[FILL]` list

| field | file | effect when missing |
|---|---|---|
| `studio.domain` | `src/content/demo/studio.ts` | no canonical, no sitemap, relative OG image |
| `studio.email` | `src/content/demo/studio.ts` | no email link, no `mailto:` fallback |
| `studio.socials` | `src/content/demo/studio.ts` | no social list |
| `studio.formEndpoint` | `src/content/demo/studio.ts` or `PUBLIC_FORM_ENDPOINT` | local demo submission |

`html[data-missing]="studio.domain,studio.email,studio.socials,studio.formEndpoint"`.

## DEMO DATA to replace

- `src/content/demo/studio.ts` — name, label, locality, country, description, four `[FILL]`s.
- `src/content/demo/copy.ts` — hero, nav, four chapters, services/work/contact strings, footer, rail labels, five poster alt texts.
- `src/content/demo/services.ts` — Websites; Web apps; Brand and motion (sentence + stack each).
- `src/content/demo/projects.ts` — Almada Ceramics (online store, 2025), Seis Radio (streaming site, 2025), Cinder Bakery (ordering site, 2024), Orla Dental (clinic website, 2024). Sentences, stack lines and seeds are demo copy. No metrics, quotes, awards, clients or team names anywhere.

## Measured in this session

Computed from Python ports of the shipped math. Reproducible from the source files.

| item | value | floor |
|---|---|---|
| pre-paint mode script | **189 B** | < 400 B |
| mode script CSP hash | `sha256-JCOkf4YLHB3mkotX7NViBrwL0EDckvqRMs7U5BBXGV0=` | — |
| JSON-LD CSP hash | `sha256-TnJ7M2E2HTU3wrSnbCvPr6X4VPrX+qKDTGZ7NkRcSj8=` | — |
| ink / desk | 14.494:1 | 4.5 |
| ink / paper | 16.604:1 | 4.5 |
| ink / raised | 17.808:1 | 4.5 |
| muted / desk | **5.994:1** | 4.5 (brief target ≈6) |
| muted / paper | 6.867:1 | 4.5 |
| muted / raised | 7.365:1 | 4.5 |
| crease / desk | **3.292:1** | 3.0 |
| crease / paper | **3.771:1** | 3.0 |
| flat light factor / exposure | 0.853813801 / 1.171215549 | product = 1 |
| flat top-down sheet, 8-bit | **(244, 242, 236)** = `--paper` | drift **0** ≤ 2 |
| Tier A triangles | 20 480 + 2 shadow = **20 482** | ≤ 25 000 |
| Tier B triangles | 5 120 + 2 = **5 122** | ≤ 25 000 |
| Tier A GPU estimate | mesh 206 472 B + print/mips 10 485 760 B = **10.197 MB** | < 32 MB |
| Tier B print/mips | **2.5 MB** | < 32 MB |
| band ÷ cell | A **2.56**, B **2.24** | ≥ 2 |
| fonts (Latin woff2) | **61 344 B** | ≤ 122 880 B |
| depth resolution @ d 3.3 | 1.296e-5 → ε is **15.4×** | separation |
| two-layer boundary step | **0.2 px** @ 500 px/unit | sub-pixel |
| fold identity at 0° | error **0** | exact |
| hand-computed 90° hinge | error **1.4e-17** | — |
| nested closed form (f1 78 / f2 135) | error **1.1e-16** | — |
| bend-band arc length | error **2.6e-10** | preserved |
| isometry, 1788 random samples | worst \|scale−1\| = **2.49e-6** | ≤ 0.02 |
| Launch cover-fit | overfills both axes at 375×812, 900×1200, 1024×768, 1440×900, 1920×1080 | covers |

### Text clearance, solved distances (4.53 / 5.00 / 4.46 / 5.07)

Worst slack in px across sheet **and** shadow, 12 px margins, 5-column panels:

| viewport | hero | strategy | design | build |
|---|---|---|---|---|
| 1024×768 | 0.3 | 0.1 | 0.6 | 1.2 |
| 1280×800 | 61.7 | 64.6 | 62.0 | 62.7 |
| 1440×900 | 70.9 | 74.2 | 71.3 | 72.0 |
| 1920×1080 | 101.6 | 111.4 | 102.0 | 102.9 |

Shipped distances add 4% (4.70 / 5.20 / 4.62 / 5.26) because 0.1 px at 1024×768 is
inside browser rounding. The resulting slack is **derived, not re-measured**;
`tests/e2e/launch-handoff.spec.ts` is the authority and names the exact string,
coordinate and colour drift if anything intrudes.

Portrait, at fit margin 1.25 and height floor 7.6: object bottom ≤ 0.50 H and
x inside 6 px at 375×667, 375×812, 390×844, 414×896, 768×1024, 900×1200.

## UNVERIFIED — produced by the harness, never claimed here

- **Gzip bytes** for initial JS, scene chunk and CSS → `pnpm size`, `pnpm engine-choice`.
- **Poster and OG bytes** → `pnpm posters` writes `docs/POSTERS.md`, budgets enforced.
- **Lighthouse LCP / CLS / TBT**, mobile and desktop → `pnpm lhci`, `pnpm lhci:desktop`.
- **GPU/CPU parity on a real GL driver** (1e-4), draw-call/tri/texture counts, leak
  checks over three passes, idle zero renders, context loss, ladder under 6× throttle,
  axe, pixel-under-text, launch seam → `pnpm test:e2e`.
- **Long tasks under 4× CPU throttle** → `pnpm trace`.
- **Real-device 60 fps.** SwiftShader cannot prove it. The guarantee is the ladder
  (rolling p75 over 30 moving frames, step down above 20 ms, never up) plus on-demand
  rendering with zero idle frames.
- **INP ≤ 150 ms.** A field metric; lab runs cannot produce it. TBT is measured instead.

## Final keyframe and fold values

`src/content/journey.ts` is the source of truth.

| key | f1 | f2 | f3 | f4 | ink s/t/i | az | el | dist | panel | centreX |
|---|---|---|---|---|---|---|---|---|---|---|
| hero | 0 | 0 | 0 | 0 | 0/0/0 | −28 | 34 | 4.70 | left | 0.70 |
| strategy | 120 | 0 | 0 | 0 | 1/0/0 | 18 | 42 | 5.20 | right | 0.30 |
| design | 105 | 150 | 150 | −90 | 1/1/0 | −32 | 30 | 4.62 | left | 0.70 |
| build | 78 | 0 | 0 | −170 | 1/1/1 | 0 | 14 | 5.26 | right | 0.30 |
| launch | 0 | 0 | 0 | 0 | 1→0 | 0 | 90 | cover-fit | none | 0.50 |

Fold tree: `f1` hinge `[0,0]` dir `[1,0]` root; `f2` `[−0.775,0.4]` dir `[√½,√½]`
child of f1; `f3` `[0.775,0.4]` dir `[√½,−√½]` child of f1; `f4` lip `[0,−0.44]`
dir `[−1,0]` root; `curl` reserved virtual root. Composition leaf→root
`f2, f3, f1, f4, curl`. Band 0.04 (A) / 0.07 (B). ε 0.0002. Max 8 folds, 5 seeded.

Portrait: `centreX 0.5`, `centreY 0.30`, `dist = max(tuned, fit(aspect), 7.6)`.
Launch: `coverDistance(aspect)`, `centre 0.5/0.5`, ink 1→0 over the last 30%.

## Engine decision

**Raw WebGL2.** No three.js, no ogl. One subdivided sheet, one baked shadow plane,
a small uniform fold array, two custom shaders. No scene graph, material system,
loaders or controls — every abstraction a wrapper adds would be unused bytes inside
an 80 KB gzip ceiling. Raw GL also makes the contracts direct: parity renders 64
points to an RGBA32F target and reads them back; draw calls, triangles, textures and
memory are counted by wrapping `gl.create*` / `gl.delete*`; context loss and disposal
are explicit. `pnpm engine-choice` writes the measured comparison to `docs/ENGINE.md`
and labels the ogl figure UNVERIFIED when it cannot measure a tree-shaken bundle.

**No Next.js.** One static route, no data fetching, no hydration, no server state.
A framework runtime would cost bytes and main-thread time without buying anything.

## Running the harness

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build                    # fonts -> render -> typecheck -> vite
pnpm posters --skip-build     # 10 AVIFs + OG, budgets enforced
pnpm test                     # 9 unit suites, node, no browser
pnpm test:e2e                 # browser contracts
pnpm qa                       # all of the above + docs/QA_RESULTS.json + screenshots
pnpm lhci && pnpm lhci:desktop
pnpm trace
pnpm template-test            # docs/TEMPLATE_TEST.md, at most 2 iterations
pnpm engine-choice
```

`pnpm serve` runs `dist` under the real `_headers` CSP on 127.0.0.1:4180.
Debug: `?debug=1` (`window.__crease`), `?perf=1` (`window.__perf`),
`?poster=<key>` (deterministic frame), `?noladder=1` (pin quality).

## Swapping in real content, file by file

1. `src/content/demo/studio.ts` — real name, label, locality, country, description;
   fill `domain`, `email`, `socials`, `formEndpoint`. A filled domain switches on the
   canonical link, `sitemap.xml`, absolute OG URL and the robots sitemap line.
2. `src/content/demo/copy.ts` — real copy. `chapters` must stay length 4 (schema).
   `rail.ticks` must stay length 5. Rewrite `posters.*` alt text to match the real scene.
3. `src/content/demo/services.ts` — real services. The contact select and the hero
   data strip derive from this array; no count is hard-coded.
4. `src/content/demo/projects.ts` — real projects with a unique integer `seed` each.
   Thumbnails regenerate as crease patterns; no screenshots needed.
5. Delete the `DEMO DATA` banners only once the file holds real facts.
6. `pnpm build && pnpm posters && pnpm qa` — content is Zod-validated at build, so a
   bad URL or an empty sentence fails the build rather than shipping.
7. Remove `(DEMO)` from the title and `copy.footer.copyright`, and `copy.work.note`.
