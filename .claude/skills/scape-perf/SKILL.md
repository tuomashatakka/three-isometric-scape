---
name: scape-perf
description: Measure and cut the three-iso scape's rendering and first-load cost — draws, triangles, programs per tier with the studio's census, fill-rate passes like the one-pass lens (`lensTaps`), CPU build time with `scape:bench` and bun's cpu profiler — and the levers that exist (scatter LOD, tier counts, mist masks, survey memo). Use when a change adds geometry, a pass or build work, when asked to make rendering or loading faster, or before claiming a change is cheap.
---

# rendering cost

## measure the frame (GPU side)

```sh
bun run studio serve                                     # background, once (see scape-studio)
bun run studio shot --poses tour --census                # draws / tris per pose, top 12 meshes
bun run studio shot --poses tour --tier desktop --census # the same with the post chain and shadows
bun run studio census                                    # top 40 of what is on screen now
bun run studio eval "scape.census(300)"                  # every row
bun run studio eval "scape.census(300).filter(r => r.triangles === 0)"   # points, lines, sprites
```

The header is `draws · tris · programs · geometries · textures` for the **whole
last frame, every pass of it** (`vitals.ts` holds the counters across passes).
The rows are scene objects only, sorted by triangles (instances × per instance).
So `draws − Σ row draws` is what no row shows: the full-screen post passes and
the shadow-map re-draws. Quote these numbers, same pose and tier before/after, at
mobile **and** desktop, in the pull request. Frame time under swiftshader is not
a performance number; draws, triangles and programs are.

Reference (mobile, after the scatter LOD landed): default ~140 draws / 0.95M
tris; `near` ~84 / 0.9M. Re-measure; do not quote these.

## passes the census cannot price — the lens

`src/scene/lens.ts` is the whole glass and film in **one** full-screen pass:
defocus disc, chromatic aberration, vignette, micro-contrast, grade + lut,
grain. It is one draw whatever it does, so its cost is fill: `lensTaps` texture
fetches per pixel where the disc is wider than a third of a pixel (the
out-of-focus part of the frame), plus the fixed taps of the rest.

| tier | post chain | `lensTaps` |
| --- | --- | --- |
| minimal, mobile | off — no composer at all | 0 |
| desktop | on, 4× msaa | 16 |
| ultra | on, 8× msaa, + GTAO, SSR, anamorphic, TRAA | 24 |
| any, `runtime.effects=all` | on | ≥ 12 (`UNLOCKED_FLOOR`) |

- The taps are compiled into the program as a constant array: a different count
  is a different program, and 0 compiles the defocus out.
- `look.lens` scales defocus, fringe and vignette together, live; `look.lens=0`
  is the lens with no blur (the branch skips the disc) — the A/B for its picture.
- To see or price the chain on the mobile build:
  `studio shot --set runtime.effects=all --rebuild` (expect several times the draws).
- A new screen-space effect that reads the same pixels **folds into the lens
  pass** rather than appending one; a new pass is a draw and a full-frame
  read+write on every post tier. Argue cost as taps × covered share of the
  frame, and show `programs` did not grow.

## measure the first load (CPU side)

```sh
bun run scape:bench                    # mobile: survey · terrain · dressing ms, + a fingerprint
bun run scape:bench --tier ultra       # the heaviest dressing (minimal|mobile|desktop|ultra)
bun --cpu-prof-md --cpu-prof-dir=.scape/prof scripts/scape-bench.ts --tier ultra
sed -n '/Hot Functions/,/Call Tree/p' "$(ls -t .scape/prof/*.md | head -1)" | head -30   # newest profile, self time first
bun --cpu-prof-md --cpu-prof-dir=.scape/prof scripts/scape-map.ts --stats   # the survey (+ the stats)
bun run scape:map --stats              # the structural numbers a speed-up must not move
```

`--cpu-prof-md` writes a grep-friendly markdown profile (self/total per
function, callers); plain `--cpu-prof` writes a `.cpuprofile` for a viewer. A
browser trace (Performance panel, "Evaluate module") is the same work under V8.
The fingerprint and `scape:map --stats` are the proof a build-time speed-up is
exact — the procedure is in `scape-verify`.

## levers that already exist

- **`landscape/scatter-lod.ts`** — every scattered family is hidden when its
  typical instance projects under `lod.pixels`, and close in is drawn as culled
  `lod.tile`-metre tiles instead of one world-wide mesh (`lod.wide` is the
  switch-over). New scatter goes through `dressing.ts`'s `stamp` and gets this
  for free; a new instanced system outside the dressing sets a real
  `boundingSphere` and `frustumCulled = true`, or joins a tiling of its own.
- **`quality.ts`** — every count is per tier (`AtmosphereQuality`). A new cost
  needs a mobile answer: a smaller count, or 0 and a graceful absence; and an
  `UNLOCKED_FLOOR` entry so `runtime.effects=all` still draws it as itself.
  `quality.test.ts` pins the ladder (each step down no dearer) and the floors —
  extend it with the new field.
- **shader tap counts** — `detailTaps` (1 = the lite ground path on
  minimal/mobile, 6 = normal map + relief + macro octave), `reliefSteps`,
  `lensTaps`: fill-rate levers, each compiled per tier.
- **world-sized sheets** (mist, haar, clouds) — a gradient across a world-sized
  quad belongs in a texture read in world metres (see `mist.ts`'s mask), never
  in vertex colours on a subdivided plane.
- **CPU build** — `surveyArchipelago` is memoized on config content. Hot loops
  use `hypot`/`hypot3` from `src/scene/hypot.ts`, never `Math.hypot`.

## rules

- Draw calls are the budget on mobile; triangles second; fill-rate (transparent
  full-screen sheets, post passes, tap counts) third.
- Never trade a determinism or a structural number (`scape:map --stats`, the
  bench fingerprint) for speed without saying so in the pull request.
- To *look* at what a cut did, the `scape-studio` skill; to *check* it, `scape-verify`.
