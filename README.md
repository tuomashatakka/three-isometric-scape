# three-iso

a production-minded isometric scape in vanilla three.js and [threejs-scene](https://www.npmjs.com/package/threejs-scene): a nordic island with a farmstead on it, three clocks running over it, and a graphics budget that survives contact with a phone.

this readme is the **design record**. most of the non-obvious decisions here are explained, and several of those explanations are bugs that come straight back if the reasoning is discarded. two shorter files sit beside it:

- **[`agents.md`](agents.md)** — the tool reference. every script, every flag, the module surface, the traps. **read this first if you are here to change something.**
- **[`instructions.md`](instructions.md)** — the standing brief for the unattended enhancement run that grows the scene.

```sh
bun install
bun run dev        # http://127.0.0.1:4174
```

---

## working on it

**almost nothing here needs a browser.** world generation, prop building, path planning and the whole palette are pure typescript — no `three`, no gl context, no dom. that is deliberate, and it is what the tooling is built on: the loop between changing a number and seeing what it did should not go through a screenshot.

| you want to know | reach for | costs |
| --- | --- | --- |
| did the composition survive | `bun run scape:map --stats` | ~16 ms, no browser |
| where is everything | `bun run scape:map` | ~16 ms, no browser |
| what does this one prop look like | `bun run prop:map <name>` | ~40 ms, no browser |
| what colour is where on a prop | `bun run prop:map <name> --audit` | ~40 ms, no browser |
| what does the roster look like | `/props.html` | one gpu context |
| how does one prop measure up | `/props.html?prop=<name>` | one gpu context |
| does it still draw at all | `bun run scape:shot` | ~20 s per pose |
| did my change move the picture | `bun run scape:diff --ref origin/main` | minutes, builds a ref |

the gate, all four clean before anything ships:

```sh
bun run lint        # warnings included — the repo is warning-clean
bun run typecheck
bun test
bun run build
```

### the ascii instruments

`scape:map` draws the whole composition — ground, beck, footpaths, cart track, steading, landings — and then says in numbers what a picture cannot. it needs no browser, no gpu and no dependency, because [`landscape/survey.ts`](src/scene/landscape/survey.ts) is pure: the ground, the farm, the landings and the network worn between them all resolve without a vertex being built. the survey is about seven milliseconds, and sampling a 96×48 grid on top of it about nine more.

the stats block is the part that earns its keep. a beck that failed to trace, an island that drowned, a pasture that never found room and a set of footpaths that collapsed to nothing are all *invisible* in a still at the default pose, and all of them are one field here.

`prop:map` is the same bargain one scale down, with its own z-buffered rasteriser. a building forty metres off, at one fixed angle, under a colour grade is exactly the viewing condition that let a gable end poke through its own roof for months — and `--audit`, which names the palette entry every baked facet came from and the height band it covers, turns *"does `faluDark` appear above the roofline"* into one line of output.

the audit has to match in **linear** colour. three bakes the colour attribute out of srgb and that conversion is a power curve rather than a scale, so a swatch compared in srgb does not point the same way as its own facets: matched wrong, the rust chimney lands in the falu bucket and hides the very fault the tool exists to find. hues separate cleanly; the greys (granite, shingle, iron, trim) are near-collinear and trade places, so read those as one family.

### the prop viewer

`/props.html` is the same question with a gpu behind it, in two modes decided by the query string.

**bare, it is a contact sheet of the whole roster** — every prop drawn at the play angle, grouped the way the scape spends them, captioned with triangle count and metres, filterable. a name is a bad handle for a mesh: `aitta`, `hayRack` and `netRack` are three words that tell you nothing about which one you are looking for. cards whose base is off the ground plane carry the offset in the corner — a few mean it, so it is a flag to look at rather than a failure. every thumbnail on it comes from **one** webgl context which is then handed straight back, because a live context per card is well past what a browser will give you and the sheet is static once drawn.

**`?prop=` names one and gets four orthographic viewports** — top, front, left and the play angle — with a two-density grid in each one's own plane, a wireframe toggle and a bounding box. one renderer and four scissor rectangles rather than four canvases, so what you compare across panes is guaranteed to be the same upload. the three axis panes never rotate: an elevation you can nudge off-axis is no longer a measurement, and you would not notice it had happened.

it is a separate vite entry importing the roster and nothing else from the scene, which is the point — it stays loadable exactly when the terrain, the atmosphere or the post chain is what is broken.

### the captures

`scape:shot` photographs the scape headlessly. the pose, clock, year and tier come off the command line and go in through `?set=`, which addresses knobs by the same dotted paths the graphics overlay and the settings snapshot use — so a knob added to [`config.ts`](src/scene/config.ts) is reachable from a url the day it lands, with nothing wired for it.

three defaults are load-bearing:

- **the tier is pinned, not detected.** `readQualitySignals` answers from cores, pointer and viewport, so an unpinned capture picks a different tier on a laptop than on a build box — and two stills at two tiers are not a comparison, they are two different scapes.
- **it renders on swiftshader, not the gpu.** software rasterisation is slower and exactly reproducible. a real adapter draws the same frame differently machine to machine, which turns every diff into an argument about how much noise counts as noise.
- **the shutter waits on a frame count, not a clock.** measured rather than assumed: a fixed nine-hundred-millisecond settle gave fifty draw calls on one run and a hundred and eight on the next, because the cloud deck and the mist fade in over *frames*.

`scape:diff` builds a reference in a detached git worktree, serves both builds, captures the same poses through both and prints a table. a diff image is written **only** for a pose that moved past the threshold, and the `structural:` line runs `scape:map --json` on both sides to catch a world-model regression no single pose would show. a git ref rather than a stored baseline is deliberate: an unattended run starts from a fresh clone with no `.scape/` in it, so a baseline-file design fails on the exact workload it exists for.

the noise floor was measured, not guessed. two independent captures of the same commit differ in about fourteen per cent of their pixels by one or two levels — float ordering in the post chain — and in **nought point nought nought per cent** at the default tolerance. a zero means zero.

`.scape/` holds all of it and is gitignored.

---

## what is in the scape

- a deterministic procedural heightfield with editable seed, scale, waterline and palette
- a mainland farmstead on a warped, non-circular coastline, ringed by fifteen offshore islets
- a cobbled network of paths between every place the farm goes — planned as a graph, worn as desire lines, paved with stones sampled along the treads themselves
- a working boat harbour: a boathouse on piles with a slipway, a net rack, and stakes in the shallows
- a walled upland hay meadow with a barn, a gate and drying poles
- a lighthouse on the outermost rock of the ring, throwing beams that sweep the water from dusk until dawn
- a beck traced downhill from a spring, carved through the terrain and flared at the shore into a tidal inlet the lake fills by itself
- **three clocks** — a day, a year, and a weather front — each a phase and a speed, each deriving everything else from that phase
- a solar arc solved from a latitude — a polar night at midwinter, a midnight sun at midsummer — with dusk and night palettes derived from it, plus seasonal growth, leaf turn, lying snow, sea ice, sea smoke, and rain that leaves the ground wet
- an aurora over the dark half of the year, gated on the night and on how much night the week has
- view-reactive fog, a gradient sky, deterministic drifting ground mist, and a sky cloud deck
- a configurable 3d-lut grade with vignette, miniature tilt-shift, bloom and film grain
- a live graphics overlay that persists to local storage and reloads what you left it at
- mobile and desktop atmosphere budgets selected from pointer, viewport and pixel-density signals
- a scape that survives a lost webgl context: it rebuilds one tier cheaper rather than asking you to reload, and remembers the verdict
- an on-page diagnostics log that survives a reload, because a phone has no devtools
- an orthographic dimetric camera, click-to-focus with an eased landing, full keyboard equivalents
- one terrain draw, one water draw, one merged steading draw, and one `InstancedMesh` per scattered prop type

there is deliberately no chat surface, llm schema, prop authoring tool or hidden app service. the only persisted state is the graphics overlay's own snapshot, under one key.

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

**tilt is not an input.** it is a function of the zoom — pushed in you get a low, near-horizontal, cinematic angle; pulled out you get the map. dragging elevation is how a view ends up under the waterline or staring straight down by accident, and the right elevation is fully determined by how close you are anyway. binding one to the other removes a control and improves every frame it used to produce.

every motion — drag, wheel, tap, keypress, the idle revolution — writes only to a *target* pose. one exponential integrator in `update` chases it, so there is no per-verb tween and nothing can move the camera without being eased. with `prefers-reduced-motion: reduce` the integrator snaps rather than eases.

url overrides for a device you cannot attach a debugger to: `?debug` adds live vitals, `?tier=minimal|mobile|desktop|ultra` forces a tier past detection and past memory, `?post=0|1` forces the optical chain either way, `?set=a.b=1` reaches any config path.

## shape the scape

the intended first edit is [`src/scene/config.ts`](src/scene/config.ts). `SCAPE_CONFIG` owns the seed, terrain extent and waterline, the islets, the beck, the footpaths, the dressing budgets, camera framing and zoom limits, all three clocks, the whole light and atmosphere rig, the optical chain, and the complete palette.

a knob that is **visual and read per frame** also belongs in [`ui/scape-controls.ts`](src/ui/scape-controls.ts) as a dotted path, which makes it persist, reset and become url-addressable for free. a knob that needs a **rebuild** to be seen — `layout.*`, `creek.*`, `footpath.*`, `cartRuts.*`, `dressing.*` — stays out of the overlay, because a slider that lies about what it does is worse than no slider.

`camera.focusX` and `camera.focusZ` are where the camera *opens*, read once when the controls are built and live state from then on. they default to the middle of the world, which is open sea — set them to put the opening view on the farm, and set them from a url to capture anything on the ground at all.

compose new systems in [`create-isometric-scape.ts`](src/scene/create-isometric-scape.ts):

```ts
const app = createApp(canvas, {
  use: [ standardLighting(), landscape.module, weatherModule, controls ],
})
```

keeping generation in `build`, animation in `update`, resize work in `resize` and cleanup in `dispose` prevents parallel render loops and orphaned gpu resources.

## project map

```text
src/
├── main.ts                         browser entry and accessible status
├── style.css                       full-viewport responsive shell
├── prop-preview/                   /props.html — contact sheet and quad view
│   ├── main.ts                     two-mode routing off the query string
│   ├── contact-sheet.ts            the whole roster from one throwaway context
│   ├── quad-view.ts                four scissored ortho viewports, one renderer
│   └── preview.css                 the instrument's own chrome
├── ui/
│   ├── camera-path-panel.ts        the waypoint tour, built by flying and pressing add
│   ├── camera-state.ts             where the reader last was, and the tour they built
│   ├── diagnostics.ts              the log, printed where a phone can read it
│   ├── fps-meter.ts                the frame counter in the bottom-left corner
│   ├── graphics-panel.ts           the drawer's contents, filled into the page's markup
│   ├── overlay-state.ts            the card, and which drawer sections were left open
│   ├── scape-card.ts               the card in the top-left, and its handle
│   ├── scape-controls.ts           which config paths it exposes, in grouped sections
│   └── settings-store.ts           local-storage snapshot of those same paths
└── scene/
    ├── atmosphere.ts               gradient sky, linear fog, sun and fill rig
    ├── aurora.ts                   auroral veils over the dark half of the year
    ├── camera-controls.ts          pointer, touch, keyboard, focus, orbit
    ├── camera-follow.ts            riding a moving fleet instance instead of the map
    ├── beacon.ts                   the coastal light: the lamp, and the beams it sweeps
    ├── clouds.ts                   sky deck, faded in as the view pulls back
    ├── config.ts                   the public tuning surface
    ├── create-isometric-scape.ts   app/module composition root
    ├── daylight.ts                 clock one: the solar arc, its year, and the derived sky palette
    ├── season.ts                   clock two: growth, turn, snow, ice, sea smoke
    ├── weather.ts                  clock three: the front, what falls, how long it stays wet
    ├── rain.ts                     the fall, as one screen-sized column of streaks
    ├── lut.ts                      cached cinematic colour-grade recipes
    ├── mist.ts                     ground-mist sheets, and the sea smoke off the coast
    ├── noise.ts                    deterministic height sampler
    ├── post.ts                     ao, ssr, sun shafts, tilt-shift, lut, bloom, grain, traa
    ├── quality.ts                  minimal/mobile/desktop/ultra gpu budgets, and the unlock
    ├── camera-path.ts              the waypoint tour, and the spline it flies
    ├── runtime.ts                  live pixel ratio, frame cap, shadow cadence
    ├── tier-memory.ts              what the device last proved it could not do
    ├── vitals.ts                   the one frame measurement everything else reads
    ├── landscape/
    │   ├── survey.ts               the pure composition, before anything is drawn
    │   ├── archipelago.ts          every inhabited island, joined by what faces the world
    │   ├── layout.ts               yard, cart track, field plots, ridges, pasture, mill
    │   ├── height.ts               authored ground, islets, beck, fbm underneath
    │   ├── steading.ts             where the buildings stand, and which way they face
    │   ├── landing.ts              the shoreline the jetty and the harbour are on
    │   ├── path.ts                 route smoothing and polyline queries
    │   ├── network.ts              the farm's street plan: places, tree, shortcuts
    │   ├── footpath.ts             a planned leg traced into a worn line
    │   ├── cart-ruts.ts            the wheel lines worn down the cart track
    │   ├── creek.ts                the beck: descent trace, channel, tidal mouth
    │   ├── beacon.ts               the outer rock a light would stand on
    │   ├── mill.ts                 the exposed shoulder a windmill would stand on
    │   ├── mill-sails.ts           every mill's wheel, turning in one instanced draw
    │   ├── waterway.ts             the navigable water between the ports
    │   ├── boats.ts                the fleet, and the wake it leaves
    │   ├── boat-motion.ts          one shared departure clock, one leg each
    │   ├── terrain.ts              geometry, banded colour, path wear painted in, ruts merged on
    │   ├── water.ts                bathymetry, swell, foam, glitter, winter ice
    │   ├── samplers.ts             where the dressing throws its darts
    │   ├── dressing-zones.ts       what the composition already claims the ground for
    │   ├── dressing-helpers.ts     the placement questions that are pure geometry
    │   ├── dressing.ts             placement, hero merge, instanced scatter
    │   └── index.ts                the scene module, and what raycasts
    ├── textures/
    │   └── catalogue.ts            every texture in the scape, in one list
    └── props/
        ├── index.ts                the roster, hero vs scattered
        ├── palette.ts              the nordic colour vocabulary
        ├── material.ts             shared materials, cloud shadow, wind, wetness, snow
        ├── ploppable.ts            2d placement with a ground-following foundation
        ├── primitives.ts           terse primitive constructors
        ├── fence.ts / wall.ts      continuous ground-following runs
        ├── timber.ts               cladding, gable and roof vocabulary
        ├── buildings.ts            barn, farmhouse, sauna, aitta, woodshed
        ├── structures.ts           jetty, well, hay rack, gate, bridge, cart
        ├── vegetation.ts           spruce, pine, birch, grass, reeds, crops
        ├── upland.ts               meadow barn, hay drying poles
        ├── mill.ts                 the post mill, its trestle and its sail wheel
        ├── beacon.ts               the lighthouse tower, and the optic that turns in it
        ├── shore.ts                boathouse and slipway, net rack, mooring stakes
        ├── objects.ts              rowboat, bales, firewood, barrel, mailbox, driftwood
        └── stone.ts                erratics, field stones, cobbles, cairns

scripts/
├── args.ts                         the shared command line, and dotted-path overrides
├── browser.ts                      finding a chromium, and serving what it looks at
├── raster.ts                       the ascii rasteriser and the palette audit
├── prop-map.ts                     one prop as ascii, from six angles
├── scape-map.ts                    the whole composition as ascii
├── scape-shot.ts                   headless stills, posed and pinned
└── scape-diff.ts                   what a change did to the picture, in numbers
```

## budget

one `createApp` render loop; the post module is the only frame renderer. teardown releases geometries, materials, sky, mist, cloud-shadow and bathymetry textures, composer targets, fullscreen passes and every baked lut.

**the default pixel ratio is 1.0 on every tier that is actually detected.** this scape is drawn through a per-pixel post chain — bloom, two tilt-shift pairs, god rays, the grade — so a retina desktop at 1.75 pays roughly three times the fill to sharpen an image whose whole look is soft focus and grain. `runtime.pixelRatio` in the overlay raises it when the point is a crisp still rather than a smooth scape.

the `ultra` tier adds ambient occlusion, screen-space reflections on the lake, anamorphic streaks and a traa resolve; it is only selected for a wide viewport on a many-core machine with a mouse.

the touch tier is the one with a hard ceiling to respect. it drops the pmrem room environment — twelve megabytes of rgba16f for an ambient term the hemisphere light already approximates — paces the draw at 30 fps, and sizes the lake to the fog rather than to the map. phone tiers also skip hardware shadow maps, avoiding the hidden mesh-depth pass firefox rejects on the pixel 10, while keeping cloud shadow and direct-light shape. the loop parks whenever the document is hidden, because a backgrounded phone that keeps drawing is a phone heating up for nobody.

if the gpu takes the context away anyway, that is treated as the device answering a question about its budget: `reduceAtmosphereQuality` steps one tier down, the canvas is replaced with a fresh one — a canvas only ever hands out a single context, restored or not — and the scape rebuilds itself. the `minimal` tier at the bottom is never detected into; it gives up the post chain entirely. once there is nothing left to give up the scape says so rather than looping.

---

# the design record

## props

every prop is a pure geometry factory — `(rng, palette) => BufferGeometry` — built from many `part()` primitives and collapsed with `mergeParts({ grime })` into one non-indexed, vertex-coloured geometry with its base at `y = 0`. `applyGrime` darkens each prop toward its base, which is free baked ambient occlusion and most of what makes a prop feel placed rather than floating.

that shape is what keeps the budget honest — detail costs vertices, not draw calls:

- **hero props** are placed by hand at layout anchors and merged into a *single* geometry, so the whole steading plus all its fencing is one draw
- **scattered props** are stamped through `scatterInstances`, one `InstancedMesh` each, with a near-white per-instance tint that varies the shade of a prop without repainting it

[`fence.ts`](src/scene/props/fence.ts) and [`wall.ts`](src/scene/props/wall.ts) are the deliberate exceptions to the factory shape. `buildFenceRun` takes a polyline and sets each post at its own ground height, then spans the rails post to post so they pick up the slope on their own — a fence built from rigid identical segments either floats over dips or, tilted per segment, zig-zags where neighbours disagree, and real fences do neither. `buildStoneWallRun` follows the same line and puts three courses of granite per station on it, stations set *closer together than a stone is long* so the courses overlap: a wall is only ever a pile that happens to be long, and gaps are what separate one from a row of rocks.

### the roof is a plane

[`timber.ts`](src/scene/props/timber.ts) holds the vocabulary every gabled building is assembled from, and one rule: **a gabled roof is a plane, and every other part of the building either lands on that plane or stays under it.** `roofUnderside(roof, across)` *is* that plane, and it is exported so a building asks the question rather than re-deriving the answer.

that rule is not decoration. the buildings used to describe the roof twice — once as a pitch measured from the overhang tip, once as a stack of shrinking gable courses — and the two disagreed by up to 0.66 m, which showed up in play as dark red blocks scattered across the shingles. a gable end is now one triangular prism whose upper edges lie *on* that plane by construction, so it cannot poke through a roof built from the same plane. it also costs 12 triangles where four stacked courses cost 48.

the two other heights a building is written against are its `plinthY` — a door drawn from `y = 0` is not a taller door, it is a door with its bottom quarter inside a socle that is proud of the wall — and, for anything sitting *on* the pitch, `roofUnderside` plus `roofRise`, which is the slab's thickness measured straight up rather than perpendicular.

because prop builders never touch a scene or a gl context, the whole roster is unit-tested headlessly: attributes, base height, bounds, and byte-for-byte determinism per seed.

### ploppable

placement in a landscape is a two-dimensional decision — you choose *where* on the map a barn goes, never how high — but every scene-graph api asks for three numbers and lets you get the third one wrong. [`ploppable.ts`](src/scene/props/ploppable.ts) extends the library's `Prop` with the ground field bound at construction, so callers pass the two coordinates they have an opinion about.

given a footprint it also fixes what makes flat-based props look pasted on. it levels the floor against the *highest* corner — sink to the mean and the uphill half ends up under the turf; sink to the low side and the building climbs out of the hill it should be cut into — then extrudes a foundation whose lower edge follows `heightAt` all the way round.

this is why the five farmstead buildings are the only props that leave the merged steading draw. a merged geometry is baked at build time and can only ever sit at one height; five extra draws against the same material is not a state change.

## placement

[`dressing.ts`](src/scene/landscape/dressing.ts) uses two strategies, chosen by what the prop is for.

**structural** props — trees, boulders, bales — go through `createPlacementField`, which owns the claims registry and enforces mutual spacing. the candidate loop lives in `dressing.ts` rather than in the solver: `place()` claims a spot the moment it satisfies the *query*, so a caller that then rejects it on its own rules leaves a claim behind that blocks everyone else. a few hundred of those and the field is saturated with nothing in it. the rules are tested first, and only an accepted spot is `reserve()`d.

**ground cover** — grass, crops, cobbles — uses a plain jittered scatter with no mutual test. overlap is invisible at that density, and the solver's spacing check is `O(claims)` per attempt, so routing nine hundred grass tufts through it would cost more than the rest of the build put together.

**where the darts are thrown matters as much as what accepts them**, and [`samplers.ts`](src/scene/landscape/samplers.ts) is the three answers to that. the island sampler draws from the mainland *or* an islet rather than uniformly over a field that is mostly open sea. the disc sampler narrows to one named feature: the pasture is a quarter of a percent of the island's disc, and the drying poles scattered through the island sampler landed, measurably, never. the tread sampler walks the traced path network itself, which is what turns a budget of nine hundred cobbles into nine hundred cobbles on the path rather than eleven.

## the farm's street plan

the farm is a set of places — a yard with five buildings on it, a landing, a boat harbour, a walled pasture, four field plots — and the paths between them are the composition, not scenery.

**it is a network, not a star.** the first version had every route leaving the well and ending somewhere, which is what you get from asking *how does a person reach each place*. it is wrong in the one way a reader notices: getting from the barn to the woodshed meant walking to the middle of the yard and out again, past a door you were already standing at. [`network.ts`](src/scene/landscape/network.ts) plans it in three steps instead.

1. **places first.** the well, each building's *doorway*, each field's gate, the meadow gateway, the landing and the harbour.
2. **a minimum spanning tree over them**, costed so a leg that would have to detour round a building is dearer than one that would not — 2.6× — which makes the tree prefer the open side of the yard to the squeeze between two walls. that alone joins everything to everything by the shortest total length there is.
3. **shortcuts**, because a tree has no loops: two doors ten metres apart can be a forty-metre walk from each other through the well. any pair the tree makes a real detour of, close enough to be worth it and clear of every building, gets a direct leg. that is what closes the ring round the yard.

it is pure and rng-free — the same layout always plans the same network. the wander that keeps the result from looking surveyed is applied later, when the legs are traced.

**a yaw is not a bearing, and this cost months.** `rotateY(θ)` carries a prop's front (local `+z`) to `(sin θ, cos θ)`; a compass bearing points at `(cos a, sin a)`. the two are reflections about the diagonal and agree on exactly one heading, so getting it wrong looks right on some seeds and puts the farmhouse door in the hedge on the rest. the steading had been arranged by bearing since it landed. `faceToward(from, to)` is now the one function everything that has to agree about a front goes through — the yaw, the doorstep, the leg worn to it — and [`yawAlong`](src/scene/landscape/layout.ts) is its counterpart for anything laid *along* a line rather than facing down one. that same conversion had already been found once, when the jetty ran across the water it was meant to run into.

**a path is found, not drawn.** [`footpath.ts`](src/scene/landscape/footpath.ts) starts each planned leg as a straight line and relaxes it. every interior point gets two nudges per pass. the first pulls it toward the midpoint of its neighbours, which is the gradient of the route's own length and is what stops it meandering. the second pushes it along the ground gradient, scaled by how much of a *bulge* it is — how far its own height stands above, or below, the two points either side of it.

that second term is the whole idea, and it is signed for a reason. a point higher than both neighbours is a crest the route is climbing for nothing, so it slides downhill. a point lower than both is a hollow it has to climb out of, so it slides up. a point that merely sits *between* its neighbours is on a steady grade — a hillside path, which is a perfectly good thing to be — and the term vanishes there however steep the ground is. so a route traverses slopes happily and refuses humps and dips, which is what a worn path does and what a shortest-path search does not. `footpath.climb` is how much sidestep a unit of gradient buys; at 0 the routes are straight lines, which is a survey rather than a path.

the difference between a bump and a footfall is one constant: `SLACK` is a third of a metre of height difference below which the bulge term reads as zero, and without it the sidestep chases the terrain's own grain and the route wanders over centimetres.

**paths go round buildings, never under them.** the yard arrangement lives in [`steading.ts`](src/scene/landscape/steading.ts) rather than in the dressing, because two copies of where a barn stands is how a path ends up leading to where the barn used to be. each building carries a rough radius, and a point that lands inside one is *projected* straight out of it after every relaxation pass rather than pushed by another force term — a path that mostly misses the barn is not a path that misses the barn. endpoints are exempt: a route to a door has to arrive at the door, and `doorstepOf` puts that anchor a pace outside the wall, further out than the clearance a route is pushed by.

**a field is met at its gate, cut toward its neighbour.** the anchor marches out from the plot's middle until the plot stops claiming the ground, which is exactly where its fence run stands — so a path arrives at the fence rather than walking through it. and the bearing it marches on points at the nearest *building*, not at the middle of the yard, because that is the neighbour the network is going to join it to. aimed at the yard and then joined to the barn, the gate ends up round the wrong corner of the fence.

**it is paint, and never height.** the legs are traced across the ground *as built* — levelled yard, graded track, carved beck and all — which is what makes them agree with the scape they cross, and also what stops them carving it: a path that sank the hillside it had just been routed over would move that hillside out from under itself on the next build. the terrain takes the wear as vertex colour and the scatter takes it as a place not to stand, and no vertex moves.

**the wear weighs itself by how green the ground already was.** this is what turns a dozen legs converging on a yard into a network instead of a stain. a path is turf that has been walked off, so it can only show where there was turf: across the meadow the full lerp toward `palette.trodden` lands, and on the yard, the cart track and the tilled plots — ground that is bare because something else already made it bare — it barely registers. the same arithmetic the seasonal tint uses, on a colour the painter already has in hand.

wear does **not** fall along a leg. it used to, mildly, back when every route started at the well and traffic really did concentrate at the hub. on a network both ends of a leg are places somebody has business at, and a taper running from one end to the other leaves a visible seam at every junction where a faded tail meets a full-strength head.

**cobbles are what make it a paved network rather than a bare stripe.** they are sampled *along the traced legs* — a segment picked in proportion to its length, a point along it, a jitter across the bare middle — rather than thrown at the island and tested. the island sampler is the wrong instrument for paving: the treads are a few hundred square metres of a landmass that is tens of thousands, so all but a handful of darts miss and the budget that survives gravels a path instead of cobbling it. no legs, no paving — turn `footpath.wear` to zero and the stones go with the paths they were laid on, without a second switch saying so.

this matters more than it sounds, because **a coarse tier cannot resolve a tread**. a terrain quad is 0.8 m across on desktop and 2 m on mobile, and a tread 1.5 m wide cannot resolve on either — so the vertex-colour wear arrives as a soft band of bare ground rather than a drawn line, and softens further the cheaper the tier. the stones are what carry the edge.

**what the scatter does with it.** the tread joins the list of things the ground is already spoken for by, alongside the yard, the track, the plots and the pasture: no spruce, boulder, bale or tuft of grass stands on it. the threshold is set at the middle of the tread rather than at the verge, because a dozen routes each clearing a two-metre corridor is a bald farmyard rather than a network.

**cost is one draw call** — the second `InstancedMesh` of cobbles. the legs are planned and traced once at build, under a millisecond for the whole network, and baked into terrain vertex colours that were already being written. the per-vertex query is a bounding-box reject followed by a segment walk. every tier gets the paths, `minimal` included.

`footpath.*` and `dressing.pathStone` are build-time knobs and are absent from the overlay for the same reason `creek.*` and `layout.*` are.

## the ruts down the cart track

two worn lines an axle apart, down the middle of the road between the yard and the landing, fading out as the traffic thins. [`cart-ruts.ts`](src/scene/landscape/cart-ruts.ts).

**it is geometry because paint could not draw it, and that is the whole design.** the section above already says why: a terrain quad is 0.68 m across on the home island at the finest tier and 2.3 m on mobile, and the vertex colours can only carry a feature several quads wide. a footpath is 1.5 m and survives as a soft band. a *rut* is two thirds of a metre. painted into that grid it does not come out thin, it comes out **absent** — the first attempt at this feature painted ruts into the terrain and `scape:diff` reported `same` at all six poses, because the ground has no vertices to spare where the wheels run. widening a rut until the grid can hold it stops it being a rut and turns the road into one dark strip.

a ribbon traced along the track carries its own vertices at its own spacing — a cross-section every half metre, five vertices across each rut — so the ruts are as fine as the wheels that made them and cost exactly the same on every tier. `minimal` gets the ruts `ultra` gets.

**the seam is closed with colour, not with blending.** the ribbon's two outer vertices are painted with the *ground's own* colour at that point, sampled from the same [`createTerrainPainter`](src/scene/landscape/terrain.ts) the terrain patch beside it used, and only the middle darkens toward wheel-packed earth. so there is no transparency to sort, no fade to tune and no second opinion about what colour the road is: the edge already matches what it lies on, whatever the season and the altitude band have done to it. the ribbon floats 6 cm, which clears the chord the terrain triangles cut under it without reading as floating from an isometric camera.

**both ruts wander together, because they are one axle.** the sideways drift and the thinning along the line come from a smoothed 1D value noise on the shared coordinate hash — interpolated between whole cells, because `hash2` is a hash and not a field, and a rut jittered by a raw hash is gravel. deterministic, and independent of every other generator: adding a prop does not move the ruts.

**wear belongs to the yard.** it is full where the traffic is and gone `cartRuts.reach` metres out, which is what stops the road reading as uniformly driven along its whole length. `cartRuts.wear` at 0 is a track nothing has ever driven down — the ribbon is not built at all, so it costs a merge and a draw of nothing rather than drawing nothing at cost. there is no separate switch.

**it lies on the terrain as *drawn*, not on the ground as authored.** these are two different surfaces and the gap between them is not small: the mesh is a chord between vertices up to 2.3 m apart, and where the ground curves it stands tens of centimetres off `heightAt`. laid on the height field with a few centimetres of clearance, most of the ribbon ends up *under* the triangles it is meant to be lying on, and the ruts come out as a dashed line — which is exactly what the first capture of this feature showed. `drawnSurfaceOf` in [`terrain.ts`](src/scene/landscape/terrain.ts) reconstructs the plane of the triangle a point falls in, including which way the quad's diagonal runs, so the ribbon sits on the mesh and its 5 cm lift is a depth-buffer margin rather than a clearance.

**cost is zero draw calls.** the ribbon merges into the terrain mesh with the seabed and the three islands, in the island's local space and translated by the same origin. about a thousand vertices per island with a track, against the terrain's tens of thousands.

`cartRuts.*` is build-time and stays out of the overlay, like `footpath.*`. and a rut is 0.68 m wide, so it is under a pixel at world zoom: capturing one needs `camera.focusX`/`camera.focusZ` and a small view size — see [`agents.md`](agents.md).

## every effect, on every tier

a tier is a bundle of decisions taken from what the device says about itself, and the cheap ones leave whole systems out rather than drawing poor versions of them — no post chain on mobile, no shadow maps, no aurora on `minimal`. that is the right default and it is the wrong ceiling: it is the reader's hardware, and a preset written from a media query is not better informed about it than they are.

`runtime.effects` is the switch. `tier` is the preset as authored; `all` runs it through [`unlockEffects`](src/scene/quality.ts), which turns on every boolean and lifts every zeroed count to the smallest number at which that system still reads as itself — one veil is an aurora, a few hundred drops are a shower.

**it turns systems on; it does not spend the tier's budget.** pixel ratio, terrain and water segments, the scatter budget, the shadow map size and the frame cap are untouched, and there is a test that says so. a phone asked for every effect gets every effect *at a phone's scale*, because those numbers are what the tier is actually for — handing them up as well would turn a switch into a way to cook a handset.

**it rebuilds the scape, and says so.** almost nothing in this config needs that; the modules re-read it every frame. what does are the decisions taken once, when the renderer and its programs are made — whether there is an `EffectComposer` at all, whether shadow maps compile, how many drops are in the rain's one static buffer. so this is the one control in the panel marked `rebuild`, and it unmounts and remounts on the same canvas rather than pretending to work until the next reload. the canvas is deliberately *not* renewed: its context is alive, and asking for another one is what the loss recovery is careful not to do lightly.

**a context loss takes it back.** the mobile preset drops the optical chain because a PowerVR handset loses its context to it, and this switch is what puts that back. if the device answers by dropping the context, `loseContext` puts `runtime.effects` to `tier` along with everything else it walks down — the reader's answer is respected right up until the hardware disagrees with it.

`?effects=all` is the same switch from a url, which is the only way to photograph a phone tier with the whole chain on it.

## every texture, in one list

[`textures/catalogue.ts`](src/scene/textures/catalogue.ts) is the roster. it exists because maps were being built wherever they happened to be needed — a seamless noise in `material.ts`, two more in `water.ts`, a baked field in each of `mist`, `clouds` and `aurora` — with the size, frequency and wrap mode written out again each time, and no way to answer *what does this scape sample, and how much of it is there* short of grepping for `Texture`.

**tiling maps are built here and shared**, so a second consumer costs a lookup rather than another upload, and the whole set is disposed as a unit by whoever built the catalogue. **maps baked from the survey stay where their data is** — a bathymetry mask belongs next to the height field it samples — but they are registered here with the module that owns them, so the list is the whole answer either way.

the rule is that a texture anywhere in `src/scene` has an entry. `catalogue.test.ts` is what makes that keepable rather than aspirational: it walks the scene source for texture constructors and fails on a module the roster has never heard of.

## the ground, and everything upright on it

the terrain's grain has always been one texture read six ways, weighted by `scapeFlat` — how horizontal the face is — because a world-space projection smears streaks down anything vertical. two things were wrong with that.

**the broad octave was the fine one read slowly.** a single field sampled at two frequencies is self-similar by construction, so the metre-wide patches landed exactly where the centimetre-wide grit was already darkest and the two reinforced into a lumpy weave instead of reading as two different histories. `ground.wear` is now its own noise — few octaves, because wear is smooth — and it also *dulls* the roughness where it is damp, which is most of what tells wet ground from dry at this distance. the albedo barely moves.

**and the `1 - flat` case had never been written.** every wall, gable, hull, jetty timber and granite face in the scape had no surface at all: flat-shaded colour, and nothing at the scale of a plank or a grain of stone. two materials carry the whole place, so "the props have no texture" was really "the injection only ever handled the ground". `prop.bark` is the other half, with the projection turned on its side to match — the horizontal coordinate wraps several times around a stem or along a wall while the vertical one crawls, which is what makes the read run *along* a board rather than across it. one fetch, weighted to nothing on ground the soil terms already own, so the two never argue over the same fragment. `terrain.propGrain` at 0 is the scape as it looked before it existed.

## the camera, between sessions

**where the reader was.** [`camera-state.ts`](src/ui/camera-state.ts) keeps the last settled pose — a ground point, a view size and a heading — under its own storage key, beside the card's and apart from the graphics snapshot. that snapshot is derived from the control list and typed against the config it writes into; a camera pose is none of those things. it is not a knob, nobody authored a default for it, and inventing config fields for it would put two copies of the camera's position in a module built specifically to avoid that.

it is written when the chase *lands*, not per frame — the settle is its own debounce, so it is at most one write per gesture. and it is parsed rather than cast: a stored pose is applied straight to the camera before the first frame, so one `NaN` from a hand-edited key is a scape that opens looking at nowhere and never recovers, and the failure would read as a broken build rather than as bad data.

**and where they want it to go.** [`camera-path.ts`](src/scene/camera-path.ts) is a waypoint tour. a stop is captured by flying the scape somewhere and pressing add, not typed: nobody knows what heading they want in degrees, and the frame they are already looking at is the answer.

the tween is a uniform catmull-rom — the same spline the routes are smoothed with, and for the same reason: it passes *through* its control points, so a stop the reader placed is a place the camera visits rather than one it leans toward. headings are unrolled onto one continuous number line first, by accumulating the *shortest* step between consecutive stops, because interpolating compass degrees directly is how a tour from 350° to 10° swings the long way through every heading it was not asked for. a looping path keeps the unrolling going across the seam, so a tour that genuinely circles twice still circles twice. a path that does not loop eases in over its first leg and out over its last; a loop does not, because the one place the reader cannot see a join is the seam, and easing there is how it becomes visible.

**it drives the same target a drag does.** there is one integrator in `camera-controls.ts` and the tour writes `target` exactly as the boat follow and every gesture do — a second tween beside it is how two things end up disagreeing about where the camera is. any manual input stops the tour, and stops it *where it is* rather than snapping to where it was heading, because a tour you cannot interrupt by grabbing the scape is a cutscene. escape is the documented way out of all three: the tour, the boat chase and the idle orbit.

## the shape of the island

a radial falloff draws a perfect disc, and nothing in the sea is a disc. `sinkToIsland` warps the falloff itself with a two-octave noise on the bearing, so the island grows headlands where the value is high and cuts bays where it is low — and because *every* other part of the scape is written against that function rather than against a radius, all of them inherit the shape without being told: the beach shelves along it, the foam follows it, the placement searches respect it, the mist's land mask is cut by it.

the fix is deliberately not "add detail to the height". roughening the terrain under a circular falloff gives a rougher coastline that is still round. **the falloff is the coastline.**

`islandInner` and `islandOuter` stopped being shorelines the moment the coast started wandering. they are where an *average* bearing starts and finishes falling away; the coast moves either side of that band by `COAST_REACH` of its width. so there are three radii worth naming, and confusing them is how a wall ends up in the sea:

| | what it is |
| --- | --- |
| `landRadiusOf` | dry whichever way you walk — `islandInner` less the whole coast reach |
| `liftRadiusOf` | the mean coastline, and how far the central massif reaches |
| `islandOuter` + reach | the furthest a headland can get, and what the islets must clear |

every placement search that assumes solid ground uses the first. the pasture search uses the second, because unlike the others it *verifies* its ground — `ringIsDry` walks the whole enclosure — so it can go looking on a headland and be told no.

**the massif is what makes a big island an island.** the fbm averages to nothing at any size while the falloff still has to bring the whole rim down to the same sea, so a larger island built from noise alone is a larger *flat* island — and a flat island has no upland for a pasture, no hillside for a beck, and no reason for the farm to be where the farm is.

**things sized in metres do not survive a change of scale.** growing the island exposed every constant that was really a fraction wearing metres: the sky and cloud decks tiled half again as often and turned to wallpaper, the sea-ice floes did the same, the pasture's distance score outranked the height it was supposed to be breaking ties on, and the probe grids searched the same number of points over twice the ground. all of them are expressed against `terrain.size` now.

## islets

`terrain.isles` are raised *after* the island falloff, never before. the falloff's whole job is to drown the terrain plane's rim unconditionally so its square edges never read as the edge of the world; anything meant to survive out there has to come later.

their profile is a **plateau with a skirt, not a dome**, and that decides whether they read as islands at all. the seabed is seven metres down and the crown a couple of metres up, so the blend has to reach roughly 0.7 before the ground breaks the surface — and a smooth dome only gets there near its very centre. an eleven-metre islet surfaced as a one-metre pebble. holding the blend at 1 across the inner 55% puts the waterline out at about 0.72 of the radius, which is an island with a beach on it.

there are fifteen, grouped rather than evenly spread — a close western pair, a southern chain thinning as it runs out, one substantial north-eastern outlier, skerries filling the gaps — because a ring of like-sized islets at even bearings reads as decoration however well each one is modelled. each clears the mainland's *warped* shore and its neighbours' skirts, which is the difference between an archipelago and a reef. they get the same coast warp the mainland does, sampled in each islet's own frame seven times tighter: at world scale the warp is nearly constant across a disc eight metres wide and would only nudge the whole islet sideways.

## the beck, and the inlet it cuts

a beck springs on the highest interior ground the farm is not standing on, falls through a channel cut into the hillside, and flares out at the shore into a tidal inlet reaching a good way inland. it is the first feature whose *shape* is found rather than authored — everything else is sited by a search and then drawn, and this one is traced.

**it costs no draw call and no material.** the lake is already one plane spanning the map, drawn wherever the baked bathymetry mask says there is water under it — so anything carved below the waterline fills itself, with the swell, depth tint, shore foam and glitter the sea already has. the beck is a hole in the terrain, and the terrain was one draw before and is one draw now.

**the course is a steepest-descent walk, because water only goes one way.** [`creek.ts`](src/scene/landscape/creek.ts) fans twenty-four bearings at every step and takes the cheapest, where the cost is the ground it lands on less two bribes: one for holding the heading it already had, and one for heading seaward. the first stops a quantised fan tracing a staircase. the second gets it out of the closed hollows the raw fbm has inside `islandInner`.

**a nudge is not enough for the deep ones.** a stream that cannot descend out of a basin fills the basin and leaves over its lowest lip — so the seaward bribe grows with every step the walk fails to get further out and collapses the moment it makes ground. that turns "usually terminates" into "always terminates", because every stalled step raises the price of staying until no rim is worth it. before it, two of four candidate courses ran out the step limit going round in circles.

**the springs are not `layout.ridges`.** the obvious thing was to start from the wooded high points the conifers cluster onto, and it produced five-metre stubs: those are ranked on the raw fbm over a square grid whose corners reach past `islandOuter`, so most are already under water once the falloff has had its say.

**the beck is resolved last, and routes around the farm.** teaching three searches the shape of a channel that does not exist yet is three chances to disagree about it; handing the beck one list of discs it has to miss says the same thing in one place. that is why adding a watercourse moved nothing that was already in the scape.

**the channel is carved after the track, never before.** the road grade is sampled from a ground with no channel in it and then smoothed, so levelling the track second would fill the crossing back in. carved second, the beck cuts *under* the road, and `findCrossing` sits the bridge deck on the nearest track points the channel does not claim — a bridge sat on the carved ground under it is a bridge lying in the beck.

**the long profile is clamped to fall the whole way.** the descent obeys the raw fbm and the ground it is carved into is not that: the shore shelving lifts the bank, an islet across the mouth's path raises the seabed. left alone the scape gets a stream running up over a bar and back down. a running minimum over the smoothed profile is the one rule water has.

`creek.mouthFlare` decides whether the scape gained a stream or a sound; below about 2 the lower reach never resolves on the mobile tier, where a terrain quad is two metres across and the whole channel is five.

## the upland pasture

up the slope from the steading there is a walled hay meadow: a drystone wall, a gap facing back down at the farm with a gate in it, a meadow barn at the back, hay drying on poles. the ground inside is painted as mown grass rather than the heath the altitude bands would give it, so the clearing reads from the far zoom as somewhere kept rather than somewhere bare.

**siting it is a search over ground that does not exist yet**, and two of its rules are there because the first version got them wrong.

**a centre being on land says nothing about the ring.** sited on its centre's own height, the search picked a shoulder above a cove: five metres of dry hillside in the middle, and a third of the wall thirty metres out where the falloff had already drowned the ground. so the whole disc has to fit inside `landRadius`, and twelve probes around the wall line have to come back dry.

**it has to agree with the ground that gets built.** `height.ts` sinks the raw fbm into the island before anything else touches it, and the layout searches run before `height.ts` exists — so they were reading a height the terrain would never have. `sinkToIsland` is now that falloff, in one place, called by the height field *and* by the search that has to predict it. two approximations of the same curve is exactly how a wall gets built on the sea.

the barn is set hard against the back wall: a building's claim on the solver is a circle around its longest half, which on a twelve-metre enclosure is most of the enclosure, and pushing it back leans that circle onto the wall's own claims instead of onto the meadow.

## the mill on the shoulder

out on the exposed rise the farm never built on there is a post mill: a boarded buck on a single oak post, four stone piers and two crosstrees under it, a stair down the back that reaches the ground, and four common sails turning off the sea wind. the geometry is [`props/mill.ts`](src/scene/props/mill.ts), where it stands is [`landscape/mill.ts`](src/scene/landscape/mill.ts), and the wheel that turns is [`landscape/mill-sails.ts`](src/scene/landscape/mill-sails.ts).

**a mill is sited by a question the rest of the farm never asks: is there any wind here.** the yard search wants the flattest sheltered ground the island has and the pasture search wants high ground the farm is not already using — a mill wants neither of those, it wants the open shoulder. so `findMillSite` scores *prominence*: the ground's height less the mean of a ring of eight probes twenty-two metres out. the mean rather than the lowest of them, because a shoulder with one gully cutting into it is still a shoulder, and scoring it by the gully moves every mill on the coast back into the middle of its island.

**it is sited last, after the beck, and that is the finding this feature turned up.** every other search runs before `createCreek` and hands the water a disc to miss, which is the right order when the thing being sited cannot move. a mill *can* move — it is the one feature in the scape that could stand almost anywhere — so putting it in that queue meant the beck was routed around it, and the first working version moved a spring that had been on the same ridge for four runs and lengthened the course by fifteen metres. what does not negotiate goes first. the mill now takes the beck's own centreline as a line to keep off, at the trestle's footing plus a channel width.

**the trestle has to be on dry level ground; the sails do not.** the sweep is held clear of the field plots, the pasture and the cart track, but the wheel is allowed out past `landRadius` and over the water — a headland mill with a sail tip over the sea is what a headland mill looks like, and holding the whole eight-metre sweep inland is what stopped the smaller islands qualifying at all. what the *trestle* needs is a metre and a bit of level, measured as the spread of four probes at pier spacing, because four dry-laid piers tolerate a slope a barn's sill does not.

**`null` is an answer.** at the default seed the home and meadow islands each build one and the ridge island does not: every shoulder it has is too steep under a four-metre footing. `scape:map --stats` says so per island rather than leaving it to be noticed. `mill.prominence` is the switch — raise it past what the ground offers and the mills go, which is the same shape as every other absence in this scape and for the same reason.

**the wheel is the one part of a building here that cannot be merged.** everything else in the settlement is baked into one geometry at build; sails turn, so they are their own `InstancedMesh` with one instance per mill and one draw for the archipelago. its bounding sphere is *given* rather than derived, because three computes an instanced bound from the geometry at the identity and these hubs are three hundred metres apart — without it two of the three mills are culled from most poses. the rate is `mill.spin` scaled by `wind.strength`, so the knob that already says how hard it is blowing turns the wheel too, and a still day stops it with nothing else set. a stopped wheel writes no matrix and uploads no buffer.

**the hub is one number in two places, so it is one constant.** the windshaft is modelled into the mill and the wheel is placed by a different module entirely; `MILL_HUB_HEIGHT`, `MILL_HUB_REACH` and `MILL_SINK` are exported from the prop and read by both, and the test that says no sail tip reaches the ground is stated against those constants rather than against a screenshot.

## the light on the outer rock

on the furthest skerry the ring has, there is a lighthouse: a battered stone tower with a painted band round its middle, a corbelled gallery with an iron rail, a glazed lantern room, and a cap with a vent finial on it. after dark the lamp comes up and the optic turns, sweeping two beams over the water on the desktop tier and three on ultra. the geometry is [`props/beacon.ts`](src/scene/props/beacon.ts), where it stands is [`landscape/beacon.ts`](src/scene/landscape/beacon.ts), and the light itself is [`scene/beacon.ts`](src/scene/beacon.ts).

**a seamark is sited by the one question no other search here asks: what is the last thing a boat passes.** the yard wants shelter, the pasture wants unused height, the mill wants wind. this wants *reach* — distance from the island's own centre — and everything else it needs is a threshold rather than a preference: `beacon.minRock` metres of islet radius to hold masonry, `beacon.freeboard` metres of rock between the plinth and the water. at the default seed that puts it on isle 5, the substantial north-eastern outlier, 74.7 m out with 6.69 m of freeboard.

**the outermost rock is not automatically the one that gets it.** two skerries stand further out than the chosen islet and neither could hold a tower: one is under the radius, and one is broad enough on paper but has water inside the footing once its own coast warp is applied. so the footing is *probed* — eight bearings at `BEACON_FOOTING`, all of which have to come back dry — rather than inferred from the islet's authored radius. the test in `landscape/beacon.test.ts` states that as a fact about the ground: every rock further out fails on radius, on freeboard, or on a wet footing.

**the crown is searched for, not assumed at the centre.** an islet carries the same detail fbm the mainland does, so its high point is a metre or two off the middle of its disc. six probes at 30% of the radius find it, which is what keeps the gallery clear of the rock behind it.

**the tower is eleven and a half metres, and that is a composition decision rather than a modelling error.** a real coastal light is thirty; at this scale, where a farmhouse is five metres and the whole island is 196, thirty metres reads as a chimney stack dropped into a model village. eleven and a half makes it the tallest thing in the archipelago without making it the only thing in it. the shaft is five courses rather than one tapered cylinder, because a lighthouse wall is *battered* — the taper steepens toward the foot — and one cone from foot to gallery is a silo.

**the tower is merged, the light cannot be.** the masonry goes into the same merged settlement draw as the mill and the boathouse. the optic turns, so it is its own `InstancedMesh` with one instance per lantern and one draw for the archipelago, and its bounding sphere is *given* for the reason the sails' is.

**a beam is two crossed fans, not a cone**, and that is the finding this run turned up. the first version was a five-sided cone at a flat tint, and it photographed as a plank of cream-coloured timber: a cone's surface is all silhouette and no axis, so nothing about it gets brighter toward the middle, and additive blending saturated the whole shape into a solid slab. two ruled fans crossed at right angles have a middle — they are brightest where they intersect, which is the axis — and the colour is graded per *vertex* down the length and out to both edges, so the beam dies into the night at `beacon.beamReach` instead of ending in an edge. both grades are deliberately gentle: a steep one across the width leaves a bright wire with nothing either side of it, which is a laser rather than a lantern. the material writes no depth and takes no fog, because fog would mix a beam toward the fog colour and then *add* it, which puts a grey cone in a hazy sky.

**brightness is most of whether it reads as light at all.** the same geometry at `beacon.lamp` 0.62 is a solid shape and at 0.34 is a glow, because additive fill over near-black water saturates long before it looks bright. that is why the default is low and the slider goes to 2.

**the lamp answers to `1 - day`, not to `dark`.** `dark` is the deeper threshold, the one the stars come out at — and a light is lit long before that, from the moment the sun is off the water. it also means a midsummer midnight at this latitude, which has no day in it and no dark either, has the lamp burning. squared, so it comes up through dusk rather than switching on.

**it is mounted after the atmosphere, because that is where the day is resolved.** the landscape publishes `lanternHubs` — where every lamp is, in world space, lifted by `LANTERN_HEIGHT` and sunk by `BEACON_SINK`, both read from the prop rather than defaulted — and the light layer consumes them. a module mounted before the atmosphere reads the hour it was on the previous frame.

**the plinth is a zone as well as a claim.** the placement solver keeps trees, saplings, erratics and cairns off the light's footing, but ground cover never asks the solver anything — measured, the first version had grass and heather growing up through the masonry, one tuft 0.4 m from the tower's centre. `onBeacon` joins the yard, the track, the paths, the plots and the pasture in the `clear` test, which is the one place that question is asked.

**while the sun is up the system is not drawn at all**, rather than drawn at zero opacity: a transparent mesh still costs a sorted draw, and the beams are most of a hundred metres of fill. `quality.beaconBlades` is the tier's answer and 0 is a graceful absence — the lantern still glows, it simply throws nothing, which is a fixed harbour lamp rather than a broken sweeping one. `beacon.turn` is turns per minute and 0 stops the sweep where it stands, which is what puts it in `STILL` and lets a capture be taken twice the same way.

## the boat harbour

a boathouse stands in the next cove along from the landing, a net rack dries gear on the bank behind it, and stakes are driven into the shallows off both.

**the boathouse is anchored to the water, not to the ground.** the five farmstead buildings are `Ploppable`s that level a floor and grow a foundation down onto the terrain — do that here and the foundation buries the one part that has to be open, the mouth and the slipway running out of it under the surface. so it is placed at the waterline the way the jetty is, on its own piles, and pushed a little seaward so the back of the shed cuts into the slope the way a real one is dug in. being a hero prop it merges into the steading geometry, so the whole harbour costs no draw call at all.

**a stake belongs to whoever drove it.** the mooring posts are the one scattered prop with a *placement* rule rather than a terrain rule: shallows, but only within thirty metres of the harbour. scattered on depth alone they would ring every islet in the archipelago, which says the opposite of what a harbour says.

## the clock

`daylight.ts` resolves a phase into a sun direction and a complete sky. the authored atmosphere palette stays the **noon anchor** and everything else is derived from it: dusk is that anchor pulled toward one warm colour, night toward one cold one. a deliberate trade against a keyframed palette per hour — retuning the scape is still editing colours that were already there, and no time of day can drift out of the family the rest of the scene was graded for.

the one place the arc is not honest is where it has to be. **the key light never goes below the horizon**, however far under it the sun actually is. a directional light following the real arc down there lights the terrain from underneath: shadows invert, every north face blows out, the shadow-frustum fit degenerates. so the arc governs the light's *colour and strength*, which is what night actually looks like, while the direction is held just above ground — and the result reads as moonlight instead of as a rendering bug.

### the arc knows what week it is

the arc used to be one shaped sine at one authored noon height, swinging through a fixed fraction of a half turn whatever week of the year it was. that is a sun with no year in it: a december noon stood exactly where a june noon stood, and the only thing that knew otherwise was a curve in `season.ts` drawn by hand to keep the aurora off a midsummer sky.

it is solved now, from **a latitude and an axial tilt**, through the hour-angle form every almanac uses:

```ts
declination(year)  = -cos(year · τ) · axialTilt
sin(elevation)     = sin(lat) · sin(dec) + cos(lat) · cos(dec) · cos(hour)
dayLength(year)    = acos(-tan(lat) · tan(dec)) / π
```

three lines, and none of them is a shape anybody chose. **the day length, the noon height and how far round the sky the light sweeps stop being three knobs and become three answers to one question**, which is the whole reason to do it this way: the alternative is authoring a noon height per season, a day length per season and an azimuth swing per season, and then keeping all three in step by hand for the rest of the scape's life.

`daylight.latitude` is **68°N**, a degree and a half inside the arctic circle. that number is a choice about what the year is allowed to do, not a label:

| week | noon | day length | midnight |
| --- | --- | --- | --- |
| midwinter | 1.4° **under** the horizon | 0 h | 45° under |
| equinox | 22° up | 12 h | 22° under |
| midsummer | 45.4° up | 24 h | 1.4° up |

so the midwinter frame is a **polar night** — a blue twilight around noon, dark by mid-afternoon, and nothing that resembles a day — and the midsummer one is a **midnight sun** that swings due north at midnight and never sets. both are the same expression running out of range rather than two cases bolted on, and `dayLength` returning exactly 0 and exactly 1 is the test that says so.

**`axialTilt` is the switch**, at 23.44° by default. set it to 0 and the axis stands straight: every day of that world's year is an equinox and the sun runs the arc it ran in june. there is no separate flag, for the same reason no other effect here has one.

what the latitude costs the frame is the noon sun: 45.4° at midsummer against the 52° the scape was graded under. close enough that the opening frame is still recognisably the opening frame, and the whole reason 68 was picked over the 71 that would have made the polar night longer.

**the azimuth is now an offset rather than the bearing.** `daylight.azimuth` says where the *noon* sun is placed — the art direction, unchanged — and `sunSwing` carries the light away from it by however far round the sky the geometry says it has gone. in december that is a short crawl along the southern horizon; in june it is the entire circle.

**the twilight edge had to widen with it.** `dayAmount` cut the day off at a *civil* twilight — 6° under the horizon — which was invisible under a fixed arc, because the only times the sun ever sat there were the few minutes either side of a sunrise. at 68°N it spends the whole of december's daylight there, and the first capture of the new midwinter came back a blackout: 3.7° under at ten in the morning, and the curve called it midnight. the lower edge is a **nautical** twilight now, and the midwinter frame is the blue afternoon it should have been. nothing else moved with it — every pose in `tour` but that one sits outside the band entirely.

**this changed one of the capture poses.** `tour`'s `night` used to be an hour: `time 0.02`, on whatever week the config opened at. the config opens at midsummer, and midsummer at 68°N has no night in it, so the pose was capturing a white one. it names a week now — late autumn, which puts the sun twenty-six degrees under at the same hour — because a still called `night` that is not one is a broken instrument rather than a surprising result.

## the year

`season.ts` is the clock's second hand and deliberately the same machine: a phase, a speed, and colours *derived* rather than keyframed. the authored palette stays the **midsummer anchor**; winter is that anchor pulled toward one dead straw and then toward one snow white, autumn the same straw with a gold leaned into it.

the year does not touch the shape of the world. the height field, the layout and every prop are built once from the seed and never rebuilt — **snow here is a surface response, not accumulation**. that is the whole reason a season can run on a live clock: a system that drifted the terrain would have to regenerate an island to get from august to november, and the frame it did that on would be a frame you could count.

three curves come out of the phase, and none is a straight sine.

- **growth lags the sun.** the ground warms and cools slower than the thing warming it, so the growing season peaks a twentieth of a year after midsummer and the first frost arrives before the shortest day. one constant, and it is why autumn here feels longer than spring.
- **the turn is one-sided.** warmth falls twice a year and only one of those falls turns anything gold. spring loses its snow to bare ground and greens straight off it, so the turn curve simply does not exist before midsummer.
- **snow is a plateau, not a peak.** it comes on around a fifth of the year out from midwinter and holds, because a cover that is only ever briefly total reads as a glitch rather than as a winter.

the interesting problem is that **two materials carry the entire scape**. a flat seasonal mix would take the falu red off the barn and the grey off the granite along with the green off the meadow. so the tint weighs itself by how far the fragment's own albedo leans green — the one thing grass, leaves, moss and heather have in common and paint, stone, sand and water have not — and then by how *light* that green is, which separates a birch canopy that goes gold from a spruce that stays black-green all winter. both are arithmetic on a colour the fragment already holds; neither costs a fetch, an attribute or a branch.

lying snow needs world height, to keep it off the beach and off the seabed under the shallows. **it gets that height without a varying.** `vViewPosition` is minus the view-space position and the view matrix is rigid, so a fragment's world height is the camera's height less that position projected onto the view matrix's second column — one dot product against two uniforms three already declares. on a program arguing about its budget with a handset offering sixty varying components in total, that is the cheaper end of the trade by a wide margin.

a fixed contour round an island reads as a stripe someone painted on it, so the snow line wanders on a cheap two-term sine field in world x and z.

the whole system adds no draw call, no texture, no material and no pass — it runs on every tier.

## the winter the water gets

the year reached the land first and left the sea a summer green all through january. the fourth curve is the freeze, and the lake reads it through **one uniform**.

the freeze is the snow curve's shape and never its timing, because a metre of water holds something like a thousand times the heat a metre of air does. the sea is the last thing to shut and the last thing to open: the fields whiten weeks before the bays close, and are bare again while the ice is still in. that is one constant — `ICE_LAG` — plus a narrower pair of thresholds, and it is the whole difference between two clocks and one clock drawn twice.

**depth is the rest of the physics.** a bank a foot deep gives its heat up in a week; a sound five metres deep takes the season. so the ice starts at the shoreline and walks outward, reading depth from the **bathymetry mask the lake was already fetching** for its own depth tint. `water.iceReach` is how far out that carries.

depth alone draws a contour line around the island — a bathymetry chart with the ice-fill switched on. `water.iceBreak` breaks it into floes on **three sines rather than a noise fetch**, and the second reason is the load-bearing one: the vertex stage needs the same ice front the fragment stage paints, and it cannot have it from a map the cheap tier's two-tap budget has no room to read twice. an analytic field is the one thing both stages can agree on exactly and for free.

they have to agree because **the freeze takes the swell out of the vertex stage as well as the ripple out of the fragment stage**. under ice the surface gives up its displacement, ripple normal, foam band and glitter — a shelf is flat, and a swell rolling under a sheet that is not rising with it is the giveaway that the winter is paint.

two smaller decisions:

- **ice is laid over the finished water, not mixed into its albedo.** a depth tint showing through frozen water reads as blue plastic sheeting.
- **ice is rougher than the water it replaces, not smoother.** new ice really is glassy — but the camera's elevation sweeps across the sun's as it zooms, and a near-mirror plane at that crossing is precisely the white-out the lake's own roughness exists to prevent. what reads correctly is snow-blown ice, which is matte and cannot blow out.

the one genuinely white part of a frozen bay is the front between sheet and open water, where the floes grind and pile. that rim is `4 · cover · (1 - cover)` — a ridge wherever the cover passes through a half — and it costs two multiplies.

## sea smoke

steam fog forms when air moves over water warmer than it is. the scape already holds both halves: `snowAmount` is how much winter the land has taken, `freezeAmount` how much the water has, and the land takes it first. so **sea smoke is not a curve of its own — it is the difference of the two the scape already had**:

```ts
seaSmokeAmount(phase) = max(0, snowAmount(phase) - freezeAmount(phase))
```

three things fall out for free, and all three are the point.

- **it is one-sided.** come spring the lag runs the other way and the difference goes negative, so the clamp takes it. a coast smokes on its way *into* the winter and not on its way out. nothing had to be written to make that true.
- **it needs open water and cannot get the timing wrong.** the smoke only has a strength during the weeks the sea has not shut, so there is no ice term anywhere in the geometry or the shader. an ice-front test would have been a second opinion about the freeze, and two opinions about one thing eventually disagree.
- **it peaks near 0.83, not 1**, a fortnight before midwinter. that is not a scale wanting a correction — the most open water a cold sky ever gets is however much of the year the lag leaves between the two curves.

the geometry is the ground mist's radial profile turned inside out: nothing over the island, full strength a couple of island-radii out, gone before the sheet's own edge. the two families never overlap. it is flat, low and slice-free, unlike the mist — sea smoke really is a shallow layer, a metre or two against the mist's nine-metre column. it is whiter than the mist for a physical reason: sea smoke is water that has just condensed out of the air standing on it, where ground mist is haze the sky is lighting through.

**cost: nothing until it exists, and two draws when it does.** the smoke's material has the same shape as the mist's, so three's cache hands it the program already linked and the scape gains none.

## the front, and the ground it leaves wet

`weather.ts` is the third clock, built to exactly the shape of the two above it and coupled to the second rather than duplicating it. **what falls out of a cold sky is snow, and the scape already knows how cold this week is.** so the weather owns *how hard* it is coming down and the year owns *what* — which is why there is no snowfall strength anywhere in the config. the same coupling shortens the streak, slows it, and takes it from a pale blue-grey toward the very white the ground is going to, reading its colour live off `season.snowColor` so the two can never disagree.

a front is **two bands and not a bell curve**. the squall comes through at full strength, gives a short clear spell, and is followed by a lighter trailing band; better than half the cycle is dry. each band is cut against the *cosine* of the phase rather than assembled from a gaussian, which makes it exactly periodic — this clock runs for as long as the page is open, and a curve with a seam in it would find that seam.

the more interesting curve is the wet one. **rain stops in a minute and the ground it fell on takes an hour**, and a surface response tied to the fall itself dries out the instant the last drop lands, which reads unmistakably as somebody switching an effect off. so wetness looks *backwards*: a decaying maximum over the quarter-cycle behind the current phase, never below the rain falling right now, zero once the long clear spell has had time to work. that shape is a deliberate refusal of an integrator, and the reason is determinism rather than taste — an accumulator carries the frame rate and the page's load time into its answer, so two captures of the same phase would not agree.

what a wet surface does is **two things pulling opposite ways**. albedo goes down, because a water film traps light dry grains would have scattered back out; specular goes up, because that film is smoother than anything under it. only the first gives a scape somebody turned the lights down on; only the second gives a scape made of plastic. together they are the whole read, and they cost two arithmetic operations on values the fragment already holds — weighted by the same `lie` term lying snow uses, and applied *before* the snow so a week doing both ends up with white over wet.

the lake answers the rain **without a uniform or a fetch of its own**: a shower puts the surface into a chop that kills the glitter and roughens the ripple, and the shader already had a knob for each.

### the column

`rain.ts` draws the fall, and the module hangs off one decision: **the column is sized against the frame, not against the map**. a column sized to the island would put the same drops over a hundred and ninety metres at every zoom, so pulling back would thin the rain to nothing and zooming in would pack it into a wall — the same mistake the mist tiles and the auroral tiles both had to be taken off. scaled to `viewSize`, the drop count *is* a screen density.

the whole shower is **one draw call from one static buffer**, and nothing is uploaded per frame. each drop is two triangles with its cell carried alongside the quad corner; falling is `mod` on a single scalar that grows, so a drop reaching the floor reappears at the ceiling in the same instant. that scalar is metres fallen rather than seconds elapsed — which is what lets `weather.fall` be turned to zero and back up without the column jumping — and it wraps against the column's own height so a page left open for an hour is not counting in a float that has lost its precision.

- **the streak is laid along the projected fall, not the screen's vertical.** those are the same thing in still air and visibly not the same in wind. the fall leans on `wind.strength`, the knob the grass is already bending on.
- **the column follows the camera's focus**, which is safe here in a way it is not for the mist: the mist's sheets carry a pattern that would drag across the ground as you pan, and rain has no pattern to drag, because one drop is any other drop.

**cost: one draw call, one program, no allocation per frame.** the drop count is a tier gate — `minimal` 0, `mobile` 900, `desktop` 2600, `ultra` 4200 — and the ground's half is two arithmetic operations in a fragment shader that was already running. the mesh is made *invisible* rather than transparent in the clear spell, because a screenful of transparent geometry contributing nothing still costs every pixel it covers.

## the aurora, and the dark it needs

**it is a deck, not a curtain, and that is a fact about the camera before it is a fact about the aurora.** an orthographic view tipped fifty degrees down puts the far distance a couple of hundred world units *above* the top of the frame: there is no horizon in this scape to hang anything against, and a wall of light standing out at sea would be rendered correctly and entirely off screen.

a deck the camera looks *down* on is a fiction worth naming as one — the light is a hundred kilometres up and the eye is eighty metres. it is also the fiction the sky deck already runs. the veils are stacked above the clouds so at least the order is right, and the clearance is enforced in code rather than left to two sliders agreeing.

**there is one gate, and it used to be two.** you cannot see the aurora in june at these latitudes — not because it has stopped, but because the sky never gets past dusk — and back when the sun ran the same arc every week, the only way to say that was a curve of the year drawn by hand in `season.ts` and multiplied into the day's own gate.

the sun has a year in it now, so both gates were asking the same question and one of them can go. `daylight.dark` is **astronomical twilight written down**: full dark once the sun is eighteen degrees under the horizon, nothing at all from the moment it touches it.

```ts
darkAmount(height) = 1 - smoothstep(sin(-18°), 0, height)
```

feed it a real arc and the season falls out for free. a midwinter midnight here has the sun 45° under and the curtain is at full strength; a midsummer midnight has it 1.4° *above*, and there is no sky to light. **night length is geometry**, and this is the geometry rather than a drawing of it.

no weather term, deliberately. solar activity is not something this scape models, and a random flare would be the one non-deterministic thing in a world that is otherwise a seed and a coordinate.

**the colour is in the field, not over it.** unlike the mist and cloud fields — white, taking their tint from the clock — the auroral field is baked with colour in it, because the colour *is* the structure: green where the curtain is dense, violet where it thins at its fringes and crown. that is a function of the distance from an arc's centre line, which is the same number the alpha is computed from and impossible to keep in step with if it were a gradient applied afterwards. two arcs are baked, wandering as sums of sines and therefore periodic across the tile. mirrored wrapping — what the mist and cloud fields use — was tried: reflecting a wandering arc turns every tile boundary into a hard chevron, and a sky full of zigzags is the one thing an aurora never looks like.

the two arcs are combined with a maximum rather than a sum: two curtains overlapping do not make a brighter curtain, and adding them fills in the dark gap the second arc exists to show.

**cost: one draw per veil, and none at all for most of the year.** the veils are two-sided and still one draw each — three renders a transparent double-sided material in two passes, right for a curved shell and waste for a flat sheet, so `forceSinglePass` is set. they are made *invisible* rather than transparent whenever the light is out. `auroraLayers` is 3 on `ultra`, 2 on `desktop`, **1 on `mobile`** and 0 on `minimal`: the phone gets an aurora, and the tier that only exists after a context loss gets a plain dark sky rather than a dimmer one.

## the sky deck

overhead cloud is the ground mist's technique moved up: world-pinned sheets of a baked alpha field, scrolling on the wind. two things had to differ.

- **the tile has to be smaller than the frame.** a pattern sized to the sheet shows you a fraction of a single blob, bilinearly smoothed into a flat wash. a tile you can fit two or three of into frame is what makes clouds look like separate clouds — the gaps are the whole effect.
- **the field is thresholded, not raised to a power.** the mist keeps a little of itself everywhere, which is right for something you are standing in. cloud read from underneath has to have holes, or it is a grey filter over the frame.

the deck fades in as the view pulls back, and that gate is not a performance dodge: an orthographic camera zoomed in sits *below* the ceiling, so the only thing overhead cloud could do there is cover the picture.

it is unfogged, deliberately. linear fog fades by distance and the deck is the furthest thing in frame, so leaving it in dissolves every cloud into the fog colour exactly when it comes into view. it takes its colour from the clock instead.

## mist that stays where the ground is

the sheets used to chase the camera's focus point, which drags the whole cloud pattern across the ground as you pan — and a mist that moves with the camera reads as the *island* moving, the one thing ground mist must never do. they are pinned to the world now, which costs two things and pays for both:

- the sheet has to reach past the terrain from any pan, and the pattern's world size has nothing to do with that. tie the texture repeat to the sheet and widening it magnifies every wisp into a few big soft blobs, bilinearly smoothed until the gaps close, which is how ground mist becomes a white-out. the repeat is derived from a fixed *units per tile* instead.
- a flat sheet that survives any pan also lies over every pixel of open water in frame, four deep. ground mist collects over land and shallows anyway, so the alpha is baked into the vertices and falls off radially.

**the mist stands up as well as lying down.** stacked horizontal sheets only have depth when you look *across* them, so a mist built from them alone thins out exactly as the view tips down. alongside them are upright slices facing the viewer, spaced along the view axis, so there is always something between the eye and the ground whatever the elevation.

those slices follow the focus point rather than the world origin — a stack pinned to the origin falls behind the camera the moment you pan to the far side of the map. that is only safe because the *pattern* does not come along: each slice feeds its own displacement along its local x axis back into the texture offset, so every wisp stays over the same patch of ground while the quad slides underneath it.

**density follows the authored amount and nothing else.** it used to be scaled each frame by the view elevation, which meant orbiting or zooming quietly changed the weather. mist belongs to the world, not to where you happen to be standing.

## sun shafts

`createGodRaysPass` projects the light and disables itself only when the light is *behind* the camera. under an orthographic projection that test almost never fires: the atmosphere models the sun 150 units from the focus, which lands somewhere around ndc y = 3 — permanently off frame, still "in front". the radial march then runs from every fragment toward a point far outside the image and smears the whole sky into a white wash.

so the shafts get their own virtual sun in [`post.ts`](src/scene/post.ts): placed a fraction of the frame away along the real sun direction, clamped just past the frame edge, faded to nothing as it leaves the view. the direction is honest — taken live from the atmosphere's sun — but the distance is a framing decision, because an orthographic camera has no vanishing point to inherit one from.

the same class of bug is why the water's ripple map carries mipmaps: a 128px noise texture sampled at roughly one texel per pixel aliases into a field of bright specks, and the ray pass turns every speck into a streak.

## the lake, and the angle that broke it

binding tilt to zoom sweeps the camera's elevation through a range that crosses the sun's. that turned out to be a good stress test of the water, which failed it twice:

- **a near-mirror plane has no good answer at that crossing.** at low roughness the whole flat surface reflects the sun into every fragment at once, and the lake becomes one white highlight the size of the sea. the surface is rough now, which spreads the lobe until no angle can concentrate it — and rough dielectrics then pick up the pale overcast sky instead, so `envMapIntensity` is cut to give the depth tint its colour back.
- **a narrow lobe also makes the sea change colour when you orbit.** short of an outright white-out, a tight highlight still means the lake is pale grey facing the sun and dark teal facing away.
- **the ripple normals came from a white-noise texture.** minified past one texel per pixel that lands a different random normal in every pixel, so wherever the mirror direction drifted into the spray, isolated pixels fired at full strength. which angles triggered it was pure luck, which is why it stayed invisible until something moved the elevation. shading now reads a *smooth* fractal field; the speckled texture only ever tints.

what the roughness gave away, the glitter pays back: two noise fields at incommensurate scales, multiplied and raised to a high power, so the product spikes only where both crests coincide. that exponent is the whole control — threshold it gently instead and the *mean* of the product clears the cut, every fragment lights up, and the lake becomes a sheet of white paper.

two related calibrations came out of the same pass:

- **bloom threshold sits above the fog.** the fog colour scatters toward the sun until its linear luminance is around 0.85, and at the old 0.86 a frame full of lit haze crossed the threshold everywhere at once and bloomed itself into a white-out.
- **direction tints the light, it does not re-expose the shot.** at the original strength the same island was a washed-out miniature facing one way and a dark, moody one facing the other. the scatter is a third of what it was.

## framing the sea

an orthographic camera's distance along its view axis changes nothing you can see — but it decides where the frustum's *bottom edge* sits in world space. let that edge drop under the waterline and the lower band of the frame is made of rays that start below the sea and point down; they can never intersect a horizontal plane above them, so the water simply stops partway up the screen.

[`camera-controls.ts`](src/scene/camera-controls.ts) therefore lifts the camera with the zoom rather than sitting at a fixed radius. it costs nothing — the projection is unchanged.

that distance carries a second, non-obvious load: the atmosphere reads it to place the fog, as `near = radius - viewSize * 0.9`. clearing the waterline needs *less* distance the steeper the view gets, so once tilt became a function of zoom the lift began to swing — and with it the fog band, which collapsed onto the camera and washed the frame grey at high elevations. the lift now has a floor proportional to `viewSize`.

## ground that casts

the terrain has always been a shadow caster, but the sun's shadow frustum was fitted with a margin sized for the tallest *prop* — about a spruce. the terrain is by far the tallest thing in the scene, so every ridge shadow was clipped where it left the visible ground and hills read as though lit from inside. the margin is derived from the terrain's own relief now.

the ground it falls on carries **two octaves of grain, and a roughness break**. one scale gives ground a texture but not a history: real soil has metre-wide patches of wear and damp under the centimetre-wide grit, and without the broad octave the fine one tiles into a visible weave the moment you zoom out past its repeat. both fetches come from the same 256² texture at different frequencies, so the second costs a sampler read and no memory. the third piece is specular — uniform roughness is the giveaway that a surface is a render — so the fine grain also polishes and dulls it by a few percent.

## the graphics overlay

a drawer on the right edge exposes the scene's optics, the three clocks, the air, the ground and water, the camera and the device budget — with a switch per effect and its parameters nested underneath. it collapses to a handle, starts collapsed on touch and narrow viewports, and resets to the authored values.

**its furniture is markup, not script.** the `<aside>`, the header, the collapse handle, the form and the footer ship in [`index.html`](index.html); [`graphics-panel.ts`](src/ui/graphics-panel.ts) fills the form and wires the two buttons. that is what lets the drawer survive the canvas being replaced under it after a context loss — and after the effects switch rebuilds the scape — and it gives the panel a shape before its module has parsed. only the controls are built at runtime, because only those depend on which tier resolved.

**sections are `<details>`, and their animation is five css declarations.** ten flat legends in a nineteen-rem drawer is a list rather than an interface: finding the snow line meant reading every legend on the way past it. runs of sections now share a heading — *look*, *time*, *air*, *ground & water*, *camera*, *device* — and each one collapses on its own underneath it, remembering by name whether the reader left it open. a `<details>` already collapses, takes the keyboard and announces its state; `interpolate-size: allow-keywords` plus a `block-size` transition on `::details-content` is the whole animation, and both degrade to an instant open on a browser without them. there is no javascript in the collapse at all.

the thing worth knowing is that **it holds no state**. every control reads and writes `SCAPE_CONFIG` directly, and the scene modules re-read that config every frame — uniforms are refreshed in each module's `update`, not captured at build. so there is exactly one copy of every number, the panel and the scene cannot drift apart, and nothing has to be pushed anywhere when a slider moves.

**a control is a path, not a closure.** each knob is declared as a dotted string into the config — `look.bloom`, `daylight.time` — rather than as a `get`/`set` pair. a closure can only be *called*; a string can be collected, compared and written to disk, which is why one declaration list drives the panel, the local-storage snapshot, the reset and the `?set=` url without any of them enumerating the scene's settings a second time.

there is no `enabled` flag anywhere in the config: an effect is off when its strength is zero. so a switch is a view of the number underneath it — it remembers what it turned off at, restores that on the way back, and follows its own slider if you drag that to zero yourself. what a slider cannot do is change the *shape* of the chain: which passes exist is a quality-tier decision made once when the composer is built, so a knob whose pass the tier never created renders greyed rather than lying.

### the card, and the corner it was in

the card in the top-left — title, gestures and the diagnostics log — **starts hidden** and is toggled by the chevron beside it or by `h`, remembered under its own key.

the handle is pinned to the *figure* rather than to the card, for the same reason `.gfx-toggle` sits outside `.gfx`: a control that hides along with the thing it controls is a one-way door.

the card is hidden rather than removed. the log inside it is the only crash report a phone gives and it goes on collecting whether or not anyone is watching, so it stays in the document — `inert` is what keeps it out of the tab order and the hit test. **`?debug` opens it whatever was last chosen**, because a debugging surface you have to already know a keyboard shortcut to reach is not one.

the offset on the handle is a `left` and not a `transform`, and that is not a preference. a percentage inside `translateX` resolves against the *element's own* width — so `--card-width`, carrying a `calc(100% - 2rem)`, collapsed to a negative six pixels against a 26-pixel button and parked the handle on top of the card it had just opened.

### the frame counter

`.fps` sits in the bottom-left and reads `58 fps · 17.2 ms`, with `41 calls · 812k tris` added under `?debug`. it is deliberately in neither the card nor the panel: both are things you put away, and a frame counter you have to open is a frame counter that was not measuring the thing you were looking at when it got slow.

it times nothing itself. [`vitals.ts`](src/scene/vitals.ts) has been measuring the frame all along, and this is a second view of that one measurement on its own quarter-second cadence.

### the performance section

three knobs applied live by [`runtime.ts`](src/scene/runtime.ts): pixel ratio, frame cap, and how often the shadow map is rebuilt.

the last is the one worth explaining. three rebuilds the entire shadow depth pass — terrain, merged steading, every scattered instance — on **every frame it draws**, at up to 4096². nothing here moves fast enough to need that: the sun crosses the sky over minutes and the foliage sway is a slow shader animation. `runtime.ts` takes `shadowMap.autoUpdate` off the renderer and hands the map out on a cadence instead, and `atmosphere.ts` only fits the sun's frustum on the frames the map is actually rebuilt on.

measured in headless chromium on an m5, desktop tier: cadence 1 draws **110 calls** a frame, cadence 4 draws **73**. the frame rate barely moves there, because that machine is fill-rate bound rather than draw-call bound — the same run has ratio 1.75 at 18fps, ratio 1.0 at 31 and ratio 0.5 at 44, which is also why the default ratio is 1.0. the cadence is for the devices where the depth pass *is* the bill.

**this section is deliberately not persisted.** its values are seeded from whatever tier the device resolved to on *this* load, re-seeded when a context loss buys a cheaper one, and re-seeded again by `reset`. a pixel ratio kept from one session and replayed into the next is exactly how a device that has already lost a context gets handed back the budget that took it — underneath a tier [`tier-memory.ts`](src/scene/tier-memory.ts) had correctly held down.

### settings that stick

the overlay writes a debounced snapshot of every exposed path under one local-storage key and applies it before the scene is built. two details carry the weight:

- **stored values are only accepted when their type still matches the config.** a snapshot from an older build cannot poke a string into a uniform and take the shader down on load — it is ignored, field by field.
- **`reset` removes the key rather than overwriting it with the defaults.** re-authoring a value in `config.ts` should reach anyone who has pressed reset, and it cannot if reset leaves a snapshot of the old defaults in front of it.

the authored values are captured when the store is constructed, *before* `load` runs — after that the config no longer holds them.

`localStorage` access alone throws in a sandboxed frame and in safari's private mode. a graphics overlay is not worth taking the scene down for, so a missing store degrades to "settings do not persist".

the panel's controls carry `autocomplete="off"`, which is not cosmetic: browsers restore a reloaded form's controls to whatever the user left them at, *after* the page's own initialisation — so a reload would put stale numbers back into the sliders, fire `input` for them, and save them over the real snapshot. right for a form; wrong for a view of external state.

---

## deployment

`vite.config.ts` uses `base: './'`, so built assets resolve relative to whatever github pages route contains the app. `bun run build` writes `dist/`; publish it to the desired pages path. the [`deploy`](.github/workflows/deploy.yml) workflow does this from `main` automatically, and [`pr checks`](.github/workflows/pr-checks.yml) runs lint, typecheck, test and build on every pull request into it.
