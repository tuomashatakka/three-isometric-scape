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
- view-reactive linear fog, a matching gradient sky, and deterministic drifting ground mist
- a configurable 3d-lut grade with vignette, miniature tilt-shift, desktop bloom, and film grain
- mobile and desktop atmosphere budgets selected from pointer, viewport, and pixel-density signals
- one terrain draw, one water draw, two instanced tree draws, and one instanced rock draw
- an orthographic dimetric camera built with `threejs-scene`
- click or tap focus with an eased landing and automatic revolution
- pointer rotation, modified/right-button panning, wheel zoom, two-finger pan and pinch
- complete keyboard equivalents and a visible canvas focus state
- responsive semantic html with coarse-pointer and reduced-motion behavior
- relative vite asset paths, suitable for a github pages subroute
- deterministic unit tests plus the current `@tuomashatakka/eslint-config`

there is deliberately no chat surface, local storage contract, llm schema, prop authoring tool, or hidden app service. this is the visual/runtime floor for a new isometric project.

## shape the scape

the intended first edit is [`src/scene/config.ts`](src/scene/config.ts). `scape_config` owns:

- the deterministic world seed
- terrain extent, resolution, amplitude, and waterline
- tree and rock instance budgets
- initial camera framing and zoom limits
- fog density and breathing, mist amount and wind, sky gradient, and the complete light rig
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

## project map

```text
src/
├── main.ts                         browser entry and accessible status
├── style.css                       full-viewport responsive shell
└── scene/
    ├── atmosphere.ts               gradient sky, linear fog, sun and fill rig
    ├── camera-controls.ts          pointer, touch, keyboard, focus, orbit
    ├── config.ts                   the starter's public tuning surface
    ├── create-isometric-scape.ts   app/module composition root
    ├── lut.ts                      cached cinematic colour-grade recipes
    ├── mist.ts                     deterministic drifting ground-mist sheets
    ├── noise.ts                    deterministic height sampler
    ├── post.ts                     ao, ssr, sun shafts, tilt-shift, lut, bloom, grain, traa
    ├── quality.ts                  mobile/desktop/ultra gpu budgets
    ├── landscape/
    │   ├── index.ts                the scene module, and what raycasts
    │   ├── layout.ts               yard, cart track, field plots, ridges
    │   ├── height.ts                authored ground, islets, fbm underneath
    │   ├── terrain.ts              geometry, height/slope banded colour
    │   ├── water.ts                baked bathymetry, swell, foam, glitter
    │   └── dressing.ts             placement, hero merge, instanced scatter
    └── props/
        ├── index.ts                the roster, hero vs scattered
        ├── palette.ts              the nordic colour vocabulary
        ├── material.ts             shared material, cloud shadow, wind, soil grain
        ├── ploppable.ts            2d placement with a ground-following foundation
        ├── primitives.ts           terse primitive constructors
        ├── fence.ts                continuous ground-following fence runs
        ├── buildings.ts            barn, farmhouse, sauna, aitta, woodshed
        ├── structures.ts           jetty, well, hay rack, gate, bridge, cart
        ├── vegetation.ts           spruce, pine, birch, grass, reeds, crops
        ├── objects.ts              rowboat, bales, firewood, barrel, mailbox
        └── stone.ts                erratics, field stones, cobbles, cairns
```

the renderer uses a device-tier pixel-ratio cap, the scene uses one `createapp` render loop, and the post module is the only frame renderer. the `ultra` tier adds ambient occlusion, screen-space reflections on the lake, anamorphic streaks and a traa resolve; it is only selected for a wide viewport on a many-core machine with a mouse. pointer state is cancelled cleanly; teardown releases geometries, materials, sky, mist, cloud-shadow and bathymetry textures, composer targets, fullscreen passes, and every baked lut. those defaults matter more than squeezing another ornamental system into a starter, tragically enough~ n__n

## props

every prop is a pure geometry factory — `(rng, palette) => BufferGeometry` — built from many `part()` primitives and collapsed with `mergeParts({ grime })` into one non-indexed, vertex-coloured geometry with its base at `y = 0`. `applyGrime` darkens each prop toward its base, which is free baked ambient occlusion and most of what makes a prop feel placed rather than floating.

that shape is what keeps the budget honest — detail costs vertices, not draw calls:

- **hero props** are placed by hand at layout anchors and merged into a *single* geometry, so the whole steading plus all its fencing is one draw
- **scattered props** are stamped through `scatterInstances`, one `InstancedMesh` each, with a near-white per-instance tint that varies the shade of a prop without repainting it

[`props/fence.ts`](src/scene/props/fence.ts) is the exception to the factory shape, deliberately. `buildFenceRun` takes a polyline and sets each post at its own ground height, then spans the rails from post to post so they pick up the slope on their own. a fence built from rigid identical segments either floats over dips or, if each segment is tilted to match its own patch of ground, zig-zags where neighbours disagree — real fences do neither.

because prop builders never touch a scene or a gl context, the whole roster is unit-tested headlessly: attributes, base height, bounds, and byte-for-byte determinism per seed.

## placement

[`landscape/dressing.ts`](src/scene/landscape/dressing.ts) uses two placement strategies, chosen by what the prop is for.

**structural** props — trees, boulders, bales — go through `createPlacementField`, which owns the claims registry and enforces mutual spacing. the candidate loop lives in `dressing.ts` rather than in the solver: `place()` claims a spot the moment it satisfies the *query*, so a caller that then rejects it on its own rules (a slope test, a ridge-density roll) leaves a claim behind that blocks everyone else. a few hundred of those and the field is saturated with nothing in it. the rules are tested first, and only an accepted spot is `reserve()`d.

**ground cover** — grass, crops, cobbles — uses a plain jittered scatter with no mutual test at all. overlap is invisible at that density, and the solver's spacing check is `O(claims)` per attempt, so routing nine hundred grass tufts through it would cost more than the rest of the build put together.

## sun shafts

`createGodRaysPass` projects the light and disables itself only when the light is *behind* the camera. under an orthographic projection that test almost never fires: the atmosphere models the sun 150 units from the focus, which lands somewhere around ndc y = 3 — permanently off frame, still "in front". the radial march then runs from every fragment toward a point far outside the image and smears the whole sky into a white wash, and any aliased highlight in frame becomes a streak pointing at it.

so the shafts get their own virtual sun in [`post.ts`](src/scene/post.ts): placed a fraction of the frame away along the real sun direction, clamped just past the frame edge, and faded to nothing as it leaves the view. the direction is honest — it is taken live from the atmosphere's sun — but the distance is a framing decision, because an orthographic camera has no vanishing point to inherit one from.

the same class of bug is why the water's ripple map carries mipmaps: a 128px noise texture sampled at roughly one texel per pixel aliases into a field of bright specks, and the ray pass turns every speck into a streak.

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

**density is authored once, at build.** it used to be recomputed each frame from the view elevation, which meant orbiting or zooming quietly changed the weather. mist belongs to the world, not to where you happen to be standing, so the camera now has no say in how much of it there is.

## islets

`terrain.isles` are raised *after* the island falloff, never before. the falloff's whole job is to drown the terrain plane's rim unconditionally so its square edges never read as the edge of the world; anything meant to survive out there has to come later.

their profile is a **plateau with a skirt, not a dome**, and that is what decides whether they read as islands at all. the seabed is seven metres down and the crown is a couple of metres up, so the blend has to reach roughly 0.7 before the ground breaks the surface — and a smooth dome only gets there near its very centre. an eleven-metre islet surfaced as a one-metre pebble. holding the blend at 1 across the inner 55% puts the waterline out at about 0.72 of the radius, which is an island with a beach on it.

they also need somewhere to stand. the ring between the mainland's shore and the plane's edge was too narrow to hold anything that would not either merge into the mainland or run off the world, so the plane is wider and `islandInner`/`islandOuter` are scaled to keep the farmstead's landmass exactly where it was. the extra span is open sea.

finally they change how the scatter samples. the placement field is now mostly open sea, and a uniform disc throws most of every attempt budget into the water — the island thins out to prove it. candidates are drawn from the mainland *or* from one of the islets instead, so the islets get dressed by the same instanced meshes.

## ploppable

placement in a landscape is a two-dimensional decision — you choose *where* on the map a barn goes, never how high — but every scene-graph api asks for three numbers and lets you get the third one wrong. [`props/ploppable.ts`](src/scene/props/ploppable.ts) extends the library's `Prop` with the ground field bound at construction, so callers pass the two coordinates they have an opinion about.

given a footprint it also fixes what makes flat-based props look pasted on. it levels the floor against the *highest* corner — sink to the mean and the uphill half of the floor ends up under the turf; sink to the low side and the building climbs out of the hill it should be cut into — then extrudes a foundation whose lower edge follows `heightAt` all the way round. buried on the high side, standing proud on the low one, the way a real plinth meets a slope.

this is why the five buildings are the only props that leave the merged steading draw. a merged geometry is baked at build time and can only ever sit at one height; five extra draws against the same material is not a state change.
