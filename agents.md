# agents.md

the tool reference for anything working on this repository without a pair of eyes on the canvas. [`instructions.md`](instructions.md) is *what to do*; this is *what you have to do it with*. the [readme](README.md) is the design record and explains why the scene is the way it is.

**the one rule that saves the most time:** almost nothing here needs a browser. world generation, prop building, path planning and the whole palette are pure typescript — no `three`, no gl context, no dom. so the fast loop is `bun` and ascii, and a screenshot is the *last* resort rather than the first.

| you want to know | reach for | costs |
| --- | --- | --- |
| where am i starting from | `bun run brief` | ~2 s, no browser |
| what does the runtime already do | [`threejs-scene-api.md`](threejs-scene-api.md) | one read |
| did the composition survive | `bun run scape:map --stats` | ~1.5 s cold, no browser |
| where is everything | `bun run scape:map` | ~1.5 s cold, no browser |
| what does this one prop look like | `bun run prop:map <name>` | ~40 ms, no browser |
| what colour is where on a prop | `bun run prop:map <name> --audit` | ~40 ms, no browser |
| what does the roster look like | `/props.html` (dev server) | one gpu context |
| how does one prop measure up | `/props.html?prop=<name>` | one gpu context |
| does it still draw at all | `bun run scape:shot` | ~20 s per pose |
| did my change move the picture | `bun run scape:diff --ref origin/main` | minutes, builds a ref |

---

## `bun run brief` — where a run starts

```sh
bun run brief                          # inventory, themes, open prs, scape:map --stats
bun run brief --sections readme        # the design record's index, heading by line
bun run brief --sections inventory,api # a subset
bun run brief --themes 12              # more history
bun run brief --out .scape/brief.txt   # keep a copy to quote into the pull request
```

```text
brief · 1.7s

inventory   134 files · 19582 lines · 86 code, 48 test · none over 666
            largest: scene/landscape/dressing.ts 609 · scene/config.ts 535 · ...
themes      the rules the tools now enforce
            the machinery that was never about this island
            ...
api digest  matches threejs-scene@0.5.0 · 59/390 exports used
open prs    none open — clear to branch
scape:map   seed 7319  world 520m  home 196m  ...
```

everything it prints is derived from this working tree, and none of it is committed — a generated file that churns on every commit is just a second thing for every
branch to conflict on, which is the same reason `.scape/` is gitignored.

**it never fails.** step 2 orients, step 6 verifies, and a `brief` that could go red would collapse that distinction.

the line counts are *effective* lines — comments and blanks skipped, the way the lint rule counts them. that is why `config.ts` reads 535 here and 1122 in an
editor: it is mostly documentation, and it is not the file that needs splitting.

## `threejs-scene-api.md` — what the runtime already does

```sh
bun run api:digest           # regenerate after a version bump
bun run api:digest --check   # say whether it is stale, change nothing
```

every symbol the runtime exports, which subpath it comes from, and which of our files import it. **read it before writing a helper.**

it is the one generated file that *is* committed, and the exception has a reason: everything else the brief prints changes on every commit, and this changes only
when the dependency's version does — so its diff is a review event worth having rather than noise. `--check` warns and never rewrites, because bumping the
dependency is a reviewed decision and regenerating a committed file as a side effect would hide exactly the diff worth reading. a test fails if the stamp and the
installed version disagree.

the reinvention it exists to stop was never a discipline problem. nothing in this repository said what was already available, so each run rebuilt what it could
not see — a gesture rig, a renderer bootstrap, three copies of one ribbon builder. 59 of 390 exports are used; the rest are one read away.

---

## the fast loop, in order of cost

### `bun run scape:map` — the whole composition, as ascii

no browser, no gpu, no dependency. [`landscape/archipelago.ts`](src/scene/landscape/archipelago.ts) resolves three local surveys, projects their paths and ports, and plans the water-only route without building a vertex; this renders the combined result.

```sh
bun run scape:map                      # grid + stats
bun run scape:map --stats              # numbers only, including route/fleet safety
bun run scape:map --seed 7318          # a different valid archipelago
bun run scape:map --window 40,-20,60   # crop: cx,cz,span
bun run scape:map --w 150              # wider grid
bun run scape:map --layers paths,waterways,boats,buildings
bun run scape:map --json               # for scripting
```

the stats block is the check that catches what a still cannot — a beck that stopped tracing, an island that drowned, a pasture that never found room, a mill that lost its shoulder, footpaths that collapsed to zero, a route that crossed land or a fleet that collided. the first block is the legacy home-island shape; the landmass, waterway and boat blocks cover the full world. **read it before and after every change.**

```text
seed 7319  world 520m  home 196m  water -1.25m  grid 96x48  5.42x10.83 m/cell

land 19.6%  above snowline 82%  peak 9.09m @ (17, 18)
yard (-17,-0.7) r19    track 27pts 48.8m    landRadius 44
footpaths 17 routes, 220m total, longest 23m
creek OK  head (19,23) 7.88m -> mouth (47,46) -14.3m  len 38.7m
pasture (34.9,-9) r6   plots 4   ridges 5   isles 15/15 surfacing
mill (29,-19.7) prominence 6.52m
beacon (60.9,39.3) isle 5 freeboard 6.69m  reach 74.7m
steading  farmhouse(-8,3) barn(-16,-14) aitta(-27,6) woodshed(-28,-7) sauna(-17,16)
landing (-26,-17)  harbour (-13,-28)
landmasses 3
home/home @ (0,0)  land 19.6% peak 9.09m  paths 17  jetty (-26,-17)  mill (29,-19.7)
ridge/ridge @ (-178,128)  land 15.1% peak 9.8m  paths 11  jetty (-151,138)  mill NONE
meadow/meadow @ (178,128)  land 27% peak 5.68m  paths 13  jetty (151,126)  mill (168.2,157.5)
waterways 3 legs 809.7m  connected OK  wet OK  clearance 0.67m
boats 3  separation 115.79m  conflicts 0
```

`beacon NONE` is the same kind of answer: the light goes on the *outermost* islet in the ring that is broad enough for masonry and has eight dry bearings at its footing, so an archipelago whose skerries are all too small gets no lighthouse. a beacon that moved isle on a run that did not touch `beacon.minRock`, `beacon.freeboard` or `terrain.isles` is a finding.

`mill NONE` is a valid answer and not a failure — an island with nowhere level and exposed enough for a trestle does not get one. what would be a finding is a mill *appearing* or *moving* on a run that did not touch the siting rules, because everything the search reads is either the ground or something the farm already claimed.

### `bun run prop:map` — one prop, as ascii

the same bargain one scale down. builds exactly one geometry and draws it through the runtime's z-buffered ascii rasteriser (`rasterizeAscii` from `threejs-scene/modules/assets`). **use this instead of a screenshot when you touch a prop builder.**

```sh
bun run prop:map farmhouse                 # the play angle
bun run prop:map farmhouse --view right    # the angle you can measure from
bun run prop:map barn --view front,right   # stacked
bun run prop:map farmhouse --audit         # palette entry by height band
bun run prop:map --all --cols 48           # the whole roster
bun run prop:map --list                    # names only
bun run prop:watch farmhouse               # re-render on save
```

views: `front` `back` `right` `left` `top` `iso`. flags: `--cols`, `--cell`, `--seed`.

`--audit` names the palette entry every baked facet came from and the height band it covers, so *"does `faluDark` appear above the roofline"* is one line of output. two things to know: the match is done in **linear** colour (three bakes the colour attribute out of srgb, and that is a power curve, not a scale — matched in srgb the rust chimney lands in the falu bucket); and the greys — granite, shingle, iron, trim — are near-collinear, so read them as one family.

### `/props.html` — the prop viewer

its own vite entry importing the roster and nothing else from the scene, so it stays loadable exactly when the terrain or the post chain is what is broken.

```sh
bun run dev     # then open /props.html
```

- **bare** — a contact sheet of the whole roster, grouped `placed by hand` / `scattered`, captioned with triangle count and metres, filterable. cards flag any prop whose base is off `y = 0`.
- **`?prop=<name>&seed=<n>`** — four orthographic viewports (top / front / left / iso) with grids, wireframe and bounds.

both are real urls. `esc` returns to the sheet, `1`–`4` solo a pane, `0` restores, `f` frames, `g`/`x`/`w`/`b` toggle grid, axes, wire and bounds.

### `bun run scape:shot` — a still

```sh
bun run scape:shot                                  # one frame, default pose
bun run scape:shot --poses tour                     # 6 frames, one browser launch
bun run scape:shot --rot 30 --zoom 12 --time 0.02
bun run scape:shot --tier ultra --set look.bloom=0
bun run scape:shot --skip post                      # drop the optical chain
```

`tour` is `default`, `near`, `far`, `noon`, `night`, `winter`. `night` pins a week as well as an hour, because the sun runs a seasonal arc and the config opens at a midsummer that has no night in it. every capture prints a line before anything opens the image, and most runs need only that line:

```text
near   ok   6.2s  fps  11.4  draws   77  tris 0.47M  f  43  err 0  -> .scape/shots/near.png
```

three defaults are load-bearing:

- **the tier is pinned, not detected** (`--tier mobile` by default). two stills at two tiers are not a comparison.
- **it renders on swiftshader, not the gpu.** slower, exactly reproducible. `--gpu` trades that back when nobody will diff the result.
- **the shutter waits on a frame count** (`--frames 40`), not a clock. measured: a fixed 900 ms settle gave 50 draws on one run and 108 on the next, because the cloud deck and the mist fade in over *frames*.

`--set a.b=1` reaches any dotted config path — the same paths the overlay and the settings snapshot use — so a knob added to [`config.ts`](src/scene/config.ts) is reachable from a url the day it lands.

**aiming the camera.** every pose in `tour` looks at the middle of the world, and the middle of the world is open sea — so nothing on the ground can be captured by zoom alone. the farmyard is 17 m west of it and the cart track runs out to 44 m. `camera.focusX` and `camera.focusZ` move where the camera opens:

```sh
bun run scape:shot --set camera.focusX=-31 --set camera.focusZ=-1 --zoom 26   # the cart track, close
```

`--set runtime.effects=all` (or `?effects=all` in the browser) builds every effect the scape has on whatever tier is pinned — the only way to photograph the mobile tier with the optical chain, shadows and the aurora on it. expect it to be *slow* under swiftshader: the same pose went from 42 draws to 447 and from seconds to a minute, because the shadow depth pass alone multiplies the draw count. give it `--frames 8` and a small `--size` or the shutter's 30-second budget runs out before the frame count does.

reach for the focus knobs whenever the change is a *ground-level* one — a rut, a doorstep, a fence line, a cobble. at world zoom a sub-metre feature is smaller than a pixel and `scape:diff` will correctly report `same` at all six tour poses whether the feature is right, wrong or missing.

### `bun run scape:diff` — what the change did

```sh
bun run scape:diff --ref origin/main --poses tour
bun run scape:diff --ref-only       # build and photograph only the reference side
bun run scape:diff --clean          # drop the cached ref worktree
```

`--ref-only` is the head start, and `bun run setup` fires it in the background at the start of a run. the reference half — checking out another commit, building it,
and photographing six poses through a software rasteriser — depends on nothing the run is about to write, so it can finish while the change is still being authored.
a later `--ref` run reuses it and does only the half that depends on the change: **40 s against several minutes.**

it warms the **tour** by default rather than the single default pose, because that is what stage 5 asks for; a cache of the wrong six pictures is correctly rejected
and rebuilt, which is a head start that costs exactly as much as no head start.

the reuse is keyed on the commit, written to `.scape/ref-shots/.ref-sha` beside the images. shots on disk say nothing about what they are shots *of*, so without
that a run reuses whatever the last one happened to leave behind. a mismatched sha, or any missing pose, rebuilds.

builds the reference in a detached git worktree, serves both, captures the same poses through both, prints a table. an image is written **only** for a pose that moved past `--threshold`. the `structural:` line runs `scape:map --json` on both sides, tolerates the older single-island json shape, and compares landmasses, jetties, waterways and fleet safety when present.

noise floor, measured: two captures of the same commit differ in ~14% of pixels by 1–2 levels, and **0.00%** at the default tolerance. a zero means zero.

`.scape/` holds every artefact and is gitignored.

---

## the gate

one command, and it is all four:

```sh
bun run gate        # lint, typecheck, test, build — concurrently, one summary
```

```text
gate · 16.8s

lint       ok      2.1s
typecheck  ok      1.5s
test       ok     16.8s
build      ok      1.9s
```

nothing in the gate contends with anything else in it — no test opens a port, spawns a process or launches a browser, and `vite build` only ever *writes* `dist/`, which none of the others read — so they run at once. the wall clock is the slowest one rather than the sum, and a clean run is four lines instead of four screens. **only a failure prints its output**, and it prints all of it.

`--only lint,test` runs a subset. `--sequential` is the escape hatch for a one- or two-core box, where four cpu-bound processes thrash worse than they parallelise. `--fast` drops `build`'s redundant second `tsc` pass and is off by default: the moment this stops running the exact command CI runs is the moment "gate green, ci red" becomes possible.

the four underneath are still there, still in this order, and still all clean before anything is pushed:

```sh
bun run lint        # eslint --max-warnings 0; a warning is a failure
bun run typecheck   # tsc --noEmit
bun test            # bun test
bun run build       # tsc --noEmit && vite build
```

`bunx eslint . --fix` first, then read the diff it produced. do not hand-format against [`@tuomashatakka/eslint-config`](https://www.npmjs.com/package/@tuomashatakka/eslint-config): no semicolons, single quotes, two-space indent, value-aligned object keys, stroustrup braces, spaces inside braces and brackets, two blank lines after the import block.

the size limits it enforces, as actual numbers rather than as a feeling: **40 statements** per function, **cyclomatic complexity 14**, **max depth 6**, and **666 lines per file** counted with comments and blank lines skipped. every one is a warning, and the gate is warning-clean, so in practice every one is an error. a file or a function past one of them is telling you to split it.

three more live in [`eslint.config.mjs`](eslint.config.mjs) rather than in the shared config, because they are this scape's rules and not style: **no `Math.random`, no `Date.now`, no `requestAnimationFrame`** anywhere in `src/`. each fails with the reason and with the thing to reach for instead.

other scripts: `bun run dev` (vite on 127.0.0.1:4174), `bun run preview`.

---

## url overrides

on the running page — useful on a device you cannot attach a debugger to:

| param | does |
| --- | --- |
| `?debug` | adds calls and triangles to the always-visible fps, xyz and zoom readout, and opens the card whatever was last chosen |
| `?tier=minimal\|mobile\|desktop\|ultra` | forces a tier past detection *and* past tier memory |
| `?post=0\|1` | forces the optical chain either way |
| `?set=look.bloom=0,daylight.time=0.5` | any dotted config path, comma separated |
| `?skip=water,mist,beacon,…` | leaves a whole family out — the list is `SCAPE_FAMILIES` in [`audit.ts`](src/scene/audit.ts) |

---

## the codebase, by what you would be changing

### a prop

`src/scene/props/*.ts`. every builder is `(rng: SeededRng, palette: NordicPalette) => BufferGeometry` — no scene, no gl, no module state, base at `y = 0`. that purity is what makes `prop:map` and the headless tests possible; keep it.

register in [`props/index.ts`](src/scene/props/index.ts) and put the name in `HERO_PROPS` (merged into the single steading draw) or `SCATTER_PROPS` (one `InstancedMesh`) deliberately.

the primitives themselves — `box`, `cyl`, `cone`, `ball`, `hedron`, `plank`, `blade`, plus `deg` and `spread` — come from `threejs-scene/modules/assets`. `hedron` is the flat-facetted polyhedron; `createRockGeometry` in the same barrel is the one with noise displaced into its surface.

| file | holds |
| --- | --- |
| `palette.ts` | the nordic colour vocabulary |
| `timber.ts` | cladding, gables, roofs, dormers, windows — **and the roof-plane rule** |
| `buildings.ts` | farmhouse, barn, sauna, aitta, woodshed |
| `structures.ts` | jetty, well, hay rack, gate, bridge, cart |
| `shore.ts` | boathouse and slipway, net rack, mooring stakes |
| `upland.ts` | meadow barn, hay drying poles |
| `mill.ts` | the post mill and its trestle, plus the sail wheel — **the one geometry not based at `y = 0`** |
| `beacon.ts` | the lighthouse tower, and the optic — a halo plus two crossed, vertex-graded fans per panel |
| `vegetation.ts` | spruce, pine, birch, grass, reeds, crops |
| `stone.ts` | erratics, field stones, cobbles, cairns |
| `objects.ts` | hollow clinker rowboat, bales, firewood, barrel, mailbox, driftwood |
| `fence.ts` / `wall.ts` | ground-following runs — take a polyline, not an rng |
| `ploppable.ts` | 2d placement with a ground-following foundation |
| `material.ts` | the two shared materials, cloud shadow, wind, soil grain, wetness, snow |

**the roof-plane rule**: a gabled roof is a *plane*, and every other part of the building either lands on it or stays under it. `roofUnderside(roof, across)` is that plane and it is exported so a building asks rather than re-derives. two descriptions of one plane is one description too many — that is exactly the bug that put dark red blocks across every roof in the scape.

### the composition

`src/scene/landscape/*.ts`. **the local resolution order is load-bearing and lives in [`survey.ts`](src/scene/landscape/survey.ts)** — layout → height → steading → landings → network → footpaths. [`archipelago.ts`](src/scene/landscape/archipelago.ts) then projects the three finished local surveys into one world before planning ports and waterways. paths answer to the *levelled* yard and the *carved* beck, not to raw fBm; routes answer to the composite seabed, not to one island's local field.

| file | holds |
| --- | --- |
| `archipelago.ts` | local surveys projected into one field, path set and port set — **the tools' entry point** |
| `survey.ts` | one island's pure local composition, before anything is drawn |
| `layout.ts` | yard, cart track, field plots, ridges, pasture, mill, `sinkToIsland`, `yawAlong` |
| `height.ts` | authored ground, islets, beck, fbm underneath |
| `steading.ts` | where the buildings stand, `faceToward`, `doorstepOf` |
| `landing.ts` | one local shoreline, with an open-sea jetty and harbour |
| `path.ts` | polyline smoothing and queries — reuse these, do not re-derive them |
| `network.ts` | the farm's street plan: waypoints, spanning tree, shortcuts |
| `footpath.ts` | tracing a planned leg into a worn line, and the wear query |
| `waterway.ts` | world ports, water-only route search and hull clearance |
| `boat-motion.ts` | synchronized legs, early jetty waits, seven-second dwell and bounded turns |
| `boats.ts` | one dynamic `InstancedMesh`, plus stable live pose and wake records |
| `creek.ts` | the beck: descent trace, channel, tidal mouth |
| `beacon.ts` | the outermost rock broad and dry enough to carry a light, and the footing probe that proves it |
| `mill.ts` | the exposed shoulder a windmill stands on, and the doorstep at the foot of its stair |
| `mill-sails.ts` | every mill's wheel in one dynamic `InstancedMesh`, geared off `wind.strength` |
| `terrain.ts` | shared archipelago geometry, height/slope banded colour, path wear painted in |
| `water.ts` | baked bathymetry, swell, foam, glitter, winter ice and shader boat wakes |
| `samplers.ts` | where the dressing throws its darts — island, disc, tread |
| `dressing-zones.ts` | world-space keep-outs and pure scatter acceptance rules |
| `dressing-helpers.ts` | hand-placed runs and helpers shared by each holding |
| `dressing.ts` | placement, hero merge, instanced scatter |
| `index.ts` | the scene module, and what raycasts |

**a yaw is not a bearing.** `rotateY(θ)` carries a prop's front (local `+z`) to `(sin θ, cos θ)`; a compass bearing points at `(cos a, sin a)`. they are reflections and agree on exactly one diagonal, which is why getting it wrong survives for months. use `faceToward(from, to)` for props and `yawAlong(bearing)` for anything laid along a line.

the runtime fleet does not use the survey's old fixed offsets as an animation clock. `boat-motion.ts` advances one shared leg schedule: short crossings wait for the final arrival, then all three boats share a seven-second dwell. its separation audit includes those stationary intervals. `boats.ts` owns the authoritative damped bearing and stable pose/wake records; camera and water consumers read them rather than resampling the route and quietly disagreeing.

### interaction and live diagnostics

the pointer bookkeeping — capture, live pointers, the pinch frame, tap detection — is `attachPointerGesture` from the runtime. what stays here is only what this scape *means* by a gesture: pan, orbit on a modifier latched at the press, pinch to zoom and pan at once, tap to open somewhere. the press is where the latch is taken and where the canvas takes focus, because a press is intent before it is a drag.

`camera-controls.ts` raycasts the fleet before the terrain. selecting an instance hands its stable pose to `camera-follow.ts`, which resolves one allocation-free orthographic third-person target at a 22-metre view; escape, terrain or empty-space selection, and pan or rotation drags clear it. **do not put a second boat simulation in the camera.** manual direct manipulation must also remain an explicit exit from any future follow mode.

`vitals.ts` is the only frame measurement. `ui/fps-meter.ts` shows fps, milliseconds, camera xyz and orthographic `viewSize` in metres on every sample; `?debug` adds calls and triangles. extend that sample if another always-visible diagnostic is needed rather than adding another timer or polling the camera elsewhere.

### an atmospheric system

`src/scene/*.ts` — `atmosphere.ts`, `mist.ts`, `clouds.ts`, `aurora.ts`, `rain.ts`, `beacon.ts`, `post.ts`, and the three clocks `daylight.ts` / `season.ts` / `weather.ts`. composed in [`create-isometric-scape.ts`](src/scene/create-isometric-scape.ts).

anything mounted *after* `atmosphere.module` sees this frame's day; anything before it sees the last one's. that is the whole reason the coastal light is a layer here rather than part of the landscape that surveys it — `beacon.ts` reads `daylight.day` and the landscape publishes `lanternHubs` for it.

the clocks are coupled, and in one direction each: the weather takes the year and decides how hard this week's precipitation falls, and the day takes the year and solves the sun's arc for it — `daylight.sample(time, year)`. so **the day's sky is a function of the week**, and `daylight.latitude` at 68°N means midwinter has no daylight in it and midsummer no night. anything reading the darkness of the sky reads `daylight.dark` (astronomical twilight, geometry) rather than a curve of the year.

shared atmosphere has four scale measures and they are not interchangeable: sheet/deck reach follows `archipelago.worldSize`, cloud and aurora composition follows `camera.maxViewSize`, rain and upright mist follow the live `viewSize`, and genuine metre features such as the 79-metre mist tile stay in metres. audit all four when the world or camera grows; swapping `terrain.size` for `worldSize` everywhere is how one fixed bug becomes four fresh ones, uwu.

### a knob

[`config.ts`](src/scene/config.ts) is the public tuning surface. **if it is visual and read per frame**, add a dotted path to [`ui/scape-controls.ts`](src/ui/scape-controls.ts) and it persists, resets and becomes url-addressable for free. **if it needs a rebuild to be seen** (`archipelago.*`, `layout.*`, `creek.*`, `footpath.*`, `dressing.*`, and every `boats.*` field except `speed`) leave it out of the overlay — a slider that lies about what it does is worse than no slider.

there is **no `enabled` flag anywhere**: an effect is off when its strength is zero.

---

## house rules that are not style

- **draw calls are the budget, vertices are not.** a prop with four hundred parts and one with forty cost the same draw. a *new material*, or a *new mesh that is neither merged nor instanced*, is what costs.
- **everything generated is deterministic.** no `Math.random`, no `Date.now`, no iteration-order dependence. fork the seeded rng (`rng.fork(name)`) so adding a prop does not reshuffle every prop built after it.
- **anything that moves needs a speed that can reach zero**, and that speed goes in `STILL` in [`scripts/scape-shot.ts`](scripts/scape-shot.ts). a hard-coded animation rate cannot be stopped, so it cannot be captured, so it silently poisons every visual diff taken after it lands. [`scape-shot.test.ts`](scripts/scape-shot.test.ts) checks this rather than trusting it: the candidates are read off the *overlay*, which is the authoritative "visual and read per frame" set, and a rate-named knob missing from `STILL` fails by name. it checks the quieter direction too — that every `STILL` entry still addresses a live config path — because a rename turns an entry into a no-op that still reads as coverage.
- **moving state has one owner.** expose stable allocation-free pose records to cameras, wakes and diagnostics; never let each consumer resample the same route with its own turn or dwell rules.
- **every tier still has to run.** new cost is gated on `AtmosphereQuality` in [`quality.ts`](src/scene/quality.ts); `mobile` is the one to defend. if a system cannot be made cheap, give it a tier gate and a graceful *absence*, not a broken-looking cheap version.
- **lifecycle discipline.** generation in `build`, animation in `update`, viewport work in `resize`, teardown in `dispose`. `createApp` owns the only render loop — never add a `requestAnimationFrame`. everything allocated on the gpu is released in `dispose`.
- **tests come with the change.** new pure builders and new pure maths get a determinism test in the neighbouring `*.test.ts`. rendering code is not unit-tested here, so keep the logic that *can* be tested out of the parts that cannot.

---

## threejs-scene

the runtime. an imperative app shell — `createApp(canvas, options)` plus a module contract — with a deterministic clock, a seeded rng, unidirectional state flow and a strict dispose chain. [npm](https://www.npmjs.com/package/threejs-scene).

```ts
import { createApp, defineModule } from 'threejs-scene'

const module = defineModule<State>({
  name: 'thing',
  build (ctx)                { /* create objects once, add to ctx.scene */ },
  update (state, frame, ctx) { /* project state onto them, every sim tick */ },
  resize (size, ctx)         { /* optional */ },
  render (frame, ctx)        { /* optional — the last mounted one owns the draw */ },
  dispose ()                 { /* optional */ },
})
```

state flows down (`store → module.update → scene`), input flows back through `setState`/`dispatch` — never straight into scene objects. same seed + same tick sequence reproduces the same world, headless included.

**in this repo the state *is* `SCAPE_CONFIG`.** `createApp<ScapeConfig>(canvas, { state: config })`, so the scape's tuning surface and the store's state are the same object, and there is exactly one of it. two rules follow, and both are enforced by the compiler rather than by remembering them:

- **anything that outlives a tick takes `LiveConfig`, never a `ScapeConfig`.** `LiveConfig` is `() => ScapeConfig`. the store commits a *new* object on every write, so a section destructured at build time and read every frame is a section frozen at whatever it held before the reader touched a slider. a factory that reads per frame takes the reader and calls it; a pure builder called once takes the config and is handed `config()`. getting this backwards is a type error, not a bug.
- **every write goes through [`config-access.ts`](src/scene/config-access.ts).** it knows whether the scape has mounted — before that a write is the next version of a plain object, after it the app's store is the single writer. [`state-path.ts`](src/scene/state-path.ts)'s `withPath` is `writePath` with structural sharing, so setting `look.bloom` copies two objects and keeps the other eighteen.

**a capture cannot check either of these.** `?set=` is applied before the scape mounts and nothing in the harness drives the overlay, so a module that stopped answering after build would photograph identically at every pose. the liveness tests in [`config-access.test.ts`](src/scene/config-access.test.ts) are what actually check it: move a knob *after* the thing was built, and assert the thing noticed.

### what this repo imports

| entry | used for |
| --- | --- |
| `threejs-scene` | `createApp`, `defineModule`, `createSeededRng`, `createRenderer`, `createIsoCamera`/`resizeIsoCamera`, `createStore`, `createLUT`, `createSeamlessNoiseTexture`, `smoothstep`, `hash2`, `valueNoise1d`, `readPath`/`writePath`/`readNumberPath`/`readTextPath` |
| `threejs-scene/modules/lighting` | `standardLighting()` |
| `threejs-scene/modules/post` | `postProcessing()`, `createAo`, `createSsr`, `createTraa` |
| `threejs-scene/modules/post/webgl` | the individual effect passes |
| `threejs-scene/modules/assets` | `part`, `mergeParts`, `mergeGeometryList`, `kitMaterial`, `markShared`, `scatterInstances`, `createPlacementField`, `applyBend`/`applyTaper`, `createRockGeometry`, the primitives (`box`, `cyl`, `cone`, `ball`, `hedron`, `plank`, `blade`, `deg`, `spread`), `createSurfaceRibbon`, `rasterizeAscii`/`auditPalette`/`ASCII_VIEWS`/`ASCII_SHADES`, `createNoiseTexture`/`createSeamlessNoiseTexture`, `Prop` |

**this repo is where several of those came from.** the ascii rasteriser, the surface ribbon, the primitives, `valueNoise1d`, the dotted-path readers and `disposeMesh` were all written here first and pushed up in `0.5.0`. generic machinery belongs in the runtime; if a helper has to know about *this* archipelago, it stays in `src/`.

### `modules/assets`, the parts this scene lives on

- **`part(geometry, { at, rotate, scale, color, jitter, rng })`** transforms a primitive and bakes one jittered shade per triangle. transform order is **scale → rotateX → rotateY → rotateZ → translate**.
- **`mergeParts(parts, { grime })`** collapses them through three's own `BufferGeometryUtils` into one non-indexed vertex-coloured geometry, and darkens toward the base. that darkening is free baked ambient occlusion and most of what makes a prop feel placed rather than floating.
- **`kitMaterial(options)`** is the one material the whole kit shares. one material, one program, no state change between props.
- **`scatterInstances({ geometry, material, count, place })`** stamps one `InstancedMesh`. `place()` returns `{ at, rotate, scale, tint }` or `null`.
- **`createPlacementField({ rng, extent, heightAt, minHeight })`** is the keep-out solver. **test your own rules first and only `reserve()` an accepted spot** — `place()` claims the moment its own query passes, so a caller that then rejects on a slope test leaves a claim blocking everyone else, and a few hundred of those saturate the field with nothing in it.
- **`markShared(resource)`** exempts a pooled resource from a `Prop`'s ownership, so `dispose()` does not blank a neighbour's material.
- **`createSurfaceRibbon({ path, across, step, heightAt, centreAt, colorAt })`** lays an open strip along a polyline and drapes it on a surface. the cart ruts are two of these off one centreline, merged. sample the surface *as drawn*, not the height field — see the note in [`cart-ruts.ts`](src/scene/landscape/cart-ruts.ts).
- **`rasterizeAscii(geometry, { view, cols, cell })`** and **`auditPalette(geometry, palette)`** are what `prop:map` is built on. both read `position` as a triangle soup, which is exactly what `mergeParts` emits.

the module also carries an llm prop-authoring dialect (`buildProp`, `validatePropSpec`, `reviewProp`, `createPropTool`, `generateProp`), procedural materials and textures, and an `ASSET_MANIFEST`. this scene does not use them — it builds its props from primitives on purpose — but they are there.

### also available, unused here

[`threejs-scene-api.md`](threejs-scene-api.md) lists every export and whether this scape uses it. most of the unused surface is simply unused. these are the ones that
look like obvious wins and are **not** — each was tried or measured, and each would cost more than it returns. do not re-open one without a reason that is not on
this list.

| export | why not |
| --- | --- |
| `modules/physics` | an optional `cannon-es` peer. a real dependency decision, not a convenience |
| `createFollowCamera` | a damped *perspective* chase rig; this scape is orthographic and has its own follow in [`camera-follow.ts`](src/scene/camera-follow.ts) |
| `attachResizeObserver` | watches the canvas's *parent*, and syncs perspective cameras. the quad view watches the canvas and has four orthographic frustums |
| `disposeScene` / `disposeMaterial` | dispose indiscriminately. this scape pools materials through `markShared`, so per-module teardown is the correct instrument |
| `createInfiniteGround` | an endless tile grid. the scape is a bounded archipelago with an authored heightfield |
| `reviewProp` | three of its five checks need more than one mesh, and this kit merges every prop into one geometry. the two that do work — base height and scale — are already asserted in [`props.test.ts`](src/scene/props/props.test.ts) with thresholds tuned to this scape, not to a generic prop |
| `createDof` | real depth-of-field, and `look.tiltShift` is already a screen-space blur banded on the focus line. two blurs fight, and three's `BokehPass` is written for a perspective camera |
| `createLensflare` | not a post pass at all — a scene object needing caller-supplied sprite textures. this scape is procedural and DOM-free on purpose |
| `createChromaticAberration` | the grade pass already carries chromatic aberration |
| `createFXAA` / `createSMAA` / `createSsaa` | antialiasing is chosen per tier and overridden by `?aa=` |
| the hand-built props, `kitProp`, `defineProp` | this scene builds from primitives on purpose |
| `createMotionBlur` | ortho-safe, and the depth texture it needs already exists on `desktop`/`ultra` — but pan is the *primary* gesture on a map-like camera and the rig auto-revolves at rest, so it would blur exactly the frames that have to stay legible, and blur a tableau meant to read as still |
| `createOutline` | its only job here would be marking the boat `camera-follow.ts` tracks, and **the threshold is the instrument** — a followed hull can be overdriven past 0.94 the way `beacon.glow` is, for no new pass and no new render target. an extra masked render plus a separable blur to draw a game-HUD affordance in a scene that has none |
| `createRadialBlur` | its own source says it "ignores 3D depth… not physically correct lighting". the depth-aware `createGodRaysPass` is already wired on the tiers that have a post chain, and `mobile` has none at all — so there is no tier where this is the right tool for a job nothing else does |
| `createAfterimage` | whole-frame feedback. smears boats, mill sails, aurora and rain into arcade echo trails |
| `createLensingPass` | a gravitational-lens warp with an optional dark core. no naturalistic reading on a nordic coastline |
| `createStereoRenderer` | "both anaglyph and stereo modes bypass EffectComposer" — it cannot coexist with AO, SSR, bloom, grade or the LUT at all. a hard incompatibility, not a taste call |
| `createHudBeamTransition` | a transient UI reveal-wipe, not an atmosphere pass. there is no `look.*` strength for it to be |
| `createCrtPass`, `createRetroPass`, `createPixel`, `createSobel`, `createBurnInPass`, the glitch trio | retro and synthetic by design. this scape is naturalistic and painterly; they fight the look categorically |
| `createBloom` (the standalone) | redundant — `postProcessing()`'s own `bloom` option already builds the `UnrealBloomPass` this scape tunes at 0.94 |

| `createSelectiveBloom` / `createEmissiveBloom` | a two-composer technique that renders the scene **twice** per frame, and its bloom buffer is not reachable without its own final composer. the whole-frame bloom here already has a **0.94 threshold** tuned above the fog, so a light only has to be bright enough to cross it — see `beacon.glow`, which is that idea and costs no extra draw |

**the threshold is the instrument.** `look.bloom` blooms whatever exceeds 0.94 in linear luminance and nothing else, which is why the night sky stays dark while
the beacon's lamp glows. anything that should glow should be *made bright enough to cross it*, not given a pass of its own. a vertex colour cannot do that —
`bakeFacetColors` clamps to 0..1 — so overdrive the material colour, as `scene/beacon.ts` does.

---

## traps that have already cost time

1. **`setViewport`/`setScissor` apply the renderer's pixel ratio themselves.** scaling again squares it, and on retina every pane becomes the full canvas.
2. **the baked `color` attribute is linear.** palette matching must convert swatches out of srgb first or the power curve swaps rust iron and falu red.
3. **an id selector beats any number of classes.** `#preview-canvas` (1-0-0) outranks `body[data-mode='index'] .single-only`, so a "hidden" element stays laid out and pushes content off screen — dom correct, nothing visible. debug layout by reading `getBoundingClientRect().top`, not by staring at the screenshot.
4. **the favicon 404 logs as a console error.** filter it or every capture reads as broken.
5. **`page.clock.install` breaks screenshots.** freezing rAF freezes the compositor and the shutter waits for a frame that never arrives. the capture tools zero every speed in the config instead.
6. **one webgl context per page, and browsers cap you near 16.** `dispose()` frees resources but leaves the context *attached*; `forceContextLoss()` is what actually returns it.
7. **a budget is a count, not a density.** growing the island without growing the budgets thins everything standing on it.
8. **things sized in metres do not survive a change of scale.** express constants against `terrain.size` unless they are genuinely metres.
