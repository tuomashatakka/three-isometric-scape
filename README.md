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
├── style.css                      full-viewport responsive shell
└── scene/
    ├── atmosphere.ts               gradient sky, linear fog, sun and fill rig
    ├── camera-controls.ts          pointer, touch, keyboard, focus, orbit
    ├── config.ts                   starter’s public tuning surface
    ├── create-isometric-scape.ts   app/module composition root
    ├── landscape.ts                terrain, water, instanced dressing
    ├── lut.ts                      cached cinematic colour-grade recipes
    ├── mist.ts                     deterministic drifting ground-mist sheets
    ├── noise.ts                    deterministic height sampler
    ├── post.ts                     tilt-shift, vignette, lut, bloom and grain
    └── quality.ts                  mobile/desktop gpu budgets
```

the renderer uses a device-tier pixel-ratio cap, the scene uses one `createapp` render loop, and the post module is the only frame renderer. pointer state is cancelled cleanly; teardown releases geometries, materials, sky and mist textures, composer targets, fullscreen passes, and every baked lut. those defaults matter more than squeezing another ornamental system into a starter, tragically enough~ n__n
