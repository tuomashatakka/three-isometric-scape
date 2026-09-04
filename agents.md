# agents.md

the tool reference for anything working on this repository without a pair of eyes on the canvas. [`instructions.md`](instructions.md) is *what to do*; this is *what you have to do it with*. the [readme](README.md) is the design record and explains why the scene is the way it is.

**the one rule that saves the most time:** almost nothing here needs a browser. world generation, prop building, path planning and the whole palette are pure typescript — no `three`, no gl context, no dom. so the fast loop is `bun` and ascii, and a screenshot is the *last* resort rather than the first.

| you want to know | reach for | costs |
| --- | --- | --- |
| where am i starting from | `bun run brief` | ~2 s, no browser |
| what does the runtime already do | [`threejs-scene-api.md`](threejs-scene-api.md) | one read |
| what is its exact signature | `node_modules/threejs-scene/llms.txt` | one read, ships with the package |
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
scape:map   seed 7319  world 1520m  home 196m  water -1.25m  grid 96x48  15.83x31.67 m/cell

land 18.3%  above snowline 72.6%  peak 8.63m @ (9, 18)
yard (-17,-0.7) r19    track 27pts 48.8m    landRadius 44
footpaths 19 routes, 245.8m total, longest 22.3m
creek OK  head (19,23) 6.49m -> mouth (36,56) -14.3m  len 38m
beck  15.9m wetted, 8m of fall
tarn  (33,3.7) surface 2.59m  wetted r5.9m  rim 2.34m
pasture (24.5,3.9) r6   plots 4   ridges 5   isles 15/15 surfacing
mill (35.9,-8.1) prominence 6.85m
chapel (26.8,15.1) prominence 1.56m  46.6m from the yard
smokehouse (-8.5,-10.3) 18m up the bank
beacon (60.9,39.3) isle 5 freeboard 6.69m  reach 74.7m
croft (-66.2,-37) isle 10  freeboard 3.95m  53.9m from the harbour
steading  farmhouse(-8,3) barn(-16,-14) aitta(-27,6) woodshed(-28,-7) sauna(-17,16)
landing (-26,-17)  harbour (-13,-28)
landmasses 5
home/home @ (0,0)  land 18.3% peak 8.63m  paths 19  jetty (-26,-17)  mill (35.9,-8.1)
ridge/ridge @ (-178,128)  land 14.3% peak 6.5m  paths 12  jetty (-151,138)  mill NONE
meadow/meadow @ (178,128)  land 27% peak 5.68m  paths 16  jetty (151,126)  mill (168.2,157.5)
sound/sound @ (-300,-480)  land 15.5% peak 12.62m  paths 16  jetty (-362,-396)  mill (-282.7,-482.5)
fell/fell @ (300,-480)  land 13.9% peak 14.94m  paths 15  jetty (322,-393)  mill (339.3,-515.2)
waterways 5 legs 2515.5m  connected OK  wet OK  clearance 0.55m
boats 5  separation 115.79m  conflicts 0
strand sound<->fell  len 450m  crest 1.1m  lowest 0.4m  CONNECTED
skerries 49 in 16 guards  widest 22m  lowest 0.8m over the water  nearest island 79.9m
fjord sound  len 115m  sea 11.7m  sill 5.5m  basin 16.3m  head +2.8m  OVERDEEPENED
fjord fell  len 115m  sea 11.7m  sill 6m  basin 16.3m  head +3.8m  OVERDEEPENED
hearths 15  lowest mouth 4.35m over the ground
windows 93  lowest pane 0.73m over the ground  facing out 93/93
storm 6/7 strikes  peak @ phase 0.3161 over fell  ridge(-193,77) 1x on -1.25m  meadow(206,141) 1x on -1.05m  sound(-336,-501) 2x on 1.72m  fell(282,-480) 2x on 7.02m
grazing 7/10 flocks  thinnest cover 0.72  home/outfield (32,-14) r7  home/outfield (24,23) r7  meadow/infield (158,146) r7  sound/infield (-329,-518) r7  sound/outfield (-266,-443) r7  fell/infield (311,-424) r7  fell/outfield (322,-541) r7
gulls 6/6 colonies  home/harbour (-53,-63) r24.1  home/rock (71,46) r28  ridge/harbour (-116,147) r28  meadow/harbour (103,132) r28  sound/harbour (-373,-353) r28  fell/harbour (322,-361) r13.2
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

**for a signature, read the runtime's own reference instead:** `node_modules/threejs-scene/llms.txt`. it ships with the package, is generated from its built type
declarations, and carries every export's real signature plus the rules that separate code which compiles from code which behaves. our digest answers *do we already
have this and do we use it*; theirs answers *what exactly does it take*. do not guess a signature when both files are on disk.

it is the one generated file that *is* committed, and the exception has a reason: everything else the brief prints changes on every commit, and this changes only
when the dependency's version does — so its diff is a review event worth having rather than noise. `--check` warns and never rewrites, because bumping the
dependency is a reviewed decision and regenerating a committed file as a side effect would hide exactly the diff worth reading. a test fails if the stamp and the
installed version disagree.

the reinvention it exists to stop was never a discipline problem. nothing in this repository said what was already available, so each run rebuilt what it could
not see — a gesture rig, a renderer bootstrap, three copies of one ribbon builder. 59 of 390 exports are used; the rest are one read away.

---

## the fast loop, in order of cost

### `bun run scape:map` — the whole composition, as ascii

no browser, no gpu, no dependency. [`landscape/archipelago.ts`](src/scene/landscape/archipelago.ts) resolves five local surveys, projects their paths and ports, and plans the water-only route without building a vertex; this renders the combined result.

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
seed 7319  world 1520m  home 196m  water -1.25m  grid 96x48  15.83x31.67 m/cell

land 18.3%  above snowline 72.6%  peak 8.63m @ (9, 18)
yard (-17,-0.7) r19    track 27pts 48.8m    landRadius 44
footpaths 19 routes, 245.8m total, longest 22.3m
creek OK  head (19,23) 6.49m -> mouth (36,56) -14.3m  len 38m
beck  15.9m wetted, 8m of fall
tarn  (33,3.7) surface 2.59m  wetted r5.9m  rim 2.34m
pasture (24.5,3.9) r6   plots 4   ridges 5   isles 15/15 surfacing
mill (35.9,-8.1) prominence 6.85m
chapel (26.8,15.1) prominence 1.56m  46.6m from the yard
smokehouse (-8.5,-10.3) 18m up the bank
beacon (60.9,39.3) isle 5 freeboard 6.69m  reach 74.7m
croft (-66.2,-37) isle 10  freeboard 3.95m  53.9m from the harbour
steading  farmhouse(-8,3) barn(-16,-14) aitta(-27,6) woodshed(-28,-7) sauna(-17,16)
landing (-26,-17)  harbour (-13,-28)
landmasses 5
home/home @ (0,0)  land 18.3% peak 8.63m  paths 19  jetty (-26,-17)  mill (35.9,-8.1)
ridge/ridge @ (-178,128)  land 14.3% peak 6.5m  paths 12  jetty (-151,138)  mill NONE
meadow/meadow @ (178,128)  land 27% peak 5.68m  paths 16  jetty (151,126)  mill (168.2,157.5)
sound/sound @ (-300,-480)  land 15.5% peak 12.62m  paths 16  jetty (-362,-396)  mill (-282.7,-482.5)
fell/fell @ (300,-480)  land 13.9% peak 14.94m  paths 15  jetty (322,-393)  mill (339.3,-515.2)
waterways 5 legs 2515.5m  connected OK  wet OK  clearance 0.55m
boats 5  separation 115.79m  conflicts 0
strand sound<->fell  len 450m  crest 1.1m  lowest 0.4m  CONNECTED
skerries 49 in 16 guards  widest 22m  lowest 0.8m over the water  nearest island 79.9m
fjord sound  len 115m  sea 11.7m  sill 5.5m  basin 16.3m  head +2.8m  OVERDEEPENED
fjord fell  len 115m  sea 11.7m  sill 6m  basin 16.3m  head +3.8m  OVERDEEPENED
hearths 15  lowest mouth 4.35m over the ground
windows 93  lowest pane 0.73m over the ground  facing out 93/93
storm 6/7 strikes  peak @ phase 0.3161 over fell  ridge(-193,77) 1x on -1.25m  meadow(206,141) 1x on -1.05m  sound(-336,-501) 2x on 1.72m  fell(282,-480) 2x on 7.02m
grazing 7/10 flocks  thinnest cover 0.72  home/outfield (32,-14) r7  home/outfield (24,23) r7  meadow/infield (158,146) r7  sound/infield (-329,-518) r7  sound/outfield (-266,-443) r7  fell/infield (311,-424) r7  fell/outfield (322,-541) r7
gulls 6/6 colonies  home/harbour (-53,-63) r24.1  home/rock (71,46) r28  ridge/harbour (-116,147) r28  meadow/harbour (103,132) r28  sound/harbour (-373,-353) r28  fell/harbour (322,-361) r13.2
```

`chapel NONE` is the same kind of answer with an extra clause: a chapel needs a rise *and* a rise inside `chapel.reach` metres of its own yard, so an island whose only knolls are out on a headland gets no church rather than one nobody walks to. the line carries the distance from the yard beside the prominence for that reason — a chapel that moved on a run which touched neither `chapel.prominence` nor `chapel.reach` is a finding, and so is one whose `from the yard` crept toward the reach.

`tarn NONE` is that answer for standing water. a pool is *sited* rather than traced — the search takes the flattest upland the holding has not already claimed, and the surface it draws is the lowest point of that rim, because that is the first place the water would run out over. so an island whose spare ground is all hillside gets no pool, and the ridge is exactly that island. the two numbers beside the position are the finding: `wetted` is how far the water actually reaches once the basin is cut, measured against the same field the bank occludes the sheet with, and `rim` is the relief the search settled for. `wetted r0m` on an island that still reports a tarn means a basin that stopped holding water — invisible in every still, because the sheet is drawn to the full radius either way and simply disappears behind its own bank.

`beacon NONE` is the same kind of answer: the light goes on the *outermost* islet in the ring that is broad enough for masonry and has eight dry bearings at its footing, so an archipelago whose skerries are all too small gets no lighthouse. a beacon that moved isle on a run that did not touch `beacon.minRock`, `beacon.freeboard` or `terrain.isles` is a finding.

`fjord <id>` is one line per island with an inlet cut into it, and it is four depths rather than a position because the landform's whole claim is a *relation* between them: the sea outside the mouth, the sill across it, the basin behind it, and how far the valley floor at the head stands over the water. `OVERDEEPENED` means the basin is deeper than the sea it opens into, which is what separates a fjord from a bay. none of it can be read from a still — the depth channel of the bathymetry mask saturates a few metres down and paints all three the same blue — so a run that retunes the falloff, the shore shelving or `seabedDrop` and quietly drowns a sill has this line and nothing else. it is measured off the island's *own* field, not the composite one: the guard answers with the seabed wherever it has no rock, so the composite is floored nine metres down and cannot see a trench.

`gulls 6/6 colonies` is the flock line, and the two numbers are the finding: the second is what the islands *offered* — one landing each, plus an outer rock where a light was built — and the first is how many of those found open water wide enough to fit a whole ring over. `5/6` on a run that did not touch `birds.spread`, the coastline or the landings means a bank closed up. this is here rather than in a screenshot because a flock is four pixels wide at the default pose.

`storm 6/7 strikes` is the lightning line, and it is here because a still cannot see this system at all: a strike is somewhere for two thirds of a second in seven minutes, so almost every frame of the scape is a frame of a coast with no storm in it. the second number is the whole comb the seed planned and the first is how many of them `storm.rate` lets through — `NO STRIKES` is a front with no lightning in it, which is a legitimate setting and a silent regression if nobody asked for it. `peak @ phase` is the instant the `storm` poses are aimed at, asked for the same way the capture harness asks so the two can never describe different frames. the per-site counts are the second finding: every strike on one island is a hash that stopped spreading, and the line says so. the metres are what each fork stands on — a site out over open water reads as the waterline, which is a bolt striking the sea and is fine.

`hearths 10  lowest mouth 5.5m over the ground` is the chimney line, and `lowest` is the whole check: two stacks a holding, and the tightest clearance between any mouth and the ground under it. a building is levelled onto the *highest* ground beneath its footprint while its chimney stands 2.6 m off the middle of that footprint, so on a slope the two are measured against different heights — anything under about three metres means a stack has been placed against a floor it does not stand on, and the map says so in the line. here rather than in a still because a plume is three pixels at the default pose.

`windows 65  lowest pane 1.9m over the ground  facing out 65/65` is the lamplight line, and it carries two checks. `lowest` is the chimney check from the other end of the building — a pane is inside a room, so anything under about half a metre means a window has been placed against a floor it does not stand on. `facing out` is the sign check, and the more valuable of the two: it counts the panes whose outward bearing points away from their own building's placed centre. anything short of the full count is a lamp lit on the *inside* of the wall it belongs to, which the building's own geometry hides — and from the default pose that is indistinguishable from the lamps not working at all.

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
bun run scape:shot --poses beacon                   # the light, 4 headings, at night
bun run scape:shot --poses coast                    # the shoreline, 4 frames, weather side and lee
bun run scape:shot --poses steading                 # the farmyard, 4 frames, summer/winter/night/evening
bun run scape:shot --poses guard                    # the rocks in the open sea, 4 frames
bun run scape:shot --poses window                   # one farmhouse wall, 2 frames: the glass by day, the lamp at dusk
bun run scape:shot --poses chapel                   # the church and its yard, 4 frames
bun run scape:shot --poses grazing                  # the flocks on the rough ground, 3 frames
bun run scape:shot --poses shallows                 # the light on the bottom, 4 frames
bun run scape:shot --poses beck                     # the water in the channel, 4 frames
bun run scape:shot --poses smokehouse               # the hut above the harbour, 3 frames
bun run scape:shot --poses croft                    # the holding out on the islets, 3 frames
bun run scape:shot --poses tide                     # the sea at both ends of its swing, 3 frames
bun run scape:shot --poses fjord                    # the drowned valley in the sound, 4 frames
bun run scape:shot --poses aspect                   # two sides of one hill, 4 frames
bun run scape:shot --poses tarn                     # the pool on the high ground, 4 frames
bun run scape:shot --poses storm                    # the lightning on the far islands, 4 frames
bun run scape:shot --rot 30 --zoom 12 --time 0.02
bun run scape:shot --tier ultra --set look.bloom=0
bun run scape:shot --skip post                      # drop the optical chain
```

`tour` is `default`, `near`, `far`, `noon`, `night`, `winter`. `night` pins a week as well as an hour, because the sun runs a seasonal arc and the config opens at a midsummer that has no night in it. every capture prints a line before anything opens the image, and most runs need only that line:

`storm` is the one set that names a *time* rather than a place, and it is the only way to photograph the lightning at all. every other system in the scape is somewhere in every frame; a strike is somewhere for two thirds of a second in seven minutes. so the set asks `stormPeak` in [`storm.ts`](src/scene/storm.ts) for the front's brightest strike and pins `weather.time` a fiftieth of a flash into it — the phase is resolved from the seed rather than written down, because a hard-coded one would go stale silently and photograph an empty sky. four frames: `storm` at the default frame, `storm-night` at the same instant in the dark half of the year, `storm-fork` on the striking island at 70 m where the channel is readable, and `storm-clear` a quarter of a cycle on, which is the control and must stay identical to the reference. reach for it whenever the change touches the front, the deck the flash sits under, or the render order between the two.

`coast` is the third set, and it exists for the same reason `beacon` does: four frames on a shoreline — `wash` at one bay, `lee` at the *identical* frame with `wind.bearing` turned right around, `shores` pulled back over the home island's whole coast and its skerries, and `frozen` at midwinter where the ice is meant to take the white water away. reach for it whenever the change touches the water's edge: surf, foam, the ice front, the depth tint or the alpha ramp. every pose in `tour` is aimed at the middle of the home island, so a change that repaints every shore in the archipelago reads as `same` at all six.

`steading` is the fourth set, and the same argument again one scale further down: the farmyard at a 48 m view, in the authored light, at midwinter and at night. every pose in `tour` is aimed at the middle of the archipelago, and `near` — the one exception at ten metres — is focused on the world origin, which is open yard between the farmhouse and the sauna and takes neither of them in. the fourth pose, `yard-evening`, is nine in the evening rather than half past midnight, and it is there because `yard-night` is deliberately *after* the household has turned in: the lamps in the windows are banked to a stove glow at that hour, and a pose that only ever saw them banked could not tell a farm with people in it from an empty one. reach for the set whenever the change is the size of a building or something standing on one: a roof, a doorstep, a rut, a chimney, a lit window.

`guard` is the fifth set, and the argument once more in the other direction — out to sea rather than in at the yard. four frames on the chain of rocks at (305, -99): `reef` over the whole 199 m line, `reef-near` on its widest rock at a zoom where the drowned shelf, the break on it and the dry crown are three things rather than one speck, `reef-lee` at the identical frame to `reef` with the wind turned right around, and `reef-winter` where the shallows the guard created are the first water in the archipelago to shut. the tour *can* see the guard — the chains read at `default`, `far` and `noon` — but forty-nine rocks of forty metres in a 1400 m frame move a fraction of one per cent of the pixels, so the whole-frame column says `same` and only `maxblock` is honest. reach for it whenever the change touches the open water between the islands, or anything standing on the rocks in it — `littoral.*` included.

`shallows` is the eighth set, and the first whose subject is not a thing at all — it is a *pattern*, two and a half metres across, on the bottom of the water. four frames on the harbour bank west of the landing: `shallows` in the authored light, `shallows-noon` with the sun at its highest, which is the top of the elevation ramp the net is scaled by, `shallows-winter` where the midwinter sun never clears the horizon at this latitude *and* the ice has shut the bank, and `shallows-far` at a 620 m view, which is the *guard*: the net is procedural and has no mipmap, so it measures its own footprint and hides rather than aliasing, and that pose has to come back `same` for the claim to hold. `coast/wash` is the closest any earlier pose comes to the water and it is still ninety metres out. reach for it whenever the change touches what the water is doing between its edge and its depth tint — `water.caustics`, `water.causticDepth`, `water.causticScale`.

`beck` is the ninth set, and it is aimed at the one surface in the scape that is neither the sea nor the ground: the sheet of water standing in the channel. four frames on the home island's course — `beck` at the middle reach where the fall is steepest and the white water is, `beck-mouth` at the estuary, which is the only frame that shows the sheet meeting the sea rather than ending in the air above it, `beck-winter` at midwinter, where a beck that runs later than the sound freezes has to still be running when the bay beside it has shut, and `beck-far` at a 320 m view, the *guard*: the surface texture is a metre-scaled procedural pattern with no mipmap behind it. the course is sixty metres off the world origin every pose in `tour` is aimed at and three metres wide where it starts, so it is a hairline at `default` and off the bottom of the frame at `near`. reach for it whenever the change touches `beck.*`, `creek.*`, or the ground either of them is cut into.

`tide` is the tenth set, and the first whose subject is a *difference* rather than a place. a tide is only ever visible as two frames of one shore, and two frames taken at two hours of the day differ by the light as well — which is the larger signal and would drown the smaller one. so the hour is held and `tide.lag` is turned instead: `ebb` and `flood` are the identical frame of the harbour bank west of the landing, half a cycle of lag apart, and the only thing that can have moved between them is the water. `tide-slack` is the *guard* — the same frame at `tide.range=0`, which has to come back `same` as the tideless scape, or the range is not the switch the section says it is. reach for it whenever the change touches `tide.*`, the waterline, or anything floating on it.

`aspect` is aimed at the one subject the tour has never had in frame at a size worth measuring: an open hillside. four frames — `aspect` and `aspect-turned` are the fell from opposite headings, which is the claim in two pictures, since the face that is dark and green from one is pale from the other; `aspect-thaw` is the week the snow line's swing lives in, a *thaw* at `season: 0.16` rather than midwinter, because at full cover a line that has run off the top of the island cannot be seen to swing; `aspect-home` is the home island's own upland, where the effect has to survive being seen next to a farm. the fell is the subject because it is the steepest ground in the archipelago and the least built on. reach for it whenever the change touches `terrain.aspect*`, `season.snowSwing`, `palette.moss`, or anything else that repaints ground rather than adding a thing to it — and reach for `--tolerance 0.04` with it, because a wide, low-amplitude repaint is precisely what the default per-pixel tolerance of 0.1 is not built to see.

`beacon` is the second set: the light itself, at night, from four headings 90° apart, aimed by `camera.focusX`/`focusZ` rather than by zoom. it exists because the beams' bug was a render-order tie broken by *projected depth*, and that flips with yaw — one heading can only ever photograph one side of the flip, and no pose in `tour` has the tower in frame at all. reach for it whenever the change touches the transparent stack.

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

the reuse is keyed on the commit **and on every knob that changes the picture** — tier, ratio, aa, post, skip, size, frames, stillness and `--set` — written to `.scape/ref-shots/.ref-sha` beside the images. shots on disk say nothing about what they are shots *of*, so without
that a run reuses whatever the last one happened to leave behind. a mismatched sha, or any missing pose, rebuilds.

the pose's *own* camera is keyed separately, in `.ref-poses` beside the sentinel, because a pose is named on the command line but *defined* in the working tree. retune one — move its focus, change its hour, add a `--set` to it — and the sentinel still matches while `chapel.png` has become a picture from somewhere else. a pose whose zoom, rotation, time, season or overrides have moved is rebuilt; the rest of the cache is kept, so retuning one frame does not throw the tour away.

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
| `smokehouse.ts` | the smokehouse — log walls, turf roof, ridge cowl, and `SMOKEHOUSE_VENT` |
| `croft.ts` | the croft — boarded walls, turf roof, stone flue, oars at the blind gable, and `CROFT_VENT` / `CROFT_WINDOWS` / `CROFT_SINK` |
| `upland.ts` | meadow barn, hay drying poles |
| `chapel.ts` | the chapel — nave, stepped chancel, open belfry, spire — and the grave markers. **fronted on `-x`, not `+z`** |
| `mill.ts` | the post mill and its trestle, plus the sail wheel — **the one geometry not based at `y = 0`** |
| `beacon.ts` | the lighthouse tower, and the optic — a halo plus two crossed, vertex-graded fans per panel |
| `vegetation.ts` | spruce, pine, birch, grass, reeds, crops — and all four runtime vertex deformers: `applyTaper`/`applyBend`/`applyTwist` on a blade, `displaceByNoise` on every canopy |
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
| `layout.ts` | yard, cart track, field plots, ridges, pasture, mill, chapel, `sinkToIsland`, `yawAlong` |
| `height.ts` | authored ground, islets, beck, fbm underneath |
| `steading.ts` | where the buildings stand, `faceToward`, `doorstepOf` |
| `landing.ts` | one local shoreline, with an open-sea jetty and harbour, and where the harbour's own furniture stands |
| `path.ts` | polyline smoothing and queries — reuse these, do not re-derive them |
| `network.ts` | the farm's street plan: waypoints, spanning tree, shortcuts |
| `footpath.ts` | tracing a planned leg into a worn line, and the wear query |
| `waterway.ts` | world ports, water-only route search and hull clearance |
| `boat-motion.ts` | synchronized legs, early jetty waits, seven-second dwell and bounded turns |
| `boats.ts` | one dynamic `InstancedMesh`, plus stable live pose and wake records |
| `creek.ts` | the beck: descent trace, channel, tidal mouth |
| `beacon.ts` | the outermost rock broad and dry enough to carry a light, and the footing probe that proves it |
| `colony.ts` | the open water off a harbour or an outer rock that a flock can wheel over without crossing land |
| `grazing.ts` | the rough ground each farm turns stock out onto, and the one predicate that both sites a flock and accepts a sheep |
| `hearths.ts` | every chimney, flue and ridge cowl in the archipelago, carried from the prop's own frame out to the mouth |
| `windows.ts` | every glazed pane, carried out the same way and turned to its wall's outward bearing |
| `fixtures.ts` | the transform both of those share: a point in a raised building's own frame, in world metres — plus the two floor rules, `floorUnder` for a plopped building and `mergedFloor` for a merged one |
| `chapel.ts` | the knoll a chapel stands on, its doorstep, and `chapelYaw` — the one yaw `yawAlong` cannot give |
| `smokehouse.ts` | the patch of bank above the harbour a smokehouse is built on |
| `croft.ts` | the free islet a croft is built on — scored on the row home from the harbour, and never the rock the light is already on |
| `mill.ts` | the exposed shoulder a windmill stands on, and the doorstep at the foot of its stair |
| `mill-sails.ts` | every mill's wheel in one dynamic `InstancedMesh`, geared off `wind.strength` |
| `terrain.ts` | shared archipelago geometry, height/slope banded colour, path wear painted in |
| `aspect.ts` | which way a slope is turned, and the moss, the bleach and the snow line that follow from it |
| `water.ts` | baked bathymetry, swell, foam, glitter, winter ice and shader boat wakes |
| `water-caustics.ts` | the net the sun draws on the bottom of the shallows, and how bright it is today |
| `beck.ts` | the sheet of water standing in every island's channel, its fall, its white water and the week it locks |
| `tarn.ts` | the search for upland flat enough to hold standing water, the basin carved into it, and the reach it holds |
| `tarn-water.ts` | every island's pool in one still draw, its depth tint, and the winter it gets weeks before the sea |
| `samplers.ts` | where the dressing throws its darts — island, disc, tread, skerry |
| `dressing-zones.ts` | world-space keep-outs and pure scatter acceptance rules |
| `dressing-helpers.ts` | hand-placed runs and helpers shared by each holding |
| `dressing-enclosures.ts` | the walled ground: the pasture wall, the churchyard wall and its graves, the plot fences |
| `dressing.ts` | placement, hero merge, instanced scatter |
| `littoral.test.ts` | the tidal band on the guard: the sampler lands on rock, the two zones do not overlap, and both reach every rock |
| `water-caustics.test.ts` | the net is a daylight effect: nothing under the horizon, nothing in the polar night, a ramp rather than a step, and rain dims it without putting it out |
| `beck.test.ts` | the sheet never runs uphill, lies flat across the channel, opens out with it, stops at the tideline, and locks after the sea does |
| `tarn.test.ts` | no rim point stands below the water, the carve only goes down and only inside its radius, water actually stands in every basin, the pool is off the farm, and it locks ahead of the sea |
| `index.ts` | the scene module, and what raycasts |
| `tide.test.ts` (in `src/scene/`) | two highs a lunar day, springs on new *and* full, a mean of zero over a cycle, a flat sea at range zero — and the shipped range fits under the router's clearance and inside the wrack band |

**a yaw is not a bearing.** `rotateY(θ)` carries a prop's front (local `+z`) to `(sin θ, cos θ)`; a compass bearing points at `(cos a, sin a)`. they are reflections and agree on exactly one diagonal, which is why getting it wrong survives for months. use `faceToward(from, to)` for props and `yawAlong(bearing)` for anything laid along a line.

the runtime fleet does not use the survey's old fixed offsets as an animation clock. `boat-motion.ts` advances one shared leg schedule: short crossings wait for the final arrival, then all three boats share a seven-second dwell. its separation audit includes those stationary intervals. `boats.ts` owns the authoritative damped bearing and stable pose/wake records; camera and water consumers read them rather than resampling the route and quietly disagreeing.

### interaction and live diagnostics

the pointer bookkeeping — capture, live pointers, the pinch frame, tap detection — is `attachPointerGesture` from the runtime. what stays here is only what this scape *means* by a gesture: pan, orbit on a modifier latched at the press, pinch to zoom and pan at once, tap to open somewhere. the press is where the latch is taken and where the canvas takes focus, because a press is intent before it is a drag.

`camera-controls.ts` raycasts the fleet before the terrain. selecting an instance hands its stable pose to `camera-follow.ts`, which resolves one allocation-free orthographic third-person target at a 22-metre view; escape, terrain or empty-space selection, and pan or rotation drags clear it. **do not put a second boat simulation in the camera.** manual direct manipulation must also remain an explicit exit from any future follow mode.

`vitals.ts` is the only frame measurement. `ui/fps-meter.ts` shows fps, milliseconds, camera xyz and orthographic `viewSize` in metres on every sample; `?debug` adds calls and triangles. extend that sample if another always-visible diagnostic is needed rather than adding another timer or polling the camera elsewhere.

### an atmospheric system

`src/scene/*.ts` — `atmosphere.ts`, `mist.ts`, `clouds.ts`, `aurora.ts`, `nightsky.ts`, `rain.ts`, `birds.ts`, `beacon.ts`, `hearth.ts`, `windows.ts`, `post.ts`, the four clocks `daylight.ts` / `season.ts` / `weather.ts` / `wind.ts`, and `tide.ts`, which is not a fifth — it is the first two read against each other. composed in [`create-isometric-scape.ts`](src/scene/create-isometric-scape.ts). the hung sheets share [`sky-deck.ts`](src/scene/sky-deck.ts) — the zoom reveal and the focus they follow — so two decks cannot fade in at two different zooms.

anything mounted *after* `atmosphere.module` sees this frame's day; anything before it sees the last one's. that is the whole reason the coastal light is a layer here rather than part of the landscape that surveys it — `beacon.ts` reads `daylight.day` and the landscape publishes `lanternHubs` for it.

**the wind is the fourth clock and it is mounted before the landscape**, not after the atmosphere — everything that answers it is either a material uniform or a sheet offset, and both are resolved inside the landscape's own update. it publishes a bearing, a gust and one integrated `travel`; a consumer keeps a *response* and never a rate of its own, which is what makes one gust one wave across the whole scape. differencing against `wind.travel` rather than integrating a delta is the pattern to copy: a response moved on the overlay should change where a sheet goes *next*, not teleport it to where it would have been had the new value always applied. `aurora.ts` is the one deliberate abstainer.

the clocks are coupled, and in one direction each: the weather takes the year and decides how hard this week's precipitation falls, and the day takes the year and solves the sun's arc for it — `daylight.sample(time, year)`. so **the day's sky is a function of the week**, and `daylight.latitude` at 68°N means midwinter has no daylight in it and midsummer no night. anything reading the darkness of the sky reads `daylight.dark` (astronomical twilight, geometry) rather than a curve of the year.

the storm is the newest system with a scale audit to state, and it spans three of the four classes at once: the lit cloud's reach is **world-sized** (a share of `archipelago.worldSize`, because a storm cell is a fact about the islands it stands over), the two reveal curves are **frame-sized** (fractions of the zoom range, because whether a flash or a fork is readable is a question about the picture), and the channel's height is **metres** — it runs from `atmosphere.cloudHeight` to the ground it struck, and nothing else would be honest.

shared atmosphere has four scale measures and they are not interchangeable: sheet/deck reach follows `archipelago.worldSize`, cloud and aurora composition follows `camera.maxViewSize`, rain, the night sky and upright mist follow the live `viewSize`, and genuine metre features such as the 79-metre mist tile and the gulls' 26-metre ceiling stay in metres. the birds are the one system that is *both*: they hang at world-surveyed colonies in metres, and their wingspan carries a floor at 1.8% of the live `viewSize` so a bird pulled fully out is a legible mark rather than a pixel and a half of grain. audit all four when the world or camera grows; swapping `terrain.size` for `worldSize` everywhere is how one fixed bug becomes four fresh ones, uwu.

**a sky is at infinity, and that decides its scale class before anything else does.** the night sky was written world-sized first, like the aurora beside it, and 520 metres of archipelago spread one night's stars over eight frames of open sea — a dozen on screen, and `scape:diff` correctly reported `same` at every pose. anything that should not slide past as the eye pans, and should not gain detail as the eye pulls back, is pinned to the camera's focus and scaled by the live `viewSize`. its count is then already a screen density and a run that grows the world never has to come back to it.

### a knob

[`config.ts`](src/scene/config.ts) is the public tuning surface. **if it is visual and read per frame**, add a dotted path to [`ui/scape-controls.ts`](src/ui/scape-controls.ts) and it persists, resets and becomes url-addressable for free. **if it needs a rebuild to be seen** (`archipelago.*`, `layout.*`, `creek.*`, `footpath.*`, `dressing.*`, `birds.spread`, and every `boats.*` field except `speed`) leave it out of the overlay — a slider that lies about what it does is worse than no slider.

there is **no `enabled` flag anywhere**: an effect is off when its strength is zero.

**and prefer folding a knob into one that already means it.** two numbers describing one physical quantity is two numbers to keep in step: the gust front has no fronts-per-minute of its own because a harder wind brings its squalls through faster, and the ground's parallax relief has no depth of its own because the relief and `terrain.detailGrain` are the same field. a `LandmassSpec` states only what its island does *differently* from the top-level `terrain` and `layout`, so the home island's eleven numbers exist once. before adding a field, check whether an existing one already implies it — and if it does, derive it and say so at the knob.

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
| `threejs-scene/modules/assets` | `part`, `mergeParts`, `mergeGeometryList`, `kitMaterial`, `markShared`, `scatterInstances`, `createPlacementField`, `applyBend`/`applyTaper`, `createRockGeometry`, the primitives (`box`, `cyl`, `cone`, `ball`, `hedron`, `plank`, `blade`, `deg`, `spread`), `createSurfaceRibbon`, `rasterizeAscii`/`auditPalette`/`ASCII_VIEWS`/`ASCII_SHADES`, `createNoiseTexture`/`createSeamlessNoiseTexture`, `bakeAlphaField`, `Prop` |

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
9. **`scape:shot` and `scape:diff` default to `--tier mobile`, and mobile draws the ground with the one-tap lite path.** the normal map, the parallax relief and the macro octave all live on the six-tap path, so a change to any of them photographs as **exactly 0.00% on every pose** at the default tier — not a subtle difference, an identical file. that is the gate working, measured on the tier the gate turns it off on. it cost a full round of "the effect is not visible" debugging, up to painting the branch bright red and watching nothing happen. **any change to the detail injection in `props/material.ts` has to be captured with `--tier desktop`**, and a diff table quoted without one proves only that mobile still links.
10. **a cached `scape:diff` reference was keyed on the commit and nothing else.** the prewarm sentinel stamped the sha, so a reference warmed at the default `--tier mobile` was happily reused for a `--tier desktop` head side — and the tiers do not merely look different, they build different programs. the table read `near 44.67% CHANGED / default 28.61% CHANGED` for a change whose actual subject moved a few pixels, and nothing in the output admitted the two halves were different tiers. fixed twice, independently and on the same day: `refStamp(rev, args)` now folds tier, ratio, aa, post, skip, size, frames, `--set` and the still flag into the sentinel, and `scape-diff.test.ts` asserts each of those moves the key while the port and the pose list do not. fixed, but worth knowing that a diff table is only ever as honest as what it thinks it is comparing.
