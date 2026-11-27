# instructions

the standing brief for the **scene enhancement run** — a scheduled, unattended llm session that makes `three-iso` look more like a real place and draw it more cheaply, one increment at a time, without letting the codebase rot.

written to be read cold. a run starts with no memory of the previous one. everything it needs is here, in the project skills under [`.claude/skills/`](.claude/skills), in [`agents.md`](agents.md), in the [readme](README.md), or in the repository itself.

- **this file** — what to do, and in what order
- **`.claude/skills/scape-studio`** — how to *look*: a warm browser, seconds per picture
- **`.claude/skills/scape-perf`** — how to *measure*: the triangle and draw census, and the levers that exist
- **`.claude/skills/scape-verify`** — how to *check*: the light gate and the full one
- **`.claude/skills/scape-assets`** — what already *exists*: `bun run assets` prints every prop, shared kit helper and texture with its cost and file; `/props.html` is the same catalog with pixels
- **`.claude/skills/scape-tools`** — which instrument: every dev tool, what it costs, and where its detail lives
- **[`agents.md`](agents.md)** — every script and flag, the module surface, the traps
- **[`README.md`](README.md)** — why the scene is the way it is

## the goal

**standing emphasis — the whole frame's rendering and realism, not single props.** every run asks first what the *general rendering* still lacks — light, atmosphere, the optical chain, materials every surface shares — and lands its change where every frame inherits it. every run should refactor broadly while it is in there (the repository is experimental; destructive changes are welcome when they leave less code): make the general rendering more immersive and realistic; make props more detailed *and more generic and reusable* by pushing detail into the shared kit; texture the environment and make geometry less faceted; merge controls under more generic parameters; and tune or fold new shader stages into the global effect chain. a prop-only run is the exception, not the default. the overlay is part of the picture too: it follows one design system (the `--ui-*` tokens in [`src/style.css`](src/style.css), see the readme's *the graphics overlay*). a run that touches the ui uses those tokens and does not add one-off colours.

**a more realistic picture, drawn for less.**

the world already has more sites than most frames show — six islands, a hundred surveyed landforms and buildings. what it lacks is the *rendering*: light, material, atmosphere and scale that read as a photograph of a nordic coast rather than as a diorama of one. so a run's headline is about how the **whole frame** looks or what it costs, not about one more prop:

- **light** — shadow quality and softness, sky and bounce light, ambient occlusion where things meet the ground, a sun that warms and a cloud that cools, exposure that adapts between noon and a midsummer night. the camera is white-balanced to the light ([`white-balance.ts`](src/scene/white-balance.ts)), so a colour cast over the whole frame is a light's colour, not a palette entry's
- **material** — ground that reads as a quilt of moss, heather and peat rather than one green (`heathFragment`), smooth terrain with real normal detail, wet versus dry, specular water with the sky in it, roughness that varies, snow that sits on top of things and not inside them, foliage that transmits light, stone and timber with relief rather than flat facets
- **atmosphere** — aerial perspective with distance, haze that is denser low, fog that lies in the valleys, rain that darkens and streaks
- **scale and detail** — what close zoom shows (richer geometry, texture detail), what wide zoom shows (silhouettes, coastline, the sea), and an lod that makes the first cost nothing at the second
- **cost** — fewer draws, fewer triangles, cheaper passes, a faster first load (`scape:bench`); every tier, mobile first
- **the optical pipeline** — the post chain is a camera, not a stack of filters: one pass per physical stage (scene light, then the glass in [`lens.ts`](src/scene/lens.ts) and the film in [`film.ts`](src/scene/film.ts)), merged rather than appended. a new screen-space effect folds into an existing pass when it reads the same pixels. anything that is a function of one pixel alone (a curve, a tint, a toe) belongs in `film.ts`, where it reaches the phone too: the film runs inside every material's tone mapping on a tier with no chain
- **the free channels first** — every fogged program already includes the aerial chunk and already carries three's fog uniforms, and tone mapping already runs in every material. a term that rides one of those (`groundFog` on `fogNear`, the film on the exposure) reaches every material on every tier with no new program, no `onBeforeCompile` and no draw. look there before adding a mesh or a pass
- **the shared kit over the single prop** — a look that belongs to a *kind* of thing (every stone, every board, every roof) lands once, in the helper every prop of that kind is built through (`stonePart`, `soften`, the two scape materials), so one change reaches every island. a term keyed on what the albedo already is (`heathFragment` on greens, `weatheringFragment` on neutral greys) reaches every prop of a kind with no per-prop flag and no new program
- **a measured model over a hand-tuned envelope** — where a term is an exponent, a stretch and a fade someone picked by eye, the physical distribution behind it is usually fewer lines and holds at every zoom (the sea's glint is cox–munk facets now, not a blinn-phong lobe). a look that falls apart at one zoom is usually missing the variance the pixel no longer resolves
- **fewer, broader knobs** — one parameter per physical decision (`look.lens` is the grade, glare, fringe, vignette, halation and grain at once; `water.state` is swell, ripple, surf, whitecaps and the roost; `atmosphere.starlight` is the stars and the aurora). a run that adds a knob should look for two it can merge or retire; the panel only shrinks. a row earns its place by being a *look* someone would turn; the rate a creel bobs at is physics, and lives on as a config leaf for `--set` and the url
- **find what paints the frame by zeroing knobs, not by hiding meshes** — `--hide` matches names, and a sheet you cannot name is a sheet `--hide` cannot find. `--set <strength>=0` per system, a luminance mean per shot, and the term that moves the mean is the one painting the frame
- **read the numbers a frame is made of before adding variation to it** — a multiplicative tint on an albedo that renders near black moves nothing. `scape:diff` per pose says whether a change is visible on the tier most people see; if it is not, the missing thing is light, not colour

a new prop or site is still allowed, when it is the cheapest way to make a frame more believable. it is no longer the default.

**judge a run by the whole frame.** the question a run answers is *which term in the picture still reads as a model*, asked of the `near` and `default` frames on the phone tier — light, material, atmosphere, optics, the motion of weather — and the answer lands where every frame inherits it: a shader chunk every program includes, one of the two shared materials, the film, the lens, or a kit helper every prop of a kind is built through. a single prop is only the answer when it is the cheapest way to fix the frame.

**the open rendering backlog** — whole-frame candidates, roughly by what they would buy. strike one through when a run lands it:

- ~~the archipelago frame is a spotlight: the haze was a ring around the focus~~ — landed: the haze is the air column between the fragment and the eye (`airColumn` in `aerial.ts`, the water's `EYE_DISTANCE` eye), thinning with height, so the wide frames take a near-even veil deepening to the far edge and the far shores keep their colour. **lesson: zero the surface's own light to see what the air paints** — with the water's `outgoingLight` at 0 the sea stayed bright at the rim. still open: the sky-light and the key are not dimmed by the same column (the air only adds its colour; a long column should also redden what it lets through — `airlight` already knows the spectrum), and the deck sheet above the sea is not fogged by the air below it
- ~~the archipelago frame's clouds are felt: the deck in the wide frame is the weather bank cut with a soft edge~~ — landed: the deck is heaped of billows at two scales (`BILLOW_TILES`, the sea's slope-carrying `water.wave` map), cut with an edge (`DECK_EDGE`), shaded in its hollows and opaque in its core (`clouds.ts`). **lesson: ask what a frame's field *is* at that zoom** — the deck read `scapeCloudRaw`, which at the wide frames is the bank alone. still open: the clouds' *shadows* on the sea and the land are still the soft field without billows (right for a 34 m throw at the yard, too soft at the archipelago), the far coast under the deck reads pale where the deck's fringe lies over it, and cloud at a low sun casts no shadow on its own neighbours
- ~~the sun on the sea is a hand-tuned lobe that vanishes at the wide frames~~ — landed: a cox–munk glint (`water-gleam.ts`), a beckmann density whose variance is shared between the ripple map and the lobe by the frame's width (`glintVariance`), so the archipelago frames carry a broad sheen toward the sun. still open: the *mirror* of the sky and the deck is still a point sample (the same variance should widen the deck read: two taps along the slope spread, or a coarser `scapeCloudKeep`); the tarns keep their own lobe; the moon's track shares the glint but has never been shot against a clear night sea
- ~~the desktop frame is a tilt-shift miniature~~ — landed: the lens's depth of field (a Vogel disc off `focal.ts`'s focal plane) is deleted outright, the sharpen is contrast-adaptive over the whole frame (`sharpenHeadroom`), and the bow and halo close as the camera climbs over the deck (`bowReveal` × the deck's reveal). still open: the bow at `far` zoom still hangs as an arch over the central island (an orthographic frame has no skyline; a ring on the rain *below* the antisolar point would be the honest form), and the phone has no sharpen (it needs a neighbour, like halation)
- ~~the wide frames' clouds are a flat grey film~~ — landed: the deck's tops stand in relief off the raw field (`scapeCloudRaw`, two reads a step apart, a wrapped lambert), dense in the core, thin at the fringe (`clouds.ts`). still open: the cloud's *underside* as seen through a gap at a low sun, the far shores (the `default` frame's left and right edges) are still grey felt under the deck, and a ~~rainbow seen from above the deck at archipelago zoom reads as a decal~~ (landed, item above)
- ~~the frame is developed twice: walls in shade print charcoal and the turf grey~~ — landed: the film ran a display-space s-curve stock (teal cast, lifted black) and then ACES. AgX is the one curve on every tier now, and the grade ahead of it is contrast as a power about mid-grey, chroma back, dye and the split tone (`film.ts`). the phone `near` frame's chapel wall 53 → 74, the falu barn reads red. the same run took the sun shafts' sheets out of frames under 24 m (`SHAFT_NEAR`): from inside a beam they were a veil over the desktop `near` frame. ~~metering~~ landed too (next item)
- ~~the iris runs on the clock, and a squall falls through sunlight~~ — landed in [`exposure.ts`](src/scene/exposure.ts): the front veils the key (`frontVeil` on `weather.fall`, up to 0.8, part scattered into the sky) and greys the dome, haze, hemisphere and key (`overcast`); an incident meter (key through the veil and the deck's mean shade, plus the sky) sets the exposure, 0.75 of a full correction, between the noon stop and a ceiling that falls with the daylight. ~~the deck's own shadows do not fade under a shut front~~ — landed: `shadeAmount` takes the veil, and the key's shadow map fades with it. still open: the meter reads the deck's *mean* shade, not the cloud shadow at the focus (a cpu twin of `scapeCloudField` at one point would let the iris open as a shadow crosses the yard). the white balance is taken before `overcast` greys the four colours, which should already remove most of the clear sky’s cast (reasoned, not yet measured — a red-card A/B under a full squall would settle it)
- ~~the far shore's hinterland is smeared streaks at `default`~~ — landed: past the ridge the ground was the bearing's crest extruded inland, and the gullies ran the whole way down every bearing. the hinterland is a world-space plateau now (`plateauAt` in [`skyline.ts`](src/scene/landscape/skyline.ts)), gullies only where a catchment gathers, no octave under twice the ring spacing inland, bare rock on the spurs. the far-field grain followed as `props/mottle.ts` (below). still open: the cloud *shadows* stay on the sea at `atmosphere.cloudCover=0` (the front's own cover drives them) — the knob's name lies
- ~~the far ground is felt: no grain coarser than a metre survives the wide frames~~ — landed as `props/mottle.ts`: a smooth world field (26 m and 83 m, value noise in place — the grit map is unmipmapped and aliased to salt) applied by the albedo's kind as the last ground term — rock through snow (sooner on the steep), peat and straw on turf, lichen and wet streaks on stone — on every ground program and tier. ~~the patches are isotropic~~ — landed: on a slope the snow and stone are tested against `gullyField`, three taps down the fall line read off the smooth world normal; the level holds its snow. still open: the far shore's own paint (`paintRing`) still decides where snow lies at all, and the turf's peat and straw are still round (hags run along the contour, not down it)
- ~~the desktop post chain painted its own artifacts~~ — landed: the lens's screen-space contact occlusion (ten depth taps at 0.7 m) ruled the desktop `default` frame in depth-quantisation bands and laid a screen door and pale rims over the `near` frame; it is deleted (contact shade is `contact.ts`, in the materials), and the defocus is 3 px at a 12 m frame, not 5 — a tilt-shift blur is the loudest miniature tell. **lesson: shoot `--tier desktop` once per run** — six runs tuned the phone while the desktop frame carried these. still open: the defocus disc still dithers per pixel (interleaved gradient noise with no resolve) where `lensTaps` is low
- ~~the wide sea is ruled in bands: every swell train striped the `far` frame~~ — landed as `SWELL_TILT` ([`swell.ts`](src/scene/landscape/swell.ts)): the swell's tilt on the shading normal was 3.84× the slope of the geometry it shades, and at a grazing rise that swings the reflected ray from the horizon to the dome. it is now 2×. still open: the far shore's hinterland reads as smeared streaks at `default` even with the mist, the deck and the lens off (more rings did not move it, so it is the ground's colour field there, not the sweep); and the sea's mirror is still a point sample (see below)
- ~~the phone has no contact shade: every small prop floats~~ — landed as `contact.ts`: small solids as spheres, binned over the frame's ground, each taking its cosine-weighted solid angle of the sky, casting a soft sun shadow where there is no shadow map, and the seat on the solid's own side. still open: the flock (a dynamic instance buffer) is not a candidate, so the sheep still float; merged hero meshes (the farmstead) get only the bake's 1.2 m reach — their walls' feet would want boxes, not spheres; and the sea knows no contact (a hull or a skerry darkens no water)
- ~~the phone has no post chain at all: a grade that survives the context-loss budget~~ — landed as `film.ts`, in the materials' tone mapping. the **vignette and grain** followed, off a clip-position varying the aerial vertex chunk hands the tone-mapping stage (`FRAME_VARYING`), with `look.lens` packed into the exposure beside the grade. still open on the phone: **halation**, which reads a neighbour and so needs a pass or a baked stand-in (contact shade landed — see below)
- ~~the phone's light is thinner than the desktop's~~ — the exposure gap is closed: `sky-light.ts` puts a horizon band and an aspect into the hemisphere term every program evaluates, and the phone's fill (`SKY_FILL`) was measured against the desktop's `near` frame. the *specular* sky landed too: `SKY_MIRROR` reflects the sky light along the reflected ray in every standard program, and the room environment (a studio interior) is gone from every tier. the wet half landed too: `runoff.ts` puts the film on walls (wind-driven, in runs) and only on what has no leaf, and the puddles' private 8× sky sheen is gone — it doubled the mirror and turned a rained-on island white. still open: the phone has no key shadow map; rain does not yet *splash* (a ring or a bounce at the foot of a wall is a wet-material term keyed on height above the ground, which the fragment does not know off the terrain)
- ~~the yard is still beige felt with the stones in it~~ — landed as `props/tread.ts`: damp hollows (two octaves at 2.4 m) and hoof-pits (the gravel lattice inverted) with water standing in them in a shower, keyed on the one shared `scapeBare`; the stones take an albedo of their own (`STONE_ALBEDO`). **lesson: debug a keyed term by painting its key** — the bare-ground weight was ~0.5 in the yard, so every bare term had run at half strength; `smoothstep(0.06, 0.4, bare)` now. still open: the grey turf on the yard's banks under rain (bare 0, not leafy enough for the sward) is the next felt surface in `near`; prints that follow the paths (a lane trodden along the fall of the footpath, not isotropic)
- ~~bare earth is tan felt: the yard, the track and the strand had nothing between the grit and the hummocks~~ — landed as `props/gravel.ts`: stones in one-cell lattices (no voronoi search), keyed on the albedo, on every tier. still open: stones that know the ground (a cart road is metalled, a field edge has cleared stones piled along the dyke, a storm beach is all cobble), and the same lattice on *rock* albedos as joint blocks or lichen rosettes (the backlog's field-stone normal below)
- ~~turf is felt: the largest surface in the `near` frame was a tint between the grit and the hummocks~~ — landed as `props/sward.ts`: strands combed along the prevailing bearing (`uDriftDir`, no new uniform), rounded and laid over, straw tips in patches, tussock tufts in a one-cell lattice, keyed on the albedo's greenness (`LEAF_KEY`, measured on the turf the terrain *actually* carries — 0.25 to 0.45, not the raw palette's 1+; a debug albedo found the first key missed every field), every tier. still open: the comb is the *prevailing* bearing, not the gust (the ground program has no wind uniform — a gust running over the sward as a moving sheen would be the vertex wind's phase handed to the terrain); the strands are flat paint at a grazing camera (no silhouette — a fin shell or a parallax step would give the turf an edge against the sky); and grass that knows the ground (long in the lee of a dyke, grazed short in the infield, rank by the beck)
- ~~the hemisphere's floor is a fixed olive, and a second directional light fakes the sunlit ground~~ — landed as `ground-bounce.ts`: the floor is the ground's albedo (turf, or snow as it lies) under the sky and the key that reaches it, through the cloud deck; the `bounce` directional light is gone from every program. still open: the floor is one colour for the whole frame — a wall over the dark sea or over a bright strand gets the island's average (the sky occlusion's ground-height channel could weight the floor by what lies within a few metres), and the bounce does not yet know the *sea*, which is the darkest and largest ground in most frames
- ~~the metre-scale form between the grit and the mesh~~: landed as `hummock.ts`, analytic tussocks and frost hummocks in the terrain's own program variant (`USE_COLOR_ALPHA`), on every tier, with rain pooling in the hollows and the crowns scoured through the snow. still open: sheep tracks and contour terracing (a form with a *direction*, which wants the slope's aspect), and hummocks that know the ground: bigger on the wet moor, none on the machair
- ~~height fog that lies in the valleys and thins up the slopes, on every tier~~ — landed as `groundFog` in the aerial chunk (`aerial.ts`), driven by `atmosphere.mistAmount` through the spare `fogNear` uniform; the flat mist sheets are gone. still open: the banks are pinned to the world (the chunk has no clock — a drift needs a second free uniform), and the profile is height above the *waterline*, so a hollow high on a fell holds no fog
- the remaining world-sized transparent sheets (the upright mist slices) are each a full-frame blend: fold what is a function of the fragment's place into the aerial chunk the way the ground mist went, and delete the sheet. ~~the sea smoke~~ went this way (`seaSmoke`, its amount in `fogFar`'s fraction), and so did ~~the haar~~: the column of a level bank standing over the fragment, its amount in `fogNear`'s fraction (`packFogNear`), its ceiling compiled in — two to five sheets, a texture and a tier count gone, and the phone has the bank. both fog uniforms are now packed; the next fold finds a channel (the exposure's low bits, or a define) or earns a uniform. still open on the haar: it is pinned to the world (no drift — the chunk has no clock), and its lanes are the ground fog's bank field, so the two fogs tear in the same places
- ~~sky light that knows the terrain~~ — landed as two terrain-scale reaches in the sky bake (`SKY_REACHES` 26 m and 70 m, over the land alone): glen floors, coves and saddles hold shade, at no per-frame cost. still open: the sky term's aspect (bluer away from the sun) is in `sky-light.ts` now; and the islands are mostly convex mounds, so the shade lands on a few percent of the land; relief that *has* hollows is a terrain-generation question
- ~~stone geometry: boulders read as smooth blobs in silhouette~~ — landed as `chisel` in the kit ([`props/chisel.ts`](src/scene/props/chisel.ts)), run by `stonePart` on every rock: two joint planes per stone, inward pitting on stones of a metre or more. ~~field stones and cairn courses get the joints only~~ — landed as `props/fissure.ts`: two world joint sets (lit, t-junctioned cracks) and crystal grain inside the stone block, every stone on every tier. the same run found `weatherable` took the olive turf as stone (73% of the terrain: the meadow crusted white with lichen and ruled with strata) and gated it (`TURF_LEAN`/`TURF_COOL`), and that the moss mix was discarding the strata's albedo. still open: joints that know the rock (sheeting parallel to a dome's surface, wider joints on the exposed shore), and frost-shattered edges on the crag
- ~~roofs are charcoal slabs: the largest flat surfaces in the `near` frame~~ — landed as `COURSE_FRAGMENT` ([`props/courses.ts`](src/scene/props/courses.ts)): shingle courses keyed on pitch and the shingle albedo, butt shadows, staggered joints, silvered shingles, moss in the lines, every tier, never the terrain. still open: the roofs are still near black under overcast (shingle linear albedo ~0.07) — like the falu walls, the next lever is the light on them; turf roofs are only heath (a sod roof has birch-bark eaves and long grass); slate roofs (cooler, larger, a nail line) would be a second family keyed on a cool albedo
- ~~timber end grain and board seams on the upright path~~ — landed as `BOARD_FRAGMENT` ([`props/boards.ts`](src/scene/props/boards.ts)): battens on paint, laps on limewash, chosen by the albedo, every tier. still open: the falu-red walls render near black under overcast (linear albedo ~0.05 in shade), so the seams read best in sun — the walls' light, not their colour, is the next lever; and board *ends* (corner boards, butt joints, end grain) need the face's extent, which the fragment does not know
- ~~per-instance colour variation on every scattered family~~ — landed as `instanceTone` ([`landscape/instance-tone.ts`](src/scene/landscape/instance-tone.ts)): the scatter's tint leans warm or cool by a hash of where the instance stands, scaled by the family's own chroma, in the instance colour the stamp already carried. the same run lifted the conifer albedos to a physical 5–8% and lit the far side of every crown through the foliage (`props/transmission.ts`). still open: none of it reaches the opening frames, which are sleet over snow at a width where a tree is a few pixels — the wide winter frame needs its own realism lever (snow-laden crowns that read, the sea, the sky); and *scale* by site (smaller on the exposed ridge, taller in the lee) is still one uniform range per rule
- ~~the film has no place in the frame on the phone~~ — landed (see the first item). the phone's grain is pinned to the pixel grid, because the tone-mapping stage has no clock: one more packed field, or a frame counter in the exposure's low bits, would let it run
- ~~falling snow, sleet and hail at close zoom are opaque white discs~~ — landed: the marks are in metres (`FALL_MARK_GLSL` in [`fall-column.ts`](src/scene/fall-column.ts)), a body and a shutter streak, floored under a pixel and keeping the root of their energy, with one in eight defocused at the glass. still open: the marks do not shade with the light (a streak is one colour at noon and at dusk), and rain does not yet streak the *ground* — splashes and running water on stone are a wet-material term, not a mark
- ~~the far shores in the `default` frame are smeared, low-contrast sheets~~ — landed: the sweep is 27 rings a bearing (the radial brush strokes were 150 m inland rings), a 38 m massif octave, and every steep stone face is bedded (`props/strata.ts`, inside the weathering stone block); the cloud shadow tiles at 210 m, not 92. the grey that followed went too (next item)
- ~~the wide frame is a grey blanket~~ — landed: the cloud deck draws the shadow's own field (`scapeCloudField`, the throw undone) as one lit sheet with gaps, and the sea mirrors the sky along the reflected ray, cloud and all (`water-gleam.ts`), so a cloud stands over its shadow and lies broken in the sea. still open: the ground mist's sine banks still lay soft wisps over the wide frame; the caustics read as a tiled lattice at `crag` zoom; puddles and wet stone mirror the hemisphere, not the clouds (`SKY_MIRROR` has no cloud field — the ground material has `scapeCloudField` in scope and could). a run tried it: `scapeCloudMirror` (now the sea's one deck lookup, in `cloud-shadow.ts`) read along the reflected ray in `SKY_MIRROR` on every ground program under roughness 0.55 — and an A/B moved **zero pixels** on phone and desktop with the ground forced wet: the wet film is 0.28 rough and a dielectric at this camera's elevation reflects a few percent, so a cloud standing in for the dome changes nothing the eye reads. the lever is the puddle (0.03 rough, desktop only) at a lower camera, or a wet *albedo* term, not the mirror)
- ~~the wide sea is milky: four fifths of the `default` and `far` frames paler than the land~~ — landed as Monahan's whitecap fraction (`water-caps.ts`): the caps were tuned to tear a fifth to a third of the sound, and the wide frame draws them as their average, so 15% foam lay over the whole sea. the find is the method: `water.mirror`, `palette.deepWater`, the haze and the deck all left the sea pixel where it was, and `water.state=0` moved it. still open: with the white gone, the sea's mirror shows **horizontal reflection bands** across the `far` frame (the deck along the reflected ray at a grazing tilt — `MIRROR_DECK` and the ripple's drag want a look); the sea's body colour still barely reaches the pixel at wide zoom (`palette.deepWater=0` moved it a few levels), so the next lever on the sea is the light on it, not its colour
- ~~the sea is marbled wood grain: closed contour rings over every frame that resolves the swell, and a pale ruled bar off every island~~ — landed: zeroing knobs one at a time put the rings on `water.waveHeight` × `water.mirror` — the swell's tilt dragged the deck lookup ninety metres up and over by a rise squared, so the cloud image folded into caustic rings. the deck is now read along a ray the *ripple* alone bends (`deckNormal`), and the swell shades through the sky gradient and its faces. the ripple itself tilted by the noise's *value* (each iso-line one facet); `water.wave` now carries its own Sobel gradient in g/b (`slopeFromHeight`) and the ripple tilts by that. the bars were the shoal spits — flat-crested and ruled straight for 240 m; they meander, scallop and sink seaward now (`shoal.ts`). still open: the sea's mirror is a point sample (a real sea averages the swell's fold inside each pixel — a glossy deck read keyed on the swell's slope spread would put the swell's folds back without the rings); the spits' tint is still the uniform shallow green at the root
- ~~the phone's `near` frame is dark under overcast (the chapel printed near black)~~ — landed with the sky light (above): mean luminance 78 → 87 of 255, the shaded walls readable

what a run may **not** do is ship something that does not pass the gate, adds cost on the mobile tier without an answer for it, breaks determinism, or leaves the repository harder to read.

---

## 0. the run card

a cloud session starts with [`.claude/hooks/session-start.sh`](.claude/hooks/session-start.sh) already run (registered in `.claude/settings.json`): dependencies installed, and a *run card* printed into the session — every command a run needs, the brief (inventory, recent themes, survey), the asset counts and the branch. read it before anything else; when a tool is added or renamed, the card is edited in the same commit.

## 1. sync

```sh
git fetch origin main
git checkout -B claude/scene-enhancement-<slug> origin/main
bun run setup
```

if a previous run's pull request is still open, finish *that* first — drive it green and merged — rather than racing it.

## 2. look before touching anything

```sh
bun run studio serve                         # in the background; wait for "studio ready"
bun run brief                                # ~2 s: inventory, recent themes, open prs, map stats
bun run assets --kit                         # ~1 s: the shared helpers a change to a *kind* of prop belongs in
bun run studio shot --poses tour --census    # the before picture, and where the triangles go
```

read the six pngs only if the census does not already tell you what to work on. the `near` and `default` frames are the two most people see. when something in a frame reads wrong and you do not know what draws it, `studio probe x y` and `studio shot --hide <name>` find it in seconds.

then read, and only these: [`src/scene/config.ts`](src/scene/config.ts) (the tuning surface), [`src/scene/quality.ts`](src/scene/quality.ts) (the tiers), `node_modules/threejs-scene/llms.txt` (the runtime's exact signatures — read it rather than guessing), [`threejs-scene-api.md`](threejs-scene-api.md) (what exists before you write a helper), and the readme section `brief --sections readme` points at.

## 3. pick one thing

**one rendering theme per run, plus one refactor or cost cut that leaves the code smaller, the chain shorter, the panel smaller or the load faster** — the theme with a headline someone could picture or measure: "terrain normals from the height field", "contact shadows under every prop", "aerial perspective that blues the far islands", "half the draw calls at the default zoom". not a sweep of unrelated tweaks.

pick by looking: what in the `near` and `default` frames reads as least real, or what in the census costs most for least. do not repeat a theme `brief` lists. prefer the change that moves **every frame on every tier** — a shader chunk every program includes (`aerial.ts`, `film.ts`), a term in the two shared materials, a kit helper — over one that moves one site.

**then announce it, before building.** print the run's title and plan in exactly this shape:

```markdown
# [run title]

[general description of the updates]

**Tasks**

- [task 1]
- [...]
```

- **the title is the headline** — the sentence that becomes the gist of the pull request title and the changelog headline. written now, so the run is judged against it rather than described after it.
- **the tasks are the plan** — the rendering theme, the refactor or cost cut, the tests and docs. the pull request's *what the frame gained* should be checkable against this list.

## 4. build it

the house rules, each load-bearing for performance or determinism. [`agents.md`](agents.md) has the long form.

- **draw calls are the budget.** merged hero geometry, one `InstancedMesh` per scattered family (the dressing's `stamp` tiles and size-culls them — see `scatter-lod.ts`), a real `boundingSphere` and culling on anything instanced elsewhere.
- **gradients belong in textures and shaders, not in subdivision.** a world-sized sheet is two triangles.
- **every tier still has to run.** gate new cost on `AtmosphereQuality`; mobile gets a cheaper version or a graceful absence, never a broken one. measure with `--tier mobile` and `--tier desktop`.
- **everything generated is deterministic.** no `Math.random`, no `Date.now`, fork the seeded rng by name.
- **the config is the app's state, and it moves.** per-frame readers take `LiveConfig` and call it; new visual knobs go in the config and, if read per frame, in the overlay. there is no `enabled` flag — an effect is off at strength zero. anything that moves has a speed that reaches zero and is in `STILL` (`scripts/scape-poses.ts`).
- **lifecycle discipline.** build in `build`, animate in `update`, viewport in `resize`, release everything in `dispose`.
- **name the scale.** world-sized, frame-sized or metre-sized — never scale all three by reflex.
- **hot loops** use `hypot` from `src/scene/hypot.ts`, never `Math.hypot`.
- **keep it clean.** 666 lines a file, the lint config's ceilings, no dead code, no `any`, comments for the decisions that are not obvious. dependencies are a last resort.
- **tests come with the change** — pure functions get a determinism test; a claim ("nothing is drawn under a pixel") gets a test that states it about the data.
- **update the documentation** — the readme section and project map, `agents.md` for a tool, a skill if the way of working changed.

## 5. look at it

```sh
bun run studio shot --poses tour --census    # after: same poses, same tier
bun run studio shot --poses tour --tier desktop --census
bun run scape:map --stats                    # did the world model move?
```

- the poses the change was aimed at moved, and the others did not. a lighting change that also moved an unrelated pose by a lot did something it did not intend.
- **nothing moved** on a run claiming something visible means it is not visible — a failure.
- **read the cast, not only the picture.** switch the haze off (`aerial.ts`) or set one colour to pure red with `--rebuild`, and sample the same pixels before and after. one number says which term paints the frame; six screenshots say only that it is grey.
- quote the census before and after. a realism change that costs draws says how many and what mobile does about it.
- `bun run scape:diff --ref origin/main --poses tour` gives the pixel table against main; run it once, at the end, when the pull request needs it.

**do not claim it looks better without having looked.** if the studio cannot run (no chromium), say so in the pull request and fall back to `scape:map` and the census numbers from a unit test.

## 6. verify

```sh
bun run gate          # light: lint, typecheck, the tests the diff reaches, build, prop audit
bun run gate --full   # what CI runs — before merging a change to generation
```

## 7. commit, push, pull request

conventional commits (`feat(render): …`, `perf(scene): …`). push to the run's branch, retrying a network failure with backoff. open the pull request ready for review, with:

- **what the frame gained** — a sentence someone can picture
- **how** — modules touched, decisions a reviewer would otherwise reverse-engineer
- **cost** — census before/after at mobile and desktop, same poses
- **verification** — the gate, `scape:map --stats`, the studio table; a still only for a pose that moved
- **follow-ups**, if any

add the [`CHANGELOG.md`](CHANGELOG.md) entry: one headline, then what it cost. newest first.

## 8. merge

the [`pr checks`](.github/workflows/pr-checks.yml) workflow is the gate. all green → squash-merge and delete the branch; deploy is automatic. red → fix and push again. cannot get it green → leave it open with an honest note. never merge red, never disable a check, never force-push `main`.

---

## scheduling the run

daily, unattended. with the claude code routine api:

```text
create_trigger(
  name: 'scene enhancement run',
  cron_expression: '0 3 * * *',
  create_new_session_on_fire: true,
  prompt: 'read instructions.md in the repository root and carry out one scene enhancement run, end to end, through to the merge decision.'
)
```

the prompt stays a pointer to this file, so changing how the runs behave is a reviewed commit.

---

## what a good run looks like

- a title and task list printed before the first edit, and a pull request that delivers what they promised
- one theme, landed completely, visible in the frames most people see
- the census at mobile is no worse, or the pull request says exactly why and what mobile gets instead
- the gate is clean; the structural stats moved only where intended
- a test that states the run's claim as a fact about the data
- docs, skills and changelog still describe what exists

## what a bad run looks like

- one more prop on one island, invisible at the default zoom
- a realism claim without a before/after look
- new geometry that is neither merged nor instanced, or a world-sized subdivided sheet
- an effect that only exists on the ultra tier because nobody sized it for mobile
- a world-sized transparent sheet for something that is a function of where the fragment is
- reading six screenshots where one census line would have answered the question
- a merged branch with red checks
