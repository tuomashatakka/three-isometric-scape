# three-iso

a small, production-minded starter for building an isometric scape with vanilla three.js and [threejs-scene](https://www.npmjs.com/package/threejs-scene). it borrows the public-viewer interaction language from playworld’s `/world/` route without carrying over chat, persistence, schemas, tools, or world-authoring runtime.

## start

```sh
bun install
bun run dev
```

open [http://127.0.0.1:4174](http://127.0.0.1:4174).

other project checks:

```sh
bun run lint
bun run typecheck
bun test
bun run build
bun run preview
```

## what is included

- a deterministic procedural heightfield with editable seed, scale, waterline, and palette
- a mainland farmstead on a warped, non-circular coastline, ringed by fifteen offshore islets, landscape only, never built on
- a working boat harbour: a boathouse on piles with a slipway, a net rack, and stakes in the shallows
- footpaths worn between the places the farm actually goes — traced as desire lines over the ground as built, painted into the terrain it crosses, and kept clear of grass and stone without costing a draw call
- a beck traced downhill from a spring on the high ground, carved through the terrain and flared at the shore into a tidal inlet the lake fills by itself — no extra draw call, no extra material
- a full day/night cycle: sun arc, dusk and night palettes, and a scrubbable clock
- a seasonal axis running alongside it: grass and leaves wither and turn, and snow lies on what faces the sky above the snow line — all of it derived from the midsummer palette, none of it a rebuild
- view-reactive linear fog, a matching gradient sky, deterministic drifting ground mist, and a sky cloud deck
- sea smoke standing on the open water for the weeks the air has taken the winter and the sea has not — derived from the gap between those two curves, and drawn only while it exists
- an aurora over the dark half of the year — additive veils above the cloud deck, gated on the night and on how much night the week has, and absent from the sky the rest of the time
- a live graphics overlay that persists to local storage and reloads what you left it at
- a configurable 3d-lut grade with vignette, miniature tilt-shift, desktop bloom, and film grain
- mobile and desktop atmosphere budgets selected from pointer, viewport, and pixel-density signals
- phone tiers skip hardware shadow maps, avoiding the hidden mesh-depth pass that firefox rejects on the pixel 10 while keeping cloud shadow and direct-light shape
- a scape that survives a lost webgl context: it rebuilds itself one tier cheaper rather than asking you to reload, and remembers the verdict so the next load starts there instead of earning it again
- a compact mobile post chain that keeps the colour grade and tilt-shift while leaving bloom, grain, and hardware shadows to desktop
- an on-page diagnostics log — tier signals, gpu, frame stalls, gl errors, whatever three said on its way down — because a phone has no devtools. it survives a reload, so a crash does not destroy its own record
- url overrides for testing on the device you cannot attach a debugger to: `?debug` adds live vitals, `?tier=minimal|mobile|desktop|ultra` forces a tier past detection and past memory, `?post=0|1` forces the optical chain either way
- one terrain draw, one water draw, two instanced tree draws, and one instanced rock draw
- an orthographic dimetric camera built with `threejs-scene`
- click or tap focus with an eased landing and automatic revolution
- pointer rotation, modified/right-button panning, wheel zoom, two-finger pan and pinch
- complete keyboard equivalents and a visible canvas focus state
- responsive semantic html with coarse-pointer and reduced-motion behavior
- relative vite asset paths, suitable for a github pages subroute
- deterministic unit tests plus the current `@tuomashatakka/eslint-config`

there is deliberately no chat surface, llm schema, prop authoring tool, or hidden app service. the only persisted state is the graphics overlay's own snapshot, under one key. this is the visual/runtime floor for a new isometric project.

## shape the scape

the intended first edit is [`src/scene/config.ts`](src/scene/config.ts). `scape_config` owns:

- the deterministic world seed
- terrain extent, resolution, amplitude, and waterline
- the offshore islets, as fractions of the terrain half-extent
- the beck's channel width, how deep it cuts, how far the mouth is dredged, and how much it flares
- the footpaths: tread width, verge, how hard a route works to keep off a climb, and how bare the treads get
- tree and rock instance budgets
- initial camera framing and zoom limits
- the clock: cycle speed, phase, the sun's bearing and noon height, and the dusk/night tints
- fog density and breathing, mist amount and wind, cloud cover and ceiling, auroral brightness, ceiling and drift, sky gradient, and the complete noon light rig
- lut recipe, grade strength, vignette, grain, bloom, and tilt-shift strength
- the complete scene palette

terrain generation lives in [`src/scene/noise.ts`](src/scene/noise.ts). the sampler is pure: a coordinate, seed, and amplitude always produce the same height. that keeps surface geometry, raycast focus, and instance placement in agreement.

[`src/scene/landscape.ts`](src/scene/landscape.ts) owns the physical scape. atmosphere is split into [`atmosphere.ts`](src/scene/atmosphere.ts), [`mist.ts`](src/scene/mist.ts), and [`post.ts`](src/scene/post.ts), so depth haze, transparent weather, and fullscreen optics each keep an independent gpu budget and disposal path. compose future systems in [`src/scene/create-isometric-scape.ts`](src/scene/create-isometric-scape.ts):

```ts
const app = createApp(canvas, {
  use: [
    standardLighting(),
    landscape.module,
    weatherModule,
    controls,
  ],
})
```

keeping generation in `build`, animation in `update`, resize work in `resize`, and cleanup in `dispose` prevents parallel render loops and orphaned gpu resources.

## controls

| input | action |
| --- | --- |
| click or tap | ease to the selected surface point, then revolve around it |
| primary drag or one-finger drag | pan |
| shift-drag, ctrl-drag, middle-drag, or right-drag | rotate |
| two-finger gesture | pan and pinch-zoom together |
| wheel | zoom |
| arrow keys | pan |
| shift + left / right | rotate |
| shift + up / down, + / − | zoom |
| escape | stop automatic revolution |
| h | hide or show the card in the top-left corner |

pan is the primary gesture because on a map, dragging means *move the map* to everyone who has ever used one; orbiting is the specialist verb and takes the modifier.

**tilt is not an input.** it is a function of the zoom — pushed in you get a low, near-horizontal, cinematic angle, pulled out you get the map. dragging elevation is how a view ends up under the waterline or staring straight down by accident, and the right elevation is fully determined by how close you are anyway. binding one to the other removes a control and improves every frame it used to produce.

every motion — drag, wheel, tap, keypress, the idle revolution — writes only to a *target* pose. one exponential integrator in `update` chases it, so there is no per-verb tween and nothing can move the camera without being eased.

with `prefers-reduced-motion: reduce`, the integrator snaps rather than eases and selecting a place does not start a revolution.

## deployment

`vite.config.ts` uses `base: './'`, so built assets resolve relative to whatever github pages route contains the app.

```sh
bun run build
```

publish the generated `dist/` directory to the desired pages path. for a project page this is normally `https://<owner>.github.io/<repository>/`; for a nested site route, copy `dist/` into that route’s deployment artifact.

## the enhancement run

the scape is grown by a scheduled, unattended llm run. [`instructions.md`](instructions.md) is its standing brief: pick one theme, build it under the draw-call, determinism and lifecycle rules the rest of this readme explains, prove it with `lint`, `typecheck`, `test` and `build`, then open a pull request and merge it once [`pr-checks.yml`](.github/workflows/pr-checks.yml) is green. every pull request into `main` runs those same four checks, whoever opened it.

## debugging the scape

the enhancement run is unattended, and stage 5 of its brief asks it to *look at* what it built. it cannot. these
three commands are what it looks with instead, and they are ordered by what they cost to read.

**`bun run scape:map`** draws the whole composition as ascii — ground, beck, footpaths, cart track, the steading,
the landings — and then says in numbers what a picture cannot. it needs no browser, no gpu and no dependency,
because [`landscape/survey.ts`](src/scene/landscape/survey.ts) is pure: the ground, the farm, the landings and the
routes worn between them all resolve without a vertex being built. the whole survey takes about seven
milliseconds, and sampling a ninety-six by forty-eight grid on top of it about nine more.

```sh
bun run scape:map                 # grid and stats
bun run scape:map --stats         # the numbers alone, about a hundred words
bun run scape:map --seed 999      # a different island
bun run scape:map --window 40,-20,60   # crop to the harbour
bun run scape:map --json          # for scripting
```

the stats block is the part that earns its keep. a beck that failed to trace, an island that drowned, a pasture
that never found room and a set of footpaths that collapsed to nothing are all *invisible* in a still at the
default pose, and all of them are one field here.

**`bun run scape:shot`** photographs it. the pose, the clock, the year and the tier all come off the command line
and go in through `?set=`, which addresses knobs by the same dotted paths the graphics overlay and the settings
snapshot already use — so a knob added to [`config.ts`](src/scene/config.ts) is reachable from a url on the day it
lands, with nothing wired for it.

```sh
bun run scape:shot --poses tour   # the six frames stage 5 asks for, one browser launch
bun run scape:shot --rot 30 --zoom 12 --time 0.02
bun run scape:shot --tier ultra --set look.bloom=0
```

`tour` is `default`, `near`, `far`, `noon`, `night` and `winter` — both zoom extremes and across the day, which is
exactly what the brief asks for and where most of this scape's historical bugs lived. every capture prints a line
before anything opens the image:

```text
near         ok          5.3s  fps  15.7  draws   50  tris 0.20M  f  43  err 0  -> .scape/shots/near.png
```

most runs need only those lines. console errors, a lost context and a scape that never reached its first draw all
show up there, and a run that reads them has already learned the thing an image would have told it.

three defaults are load-bearing and worth knowing about:

- **the tier is pinned, not detected.** `readQualitySignals` answers from cores, pointer and viewport, so an
  unpinned capture picks a different tier on a laptop than on a build box — and two stills at two tiers are not a
  comparison, they are two different scapes.
- **it renders on swiftshader, not the gpu.** software rasterisation is slower and exactly reproducible. a real
  adapter draws the same frame differently from one machine to the next, which turns every diff into an argument
  about how much noise counts as noise. `--gpu` trades that back when nobody is going to diff the result.
- **the shutter waits on a frame count, not a clock.** this one was measured rather than assumed: settling for a
  fixed nine hundred milliseconds produced fifty draw calls on one run and a hundred and eight on the next,
  because the cloud deck and the mist fade in over frames and the machine draws a different number of them each
  time. `--frames 40` is the same everywhere.

**`bun run scape:diff`** says whether the change moved anything, and reports numbers before it reports pictures.

```sh
bun run scape:diff --ref origin/main --poses tour
```

it builds the reference in a detached git worktree, serves both builds statically, captures the same poses through
both, and prints a table. a diff image is written **only** for a pose that moved past `--threshold`, so an
unchanged run costs a few lines and a changed one points straight at the frame worth opening. the `structural:`
line runs `scape:map --json` on both sides, which catches a world-model regression that no single pose would show.

the reference worktree is cached under `.scape/ref`, because building one is the slowest thing either tool does
and comparing against `origin/main` twice in an afternoon should pay for it once. `bun run scape:diff --clean`
gives them back.

a git ref rather than a stored baseline is deliberate: an unattended run starts from a fresh clone with no
`.scape/` in it, so a baseline-file design fails on the exact workload it exists for. `--accept` and a bare
`scape:diff` give the baseline flow anyway, for iterating inside one session.

the noise floor was measured, not guessed. two independent captures of the same commit differ in about fourteen
per cent of their pixels by one or two levels — float ordering in the post chain — and in **nought point nought
nought per cent** at the default tolerance. a zero means zero.

`.scape/` holds all of it and is gitignored.

## project map

```text
src/
├── main.ts                         browser entry and accessible status
├── style.css                       full-viewport responsive shell
├── ui/
│   ├── diagnostics.ts              the log, printed where a phone can read it
│   ├── fps-meter.ts                the frame counter in the bottom-left corner
│   ├── graphics-panel.ts           the overlay, built from real form elements
│   ├── overlay-state.ts            whether the card was last left hidden
│   ├── scape-card.ts               the card in the top-left, and its handle
│   ├── scape-controls.ts           which config paths it exposes, in sections
│   └── settings-store.ts           local-storage snapshot of those same paths
└── scene/
    ├── atmosphere.ts               gradient sky, linear fog, sun and fill rig
    ├── aurora.ts                   auroral veils over the dark half of the year
    ├── camera-controls.ts          pointer, touch, keyboard, focus, orbit
    ├── clouds.ts                   sky deck, faded in as the view pulls back
    ├── config.ts                   the starter's public tuning surface
    ├── create-isometric-scape.ts   app/module composition root
    ├── daylight.ts                 the clock: sun arc and derived sky palette
    ├── lut.ts                      cached cinematic colour-grade recipes
    ├── mist.ts                     drifting ground-mist sheets, and the sea smoke off the coast
    ├── noise.ts                    deterministic height sampler
    ├── post.ts                     ao, ssr, sun shafts, tilt-shift, lut, bloom, grain, traa
    ├── quality.ts                  minimal/mobile/desktop/ultra gpu budgets
    ├── runtime.ts                  live pixel ratio, frame cap, shadow cadence
    ├── season.ts                   the year: growth, leaf turn, snow, sea ice, sea smoke, night length
    ├── landscape/
    │   ├── index.ts                the scene module, and what raycasts
    │   ├── layout.ts               yard, cart track, field plots, ridges, pasture
    │   ├── steading.ts             where the farm's buildings and well stand
    │   ├── landing.ts              the shoreline the jetty and the harbour are on
    │   ├── path.ts                 route smoothing and polyline queries
    │   ├── survey.ts               the pure composition, before anything is drawn
    │   ├── footpath.ts             desire lines worn between the places above
    │   ├── creek.ts                the beck: descent trace, channel, tidal mouth
    │   ├── height.ts                authored ground, islets, beck, fbm underneath
    │   ├── terrain.ts              geometry, height/slope banded colour
    │   ├── water.ts                baked bathymetry, swell, foam, glitter, winter ice
    │   └── dressing.ts             placement, hero merge, instanced scatter
    └── props/
        ├── index.ts                the roster, hero vs scattered
        ├── palette.ts              the nordic colour vocabulary
        ├── material.ts             shared material, cloud shadow, wind, soil grain
        ├── ploppable.ts            2d placement with a ground-following foundation
        ├── primitives.ts           terse primitive constructors
        ├── fence.ts                continuous ground-following fence runs
        ├── wall.ts                 continuous ground-following drystone walls
        ├── timber.ts               cladding, gable and roof vocabulary
        ├── buildings.ts            barn, farmhouse, sauna, aitta, woodshed
        ├── structures.ts           jetty, well, hay rack, gate, bridge, cart
        ├── vegetation.ts           spruce, pine, birch, grass, reeds, crops
        ├── upland.ts               meadow barn, hay drying poles
        ├── shore.ts                boathouse and slipway, net rack, mooring stakes
        ├── objects.ts              rowboat, bales, firewood, barrel, mailbox, driftwood
        └── stone.ts                erratics, field stones, cobbles, cairns

scripts/
├── args.ts                         the shared command line, and dotted-path overrides
├── browser.ts                      finding a chromium, and serving what it looks at
├── scape-map.ts                    the whole composition as ascii, without a browser
├── scape-shot.ts                   headless stills, posed and pinned
└── scape-diff.ts                   what a change did to the picture, in numbers
```

the renderer uses a device-tier pixel-ratio cap, the scene uses one `createapp` render loop, and the post module is the only frame renderer. the `ultra` tier adds ambient occlusion, screen-space reflections on the lake, anamorphic streaks and a traa resolve; it is only selected for a wide viewport on a many-core machine with a mouse. pointer state is cancelled cleanly; teardown releases geometries, materials, sky, mist, cloud-shadow and bathymetry textures, composer targets, fullscreen passes, and every baked lut. those defaults matter more than squeezing another ornamental system into a starter, tragically enough~ n__n

the touch tier is the one with a hard ceiling to respect. it drops the pmrem room environment — twelve megabytes of rgba16f for an ambient term the hemisphere light already approximates — paces the draw at 30 fps, and sizes the lake to the fog rather than to the map. the loop parks whenever the document is hidden, because a backgrounded phone that keeps drawing is a phone heating up for nobody.

if the gpu takes the context away anyway, that is treated as the device answering a question about its budget: `reduceatmospherequality` steps one tier down, the canvas is replaced with a fresh one — a canvas only ever hands out a single context, restored or not — and the scape rebuilds itself. the `minimal` tier at the bottom of that ladder is never detected into; it gives up the post chain entirely and lets the renderer draw straight to the canvas. once there is nothing left to give up the scape says so rather than looping.

## props

every prop is a pure geometry factory — `(rng, palette) => BufferGeometry` — built from many `part()` primitives and collapsed with `mergeParts({ grime })` into one non-indexed, vertex-coloured geometry with its base at `y = 0`. `applyGrime` darkens each prop toward its base, which is free baked ambient occlusion and most of what makes a prop feel placed rather than floating.

that shape is what keeps the budget honest — detail costs vertices, not draw calls:

- **hero props** are placed by hand at layout anchors and merged into a *single* geometry, so the whole steading plus all its fencing is one draw
- **scattered props** are stamped through `scatterInstances`, one `InstancedMesh` each, with a near-white per-instance tint that varies the shade of a prop without repainting it

[`props/fence.ts`](src/scene/props/fence.ts) and [`props/wall.ts`](src/scene/props/wall.ts) are the exceptions to the factory shape, deliberately. `buildFenceRun` takes a polyline and sets each post at its own ground height, then spans the rails from post to post so they pick up the slope on their own. a fence built from rigid identical segments either floats over dips or, if each segment is tilted to match its own patch of ground, zig-zags where neighbours disagree — real fences do neither. `buildStoneWallRun` follows the same line the same way and puts something else on it: three courses of granite per station, stations set *closer together than a stone is long* so the courses overlap. a wall is only ever a pile that happens to be long, and gaps are what separate one from a row of rocks.

because prop builders never touch a scene or a gl context, the whole roster is unit-tested headlessly: attributes, base height, bounds, and byte-for-byte determinism per seed.

## placement

[`landscape/dressing.ts`](src/scene/landscape/dressing.ts) uses two placement strategies, chosen by what the prop is for.

**structural** props — trees, boulders, bales — go through `createPlacementField`, which owns the claims registry and enforces mutual spacing. the candidate loop lives in `dressing.ts` rather than in the solver: `place()` claims a spot the moment it satisfies the *query*, so a caller that then rejects it on its own rules (a slope test, a ridge-density roll) leaves a claim behind that blocks everyone else. a few hundred of those and the field is saturated with nothing in it. the rules are tested first, and only an accepted spot is `reserve()`d.

**ground cover** — grass, crops, cobbles — uses a plain jittered scatter with no mutual test at all. overlap is invisible at that density, and the solver's spacing check is `O(claims)` per attempt, so routing nine hundred grass tufts through it would cost more than the rest of the build put together.

## sun shafts

`createGodRaysPass` projects the light and disables itself only when the light is *behind* the camera. under an orthographic projection that test almost never fires: the atmosphere models the sun 150 units from the focus, which lands somewhere around ndc y = 3 — permanently off frame, still "in front". the radial march then runs from every fragment toward a point far outside the image and smears the whole sky into a white wash, and any aliased highlight in frame becomes a streak pointing at it.

so the shafts get their own virtual sun in [`post.ts`](src/scene/post.ts): placed a fraction of the frame away along the real sun direction, clamped just past the frame edge, and faded to nothing as it leaves the view. the direction is honest — it is taken live from the atmosphere's sun — but the distance is a framing decision, because an orthographic camera has no vanishing point to inherit one from.

the same class of bug is why the water's ripple map carries mipmaps: a 128px noise texture sampled at roughly one texel per pixel aliases into a field of bright specks, and the ray pass turns every speck into a streak.

## the graphics overlay

a panel on the right edge exposes the scene's optics, daylight, atmosphere, mist, water, ground and camera tilt, with a switch per effect and its parameters nested underneath. it collapses to a handle, starts collapsed on touch and narrow viewports, and resets to the authored values.

the thing worth knowing about it is that **it holds no state**. every control reads and writes `SCAPE_CONFIG` directly, and the scene modules re-read that config every frame — uniforms are refreshed in each module's `update`, not captured at build. so there is exactly one copy of every number, the panel and the scene cannot drift apart, and nothing has to be pushed anywhere when a slider moves. the readme has always called `config.ts` the public tuning surface; the overlay is what makes that literally true at runtime.

**a control is a path, not a closure.** each knob is declared as a dotted string into the config — `look.bloom`, `daylight.time` — rather than as a `get`/`set` pair. a closure can only be *called*; a string can be collected, compared and written to disk, which is why the same declaration list drives the panel, the local-storage snapshot and the reset without any of them enumerating the scene's settings a second time. add a knob to [`scape-controls.ts`](src/ui/scape-controls.ts) and it persists by construction.

there is no `enabled` flag anywhere in the config: an effect is off when its strength is zero. so a switch is a view of the number underneath it — it remembers what it turned off at, restores that on the way back, and follows its own slider if you drag that to zero yourself.

what a slider cannot do is change the *shape* of the chain. which passes exist at all is a quality-tier decision made once when the composer is built, so a knob whose pass the tier never created renders greyed rather than lying about what it does.

### the card, and the corner it was in

the card in the top-left — the title, the gestures, and the diagnostics log — **starts hidden** and is toggled by the chevron beside it or by `h`. the choice is remembered in its own local-storage key, `three-iso.overlay.v1`.

the handle is pinned to the *figure* rather than to the card, for the same reason `.gfx-toggle` sits outside `.gfx`: a control that hides along with the thing it controls is a one-way door. the card slides off the left edge and the chevron stays exactly where it was.

the card is hidden rather than removed. the log inside it is the only crash report a phone gives and it goes on collecting whether or not anyone is watching, so it stays in the document — `inert` is what keeps a card parked off-screen out of the tab order and out of the hit test. **`?debug` opens it whatever was last chosen**, because a debugging surface you have to already know a keyboard shortcut to reach is not one.

the offset on the handle is a `left` and not a `transform`, and that is not a preference. a percentage inside `translateX` resolves against the *element's own* width — so `--card-width`, which carries a `calc(100% - 2rem)`, collapsed to a negative six pixels against a 26-pixel button and parked the handle on top of the card it had just opened. in `left` the same percentage resolves against the containing block, which is the figure, which is what the card measures against too.

### the frame counter

`.fps` sits in the bottom-left and reads `58 fps · 17.2 ms`, with `41 calls · 812k tris` added under `?debug`. it is deliberately in neither the card nor the panel: both of those are things you put away, and a frame counter you have to open is a frame counter that was not measuring the thing you were looking at when it got slow.

it times nothing itself. [`vitals.ts`](src/scene/vitals.ts) has been measuring the frame all along — for the log, and for the snapshot written at the moment a context is lost — and this is a second view of that one measurement, taken on its own quarter-second cadence so the log's four-second window is unchanged.

### the performance section

three knobs at the bottom of the panel, applied live by [`runtime.ts`](src/scene/runtime.ts):

| knob | what it does |
| --- | --- |
| pixel ratio | rescales the drawing buffer, and the composer behind it |
| frame cap | `0` draws on every animation frame the display offers |
| shadow every n frames | how often the shadow map is rebuilt |

the last one is the one worth explaining. three rebuilds the entire shadow depth pass — the terrain, the merged steading and every scattered instance — on **every frame it draws**, at up to 4096². nothing in this scape moves fast enough to need that: the sun crosses the sky over minutes and the foliage sway is a slow shader animation. `runtime.ts` takes `shadowMap.autoUpdate` off the renderer and hands the map out on a cadence instead, and `atmosphere.ts` only fits the sun's frustum on the frames the map is actually being rebuilt on — the fit is written into `sun.shadow.camera` and read only when the map renders, so fitting it on any other frame is work with nowhere to go.

measured in headless chromium on an m5, desktop tier at ratio 1.75: cadence 1 draws **110 calls** a frame, cadence 4 draws **73**. the frame rate barely moves there, because that machine is fill-rate bound rather than draw-call bound — the same run has ratio 1.75 at 18fps, ratio 1.0 at 31 and ratio 0.5 at 44. the cadence is for the devices where the depth pass *is* the bill, which is every phone this scape has ever lost a context on.

**this section is deliberately not persisted.** its three values are seeded from whatever quality tier the device resolved to on *this* load, re-seeded when a context loss buys a cheaper one, and re-seeded again by `reset`. a pixel ratio or an uncapped frame rate kept from one session and replayed into the next is exactly how a device that has already lost a context gets handed back the budget that took it — underneath a tier [`tier-memory.ts`](src/scene/tier-memory.ts) had correctly held down.

### settings that stick

the overlay writes a debounced snapshot of every exposed path under one local-storage key, and applies it before the scene is built. a section can opt out with `persist: false`, and the performance section above is the only one that does. two details carry the weight for everything else:

- **stored values are only accepted when their type still matches the config.** a snapshot from an older build, or a hand-edited one, cannot poke a string into a uniform and take the shader down on load — it is simply ignored, field by field.
- **`reset` removes the key rather than overwriting it with the defaults.** re-authoring a value in `config.ts` should reach anyone who has pressed reset, and it cannot if reset leaves a snapshot of the old defaults sitting in front of it.

the authored values are captured when the store is constructed, *before* `load` runs — after that the config no longer holds them, and reset is the only thing that has them.

`localStorage` access alone throws in a sandboxed frame and in safari's private mode — the property read, not the write. a graphics overlay is not worth taking the scene down for, so a missing store degrades to "settings do not persist".

the panel's controls also carry `autocomplete="off"`, which is not cosmetic. browsers restore a reloaded form's controls to whatever the user left them at, *after* the page's own initialisation — so a reload would put stale numbers back into the sliders and fire `input` for them, showing values the scene does not have and saving them over the real snapshot. right for a form; wrong for a view of external state.

## the clock

`daylight.ts` resolves a phase of the cycle into a sun direction and a complete sky. the authored atmosphere palette stays the **noon anchor** and everything else is derived from it: dusk is that anchor pulled toward one warm colour, night toward one cold one. that is a deliberate trade against a keyframed palette per hour — retuning the scape is still a matter of editing colours that were already there, and no time of day can drift out of the family the rest of the scene was graded for.

the one place the arc is not honest is where it has to be. **the key light never goes below the horizon**, however far under it the sun actually is. a directional light that follows the real arc down there lights the terrain from underneath: shadows invert, every north face blows out, and the shadow-frustum fit degenerates. so the arc governs the light's *colour and strength*, which is what night actually looks like, while the direction is held just above ground — and the result reads as moonlight instead of as a rendering bug.

the clock lives in the config as a phase and a speed, which means scrubbing the overlay's time slider and letting the cycle run are the same operation on the same number. the time knob sits outside its switch on purpose: freezing the cycle is exactly when you want to scrub it.

## the year

`season.ts` is the clock's second hand, and deliberately the same machine. a phase, a speed, and colours that are *derived* rather than keyframed: the authored palette stays the **midsummer anchor**, winter is that anchor pulled toward one dead straw and then toward one snow white, autumn is the same straw with a gold leaned into it. no month has its own palette, so retuning the scape is still a matter of editing the colours that were already in `palette`.

the year does not touch the shape of the world. the height field, the layout and every prop are built once from the seed and never rebuilt — **snow here is a surface response, not accumulation**. that is the whole reason a season can run on a live clock at all: a system that drifted the terrain would have to regenerate an island to get from august to november, and the frame it did that on would be a frame you could count.

three curves come out of the phase, and none of them is a straight sine.

- **growth lags the sun.** the ground warms and cools slower than the thing warming it, so the growing season peaks a twentieth of a year after midsummer and the first frost arrives before the shortest day. it is one constant in the file and it is why autumn here feels longer than spring.
- **the turn is one-sided.** warmth falls twice a year and only one of those falls turns anything gold. spring loses its snow to bare ground and greens straight off it, which is what the growth curve alone already says — so the turn curve simply does not exist before midsummer.
- **snow is a plateau, not a peak.** it comes on around a fifth of the year out from midwinter and holds, because a snow cover that is only ever briefly total reads as a glitch rather than as a winter.

the interesting problem is that **two materials carry the entire scape**. a flat seasonal mix would take the falu red off the barn and the grey off the granite along with the green off the meadow. so the tint weighs itself by how far the fragment's own albedo leans green — the one thing grass, leaves, moss and heather have in common and paint, stone, sand and water have not — and then by how *light* that green is, which is what separates a birch canopy that goes gold from a spruce that stays black-green all winter. both are arithmetic on a colour the fragment is already holding. neither costs a fetch, an attribute or a branch.

lying snow needs world height, to keep it off the beach the sea keeps warm and off the seabed under the shallows. **it gets that height without a varying.** `vViewPosition` is minus the view-space position and the view matrix is rigid, so a fragment's world height is the camera's height less that position projected onto the view matrix's second column — one dot product against two uniforms three already declares. on a program that argues about its budget with a handset offering sixty varying components in total, a dot product is the cheaper end of that trade by a wide margin.

what is left is the snow line itself, and a fixed contour round an island reads as a stripe someone painted on it. the line wanders instead, on a cheap two-term sine field in world x and z, so the edge of the cover breaks up into patches without any of them drifting when the camera moves.

`season.time`, `season.speed`, `season.snow`, `season.snowLine`, `season.turn` and `season.seaSmoke` are all in the overlay and all live. the time knob sits outside its switch for the same reason the time of day does: freezing the year is exactly when you want to scrub it. the whole system adds no draw call, no texture, no material and no pass — it runs on every tier, including the phone, because there is nothing in it a phone could fail at.

## the winter the water gets

the year reached the land first and left the sea a summer green all through january. `season.ts`'s fourth curve is the freeze, and the lake reads it through **one uniform**.

the freeze is the snow curve's shape and never its timing, because a metre of water holds something like a thousand times the heat a metre of air does. so the sea is the last thing to shut and the last thing to open: the fields whiten weeks before the bays close, and they are bare again while the ice is still in. that is one constant — `ICE_LAG` — plus a narrower pair of thresholds, and it is the whole difference between two clocks and one clock drawn twice.

**depth is the rest of the physics.** a bank a foot deep gives its heat up in a week; a sound five metres deep takes the season. so the ice starts at the shoreline and walks outward as the year deepens, and it reads that depth from the **bathymetry mask the lake was already fetching** for its own depth tint — the freeze costs no texture read the water was not making anyway. `water.iceReach` is how far out that carries: at 1 the ice is confined to water shallow enough to lose its heat, at 0 the open sea freezes as readily as the bank, which is a lake rather than a coast.

depth alone, though, draws a contour line around the island — a bathymetry chart with the ice-fill switched on. `water.iceBreak` breaks that line into floes, on **three sines rather than a noise fetch**. two reasons, and the second is the load-bearing one: the vertex stage needs the same ice front the fragment stage paints, and it cannot have it from a map the cheap tier's two-tap budget has no room to read twice. an analytic field is the one thing both stages can agree on exactly and for free.

they have to agree because **the freeze takes the swell out of the vertex stage as well as the ripple out of the fragment stage**. under ice the surface gives up its displacement, its ripple normal, its foam band and its glitter — a shelf is flat, and a swell rolling under a sheet that is not rising with it is the giveaway that the winter is paint. the one new cost is a vertex texture fetch of the bathymetry mask, on a plane of at most sixteen thousand vertices, against a texture with no mipmaps and linear filtering: nothing to stall on and no derivative to go looking for.

two smaller decisions:

- **ice is laid over the finished water, not mixed into its albedo.** what is under a shelf stops mattering the moment the shelf is thick, and a depth tint showing through frozen water reads as blue plastic sheeting rather than as a winter.
- **ice is rougher than the water it replaces, not smoother.** new ice really is glassy — but the camera's elevation sweeps across the sun's as it zooms, and a near-mirror plane at that crossing is precisely the white-out that [the lake's own roughness](#the-lake-and-the-angle-that-broke-it) exists to prevent. a frozen bay is that same flat plane with the swell taken *out* of it, which makes it the better candidate for the failure rather than the worse one. what does read correctly is snow-blown ice, which is matte and cannot blow out.

the one part of a frozen bay that is genuinely white is the front between the sheet and the open water, where the floes grind and pile. that rim is `4 · cover · (1 - cover)` — a ridge wherever the cover is passing through a half — and it costs two multiplies.

`season.ice`, `water.iceReach` and `water.iceBreak` are in the overlay, live and persisted, grouped under the year rather than under the water because the year is what drives them. the beck's tidal inlet is shallow the whole way up, so it shuts first and reopens last without knowing anything about the freeze — it is simply the shallowest water on the map. no draw call, no texture, no material, no pass and no fragment tap: every tier gets the winter, `minimal` included.

## sea smoke

the scape has had two winters since the run above — the land's and the sea's — and `ICE_LAG` is the fact that they are weeks apart. this run draws what lives in the gap between them.

steam fog forms when air moves over water warmer than it is. that is the definition, and the scape already holds both halves of it: `snowAmount` is how much winter the land has taken, `freezeAmount` is how much the water has, and the land takes it first. so **sea smoke is not a curve of its own — it is the difference of the two the scape already had**:

```ts
seaSmokeAmount(phase) = max(0, snowAmount(phase) - freezeAmount(phase))
```

three things fall out of that for free, and all three are the point.

- **it is one-sided.** come spring the lag runs the other way — the air is back and the bays are still shut — so the difference goes negative and the clamp takes it. a coast smokes on its way *into* the winter and not on its way out, which is what a coast does. nothing had to be written to make that true.
- **it needs open water, and it cannot get the timing wrong.** the smoke only ever has a strength during the weeks the sea has not shut, so there is no ice term anywhere in the geometry or the shader: the open water it wants is all the water there is. an ice-front test would have been a second opinion about the freeze, and two opinions about one thing eventually disagree.
- **it peaks near 0.83, not 1**, a fortnight or so before midwinter. that is not a scale wanting a correction. the most open water a cold sky ever gets is however much of the year the lag leaves between the two curves, and normalising it would be inventing weather the physics does not have.

the geometry is the ground mist's radial profile turned inside out — nothing over the island, full strength a couple of island-radii out, gone again before the sheet's own edge, because a rim on a transparent quad reads as a quad. the two families therefore never overlap: the mist stands on the island all year and the smoke stands exactly where the mist has already faded to nothing.

it is flat, low and slice-free, unlike the mist. sea smoke really is a shallow layer — a metre or two against the mist's nine-metre column — so the thinning that argued the [upright slices](#mist-that-stays-where-the-ground-is) into existence is not a failure here but the shape of the thing. seen from the near zoom, across the water rather than down onto it, two sheets a metre apart present as a bank lying along the coastline, which is what steam fog looks like from a shore.

it is whiter than the mist, and for a physical reason rather than a compositional one: sea smoke is water that has just condensed out of the air standing on it, where ground mist is haze the sky is lighting through. it follows the clock like the mist does — same horizon colour, pulled twice as far toward white.

`season.seaSmoke` is in the overlay, live and persisted, grouped under the year alongside the snow and the ice because it is the arithmetic between them. it is also the switch: there is nothing to steam when it is zero.

**cost: nothing until it exists, and two draws when it does.** `?debug` reports **109 calls · 698k tris · 42 geo · 27 tex · 34 prog** on the desktop tier at midsummer — unchanged — and **111 · 705k · 43 · 27 · 34** at the peak of the smoke. the program count is the interesting one: the smoke's material has the same shape as the mist's, so three's cache hands it the program already linked and the scape gains none. a layer at zero strength is made *invisible* rather than transparent, because a map-wide transparent quad contributing nothing still costs every pixel it covers. the sheet count is `mistLayers / 2`, so `mobile` and `minimal` get one and `ultra` gets three; every tier gets the smoke.

## the aurora, and the dark it needs

the scape has had a night since the clock run and nothing has ever happened in it. this one lights it up, for the half of the year that can hold a light.

**it is a deck, not a curtain, and that is a fact about the camera before it is a fact about the aurora.** an orthographic view tipped fifty degrees down puts the far distance a couple of hundred world units *above* the top of the frame: there is no horizon in this scape to hang anything against, and a wall of light standing out at sea would be rendered correctly and entirely off screen.

a deck the camera looks *down* on is a fiction, and worth naming as one — the light is a hundred kilometres up and the eye is eighty metres. it is also the fiction [the sky deck](#the-sky-deck) already runs: this scape's camera flies above its own weather, and a layer it cannot see is a layer it does not have. the veils are stacked above the clouds so that at least the order is right, and the clearance is enforced in code rather than left to the two sliders agreeing.

everything else follows [the sky deck](#the-sky-deck), including its zoom gate and for its reason: at the near zoom the camera sits *under* the ceiling, and the only thing a luminous sheet could do there is cover the picture.

**the year is the second gate, and it is the one that had to be added.** `daylight.ts` runs one sun arc at one tilt for every week of the year — a deliberate simplification, since a scape with a real seasonal arc has a midwinter with no daylight in it at all — so a midsummer midnight there is exactly as dark as a midwinter one. that is fine for everything else in the scene and wrong for this: the reason you cannot see the aurora in june at these latitudes is not that it has stopped, it is that the sky never gets past dusk. so `season.ts` gained the one curve in it that is not about heat:

```ts
darkAmount(phase) = smoothstep(-0.9, -0.15, cos(phase · τ))
```

every other seasonal curve in this file runs late — the ground warms weeks after midsummer, the sea cools weeks after the ground, and `LAG` and `ICE_LAG` are those weeks written down. this one has no lag at all, and cannot: night length is geometry, not heat, and the sun comes back up on the day the orbit says. full dark holds from equinox to equinox through the winter, and gives out across the two months either side of midsummer.

the brightness is those two gates and nothing else:

```ts
auroraBrightness(day, dark, strength) = strength · dark · (1 - smoothstep(0.02, 0.32, day))
```

no weather term, deliberately. solar activity is not something this scape models, and a random flare would be the one non-deterministic thing in a world that is otherwise a seed and a coordinate.

**the colour is in the field, not over it.** unlike the mist and cloud fields — which are white, and take their tint from the clock — the auroral field is baked with colour in it, because the colour *is* the structure. an aurora is green where the curtain is dense and violet where it thins out at its fringes and its crown, so the tint is a function of the distance from an arc's centre line — the same number the alpha is computed from, and impossible to keep in step with it if it were a gradient applied afterwards. two arcs are baked, wandering as sums of sines and therefore periodic across the tile, so an arc leaves one edge at the height it enters the next; the ray noise, which has no period of its own, is cross-faded with a copy of itself one tile over until it has one. the alternative is mirrored wrapping — what the mist and the cloud fields use — and it was tried: reflecting a wandering arc turns every tile boundary into a hard chevron, and a sky full of zigzags is the one thing an aurora never looks like.

the two arcs are combined with a maximum rather than a sum: two curtains overlapping do not make a brighter curtain, and adding them fills in the dark gap the second arc exists to show.

it is additive, and unlit. the aurora is emission — it never darkens what is behind it — and it is the one thing in the frame the sun does not light, which is why it is also the only sheet in the scape that does not take its colour from the clock.

`atmosphere.aurora` is in the overlay under the sky, live and persisted, with the ceiling and the drift beneath it. it is also the switch. the ceiling is held above `cloudHeight` by the module whatever it is set to, so the weather passes beneath the light rather than through it, and the slider stops at 70 because the camera at full zoom-out is only eighty metres up — past that the deck climbs over the eye and the sky goes dark again.

**cost: one draw per veil, and none at all for most of the year.** `?debug` reports **109 calls** on the desktop tier at the authored opening frame — exactly what it reported before the aurora existed — and **112** at a midwinter midnight pulled all the way out, against **110** with the brightness scrubbed to zero. on the mobile tier the same a/b is **51** against **50**. the veils are two-sided and still one draw each: three renders a transparent double-sided material in two passes, which is right for a curved shell and waste for a flat sheet, so `forceSinglePass` is set and the measurement above is what found it. the veils are made *invisible* rather than transparent whenever the light is out, because a map-wide additive quad contributing nothing still costs every pixel it covers — and it is out for every daylight hour of every day, and every hour of the white-night weeks. the material has the same shape as the cloud deck's, so three's cache hands it the program already linked and the scape gains none. `auroraLayers` is 3 on `ultra`, 2 on `desktop`, **1 on `mobile`** and 0 on `minimal`: the phone tier gets an aurora, and the tier that only exists after a context loss gets a plain dark sky rather than a dimmer aurora.

## the sky deck

overhead cloud is the ground mist's technique moved up: world-pinned sheets of a baked alpha field, scrolling on the wind. two things had to differ.

- **the tile has to be smaller than the frame.** the deck is far wider than anything visible at once, so a pattern sized to the sheet shows you a fraction of a single blob, bilinearly smoothed into a flat wash — the exact failure the ground mist already had once. a tile you can fit two or three of into frame is what makes clouds look like separate clouds. the gaps are the whole effect, and a pattern whose features are larger than the picture has none.
- **the field is thresholded, not raised to a power.** the mist keeps a little of itself everywhere, which is right for something you are standing in. cloud read from underneath has to have holes, or it is just a grey filter over the frame.

the deck fades in as the view pulls back, and that gate is not a performance dodge: an orthographic camera zoomed in sits *below* the ceiling, so the only thing overhead cloud could do there is cover the picture. pull out and the camera climbs past it, and the deck becomes what it is meant to be — weather between you and the islands.

it is also unfogged, deliberately. linear fog fades by distance from the camera and the deck is the furthest thing in frame, so leaving it in dissolves every cloud into the fog colour exactly when it comes into view. it takes its colour from the clock instead, like the mist does — cloud is the one surface here with nothing but ambient on it, and if it does not follow the sky it stays daylight-white through the night.

## framing the sea

an orthographic camera's distance along its view axis changes nothing you can see — but it decides where the frustum's *bottom edge* sits in world space. let that edge drop under the waterline and the lower band of the frame is made of rays that start below the sea and point down; they can never intersect a horizontal plane above them, so the water simply stops partway up the screen and the background shows through.

[`camera-controls.ts`](src/scene/camera-controls.ts) therefore lifts the camera with the zoom rather than sitting at a fixed radius, keeping the frustum clear of the waterline at every tilt. it costs nothing — the projection is unchanged — and it is why the sea reaches the bottom of the frame at the shallowest angle the controls allow.

that distance carries a second, non-obvious load: the atmosphere reads it to place the fog, as `near = radius - viewSize * 0.9`. clearing the waterline needs *less* distance the steeper the view gets, so once tilt became a function of zoom, the lift began to swing — and with it the fog band, which collapsed onto the camera and washed the whole frame grey at high elevations. the lift now has a floor proportional to `viewSize`, which keeps the fog where it was authored at every angle.

## the lake, and the angle that broke it

binding tilt to zoom sweeps the camera's elevation through a range that crosses the sun's. that turned out to be a good stress test of the water, which failed it twice:

- **a near-mirror plane has no good answer at that crossing.** at low roughness the whole flat surface reflects the sun into every fragment at once, and the lake stops being water and becomes one white highlight the size of the sea. the surface is rough now, which spreads the lobe until no angle can concentrate it — and rough dielectrics then pick up the pale overcast sky instead, so `envMapIntensity` is cut to give the depth tint its colour back.
- **a narrow lobe also makes the sea change colour when you orbit.** short of an outright white-out, a tight highlight still means the lake is pale grey facing the sun and dark teal facing away — the water reads as a different material depending on which way you turned. broadening the lobe further is what makes the two headings agree.
- **the ripple normals came from a white-noise texture.** minified past one texel per pixel that lands a different random normal in every pixel, so wherever the mirror direction drifted into the spray, isolated pixels fired at full strength. which angles triggered it was pure luck, which is why it stayed invisible until something moved the elevation. shading now reads a *smooth* fractal field; the speckled texture is kept, but only ever tints.

what the roughness gave away, the glitter pays back: two noise fields at incommensurate scales, multiplied and raised to a high power, so the product spikes only where both crests coincide. that exponent is the whole control — threshold it gently instead and the *mean* of the product clears the cut, every fragment lights up, and the lake becomes a sheet of white paper.

two related calibrations came out of the same pass:

- **bloom threshold sits above the fog.** bloom is for highlights, and the fog colour scatters toward the sun until its linear luminance is around 0.85. at the old 0.86 a frame full of lit haze crossed the threshold everywhere at once and bloomed itself into a white-out.
- **direction tints the light, it does not re-expose the shot.** the atmosphere scatters its horizon colour toward the sun by view heading, and that colour is both the fog and the sky's lower band — so at the original strength the same island was a washed-out miniature facing one way and a dark, moody one facing the other. the scatter is a third of what it was.

## mist that stays where the ground is

the sheets used to chase the camera's focus point, which drags the whole cloud pattern across the ground as you pan — and a mist that moves with the camera reads as the *island* moving, the one thing ground mist must never do. they are pinned to the world now, which costs two things and pays for both:

- the sheet has to be wide enough to reach past the terrain from any pan, and the pattern's world size has nothing to do with that. tie the texture repeat to the sheet and widening it magnifies every wisp — a few big soft blobs, bilinearly smoothed until the gaps close, which is how ground mist becomes a white-out. the repeat is derived from a fixed *units per tile* instead.
- a flat sheet that survives any pan also lies over every pixel of open water in frame, four deep. ground mist collects over land and shallows in the first place, so the alpha is baked into the vertices and falls off radially: dense on the island, gone by the time the eye is out at sea.

**the mist stands up as well as lying down.** stacked horizontal sheets only have depth when you look *across* them, so a mist built from them alone thins out exactly as the view tips down, until it is a set of planes seen edge-on. alongside them is the standard trick for volumetric fog: upright slices that face the viewer, spaced along the view axis, so there is always something between the eye and the ground whatever the elevation. their alpha is dense at the waterline and gone by the top, and falls off both sides so the slab never shows a vertical edge.

those slices follow the focus point rather than the world origin — a stack pinned to the origin falls behind the camera the moment you pan to the far side of the map, and the upright mist simply stops existing there. following the focus is only safe because the *pattern* does not come along: each slice feeds its own displacement along its local x axis back into the texture offset, so every wisp stays over the same patch of ground while the quad slides underneath it.

**density follows the authored amount, and nothing else.** it used to be scaled each frame by the view elevation, which meant orbiting or zooming quietly changed the weather. mist belongs to the world, not to where you happen to be standing, so the camera has no say in how much of it there is — only the clock does, and only over its colour.

## ground that casts

the terrain has always been a shadow caster, but the sun's shadow frustum was fitted with a margin sized for the tallest *prop* — about a spruce. the terrain is by far the tallest thing in the scene, so every ridge shadow was clipped where it left the visible ground, and hills read as though they were lit from inside. the margin is derived from the terrain's own relief now, which is what lets a low sun throw a ridge's shadow the length of the frame, and an islet's across the water it stands in.

the ground it falls on carries **two octaves of grain, and a roughness break**. one scale gives ground a texture but not a history: real soil has metre-wide patches of wear and damp under the centimetre-wide grit, and without the broad octave the fine one tiles into a visible weave the moment you zoom out past its repeat. both fetches come from the same 256² texture at different frequencies, so the second costs a sampler read and no memory. the third piece is specular — uniform roughness is the giveaway that a surface is a render, because nothing outdoors reflects evenly — so the fine grain also polishes and dulls it by a few percent, and wet silt stops being the same material as dry heath under the same vertex colour.

## the shape of the island

a radial falloff draws a perfect disc, and nothing in the sea is a disc. `sinkToIsland` warps the falloff itself with a two-octave noise on the bearing, so the island grows headlands where the value is high and cuts bays where it is low — and because *every* other part of the scape is written against that function rather than against a radius, all of them inherit the shape without being told: the beach shelves along it, the foam follows it, the placement searches respect it, and the mist's land mask is cut by it.

the fix is deliberately not "add detail to the height". roughening the terrain under a circular falloff gives a rougher coastline that is still round. the falloff is the coastline.

**`islandInner` and `islandOuter` stopped being shorelines when the coast started wandering.** they are where an *average* bearing starts and finishes falling away; the coast moves either side of that band by `COAST_REACH` of its width. so there are now three radii worth naming, and confusing them is how a wall ends up in the sea:

| | what it is |
| --- | --- |
| `landRadiusOf` | dry whichever way you walk — `islandInner` less the whole coast reach |
| `liftRadiusOf` | the mean coastline, and how far the central massif reaches |
| `islandOuter` + reach | the furthest a headland can get, and what the islets must clear |

every placement search that assumes solid ground uses the first. the pasture search uses the second, because unlike the others it *verifies* its ground — `ringIsDry` walks the whole enclosure — so it can go looking on a headland and be told no. held to the guaranteed radius it could not reach the high ground of an island whose coastline is not a circle, which is every island.

**the massif is what makes a big island an island.** the fbm averages to nothing at any size while the falloff still has to bring the whole rim down to the same sea, so a larger island built from noise alone is a larger *flat* island — and a flat island has no upland for a pasture, no hillside for a beck, and no reason for the farm to be where the farm is. the radial lift in `noise.ts` is that shape, and it is now sized to the island rather than fixed at the 58 units the first one happened to be.

**things sized in metres do not survive a change of scale.** growing the island exposed every constant that was really a fraction wearing metres: the sky and cloud decks tiled half again as often and turned to wallpaper, the sea-ice floes did the same, the pasture's distance-from-the-farm score outranked the height it was supposed to be breaking ties on, and the probe grids searched the same number of points over twice the ground. all of them are expressed against `terrain.size` now.

## islets

`terrain.isles` are raised *after* the island falloff, never before. the falloff's whole job is to drown the terrain plane's rim unconditionally so its square edges never read as the edge of the world; anything meant to survive out there has to come later.

their profile is a **plateau with a skirt, not a dome**, and that is what decides whether they read as islands at all. the seabed is seven metres down and the crown is a couple of metres up, so the blend has to reach roughly 0.7 before the ground breaks the surface — and a smooth dome only gets there near its very centre. an eleven-metre islet surfaced as a one-metre pebble. holding the blend at 1 across the inner 55% puts the waterline out at about 0.72 of the radius, which is an island with a beach on it.

they also need somewhere to stand. the ring between the mainland's shore and the plane's edge was too narrow to hold anything that would not either merge into the mainland or run off the world, so the plane is wider and `islandInner`/`islandOuter` are scaled to keep the farmstead's landmass exactly where it was. the extra span is open sea.

there are fifteen of them, and the spacing is the design: each one clears the mainland's *warped* shore and its neighbours' skirts, which is the difference between an archipelago and a reef. they are grouped rather than evenly spread — a close western pair, a southern chain thinning as it runs out, one substantial north-eastern outlier, and skerries filling the gaps — because a ring of like-sized islets at even bearings reads as decoration however well each one is modelled.

they get the same coast warp the mainland does, sampled in each islet's own frame with a seed of its own. at world scale the warp is very nearly constant across a disc eight metres wide, so it would only nudge the whole islet sideways; sampled seven times tighter it reshapes the skirt, which is where a small island is nearly all coastline.

finally they change how the scatter samples. the placement field is now mostly open sea, and a uniform disc throws most of every attempt budget into the water — the island thins out to prove it. candidates are drawn from the mainland *or* from one of the islets instead, so the islets get dressed by the same instanced meshes.

## the boat harbour

the farm already owned a jetty and a rowboat; it now has somewhere to keep the boat. a boathouse stands in the next cove along from the landing, a net rack dries gear on the bank behind it, and stakes are driven into the shallows off both.

three decisions in it are worth keeping.

**a bearing is not a rotation.** `rotateY` sends `+z` to `(sin y, cos y)`, while a compass bearing points at `(cos a, sin a)` — the two are mirrored about the diagonal. the jetty had been rotated by the shoreline bearing itself, so it ran *across* the water it was supposed to run into; how wrong it looked was a function of which bearing the seed happened to pick, which is why it survived. [`yawAlong`](src/scene/landscape/layout.ts) is that conversion, and it does double duty: the same rotation that points a `+z`-long prop out to sea puts an `+x`-long one broadside to it, which is exactly where a net rack belongs.

**the boathouse is anchored to the water, not to the ground.** the five farmstead buildings are `Ploppable`s that level a floor against the highest corner and grow a foundation down onto the terrain. do that here and the foundation buries the one part that has to be open — the mouth, and the slipway running out of it under the surface. so the boathouse is placed at the waterline the way the jetty is, on its own piles, and pushed a little seaward of the bank so the back of the shed cuts into the slope the way a real one is dug in. being a hero prop it merges into the steading geometry, so the whole harbour costs no draw call at all.

**a stake belongs to whoever drove it.** the mooring posts are the one scattered prop with a *placement* rule rather than a terrain rule: shallows, but only within thirty metres of the harbour. scattered on depth alone they would ring every islet in the archipelago, which says the opposite of what a harbour says. that is one `InstancedMesh`, and the only draw call this run adds.

`layout.harbourSpread` is how far around the shore the boathouse sits from the jetty, in degrees. it is a build-time knob like the rest of `layout` and `dressing`, so it is not in the overlay — the panel only carries values the modules re-read every frame, and a knob that needs a rebuild to be seen would lie about what a slider does.

## the upland pasture

the farm ploughs the flat ground beside the yard and grazes what is left. up the slope from the steading there is now a walled hay meadow: a drystone wall around it, a gap in the wall facing back down at the farm with a gate in it, a meadow barn at the back, and hay drying on poles in between. the ground inside is painted as mown grass rather than as the heath the altitude bands would otherwise give it, so the clearing reads from the far zoom as somewhere kept rather than somewhere bare.

**siting it is the whole problem, and it is a search over ground that does not exist yet.** the island is about sixty metres across and the farmyard's graded shelf already claims twenty-one of them, so there is not much left that is high, flat, dry, off the track, off the plots and not the farm. `findPasture` in [`layout.ts`](src/scene/landscape/layout.ts) probes for it against the raw fbm the way `findYard` does, and returns `null` rather than relaxing a rule if the island has no room — a smaller world or a larger `pastureRadius` genuinely means there is nowhere, and every caller copes with the absence.

two of its rules are there because the first version of the search got them wrong in ways that are worth keeping written down.

**a centre being on land says nothing about the ring.** the enclosure is a disc, and the wall stands on its edge. sited on its centre's own height, the search picked a shoulder above a cove: five metres of dry hillside in the middle, and a third of the wall thirty metres out where the island falloff had already drowned the ground. so the whole disc has to fit inside `landRadius`, and twelve probes around the wall line have to come back dry as well.

**it has to agree with the ground that gets built.** `height.ts` sinks the raw fbm into the island before anything else touches it, and the layout searches run before `height.ts` exists — so they were reading a height the terrain would never have. [`sinkToIsland`](src/scene/landscape/layout.ts) is now that falloff, in one place, called by the height field and by the search that has to predict it. two approximations of the same curve is exactly how a wall gets built on the sea.

the wall, the gate and the barn all pay the same way the harbour does. the wall run and the gate are hero geometry and merge into the steading's single draw; the meadow barn is a `Ploppable` like the farmstead's five, because it stands on a hillside and a merged geometry can only ever sit at one height. the drying poles are one `InstancedMesh`.

**a prop that belongs to a place cannot be found by throwing darts at the island.** the drying poles were scattered through the same sampler as everything else and landed, measurably, never — the pasture is a quarter of a percent of that sampler's disc, and the few candidates that did land inside it were then rejected by the barn's claim on the middle. so a scatter can now be given its own candidate generator, and the poles get a disc the size of the pasture. the barn is set hard against the back wall for the same reason: a building's claim on the solver is a circle around its longest half, which on a twelve-metre enclosure is most of the enclosure, and pushing it back leans that circle onto the wall's own claims instead of onto the meadow.

## the beck, and the inlet it cuts

water now runs off the high ground. a beck springs on the highest interior ground the farm is not standing on, falls through a channel cut into the hillside, and flares out at the shore into a tidal inlet that reaches a good way inland. it is the first feature in the scape whose *shape* is found rather than authored — everything else is sited by a search and then drawn, and this one is traced.

**it costs no draw call and no material.** that is the whole reason it could be a whole watercourse rather than a decal. the lake is already one plane spanning the map, drawn wherever the baked bathymetry mask says there is water under it — so anything carved below the waterline fills itself, with the swell, the depth tint, the shore foam band and the sun glitter the sea already has. the beck is a hole in the terrain, and the terrain was one draw before and is one draw now.

**the course is a steepest-descent walk, because water only goes one way.** [`creek.ts`](src/scene/landscape/creek.ts) fans twenty-four bearings at every step and takes the cheapest, where the cost is the ground it lands on less two bribes: one for holding the heading it already had, and one for heading seaward. the first is what stops a quantised fan tracing a staircase — without it the walk spends as much of its length turning as descending. the second is what gets it out of the closed hollows the raw fbm has inside `islandInner`, where the island falloff has not started taking height away yet.

**a nudge is not enough for the deep ones, and the fix is the honest one.** a stream that cannot descend out of a basin fills the basin and leaves over its lowest lip. so the seaward bribe grows with every step the walk fails to get further out and collapses the moment it makes ground — which is that behaviour, and it turns "usually terminates" into "always terminates", because every stalled step raises the price of staying until no rim is worth it. before it, two of four candidate courses ran out the step limit going round in circles.

**the springs are not `layout.ridges`.** the obvious thing was to start from the wooded high points the conifers already cluster onto, and it produced nothing: those are ranked on the raw fbm over a square grid whose corners reach past `islandOuter`, so most of them are already under water once the falloff has had its say. traced from them, every course was a five-metre stub. a spring needs real height on ground that survives the drowning, so the search probes for that directly.

**the beck is resolved last, and routes around the farm.** the yard, the fields and the walled meadow are all sited by searches of their own, and the beck's spring wanted the same hilltop the pasture was already on. teaching three searches the shape of a channel that does not exist yet is three chances to disagree about it; handing the beck one list of discs it has to miss says the same thing in one place. so the course is traced after all of them, and a course that cannot miss them is discarded rather than shaved. that is why adding a watercourse to this scape moved nothing that was already in it — the plots and the pasture are exactly where they were.

**the channel is carved after the track, never before.** the road grade is sampled from a ground with no channel in it and smoothed, so levelling the track second would fill the crossing back in. carved second, the beck cuts *under* the road, and the bridge — which until now sat in whatever low patch of track it could find — has something to cross. where the two do meet, `findCrossing` sits the deck on the nearest track points the channel does not claim, because a bridge sat on the carved ground under it is a bridge lying in the beck.

**the long profile is clamped to fall the whole way.** the descent obeys the raw fbm and the ground it is carved into is not that: the shore shelving lifts the bank, and an islet dropped across the mouth's path raises the seabed under it by several metres. left alone the channel inherits those rises and the scape gets a stream running up over a bar and back down. a running minimum over the smoothed profile is the one rule water has, and it makes the beck cut through whatever is in front of it.

**four smoothing passes, not eight.** the same count the road grade uses. eight passes over a fourteen-point profile is very nearly one average, and a long profile averaged flat carves a level canal.

the channel widens as it goes: `creek.mouthFlare` is how much broader the mouth is than the spring, and it is the knob that decides whether the scape gained a stream or a sound. below about 2 the lower reach never resolves on the mobile tier, where a terrain quad is two metres across and the whole channel is five. the bank taper reaches two and a half times the floor's own half-width — wider and the beck reads as a valley it happens to be lying in, narrower and the grid cannot resolve two sides at all.

the dressing comes for free, and deliberately so. reeds already scatter in the band either side of the waterline, cobbles already go wherever the ground is low or steep, and lily pads already want shallow standing water — so the banks plant themselves, and the run added no new scatter rule to get them. what it did add is one rule in the other direction: the landing search rejects a bank the beck claims, because the beck reaches within a couple of yard radii of the farm and is the nearest thing under the waterline that a walk outward from the yard finds. without it the jetty gets built across a stream two metres wide and the boathouse follows it in.

`creek.*` are build-time knobs like `layout` and `dressing`, so they are not in the overlay for the same reason `harbourSpread` is not: the channel is baked into the terrain mesh and into the bathymetry mask, and a slider that needs a rebuild to be seen would lie about what a slider does.

## the paths people wear

the farm has always been a set of places — a yard with five buildings on it, a landing, a boat harbour, a walled pasture, a field or three — with nothing at all between them. now there is: a network of footpaths, worn from the well out to every one of them.

**a path is found, not drawn.** [`landscape/footpath.ts`](src/scene/landscape/footpath.ts) starts each route as a straight line between two places and then relaxes it. every interior point gets two nudges per pass. the first pulls it toward the midpoint of its neighbours, which is the gradient of the route's own length and is what stops a route meandering. the second pushes it along the ground gradient, scaled by how much of a *bulge* it is — how far its own height stands above, or below, the two points either side of it.

that second term is the whole idea, and it is signed for a reason. a point higher than both its neighbours is a crest the route is climbing over for nothing, so it slides downhill. a point lower than both is a hollow it drops into and has to climb back out of, so it slides up. a point that merely sits *between* its neighbours is on a steady grade — a hillside path, which is a perfectly good thing to be — and the term vanishes there however steep the ground is. so a route traverses slopes happily and refuses humps and dips, which is what a worn path does and what a shortest-path search does not. `footpath.climb` is how much sidestep a unit of gradient buys; at 0 the routes are straight lines between the anchors, which is a survey rather than a path.

the difference between a bump and a footfall is one constant. `SLACK` is a third of a metre of height difference below which the bulge term reads as zero, and without it the sidestep chases the terrain's own grain and the route wanders over centimetres.

**the network is a star on the well.** the one errand everybody in the place runs every day is water, so that is the ground that goes bare and that is where every other route leaves from. the spokes are the five buildings' doorways, then the outlying work: the landing, the boat harbour's bank, the pasture gateway and the near edge of each field plot. fields are met at their edge — the anchor marches in from the middle until the plot stops claiming the ground, which is exactly where its fence run stands — so a path arrives at the fence rather than walking through it.

**paths go round buildings, never under them.** the yard arrangement moved out of the dressing into [`landscape/steading.ts`](src/scene/landscape/steading.ts) for this, because two copies of where a barn stands is how a path ends up leading to where the barn used to be. each building carries a rough radius, and a point that lands inside one is *projected* straight out of it after every relaxation pass rather than pushed by another force term — a path that mostly misses the barn is not a path that misses the barn. endpoints are exempt: a route to a door has to arrive at the door.

**it is paint, and never height.** the routes are traced across the ground *as built* — levelled yard, graded track, carved beck and all — which is what makes them agree with the scape they cross, and also what stops them carving it: a path that sank the hillside it had just been routed over would move the hillside out from under itself on the next build. so the terrain takes the wear as vertex colour and the scatter takes it as a place not to stand, and no vertex moves.

**the wear weighs itself by how green the ground already was.** this is the one thing that turns eight routes converging on one well into a network instead of a stain. a path is turf that has been walked off, so it can only show where there was turf: across the meadow the full lerp toward `palette.trodden` lands, and on the yard, the cart track and the tilled plots — ground that is bare because something else already made it bare — it barely registers. the same arithmetic the seasonal tint uses, for the same reason, on a colour the painter already has in hand.

wear also falls along a route, but only mildly. traffic really does concentrate at the hub, and a steep falloff pales the tread exactly where it is the only thing saying anybody walks here — the outer end, out on the grass, is the only place the eye can read a path at all.

**what the scatter does with it.** the tread joins the list of things the ground is already spoken for by, alongside the yard, the track, the plots and the pasture: no spruce, boulder, bale or tuft of grass stands on it. the threshold is set at the middle of the tread rather than at the verge, because eight routes clearing a two-metre corridor each is a bald farmyard rather than a network. one cover goes the other way — cobbles are *more* likely on a tread, because taking the turf off a hillside is how the stone under it surfaces, and it is what keeps a path from reading as a stripe of flat colour at close zoom.

**cost is nothing.** no draw call, no material, no texture, no pass: the routes are traced once at build (under a millisecond for the whole network) and baked into the terrain's vertex colours, which were already being written. the per-vertex query is a bounding-box reject followed by a segment walk, about eight milliseconds across an `ultra` terrain's fifty thousand vertices. every tier gets the paths, `minimal` included.

what a coarse tier does *not* get is a crisp edge. a terrain quad is 0.8 m across on desktop and 2 m on mobile, and a tread 1.5 m wide cannot resolve on either — so the wear arrives as a soft band of bare ground rather than a drawn line, and softens further the cheaper the tier. that is the honest limit of painting a metre-scale feature into vertex colour, and it is why the cobbles matter.

`footpath.*` are build-time knobs like `creek.*` and `layout.*`, and are absent from the overlay for the same reason: the routes are baked into the mesh, and a slider that needs a rebuild to be seen would lie about what a slider does. `footpath.wear` at 0 is the off switch — no route is traced at all, so the grass and the stones close back over ground that would otherwise be a path.

## ploppable

placement in a landscape is a two-dimensional decision — you choose *where* on the map a barn goes, never how high — but every scene-graph api asks for three numbers and lets you get the third one wrong. [`props/ploppable.ts`](src/scene/props/ploppable.ts) extends the library's `Prop` with the ground field bound at construction, so callers pass the two coordinates they have an opinion about.

given a footprint it also fixes what makes flat-based props look pasted on. it levels the floor against the *highest* corner — sink to the mean and the uphill half of the floor ends up under the turf; sink to the low side and the building climbs out of the hill it should be cut into — then extrudes a foundation whose lower edge follows `heightAt` all the way round. buried on the high side, standing proud on the low one, the way a real plinth meets a slope.

this is why the five buildings are the only props that leave the merged steading draw. a merged geometry is baked at build time and can only ever sit at one height; five extra draws against the same material is not a state change.
