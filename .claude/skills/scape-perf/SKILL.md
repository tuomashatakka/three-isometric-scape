---
name: scape-perf
description: Measure and cut the three-iso scape's rendering cost — triangles, draw calls, programs, per tier — with the studio's census, and the levers that exist (scatter LOD, tiers, mist masks, survey cost). Use when a change adds geometry or a pass, when asked to make rendering faster, or before claiming a change is cheap.
---

# rendering cost

## measure

```sh
bun run studio serve                                     # background, once (see scape-studio)
bun run studio shot --poses tour --census                # draws / tris per pose, top meshes
bun run studio shot --poses near --tier desktop --census # the same at another tier
```

The census line is `draws · tris · programs · geometries · textures`, then the
meshes sorted by triangles (instances × triangles per instance). Quote these
numbers, same pose and tier before/after, in the pull request. Frame time under
swiftshader is not a performance number; draws and triangles are.

Reference (mobile tier, after the scatter LOD landed): default frame ~140 draws /
0.95M tris; `near` ~84 draws / 0.9M tris.

## the first load (CPU)

`bun run scape:bench --tier ultra` times the archipelago survey and the
dressing headless — the two things the page builds before its first frame. A
browser trace (Performance panel, "Evaluate module") is the same work under V8;
its bottom-up self times name the hot function. Before this tooling a desktop
first load was ~27 s; see the changelog for where it went.

## levers that already exist

- **`landscape/scatter-lod.ts`** — every scattered family is hidden when its
  typical instance projects under `lod.pixels`, and close in is drawn as culled
  `lod.tile`-metre tiles instead of one world-wide mesh (`lod.wide` is the
  switch-over). New scatter goes through `dressing.ts`'s `stamp` and gets this
  for free; a new instanced system outside the dressing should set a real
  `boundingSphere` and `frustumCulled = true`, or join a tiling of its own.
- **`quality.ts`** — every count is per tier. A new cost needs a mobile answer:
  a smaller count, or 0 and a graceful absence.
- **world-sized sheets** (mist, haar, clouds) — a gradient across a world-sized
  quad belongs in a texture read in world metres (see `mist.ts`'s mask), never in
  vertex colours on a subdivided plane.
- **CPU build** — `surveyArchipelago` is memoized on config content; profile with
  `bun --cpu-prof` on a script that calls it. Hot loops use `hypot`/`hypot3` from
  `src/scene/hypot.ts`, never `Math.hypot`.

## rules

- Draw calls are the budget on mobile; triangles second; fill-rate (transparent
  full-screen sheets, post passes) third.
- Never trade a determinism or a structural number (`scape:map --stats`) for
  speed without saying so in the pull request.
