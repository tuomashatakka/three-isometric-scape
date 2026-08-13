# changelog

one entry per [scene enhancement run](instructions.md), newest first. a run is one theme, so an entry is one headline plus what it cost.

## the boat harbour

- **added** `props/shore.ts`: a boathouse on piles with a slipway running out under the waterline, a net drying rack, and a mooring stake
- **added** the harbour to `landscape/dressing.ts` — the boathouse and rack are placed in the next cove along from the jetty and merge into the steading draw; the stakes are scattered into the shallows within thirty metres of the landing
- **fixed** shore structures pointing across the water instead of into it: `yawAlong` in `landscape/layout.ts` converts a shoreline bearing into the `y` rotation a `+z`-long prop needs, and the jetty and rowboat now use it too
- **refactored** `findShore` onto a reusable `findBank` walk, so the harbour can ask for the bank on one bearing without a second copy of the search
- **added** `layout.harbourSpread` (degrees along the shore between jetty and boathouse) and `dressing.mooringPost` to the config
- **cost** one draw call, for the stakes' `InstancedMesh`; the boathouse and rack add ~4.1k vertices to the existing merged steading geometry and no new material
- **tests** `props/shore.test.ts` and `landscape/layout.test.ts`, plus the roster's existing determinism and base-height coverage over the three new builders
