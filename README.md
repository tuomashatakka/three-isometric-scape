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
| primary drag or one-finger drag | rotate and tilt |
| shift-drag, ctrl-drag, middle-drag, or right-drag | pan |
| two-finger gesture | pan and pinch-zoom together |
| wheel | zoom |
| arrow keys | pan |
| shift + arrow keys | rotate and tilt |
| + / − | zoom |
| escape | stop automatic revolution |

with `prefers-reduced-motion: reduce`, selecting a place focuses immediately and does not start a revolution.

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
    │   ├── height.ts               authored ground layered over the fbm
    │   ├── terrain.ts              geometry, height/slope banded colour
    │   ├── water.ts                baked bathymetry, foam band, ripple
    │   └── dressing.ts             placement, hero merge, instanced scatter
    └── props/
        ├── index.ts                the roster, hero vs scattered
        ├── palette.ts              the nordic colour vocabulary
        ├── material.ts             shared material, cloud shadow, wind
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

two related calibrations came out of the same pass:

- **bloom threshold sits above the fog.** bloom is for highlights, and the fog colour scatters toward the sun until its linear luminance is around 0.85. at the old 0.86 a frame full of lit haze crossed the threshold everywhere at once and bloomed itself into a white-out.
- **the mist fades as the view flattens.** the sheets are flat, so from above you see each one over a small patch of ground, while at a grazing angle every one of them stretches to the horizon and the whole lower frame ends up behind four stacked layers. more path length really does mean more mist — but a miniature reads as a miniature because you can see it.
