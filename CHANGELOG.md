# changelog

one entry per [scene enhancement run](instructions.md), newest first. a run is one theme, so an entry is one headline plus what it cost.

## the depth pass the phone could not keep

the pixel 10 made the failure reproducible in firefox's usb debugger. the mobile tier with its post chain forced off emitted six shader validation failures and lost the webgl context; the identical run with only shadow maps skipped stayed clean. the first rejected program was three's generated `meshdepthmaterial`, not one of the visible scape shaders.

- **fixed** both phone tiers to disable the renderer's shadow-map pass instead of merely shrinking its texture
- **fixed** the directional sun to stop advertising a shadow caster on those tiers, and stopped recalculating a shadow frustum that will never render
- **kept** the mobile colour grade and tilt-shift composer, plus the authored cloud shadow, hemisphere fill, direct sun, and all visible materials; desktop and ultra retain their hardware shadows
- **restored** the startup gpu report, context-loss listeners, recovery callback, and hidden-tab loop parking that an unfinished diagnostic edit had disconnected
- **proved** the boundary on the connected device: shadows on reproduced six validation failures within twenty seconds; shadows off stayed clean, with the same mobile tier, framebuffer cap, geometry, and no-post path
- **cost** one boolean in the tier preset and one fewer render pass per light on phones

## the walled hay meadow

the farm ploughs the flat ground and grazes what is left, and until now the scape only showed the half of that it ploughs. up the slope from the steading there is a walled pasture: a drystone wall around it, a gate in the gap facing back down at the farm, a meadow barn at the back with its doors open on hay, and drying poles standing in the grass between them.

- **added** `landscape/layout.ts`'s `findPasture` and the `pasture` it puts on the layout — high, flat, dry ground that the yard, the plots and the track have all left alone. it returns `null` rather than relaxing a rule, because on an island sixty metres across with a twenty-one metre farmyard shelf there genuinely may be nowhere, and a search that always answers is a search that will one day answer with the sea
- **fixed** that search siting the enclosure on its centre's own height. the first version picked a shoulder above a cove — five metres of dry hillside in the middle and a third of the wall thirty metres out, where the island falloff had already drowned the ground. the whole disc now has to fit inside `landRadius`, and twelve probes around the wall line have to come back dry too
- **fixed** the layout searches and the built ground disagreeing about where the island *is*. `height.ts` sank the raw fbm into the island inline, and the searches that run before it exists were reading the fbm raw. `sinkToIsland` is that falloff in one place now, called by both
- **added** `props/wall.ts`: `buildStoneWallRun`, the fence run's sibling. same polyline, same per-station ground height, three courses of granite instead of posts and rails — and stations set closer together than a stone is long, because a wall is a pile that happens to be long and gaps are what make it a row of rocks
- **added** `props/upland.ts`: the meadow barn (niittylato) on its corner stones, and the hay drying pole (seiväshaasia) whose pole is deliberately left standing proud of the hay so the silhouette survives the far zoom
- **added** `props/timber.ts` — the cladding, gable and roof helpers, lifted out of `buildings.ts` because the meadow barn is the same construction in weathered grey and a second copy of the roof trigonometry is a second place for it to be wrong
- **added** a mown-grass tint to the terrain painter inside the wall, painted over the altitude bands. the pasture sits high enough that the bands had already turned it toward heath and scree, which is exactly what grazed grass is not
- **fixed** the drying poles landing, measurably, never. they were drawn from the island-wide sampler, and the pasture is a quarter of a percent of its disc — forty attempts found it about once, and that one was inside the barn's claim on the middle. a scatter can now be handed its own candidate generator, and the poles get a disc the size of the pasture. the barn moved hard against the back wall for the same reason: a building's claim is a circle around its longest half, which on a twelve-metre enclosure is most of the enclosure
- **changed** what the scatter will accept there: no conifers, no saplings, no heather, no field stones — the stones that were in it are the wall. wildflowers stay, because a hay meadow is the flowers
- **added** `layout.pastureRadius`, `layout.pastureGateway` and `dressing.hayPole` to the config. build-time knobs like the rest of `layout` and `dressing`, so not in the overlay
- **cost** one draw call for the poles' `InstancedMesh` and one for the barn's `Ploppable`, which is a `Ploppable` for the same reason the farmstead's five are — it stands on a hillside, and merged geometry can only sit at one height. the wall and the gate add ~10k vertices to the merged steading geometry and no new material. nothing new per frame, and no new varying
- **tests** `props/upland.test.ts` covers the barn, the pole's silhouette, and the wall run following its ground, skipping stations under `minHeight`, refusing a single point and staying byte-for-byte stable. `landscape/layout.test.ts` covers the pasture existing, standing dry all the way round its wall, clearing the yard shelf, facing its gateway at the farm, and resolving identically from the same seed

## fifteen vec4, and not one more

the cause, at last, and it was never a budget. `public/probe.html` — vanilla webgl2, no three, no scene — was loaded on the handset and answered in two lines:

```
varying_components  60
varyings ×16 · LINK false · getError 0 · log "Could not pack varying v15"
linked up to 15 vec4 varyings
… alive 24s · 1458 frames · gl error 0
```

**60 varying components. fifteen vec4 — the floor gles 3.0 permits, half what a desktop reports.** the probe itself ran 24 seconds at gl error 0 with an instanced `mat4` attribute and a depth-texture fbo drawing every frame, so the driver was never flaky and the device was never broken. a stock `MeshStandardMaterial` with shadows, fog and instancing spends most of fifteen vec4 before this scape adds anything — every shadow coordinate is a whole vec4 — and past the ceiling the driver declines to link, three binds the unlinked program regardless, every draw raises `INVALID_OPERATION`, and angle takes the context away. that is the whole mechanism, and the variable timing (0.7s, 1.6s, 4.1s, 6.3s, 8.4s, once never) was only ever *when* the offending material first got linked, which depends on what has scrolled into view.

- **fixed** the context loss, by spending three varying components where the scape used to spend six. `vScapeWorld` was a `vec3` whose `y` no reader ever touched — now `vScapeGround`, a `vec2`. `vScapeNormal` was a `vec3` whose `y` was the only part read — now `vScapeUp`, a `float`
- **fixed** `scape-foliage` declaring and writing a normal varying that **nothing in its shader reads**. the normal now rides with the ground `detail` injection, which is its only reader, so foliage spends two components where it used to spend six. that material was the first to fail on the device, and it was the one wasting the most
- **changed** the water's `vWaterWorld` `vec3` to `vWaterGround`, a `vec2`. all nine reads were `.xz`
- **added** `varyings Nc · attribs N · vtx uniforms N · texture units N` to the startup log. this is the number that mattered and nothing was looking at it — and since firefox reports a canned adapter string, the limits are the only honest description of the device it will give up
- **added** `public/probe.html`, kept rather than deleted: vanilla webgl2 in escalating stages — limits, a context per `powerPreference`, a varying link-walk, three's `instanceMatrix` shape as a real instanced `mat4`, a depth-texture fbo, then all of it in a loop with an uptime counter. it looks for the exact signature a driver produces rather than for "it broke", and it is the floor to measure any future device against
- **cost** nothing. no feature given up, no tier changed, no visual difference — interpolating a `vec3` and reading one component is arithmetically identical to interpolating that component alone
- **note** the same ceiling is why the library's own example apps fail on this handset. they carry no `onBeforeCompile` at all, so stock `MeshStandardMaterial` with shadows and instancing is already close enough to fifteen vec4 that anything tips it. this fix buys the scape headroom; it does not raise the ceiling

## no composer on a phone

> superseded by the entry above. the diagnosis in this entry was wrong: the post chain was never the cause, and the change it describes was reverted the same day. what it did contribute was the material naming, which is the only reason the failing material could be identified at all.


the log from the previous run came back off an android handset and named the thing. the context died twice with the post chain built — once at 0.7s while its programs were still linking, once after 6.3s of clean 30fps — and then ran for as long as anyone watched on the one tier that has never built it. everything the earlier rounds were optimising held still: **one** resize the whole run, no frame over 250 ms, fourteen textures, no `OUT_OF_MEMORY`. it was never a budget.

- **fixed** the scape losing its context on phones, by not building the post chain there. `post: false` on the mobile tier, and `tiltShiftPairs` with it — the composer was on every tier a device could actually be *detected* into, so the "light" tier of the last run still built one and still died. `minimal` was the only post-free tier and nothing ever selected it
- **added** `scene/tier-memory.ts`: what the device already proved, in `localStorage`, stamped with the build. the ladder worked — it just re-learned the same lesson on every load, and the lesson cost a crash to teach. a loss writes the tier it dropped *to* immediately; a tier that survives nine seconds writes itself as known-good. memory only ever argues downward, because something that held `ultra` last week may be throttled or on battery now
- **added** `?tier=minimal|mobile|desktop|ultra` and `?post=0|1`, so the diagnosis can be tested on the device rather than believed. `?post=1` on a phone is now the only way to ask it whether the chain was really what killed it
- **fixed** the log throwing away the crash it exists to record. `sessionStorage` carries a run into the next one under a `previous run` separator — a reload is the first thing anyone does, and it was destroying the only witness
- **fixed** the log scrolling its newest lines out of sight. assigning `textContent` leaves `scrollTop` where it was, so a log taller than its box drifted upward as it grew, newest-first notwithstanding. three photographs of a phone screen were needed to recover what one assignment now keeps in view
- **fixed** a phone in landscape landing on the desktop tier — a 2048 shadow map and a full optical chain, on a phone. `compactViewport` asked for 900px and handsets are 844–932 css pixels wide on their side, so the threshold cut through the middle of the range; it asks for 1100px now. the rule still wants a coarse pointer too, so a touchscreen laptop keeps its tier
- **added** names to the scape's materials — `scape-ground`, `scape-foliage`, `water-surface`, `cloud-deck-N`, `mist-N`, `mist-slice-N`. six programs failed to link on the tier that *works*, each reported as `Material Name:` and nothing, because a driver that declines to link and declines to fill in the info log leaves the name as the whole diagnosis
- **added** `__SCAPE_BUILD__`, stamped by vite, so a deploy that changes what a tier costs does not inherit a verdict reached about the old one
- **changed** nothing about the desktop or ultra tiers. the chain is untouched where it has never failed
- **cost** on the mobile tier: 22 → 10 linked programs, two HDR ping-pong targets and every fullscreen pass gone. it also gives up the grade, the LUT and the tilt-shift there — tone mapping falls back to three's in-material path. two `localStorage` calls and one `sessionStorage` write per log line, all off the frame path
- **tests** `scene/tier-memory.test.ts` covers the clamp, the downward-only rule, a stamp from another build, an unparseable value, and a device with no storage or storage that throws. `scene/quality.test.ts` now asserts neither touch tier builds a chain
- **honest** this is the tier configuration the device has actually been observed to survive, which is not the same as a confirmed root cause. what makes the driver drop the context when a composer exists is still unknown; `?post=1` is there to close that gap

## the log, where the phone can show it

the budget cuts below were not enough — the light tier loses the context too, so the cause is something the numbers do not explain. this run is about being able to see it.

- **added** `ui/diagnostics.ts`: the status output becomes a rolling log, newest first, seconds since load on every line. tapping it copies the lot, because selecting text on a phone is its own small ordeal
- **added** console patching to that log. three reports shader compile failures, context loss and every other renderer complaint through `console.error`/`console.warn`, and on a phone nobody is reading those. `window.onerror` and unhandled rejections land there too
- **added** `scene/vitals.ts`: real frame times off the wall clock (the frame context reports the *nominal* delta once the loop is paced, which is exactly the number that hides a device failing to keep up), per-frame draw calls and triangles, and a resize counter — a phone's collapsing url bar can fire `ResizeObserver` dozens of times a second, and each one reallocates the drawing buffer and every render target hanging off it
- **added** a stall line whenever a frame crosses 250 ms, rate-limited to one every three seconds so a device stalling on every frame does not throw the startup summary out of the history
- **added** to the log on startup: the raw tier signals and what they resolved to, the unmasked gpu string, the drawing buffer size, the frame cap, and the build time. a tier that is wrong for a device is indistinguishable from a tier that is right and still too heavy, unless you can read what it was picked from
- **added** `getError` polling once a second — it synchronises, so not per frame — to catch an `OUT_OF_MEMORY` on its way to becoming a lost context
- **added** the `webglcontextlost` `statusMessage` to the report, plus the vitals at the moment of the loss. `webglcontextrestored` and `webglcontextcreationerror` are logged too
- **changed** `renderer.info.autoReset` to off, reset once per frame instead. the post chain renders many times per frame and each pass was clearing the counters behind it, which is why an instrumented composer reads as one draw call and no triangles
- **added** `?debug` for the live vitals line pinned above the log
- **cost** one wall-clock read and a few counters per frame, one synchronising `getError` per second

## a scape a phone can hold

- **fixed** the scape losing its WebGL context a few seconds after the first frame on phones. the mobile tier was asking for more than a phone gpu has, uncapped, and there was no way back once the driver took the context away
- **changed** the mobile tier in `scene/quality.ts`: no image-based fill (the PMREM room environment was 12 MB of RGBA16F on its own), 30 fps instead of uncapped, pixel ratio 1.25 → 1, shadow map 1024 → 512, terrain 96 → 64 segments, dressing 0.45 → 0.32, and a lake plane sized to the tier rather than always 8× the terrain at 128²
- **added** a `minimal` tier — never detected, only ever degraded into. it drops the post chain entirely, so the renderer draws straight to the canvas
- **added** `reduceAtmosphereQuality`: a lost context costs a tier and the scape rebuilds itself on a fresh canvas, because coming back on the budget that just failed is how one thermal loss becomes a loop. at the floor it says so instead of thrashing
- **added** loop parking while the document is hidden — a backgrounded phone that keeps drawing is a phone heating up for nobody, and heat is what the context is lost over
- **fixed** `pagehide` tearing the scape down when the browser only froze the page into the bfcache, which left a dead canvas behind on the way back
- **cost** on the mobile tier: gpu texture memory 34.4 MB → 10.4 MB, renderbuffers 7.1 MB → 2.6 MB, 28 → 22 linked programs, and roughly half the time to first frame. the tilt-shift, the grade and the LUT all survive — only the `minimal` fallback gives them up
- **tests** `scene/quality.test.ts` covers the ladder, that every step down is strictly cheaper, and that `minimal` is unreachable by detection

## the boat harbour

- **added** `props/shore.ts`: a boathouse on piles with a slipway running out under the waterline, a net drying rack, and a mooring stake
- **added** the harbour to `landscape/dressing.ts` — the boathouse and rack are placed in the next cove along from the jetty and merge into the steading draw; the stakes are scattered into the shallows within thirty metres of the landing
- **fixed** shore structures pointing across the water instead of into it: `yawAlong` in `landscape/layout.ts` converts a shoreline bearing into the `y` rotation a `+z`-long prop needs, and the jetty and rowboat now use it too
- **refactored** `findShore` onto a reusable `findBank` walk, so the harbour can ask for the bank on one bearing without a second copy of the search
- **added** `layout.harbourSpread` (degrees along the shore between jetty and boathouse) and `dressing.mooringPost` to the config
- **cost** one draw call, for the stakes' `InstancedMesh`; the boathouse and rack add ~4.1k vertices to the existing merged steading geometry and no new material
- **tests** `props/shore.test.ts` and `landscape/layout.test.ts`, plus the roster's existing determinism and base-height coverage over the three new builders
