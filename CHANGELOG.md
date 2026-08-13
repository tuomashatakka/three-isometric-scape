# changelog

one entry per [scene enhancement run](instructions.md), newest first. a run is one theme, so an entry is one headline plus what it cost.

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
