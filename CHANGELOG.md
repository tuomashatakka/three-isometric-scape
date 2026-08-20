# changelog

one entry per [scene enhancement run](instructions.md), newest first. a run is one theme, so an entry is one headline plus what it cost.

## the birds the coast never had

four flocks of gulls, wheeling over the harbour mouths and over the rock the light stands on. the first living thing in the scape that is not rooted to the ground.

- **a colony is sited by a whole ring, not by a point.** [`landscape/colony.ts`](src/scene/landscape/colony.ts) walks seaward from each landing and each beacon
  rock and tests every bearing around the candidate circle before accepting it — a centre over deep water is a different claim from a *ring* clear of the land, and
  the first version put half of every wheel over the beach. the bearings are spaced (one every 1.5 m) rather than counted, because sixteen samples around a
  28-metre ring is four metres between them, which steps clean over a skerry
- **widest, not nearest.** keeping the first candidate that fit anything squeezed every harbour ring to 9.7 m and sixty birds flew through each other; searching on
  and keeping the best gives three colonies the full 28 m and the enclosed home harbour 24.1 m, with distance only breaking a tie
- **one draw call for every bird in the archipelago.** eight vertices and four triangles each — two wing quads meeting at a shoulder, and no body, because from
  this camera the shoulder *is* the body. bearing, bank, sweep and wingbeat all happen in the vertex stage off two accumulating scalars, so nothing is uploaded per
  frame. the rates are quantised to five steps for the reason the rain's are: the sweep has to wrap, and wrapping is only invisible if every bird lands back where
  it started
- **down at night, and mostly down in a squall.** `birdsAloft(flight, day, fall)` is the whole rule and neither threshold is a knob — `birds.flight` is the one
  strength, and zero is the switch
- **one place they are sized against the frame, said out loud.** a capture is 500 px tall and the default pose is 500 m of sea, so an honest 1.6 m wingspan is a
  pixel and a half of grain. the wingspan carries a floor at 1.8% of the live `viewSize`; below about 90 m of view the floor stops binding and a gull is exactly as
  wide as the config says. the ceiling, the ring and the bob stay in metres
- **cost: one transparent draw, one program, one static buffer.** 260 gulls on desktop is 2,080 vertices — less geometry than a single spruce; mobile takes 90,
  `minimal` takes none and the module is absent rather than cheap. `?skip=birds` drops the family
- **`scape:map --stats` gained a `gulls n/m colonies` line**, because a flock is four pixels wide at the default pose and a colony that lost its ring is invisible
  in a still
- **cost against the picture: the four daylight poses moved and the two dark ones did not.** `default` 0.12% / 6.4% max-block, `near` 0.16% / 18.8%, `far` 0.11% /
  6.3%, `noon` 0.13% / 7.6%, `night` and `winter` exactly 0.00% — the midwinter pose at 68°N is a polar night, and there are no birds up in it. structural
  unchanged. at the default 0.5% threshold every pose still reads `same`: a scatter of small bright marks is precisely the case `changed` cannot register and
  `maxBlock` exists for, so the run above was taken at `--threshold 0.1`

## the lens looks where you are looking

two pointer features, and the whole difficulty is that **no capture ever moves a pointer** — so both had to change nothing at all when there is not one.

- **the tilt-shift band tracks the cursor.** worth naming what "focus point" turned out to mean: `HorizontalTiltShiftShader` computes `hh = h * abs(r - vUv.y)`, so `r`
  is a focused *horizontal line*, not a point — which is what a real tilt-shift lens does. a true 2d focus point is a radial bokeh shader, a different effect
  entirely. the band is what shipped
- **rotate-drag orbits the point under the cursor.** `rotateAroundPivot(focus, pivot, delta)` is pure and exported, and the pivot is captured **once** at
  `onPressStart` and held — re-deriving it per frame from a moving cursor makes the world slide under the hand. keyboard rotation passes no pivot and keeps the old
  single-point orbit
- **the ease had to be fixed before it could ship.** it blended `lookAtLine` (0..1) with a projected `y` (-1..1) — two different spaces — and re-derived from a
  fresh anchor every frame, so it never actually travelled. now one persistent value in the shader's own 0..1 space, eased across frames, snapping on the first
  frame and under `reducedMotion`
- **touch keeps today's behaviour.** a touchscreen has no hover, so only a fine pointer drives the band; without one the band sits exactly where it always did
- **cost: `same` on all six tour poses**, structural unchanged — which for these two features is the *entire* acceptance test rather than a footnote. six new tests
  cover the pivot maths: the point under the cursor stays fixed, a 360° round-trip is identity, distance is preserved, and the wrap at 0/360 holds

## the sea in front of its own lighthouse

the beams showed over land and vanished over water, at about half the headings on the compass. the cause is one number nobody wrote down.

- **three's transparent sort is `groupOrder → renderOrder → projected depth → id`** (`reversePainterSortStable`). every transparent layer in this scape names its
  `renderOrder` — mist at 2, rain at 12, clouds at 20, aurora at 30, stars at 34 — **except the water and the beams**, which both inherited the default of **0**
- **a tie falls through to the depth compare, and that compare is a guess.** it projects *one point per object*: `object.boundingSphere.center` when there is one,
  the geometry's otherwise. the beams are an `InstancedMesh` with a hand-set sphere centred on the lanterns at **(60.9, 39.3)**; the water's is its geometry's,
  near the origin. two centres seventy-odd metres apart, so rotating the camera flips which projects nearer — and with it, which of the two gets painted second
- **over land it never showed** because terrain is *opaque*: it writes depth, and the beams test against it. over water there is nothing to test against — both
  draw with `depthWrite: false`, which is correct for transparency and exactly why the order has to be stated rather than measured
- **the sea smoke had the same bug**, unreported: it indexed from `index`, so its first sheet also sat at 0, tied with the water it steams off
- **[`layers.ts`](src/scene/layers.ts) is now the one place the stack is ordered**, spaced by ten so a layer can be slipped in without renumbering. five files stopped
  carrying magic numbers, and `layers.test.ts` asserts the ladder ascends, that nothing shares the sea floor, and that no multi-sheet band can index into the one
  above it — checked against every tier *and* `unlockEffects`
- **cost: `same` on all six tour poses**, structural unchanged — and that is *not* the proof it looks like. the tour never aims at the lighthouse, which sits far
  out at the rim, so no tour pose exercised the fix either way. what the six poses do prove is that renumbering rain, clouds, aurora and the night sky disturbed
  **nothing**
- **the aimed capture, since taken.** `--poses beacon` is a capture set in its own right now: the light itself, at night, from **four headings 90° apart** — because a
  tie broken by projected depth flips with yaw, so a single heading can only ever photograph one side of the flip. against `d6ed866^` it reads `beacon-0` **same**,
  `beacon-90` **same**, `beacon-180` **changed 1.15%**, `beacon-270` **changed 1.25%** — max block 67% and 99%, which is a beam appearing rather than noise drifting.
  that is the shape the diagnosis predicted *and* the shape a real fix has: the two headings that already threw a beam did not move, and the two that showed bare
  water now throw one. `.scape/ref-shots` also stopped being keyed on the commit alone — tier, size and the rest of the shot knobs are stamped beside it, because a
  ref reused across a `--tier` change compares two different scapes and calls it a regression

## seven things that were never about this scape

The upstream batch. `threejs-scene` 0.6.0 and 0.6.1 went out, and this scape stopped keeping its own copy of everything in them — **−1054 lines from `src/`** for no
behaviour change at all.

- **the program audit was the big one.** `scene/audit.ts` was 474 lines, and 402 of them imported nothing but `WebGLRenderer` — reading `LINK_STATUS` before the
  first draw, and walking a shader's `#ifdef`s and `#define`s *together* to count the varyings a driver actually sees. None of that was ever about an archipelago. It
  is `reportPrograms`, `readVaryings`, `packedRows`, `varyingRowLimit` and the census upstream now, with its 16 tests. What is left here is the 70 lines that *are*
  ours: which families exist and how `?skip=` names them
- **`withPath` went up as the write primitive `createStore` always implied.** Written here yesterday, and it belonged beside `readPath`/`writePath` from the start
- **`createStateAccess`** is `config-access.ts` with the scape taken out — who owns state before a mount, after it, and across the gap. This file is now four lines
  and a type alias
- **`bakeAlphaField`** moved into `modules/assets`, where it is DOM-free like the rest of that module. The catalogue rule followed it: the test greps for texture
  constructors, so `bakeAlphaField(` joined the regex rather than the helper being exempted
- **`readQualitySignals`/`describeQualitySignals`** are pure device probing. `quality.ts` keeps what is genuinely this scape's — the tier presets, `unlockEffects`,
  and the mapping from signals to *this* budget
- **`createLadderMemory`** is `tier-memory.ts` generified over a ladder: 117 lines down to 44, and the remaining 44 are the storage key, the build stamp and the
  reason the stamp exists
- **the runtime documents itself now.** 0.6.1 ships `llms.txt` — 198 real signatures grouped by import path, generated from its own type declarations so it cannot
  drift from the installed version. `agents.md` and `instructions.md` both point at it: our digest answers *do we already have this*, theirs answers *what exactly
  does it take*
- **cost: `same` on all six tour poses**, structural unchanged, 579 tests. Every line that left was a line that was never about this place

## the sky the dark was always for

`daylight.ts` has been carrying the sentence *"1 once the sun is far enough under for the stars"* in a doc comment since the solar arc landed, with nothing on the
other end of it. the scape had a polar night, an aurora and a lighthouse burning through it, and the sky all three happened in was empty. it has a star field and a
moon now, and **neither of them is a fourth clock**.

- **the wheel is the day.** [`nightsky.ts`](src/scene/nightsky.ts) reads `daylight.time` straight as an hour angle — one turn of the deck per turn of the day — so
nothing integrates, scrubbing the overlay's time slider backwards runs the sky backwards, and **`STILL` needed no new entry**. the pole is 68° up on this coast,
which is close enough to overhead that a deck turning about its own centre *is* the sky turning about the pole
- **the month is the year.** `season.time` counted against 12.368 lunations. the moon is a body on the sun's own arc displaced two ways: a phase behind in hour
angle, so a full moon transits at midnight and a first quarter at dusk, and a lunation ahead along the ecliptic, so its declination is the sun's a month later.
that second term is why **the midwinter full moon rides high over the midwinter sun**, which is a test rather than a claim — share the sun's declination and the
two come out equal, and a northern winter loses the one light it has
- **`daylight.ts` grew `bodyHeight` and `bodySwing`** — the hour-angle solution written against a declination instead of against the year — with `sunHeight` and
`sunSwing` now one line each on top of them. the alternative was a second copy of the same trigonometry, free to drift out of step with the first
- **the first version was world-sized, and `scape:diff` was right to call it `same`.** sized from `archipelago.worldSize` like the aurora beside it, 520 metres of
archipelago spread one night's stars over eight frames of open sea: about a dozen on screen, reading as a blank sky with dust in it. a sky is at infinity, so every
extent here is frame-sized — baked on a unit disc, pinned to the camera focus, scaled by the live `viewSize`. `starCount` is consequently already a screen density,
and a run that grows the world never has to come back to it
- **the disc is billboarded**, and it is the one place the deck fiction is broken on purpose: a quad lying flat is seen at the camera's own fifty degrees, and a
moon squashed to two thirds of its width reads as a bug in a way a foreshortened aurora never does. `atmosphere.moonlight` at 1.35 against a ~0.86 linear white puts
a full moon over the bloom's 0.94 threshold and leaves a crescent's limb under it — the same trade `beacon.glow` is written down for
- **[`sky-deck.ts`](src/scene/sky-deck.ts) is the reveal both decks now share.** the aurora's zoom fade was the third copy of the same curve about to be written;
two skies fading in at two different zooms is the sort of thing nobody notices until the pull-out looks wrong
- **cost: two draws, and none at all for most of the year.** one `Points` over a baked field — one vertex a star, nothing allocated after the bake — and one unit
quad, both unlit, both additive, both made *invisible* rather than transparent whenever the sun is up or the view is close in. `starCount` 3200 `ultra` / 1900
`desktop` / **700 `mobile`** / 0 `minimal`. `scape:diff`: **`night` moved, every other pose `same`**, structural unchanged. the changed-pixel figure is small by the
nature of a point field — a sky of one-to-four-pixel stars cannot move many pixels — so the still is the evidence and the number is not

## the cone that stopped reading as a traffic cone

`vegetation.ts` already used two of the runtime's four vertex deformers — `applyBend` and `applyTaper`, on grass blades. The other two were sitting there unused, and
the conifers were the reason to care: a `cone(radius, height, 7)` is a *perfect* cone, and at the near pose that is what it looks like.

- **`displaceByNoise` on every canopy tier.** Spruce and pine push each rim vertex along its own normal by a tenth of that tier's own radius, so the silhouette goes
ragged and needle-like instead of geometric. Birch puffs get the same at 0.12 of their radius, for lumpy foliage rather than smooth spheres. This is the trick
`createRockGeometry` already uses on stone, borrowed at a tenth of the amplitude
- **`applyTwist` on the grass.** The bend puts a lean into a blade; the twist puts a *fold* into it, so its flat face catches light along a curve rather than as one
plank-flat facet. That is also why four blades stop reading as four copies of one
- **determinism was never at risk, by construction.** `NoiseDisplaceOptions` takes an `rng?: SeededRng` — the same fork the builder already holds — so the noise is
part of the seeded stream rather than beside it. Byte-for-byte stable per seed, and `vegetation.test.ts` (new, 7 tests) now asserts exactly that, plus that the noise
*reached* the geometry rather than being a silent no-op, and that the twist pivots from the blade's base so the root stays planted
- **it costs nothing.** **Triangle counts are identical** — 80 spruce, 106 pine, 140 birch, 112 grass, before and after — because these modifiers move vertices and
never add one. All four are `SCATTER_PROPS`, so each is built once into one canonical geometry and stamped through a single `InstancedMesh`: the per-vertex loop runs
at build, not per instance and not per frame. Nothing to tier-gate, and `mobile` is unaffected
- **cost: `near` moved 0.97% and nothing else did.** Predicted before running — `near` is the close pose where canopies and grass fill the frame; `far` is 540m out
where sub-metre detail is sub-pixel. `default`/`noon`/`far` came in at 0.02%, `night`/`winter` at 0.00%, all `same`, structural unchanged. The diff image puts every
changed pixel on a canopy rim or a grass tuft — the fences, barrels and buildings in the same frame are untouched

## one texture constructor, and nine passes that will not be asked again

two jobs off the queue, one of them by deleting the queue entry.

- **the three sheet layers stopped rebuilding the same `DataTexture`.** mist, the cloud deck and the auroral veil each painted a different noise into an identical
seven-line construction — field, texture, both wrap modes, both filters, `needsUpdate`. `bakeAlphaField(size, sampler, options?)` in
[`alpha-field.ts`](src/scene/alpha-field.ts) takes the size and a sampler and hands back the texture; each layer keeps its own noise and falloff, which is the half
that was never duplicated. **29 lines out of the call sites**, and each bake is now one expression
- **aurora genuinely differed and stayed differing.** it wraps `Repeat` where the other two mirror, and it is the only one in `SRGBColorSpace` — so those are options
rather than a flattened default. mirroring is the default because two of three want it
- **the catalogue test had an opinion about this, and it was right.** `alpha-field.ts` calls `new DataTexture`, so the roster's "every module that builds one is
catalogued" rule fired. relabelling all three entries to point at the helper would have been the easy fix and the wrong one: `module` answers *where does this texture
come from*, and for the cloud deck that is still `clouds.ts`. the shared constructor is excluded by name, with the reason written down, and the rule still bites for
any layer that bakes a field without cataloguing it
- **nine post passes joined the "measured and rejected" table.** the queue said start with `createDof` and `createLensflare`; both were already rejected, so the real
question was what is left. the answer is *nothing*, and the reasons are now written down so no future run re-derives them. `createMotionBlur` was the closest call —
ortho-safe, and the depth texture it wants already exists on `desktop`/`ultra` — and it loses on the interaction model: panning is the primary gesture here and the rig
revolves at rest, so it would blur the frames that must stay legible. `createOutline` loses to the threshold: a followed hull can be overdriven past 0.94 the way
`beacon.glow` is, for no pass at all
- **cost: `same` on all six tour poses**, structural unchanged. the texture work is a pure refactor and the pass work shipped no code — only the reasons not to

## the config the app was never given

`createApp` was handed `state: {}`. an empty store, and the whole tuning surface passed down beside it as a plain object every module captured — which is not the
unidirectional flow [`agents.md`](agents.md) has documented since it was written. the flow was right in spirit and absent in fact.

- **the state *is* the config now.** `createApp<ScapeConfig>(canvas, { state: config })`. one object, one owner, and `SCAPE_CONFIG` demoted to what it always
should have been: the authored defaults, read once and never written again
- **the store commits a new object on every write, which is the whole difficulty.** a section destructured at build time and read every frame stops answering the
moment a slider moves. `createDaylight`, `createSeason` and `createAtmosphereLayer` all had exactly that shape — the solar arc's latitude, the year's ice, both light
strengths — and none of it would have shown up in a capture
- **so the distinction became a type.** `LiveConfig` is `() => ScapeConfig`: anything that outlives a tick takes the reader and calls it, anything called once at
build takes the config. **fifteen modules** changed, and every read site was found by `tsc` rather than by reading — a factory that reads per frame and captures its
section is now a compile error
- **`withPath` is `writePath` with structural sharing.** setting `look.bloom` copies two objects and keeps the other eighteen by reference, and hands back the *same*
object when the knob was already there — so a slider dragged across a value it is already on wakes nobody
- **`config-access.ts` is the one thing that knows who owns it.** before the mount a write is the next version of a plain object; after it the app's store is the
single writer; on teardown the last committed state comes back out, which is what lets a rebuild after a context loss open on what the reader dragged rather than on
what shipped
- **a capture cannot verify any of this**, and that is worth saying plainly: `?set=` lands before the mount and nothing drives the overlay, so a module that went
deaf after build would photograph identically at all six poses. the liveness tests are what check it — move a knob *after* the thing was built and assert it noticed.
proven the way the `STILL` test was: put the build-time capture back into `daylight.ts` by hand, watch `reaches the solar arc` fail, put it back
- **cost: `same` on all six tour poses**, structural unchanged, and **594 tests** — seven of them new and three of them the only thing standing between this design
and a silent one

## three state machines, one store

`main.ts` was 633 lines holding three unrelated machines in one closure scope: a query-string parser, the mount, and the webgl context-loss ladder. they shared
`params`, `diagnostics` and eight `let` bindings, so none of the three could be read — or tested — without the other two.

- **the ladder is a reducer now.** [`context-recovery.ts`](src/context-recovery.ts) keeps the scape's condition in the runtime's own `createStore` —
`{ scape, quality, losses }`, serializable, one writer. every decision a lost context forces (spend another or stop, drop a tier or admit there is none left) is
`reduce(status, action)`: a pure function, argued with in **six tests** that need no gpu, no dom and no timers
- **`announce` is gone.** `data-scape-state` is a *subscriber* rather than a fifth place the state was kept, so the attribute cannot disagree with the store.
`onVitals` dispatches `drawn` and the reducer decides whether it still means anything — a stray frame no longer talks a failed scape back into `ready`
- **three `try`/`catch` blocks became one.** the first load, a rebuild and a recovery timer all failed the same way in three copies. `attempt(what)` is the only one
left; the "this origin has lost too many contexts" hint stays on the first load, where it is the only place it helps
- **the parser moved out whole.** [`url-overrides.ts`](src/url-overrides.ts) — `?tier= ?post= ?ratio= ?aa= ?effects= ?set=` — takes its query string and its log as
arguments instead of reaching into module scope, so **eight more tests** pin the `?set=` coercion rules and what happens when tier memory and the url disagree
- **`fence.ts` stopped hand-rolling a cylinder**, the last prop builder bypassing the runtime's primitives
- **cost: `same` on all six tour poses**, structural unchanged — this moves no pixels. `main.ts` 633 → 323 lines, and the ladder gained fourteen tests it never had

## the lamp the bloom never saw

the lighthouse landed with a comment saying the glow around its lamp was "the bloom's business, not the mesh's". it was the right intent. the bloom was never handed
anything bright enough to do it with, and nobody could tell, because a lamp that does not bloom looks like a lamp.

- **measured first.** the beacon at night, at the same pose, with `look.bloom` on and off: **0 pixels of 308,000 differed by more than two levels**, and the largest
single-pixel delta was 1.0 — the noise floor. the bloom was doing *nothing* to the light
- **the arithmetic says why.** the optic's warm white is `#ffdca8`, about **0.76** in linear luminance, and `beacon.lamp` opens it at **0.34** — so the frame saw
about **0.26** against a bloom threshold of **0.94**. it was at a quarter of what it needed, and no amount of the existing knobs would get it there
- **the fix is the material colour, not the baked one.** `bakeFacetColors` clamps a vertex colour to 0..1, which is correct for an albedo and wrong for a light.
`MeshBasicMaterial.color` is not clamped and multiplies through, so `beacon.glow` scales the whole optic and keeps the shape the geometry already bakes — the core
brightest, each blade falling off along its length. the core crosses the threshold first and only the base of a beam follows it over
- **measured after.** same pose, same comparison: **855 pixels** now differ with the bloom on, by up to **44.8 levels**. brightest pixel went **174 → 229**. the
lamp glows, and the glow is the bloom's, exactly as the comment always claimed
- **gated on having a bloom to catch it.** on `minimal` and `mobile` there is none, so `lampGlow` returns 1 and the lamp is left exactly as it was — a warm dot
rather than a clipped white one. that is the graceful absence, and the tour proves it: **`same` on all six poses**, because every tour capture pins the mobile tier
- **cost: nothing.** no new pass, no new geometry, no new material. **158 draw calls before and after.** one `setScalar` per frame, read live so the knob in the
panel does not lie about when it applies

the default of 5 is derived rather than dialled, and [`beacon.test.ts`](src/scene/beacon.test.ts) states that derivation as a fact about the numbers — so changing
the lamp's brightness or the palette's warm white fails a test rather than quietly un-blooming the light.

## what the runtime already does, and what it should not be asked to do

no new capability. this is the run that checked the remaining migration candidates against the code instead of against a summary, and three of them turned out to be
wrong in the same way: a pattern that matches on names rather than on what a function does.

- **the beck and the waterway were never ribbons.** the survey grouped `traceTrack`, `traceDescent` and `traceGrid` as three copies of one strip builder. only the
first was: `traceDescent` and `traceGrid` both return `Vec2[]` and are *pathfinders*, and the beck is **carved into the heightfield** ([`height.ts`](src/scene/landscape/height.ts))
rather than drawn as geometry. neither file contains a `BufferAttribute` or an index. the ribbon extraction was already complete when the cart ruts moved
- **`reviewProp` would measure almost nothing here.** three of its five checks — detached pieces, buried pieces, duplicated pieces — need more than one mesh, and
this kit merges every prop into a single geometry. the two that do work are base height and overall scale, and [`props.test.ts`](src/scene/props/props.test.ts) already
asserts both, with thresholds tuned to *this* scape: `min.y > -0.75` because the mill and the jetty are deliberately based below zero, and `< 14 m` because the
lighthouse is 11.6. a generic 20-metre "that is scenery" threshold would never fire
- **depth of field would fight the tilt-shift.** `look.tiltShift` is a screen-space blur banded on the projected focus *line* and scaled by zoom — the miniature
look an isometric scape is built around. `createDof` is real depth-based bokeh, so having both means blurring twice, and three's `BokehPass` is written for a
perspective camera
- **and a lens flare is not a post pass.** it is a scene object attached to a light, needing sprite textures a caller supplies. this scape has none and is
procedural on purpose
- **all of it is now written down** in [`agents.md`](agents.md), as a table of what looks like an obvious win and is not, with the reason for each. the point of a
migration is to stop reinventing what exists; the point of this table is to stop *re-investigating* what has already been ruled out

**the one still worth doing** is selective bloom: this scape's bloom is whole-frame, so the beacon's lamp cannot glow without lifting the whole night sky with it.
that is a themed run of its own.

**cost: nothing.** documentation only, no `src/` change.

## the last of the reinvention, and one split not made

the prop viewer built its own renderer. it now takes the runtime's — and the two things that looked like the same job, but were not, are written down rather than
left to be rediscovered.

- **the quad view takes `createRenderer`**, with both of its flattering defaults off. shadows have nothing to fall on in an inspection stage, and ACES is a *film*
curve: it rolls off exactly the highlights this page exists to let you read. a viewer that grades what it shows cannot be measured from, so `NoToneMapping` keeps
it neutral — which is what three does by default, and therefore what it did before. the win is small and real: the context attributes and the pixel-ratio cap now
live in one place
- **not `attachResizeObserver`.** it watches the canvas's *parent* where this watches the canvas, and the camera it keeps in sync is a perspective one. four
orthographic frustums and four pane rectangles are recomputed on every resize here regardless, so routing through it would add a layer that does none of the work
and quietly changes which element is measured
- **not the contact sheet either.** it needs `preserveDrawingBuffer` so each thumbnail can be read back out of the canvas, and the factory does not expose that
context attribute. a candidate for the next upstream batch; not a reason to cut a release on its own
- **and `main.ts` was not split.** the plan said to, on the grounds that it was six hundred lines of three unrelated state machines. it is **313 effective lines** —
under half the enforced 666, and not in the five largest files in the repository. the case for splitting it was a number that turned out to be the raw line count
of a file that is largely documentation. splitting it anyway would be an unrelated micro-edit with no headline, which is the definition of a bad run

**verified where a capture cannot see.** `/props.html` is not in any tour pose, so both pages were opened in a browser: four panes in their own quadrants at
device ratio 2 rather than a squared 4, the whole roster drawing in the contact sheet, and the same ungraded look as before.

**cost: nothing.** `scape:diff --ref origin/main --poses tour` reads `same` on all six poses.

## the gesture rig we already had

the camera's pointer handling was a hand-rolled multi-touch state machine: a map of live pointers, a two-finger frame, tap detection, capture. the runtime ships
`attachPointerGesture`, which is the same machine. **it did not fit** — and finding out exactly why is most of what this run was.

- **the runtime's gesture layer was missing a lifecycle.** it described a gesture but never said when one *began*, which is where this scape does two things that
cannot wait for the first move: leaving the boat chase, the tour and the idle orbit, and focusing the canvas so the arrow keys work afterwards. a press is an act
of intent even when it never becomes a drag
- **it also could not carry a latched modifier.** shift decides orbit-versus-pan at the press and holds it for the gesture; re-reading the modifier per move would
let releasing shift halfway through an orbit turn it into a pan under the reader's hand
- **and it had a bug this scape was already guarding against.** the tap check runs when the *last* pointer leaves but measures against the press the *first* one
recorded, so a pinch ending near where it began, quickly enough, fires a tap nobody made — which here means the camera jumping to a point the reader never chose
- **so the runtime was fixed rather than the fit forced.** `threejs-scene` 0.5.1 adds `onPressStart`/`onPressEnd`, suppresses the phantom tap, gives `onPinch` the
distance its centre travelled (a pinch is almost always a two-finger *drag* as well), and ends a pointer on `lostpointercapture`. six new tests there
- **then the swap: 123 lines out, 56 in.** what is left in [`camera-controls.ts`](src/scene/camera-controls.ts) is only what this scape *means* by a gesture — pan,
orbit, pinch-to-zoom-and-pan, tap-to-open — with none of the bookkeeping under it. the file is 415 effective lines, down from 500
- **verified by hand, because no capture can.** this is input code: `scape:diff` reads `same` on all six poses precisely because it cannot see any of it. so every
gesture was driven in a real browser and the camera's own readout checked — drag pans, shift-drag orbits *and keeps orbiting when shift is released mid-drag*,
wheel zooms, a pinch zooms and pans together, two fingers lifted together produce no jump, one finger taps to re-centre, and the arrow keys work after a press
because the press focused the canvas

**cost: nothing.** `scape:diff --ref origin/main --poses tour` reads `same` on all six poses with no structural change.

## the slow half, moved off the clock

`scape:diff` is the one instrument that costs minutes, and almost all of it is the reference side: checking out another commit, building it, and photographing six
poses through a software rasteriser. none of that depends on what the run is about to write. so it no longer waits for it.

- **added** `bun run setup` — install, **a chromium check before anything depends on one**, the api digest's freshness, `brief`, and the reference build started
detached in the background. one command at stage 1
- **added** `scape:diff --ref-only`, which builds and photographs only the reference side and stops. a later `--ref` run reuses it: **40 seconds against several
minutes**, measured on the same commit
- **the reuse is keyed on the commit**, written to `.scape/ref-shots/.ref-sha` beside the images. shots on disk say nothing about what they are shots *of*, so
without a sentinel a run reuses whatever the last one happened to leave behind — a wrong answer that looks exactly like a right one. a mismatched sha or any
missing pose rebuilds; both paths were tested by breaking them
- **found while testing it: the prewarm was warming the wrong pictures.** `--ref-only` inherited the default single-pose behaviour, so it cached one `shot.png`
while stage 5 asks for the six-pose tour. the reuse check correctly rejected it and rebuilt the lot — a head start that cost exactly as much as no head start. it
now warms the tour by default, because a prewarm exists to serve stage 5 and should default to what stage 5 asks for
- **chromium is now discovered at minute one rather than at stage 5.** it used to surface at the moment a run wanted a picture, which is *after* the budget was
spent building the thing it wanted a picture of. knowing early changes what a run picks: a theme the ascii instruments can judge, and an honest note in the pull
request, rather than finishing blind
- **the prewarm cannot fail a run.** detached so nothing cancels it, best-effort so nothing waits on it, and `scape:diff` remains the source of truth — it does the
work itself if the prewarm never finished or was of the wrong commit

- **found while shipping it: `bun run lint` never enforced the rule it documents.** three documents say lint must be clean *warnings included*, and the repo has
been warning-clean by habit — but `eslint .` exits 0 on warnings, so the gate passed a file carrying one. `--max-warnings 0` makes the stated rule the actual rule.
the warning that exposed it was mine: this change pushed one function a single branch over the complexity limit, and the gate said `ok`

**cost: nothing at runtime.** no `src/` file changed. `scape:diff --ref origin/main --poses tour` reads `same` on all six poses.

## one read to orient, and a map of the runtime

a run starts with no memory and was pointed at four prose documents totalling well over a thousand lines. most of that reading was *searching* — for the section
about the thing being changed, for whether a pull request was still open, for what the last run did. all of that is mechanically derivable, so it is now derived.

- **added** `bun run brief` — inventory with effective line counts against the enforced 666, the last eight run themes, open pull requests via `gh`, the api digest's
freshness, and the full `scape:map --stats` block. **1.7 seconds.** `--sections readme` prints the design record's index with the line each heading starts on, which
turns "read the relevant readme section" from a skim of seven hundred lines into one offset
- **added** `bun run api:digest` and the committed [`threejs-scene-api.md`](threejs-scene-api.md) — every symbol the runtime exports, which subpath it is on, and
which of our files import it. **59 of 390 exports are used.** the reinvention this stops was never a discipline problem: nothing here said what was already
available, so each run rebuilt what it could not see. now one read answers it
- **the digest is the only generated file that is committed**, and the exception is the point. everything `brief` prints derives from the working tree and would
churn on every commit, so committing it would add a second thing for every branch to conflict on — the same reasoning that gitignores `.scape/`. the digest moves
only when the dependency's version does, so its diff is a review event worth having
- **`--check` warns and never rewrites.** bumping the dependency is a reviewed decision, and silently regenerating a committed file as a side effect would hide
exactly the diff worth reading. a test fails if the stamp and the installed version disagree; `brief` reports the same drift without failing, which is the right
split between orienting and verifying
- **found while building it: nothing in the repository is over the line limit.** the largest file is `dressing.ts` at 609 effective lines against a ceiling of 666.
`config.ts` reads 1122 in an editor and **535** here, because the count skips comments the way the lint rule does — it is mostly documentation, and it is not the
file that wanted splitting. the brief now prints this rather than leaving it to be guessed at
- **the parse is a regex over the shipped `.d.ts` files**, not a trip through the typescript compiler. same bargain every instrument here makes: a barrel of
`export { a, b } from './c.js'` is not a language, it is a list, and these tools have to keep working when the dependency tree is what is under suspicion

**cost: nothing at runtime.** no `src/` file changed. two scripts, one committed generated document, one test file.

## the rules the tools now enforce

four house rules were prose, which means they were checked by whoever remembered to check them. they are now checked by the gate, and writing the checks found two things prose had missed.

- **added** `bun run gate` — lint, typecheck, test and build **at once**, as one four-line summary, with the full output of only whatever failed. safe because nothing in the gate contends with anything else in it: no test opens a port, spawns a process or launches a browser, and `vite build` only *writes* `dist/`, which none of the others read. 16.8s against 22.3s sequential — a modest clock win, because `bun test` is the long pole and everything else hides behind it. the real win is that a clean run is four lines instead of four screens. `--only`, `--sequential` and `--fast` where they earn it
- **added** `scripts/scape-shot.test.ts`, which closes the trap that costs the most. the candidates come off the **overlay**, not the config, and that is the whole trick: the house rule already requires a knob to be in the panel if and only if it is visual and read per frame, so the panel *is* the list of things that can move. a rate-named knob missing from `STILL` now fails by name
- **found by that test: `wind.speed` was never in `STILL`.** [`rain.ts`](src/scene/rain.ts) integrates it — `heading += delta * wind.speed` — so it is a real clock. it happened to be invisible because `wind.strength=0` zeroes what the wind is multiplied into, which is exactly the "a capture must not depend on a second knob's value" dependency the `mill.spin` comment in that file already warns about. now stopped in its own right
- **found by that test: `season.turn` is not a rate at all.** it is the turn of the *year* — an amount, 0..1, scaling a tint off `season.time`. it is declared as an exception with that reason rather than by loosening the pattern, and a second test asserts the exception still names a real knob, so a rename cannot leave a stale excuse covering some future rate
- **added** the other direction, which is quieter and worse: every `STILL` entry must still address a live config path. a rename turns an entry into a silent no-op that still reads as coverage — nothing fails, nothing warns, and every capture after it has a clock running in it
- **added** three lint rules for `src/`: **no `Math.random`** (fork the seeded rng), **no `Date.now`** (take elapsed time off the frame), **no `requestAnimationFrame`** (`createApp` owns the only render loop). each fails with the reason and the thing to reach for. all three start green
- **added** `config.test.ts` — no knob is a boolean, tested by *shape* rather than by name, because `enabled` is only the most obvious spelling of that mistake and `on`, `visible` and `active` are the same one with better cover. plus: every knob is a number, a string or a list, and every number is finite
- **added** to `props.test.ts` — every prop in the roster is spent, as a hero or as scatter, exactly once. an unregistered prop compiles, passes its own determinism test, draws under `prop:map`, and never appears in the scape
- **corrected the docs against the actual gate.** `agents.md` said the config enforces "max 400 statements-ish per function"; it enforces **40**, plus complexity 14, depth 6 and 666 lines per file. an agent reading the old number would write functions ten times over the limit. `instructions.md`'s "roughly four hundred lines" per module is now the enforced 666

**cost: nothing at runtime.** no source file outside the tests changed except one line added to `STILL`. `scape:diff --ref origin/main --poses tour` reads `same` on all six poses.

## the machinery that was never about this island

four things in here were general-purpose code wearing a scape's clothes: an ascii rasteriser, a ribbon builder, a set of primitive constructors and a dotted-path reader. none of them knew anything about an archipelago. they now live in `threejs-scene` `0.5.0` and this repo imports them, which is **784 lines lighter** across `src/` and `scripts/` — 80 added against 864 removed — and one place to fix them instead of three.

- **moved upstream** `scripts/raster.ts` → `rasterizeAscii` / `auditPalette` / `ASCII_VIEWS` / `ASCII_SHADES`. it was always the missing half of the runtime's own prop-authoring pipeline: `validatePropSpec` says a spec is legal and `reviewProp` says the result does not float, but neither could say *what it looks like*, so a model authoring geometry was reasoning blind. `prop:map` is unchanged at the command line
- **moved upstream** `props/primitives.ts` → the primitives now come from `modules/assets`. `rock` is `hedron` there, so that it does not read as a synonym for `createRockGeometry` sitting in the same barrel; ten prop builders follow the rename
- **moved upstream** the cart ruts' ribbon builder → `createSurfaceRibbon`. the beck and the waterway trace their own strips the same way, and three hand-written copies of cross-section-times-arc-length indexing is three places for the winding to be wrong in. `cart-ruts.ts` went from 302 lines to 162 and **all 17 of its determinism tests pass unchanged**, which is the only evidence worth having that the extraction is faithful
- **moved upstream** `readPath`/`writePath` out of the graphics overlay, plus `wanderAt` as `valueNoise1d` and the layer teardown as `disposeMesh`. `scape-controls.ts` owns the control *tree* now, not the addressing — five callers take the readers from the runtime instead
- **cost: nothing.** `scape:diff --ref origin/main --poses tour` reads **0.00% on all six poses**, `same` everywhere, `no structural change`. the ruts are the same vertices in the same order: the extraction reproduces the arithmetic exactly rather than approximating it. no new dependency, no draw call moved, no tier gate touched
- **also** `threejs-scene` gained a `CHANGELOG.md`, a `build:watch` for developing against a linked consumer, and a publish workflow — releases were a manual `npm publish` from one machine with tags four versions out of date

**the rule this sets:** generic machinery belongs in the runtime; if a helper has to know about *this* archipelago, it stays in `src/`. the atmosphere layers deliberately did **not** move — `mist`, `clouds`, `aurora` and `rain` share a recipe but differ in their noise and falloff and read this scape's own `sampleHeight`, so they only rhyme. neither did the prop viewer's quad view: `modules/assets` is DOM-free and ssr-safe on purpose, and a keyboard-driven multi-pane widget would end that.

## the light on the outer rock

the furthest skerry in the ring now carries a lighthouse: a battered stone tower with a painted band round its middle, a corbelled gallery, a glazed lantern room and a vent finial on the cap. after dark the lamp comes up and the optic turns, sweeping beams out over the water until dawn.

- **added** `props/beacon.ts` — the tower as a hero prop, **1,112 triangles**, merged into the settlement draw like the mill. the shaft is five courses rather than one tapered cylinder, because a lighthouse wall is *battered* and one cone from foot to gallery is a silo. eleven and a half metres, not thirty: at this scale, where a farmhouse is five metres, a scale tower reads as a chimney stack dropped into a model village
- **added** `landscape/beacon.ts` — where a light would stand, as a pure search. it scores one thing no other search here asks for, *reach* from the island's own centre, and treats everything else as a threshold: `beacon.minRock` metres of islet radius, `beacon.freeboard` metres between the plinth and the water, and eight dry bearings at the footing. at the default seed that is **isle 5, 74.7 m out, 6.69 m of freeboard**
- **probed the footing rather than trusting the authored radius.** two skerries stand further out than the chosen islet and neither could hold a tower — one is under the radius, one is broad enough on paper and has water inside its footing once its own coast warp is applied. the test states that as a fact about the ground: every rock further out fails on radius, on freeboard, or on a wet bearing
- **searched for the crown instead of assuming the disc centre.** an islet carries the same detail fbm the mainland does, so its high point is a metre or two off its middle; six probes at 30% of the radius find it, which is what keeps the gallery clear of the rock behind it
- **added** `scene/beacon.ts` — the lamp and its beams as one dynamic `InstancedMesh`, one instance per lantern and **one draw for the archipelago**, with the bounding sphere given rather than derived for the reason the sails' is
- **built a beam as two crossed fans rather than as a cone**, which is the finding this run turned up and it took a capture to see. the first version was a five-sided cone at a flat tint and it photographed as a plank of cream-coloured timber: a cone's surface is all silhouette and no axis, so nothing about it gets brighter toward the middle, and additive blending saturated the shape into a slab. two ruled fans crossed at right angles have a middle, and the colour is graded *per vertex* down the length and out to both edges — gently, because a steep grade across the width is a laser and not a lantern. **60 triangles a beam**, and the beam dies into the night at `beacon.beamReach` instead of ending in an edge. no depth write, and no fog, which would mix a beam toward the fog colour and then *add* it
- **tuned the brightness down to a third.** the same geometry at `lamp` 0.62 is a shape and at 0.34 is a glow: additive fill over near-black water saturates long before it looks bright. the slider still goes to 2 for anyone who wants a beam you can read a chart by
- **made the plinth a zone as well as a claim.** the solver keeps trees, saplings, erratics and cairns off the footing, but ground cover never asks the solver anything — measured, the first version had grass and heather growing up through the masonry, one tuft 0.4 m from the tower's centre. `onBeacon` now joins the yard, the track, the paths, the plots and the pasture in the `clear` test
- **lit the lamp off `1 - day`, not off `dark`.** `dark` is the deeper threshold, the one the stars come out at, and a light burns from the moment the sun is off the water. it also means a midsummer midnight at this latitude — no day in it and no dark either — has the lamp on, which is what a light that answers to the sun does. squared, so it comes up through dusk rather than switching on
- **mounted it after the atmosphere**, where the day has already been resolved this frame, which is why the light is a layer of its own rather than part of the landscape that surveys it. the landscape publishes `lanternHubs`; `LANTERN_HEIGHT` and `BEACON_SINK` are exported from the prop and read by both ends, so the glow cannot end up beside its own glazing
- **gated the panels on the tier.** `quality.beaconBlades` is 3 on ultra, 2 on desktop, 1 on mobile and **0 on minimal — a graceful absence rather than a poor version**: the lantern still glows, it simply throws nothing, which is a fixed harbour lamp and not a broken sweeping one. the unlock floor is 1, so `runtime.effects=all` gives a phone a beam at a phone's scale
- **exposed** `beacon.lamp` and `beacon.turn` (live, and on the overlay), `beacon.minRock`, `beacon.freeboard`, `beamReach` and `beamSpread` (build-time, and off it). `turn` is turns per minute and 0 stops the sweep where it stands, which is what puts it in `STILL`; `beamReach` and `beamSpread` are metre-sized, so a world or a camera that grows leaves them alone
- **reported it in the instruments.** `scape:map --stats` prints the site, the islet it chose, its freeboard and its reach, and stamps `L` on the grid; `?skip=beacon` leaves the light out; `prop:map lighthouse --view right` is the angle the gallery overhang can be measured from
- **shared one conversion of the islets.** `resolveIsles` came out of `height.ts` so the ground and the siting read the same rocks — two conversions of the same fractions is a tower standing on an islet that is not where it thinks it is
- **left the scatter reshuffled, and that is the one thing this run did not fix.** the footing has to be a claim on the placement field, and adding a claim makes it reject darts — every candidate the field re-rolls after it shifts the stream, so all twenty-two instanced fleets keep their counts and move their contents. measured with a headless probe rather than guessed. the `near` pose reports it: **5.16% of pixels** at ten metres of view, barrels and bales a metre from where they were, and the rest of the tour reports `same`. **follow-up for the next run: fork a stream per fleet in `dressing.ts`**, so a claim added anywhere stops moving every dart drawn after it — the same rule the props already follow, in the one place it is not applied
- **cost** one merged 1,112-triangle hero and one instanced draw that is **not drawn at all while the sun is up** — a transparent mesh still costs a sorted draw and the beams are most of a hundred metres of fill. no texture, no allocation per frame, and one matrix write per lantern on a frame the optic turned on

## the dirt the ruts run in

the ruts had two worn lines and clean ground either side of them. the road they run down is dirty now too — damp, packed, heaviest at the gate and thinning with the traffic, on the same curve the lines themselves fade on.

- **added a paint pass beside the ribbon, at the scale paint can actually hold.** the ribbon exists because a 0.34 m rut cannot be painted into a grid whose vertices are 0.68 m apart at best and 2.3 m apart on mobile. a *corridor* is metres across, though, so the half of the wear the ribbon cannot carry — the broad soiling of a road that gets driven on — goes back into the terrain colour where it costs nothing at all. no geometry, no draw, no tier that misses it
- **squared it against `onTrack`**, so the dirt sits on the crown of the road and the verges keep the track's own colour. flat across the corridor it darkens the edges as hard as the middle, and a road evenly browner edge to edge reads as a narrower road rather than a worn one. the wear has to fall where the wheels are, which is where the ribbon is too
- **pulled `trafficAt` out of `writeRut` and exported it**, because the falloff now has two callers and two copies of it would show as the lines outliving the dirt they sit in. one curve, one `HELD`, one answer. it takes the distance rather than the point, since the painter has already measured it for the farmyard
- **the seam handles itself.** the ribbon samples the terrain painter for its outer edge, so the edge picks the soiling up without being told, and both sides lerp toward the same `palette.track × 0.4` — the middle of a rut lands nearer that colour instead of overshooting past it. nothing to sort, nothing to fade, no second constant to keep in step
- **turned up that `cartRuts.reach` outruns the road it fades.** 40 m of reach against a track that never gets more than about 26 m from the yard gate, so nothing on it is ever fully clean. left as tuned and pinned in a test, because it is a look rather than a bug — but it is now a number somebody chose rather than one nobody had measured

## a windmill on the shoulder

the exposed rise the farm never built on now has a post mill standing on it: a boarded buck on one oak post, four stone piers and two crosstrees under it, a stair down the back that reaches the ground, and four common sails turning off the sea wind.

- **added** `props/mill.ts` — the post mill as a hero prop, and the sail wheel as a separate geometry. every piece of the trestle is modelled rather than implied, because the daylight under a post mill is most of what says it is one. **716 triangles**, merged into the settlement draw with everything else
- **added** `landscape/mill.ts` — where a mill would stand, as a pure search. it scores *prominence*: the ground less the mean of eight probes twenty-two metres out. the mean and not the lowest of them, because a shoulder with one gully in it is still a shoulder, and scoring it by the gully puts every mill on the coast back in the middle of its island
- **sited it last, after the beck**, which is the finding this run turned up rather than a preference. every other search runs before `createCreek` and hands the water another disc to miss — right when the thing being sited cannot move, and wrong for the one feature in the scape that could stand almost anywhere. sited in that queue, the mill moved a spring that had been on the same ridge for four runs and lengthened the course from **38.7 m to 53.7 m**. the mill takes the beck's centreline as a line to keep off instead, and every figure in the stats block but the footpaths is now unchanged
- **kept the trestle on dry level ground and let the sails hang over the water.** the first version held the whole eight-metre sweep inside `landRadius` and no island but home qualified; a headland mill with a sail tip over the sea is what a headland mill looks like. what the trestle needs is a metre and a bit of level at pier spacing, which four dry-laid piers tolerate and a barn's sill does not
- **`null` is an answer.** home and meadow build one; the ridge island does not, because every shoulder it has is too steep under a four-metre footing. `scape:map --stats` reports the site and its prominence per island, and stamps `W` on the grid, so a mill that moves on a run that did not touch the siting is visible as a number rather than as a surprise in a still
- **added** `landscape/mill-sails.ts` — the wheels as one dynamic `InstancedMesh`, one instance per mill, **one draw for the archipelago**. the rotation is composed `'YXZ'` so the spin happens in the wheel's own plane rather than in world space, and the bounding sphere is given rather than derived, because three computes an instanced bound from the geometry at the identity and these hubs are three hundred metres apart — without it two of the three mills are culled from most poses
- **geared the sails off the wind that already exists.** the rate is `mill.spin × wind.strength`, so a still day stops the wheel with nothing else set and no second "is it windy" number to keep in step. a stopped wheel writes no matrix and uploads no buffer. `mill.spin=0` is in `STILL` anyway, because a capture must not depend on another knob's value to be reproducible
- **exposed** `mill.spin` (live, and on the overlay beside the wind it is scaled by), `mill.prominence` and `mill.sailSpan` (build-time, and off it). `prominence` is the switch — raise it past what the ground offers and the mills go
- **gave the mill a footpath.** its doorstep is the foot of the tail stair, the same rule a building's doorstep follows, and the network plans a leg to it like any other place the farm walks to: **16 routes and 210 m becomes 17 and 220 m** on the home island, 12 and 13 on the meadow
- **cost** one instanced draw and one 716-triangle merge per island, identical on every tier — `minimal` gets the mill `ultra` gets. no texture, no per-frame allocation, and three matrix writes on a frame the wind is blowing

## the sun that knows what week it is

the scape's sun ran one arc at one authored noon height for every week of the year. it is solved from a latitude now, so this coast gets the year its snow and its sea ice already had: a midwinter with no daylight in it and a midsummer with no night.

- **replaced `daylight.tilt` with `daylight.latitude` and `daylight.axialTilt`**, and the shaped sine with the hour-angle solution every almanac uses. the sun's height, the length of the day and how far round the sky the light sweeps stop being three authored numbers and become three answers to one question — at **68°N** that is a noon 1.4° *under* the horizon at midwinter and a midnight 1.4° *above* it at midsummer, both of them the same expression running out of range rather than two cases bolted on
- **made the azimuth an offset rather than the bearing.** `daylight.azimuth` still says where the noon sun is placed, which is the art direction; `sunSwing` carries the light away from it by however far the geometry says it has gone, which in december is a crawl along the southern horizon and in june is the whole circle. the fixed 1.6-half-turns-a-day constant it replaces was a fudge that could only ever be right for one week of the year
- **`axialTilt` is the switch**, at 23.44° by default. 0 is a world whose axis stands straight, whose every day is an equinox, and whose sun runs the arc it ran in june. no separate flag, for the same reason nothing else here has one
- **took the stand-in curve back out.** `season.darkAmount` existed because the sun had no year in it — a hand-drawn night length multiplied into the aurora's gate. `daylight.darkAmount` is astronomical twilight instead: full dark eighteen degrees under the horizon, nothing from the moment the sun touches it. feed it a real arc and the season falls out for free, so the aurora is down to **one gate from two** and `SeasonState.dark` is gone
- **widened the twilight the day is cut off at**, from a civil to a nautical one. under a fixed arc the sun only ever sat just under the horizon for the few minutes either side of a sunrise and how much light those got was invisible; at 68°N it spends the whole of december's daylight there, and the first midwinter capture came back a blackout — 3.7° under at ten in the morning, and `dayAmount` called it midnight. every pose in `tour` but that one sits outside the band and did not move
- **gave the `night` capture pose a week.** it pinned `time 0.02` on whatever the config opened at, the config opens at midsummer, and midsummer at this latitude has no night in it — the pose had been capturing a white one. late autumn puts the sun 26° under at the same hour
- **budgeted the two determinism tests that were timing out on `main`.** both survey a second full archipelago to prove the first one is reproducible, which is seconds of work against a five-second default; they state their own 30 s budget now, the way the second-seed map test already did. red before this run, and not because of it
- **cost** nothing: no geometry, no draw call, no texture, no allocation per frame. two transcendentals and an `acos` once a frame in a function that already ran three of them, on every tier alike. the aurora is one multiply cheaper than it was

## every effect on every tier, and a drawer you can find things in

six changes to what the scape can be asked for, and to the surface that asks.

- **added** `runtime.effects`. `tier` is the preset as authored; `all` runs it through `unlockEffects`, which turns on every gated boolean and lifts every zeroed count to the smallest number at which that system still reads as itself. it turns systems *on* rather than spending the tier's budget — pixel ratio, segment counts, scatter budgets, shadow map size and the frame cap are untouched, and there is a test that says so. the one control in the panel that rebuilds the scape, because what it turns on is decided when the renderer and its programs are made. a context loss puts it back to `tier`, because that is the hardware disagreeing
- **fixed** screen-space reflections, which had never once run. three's `SSRPass` calls `groundReflector.doRender()` and the scape handed it the lake `Mesh`, so the whole post chain threw on the first frame — invisible until now because `ssr` was only true on `ultra` and every capture pins a cheaper tier. `selects` without a reflector is also the right instrument: a reflector re-renders the scene into a mirror plane, and the lake is a custom shader surface with swell, foam, glitter, wakes and winter ice on it
- **added** `textures/catalogue.ts` — every texture in the scape in one list, tiling maps built there and shared, baked maps registered where their data is. the roster is checked against the source rather than trusted: a texture constructor in a module the list has never heard of fails the test
- **gave the ground its second octave as its own noise**, where it was the fine grain read at a low frequency — self-similar by construction, so the broad patches landed exactly where the grit was darkest and the two reinforced into a weave. the new map also dulls roughness where it is damp, which is most of what tells wet ground from dry at this distance
- **wrote the `1 - flat` case the injection never had.** every wall, gable, hull, jetty timber and granite face had no surface at all, because every term weighs itself by how horizontal the face is. `prop.bark` is the same idea with the projection on its side, so the read runs along a board rather than across it. `terrain.propGrain` at 0 is the scape as it was
- **moved the drawer's furniture into `index.html`** and split its ten flat legends into six named groups of collapsible `<details>`. the animation is `interpolate-size` and a `block-size` transition on `::details-content` — five declarations, no script, and an instant open on a browser without them. which sections were left open is remembered by name
- **kept the camera between sessions**, under its own storage key: the last *settled* pose, parsed rather than cast, because a `NaN` applied before the first frame is a scape looking at nowhere that reads like a broken build
- **added** `camera-path.ts` — a waypoint tour built by flying the scape and pressing add. uniform catmull-rom through the stops, headings unrolled onto one number line so a turn takes the short way round, and the seam of a loop left un-eased because it is the one join the reader cannot see. it writes the same `target` a drag writes; any input stops it where it is, and escape is the way out of it, the boat chase and the idle orbit alike
- **pinned a fresh camera for every capture.** storage is per origin rather than per page load, so the moment the camera started being remembered, a tour of six poses through one browser context had each pose opening on wherever the pose before it settled — `near` went from 35 draws to 72 and the diff went quiet. `scape:shot` now sends `?camera=fresh` whenever the clocks are stopped, for the same reason it pins the tier
- **cost** nothing on the default path: the catalogue is lazy, the new shader work is one texture fetch gated to non-horizontal faces, and `runtime.effects` defaults to `tier`. the six tour poses are **72 draws · 0.50M tris**, unchanged, and report `same` against `main` — a world-zoom pose cannot resolve a plank any more than it can resolve a rut. the prop grain measured at the settlement pose moves **0.22% of the frame · 14.6% of the worst block**, on the buildings and nowhere else. unlocked on the mobile tier at one pose, swiftshader measured **447 draws · 4.84M tris** against **42 · 0.49M** — that is what the switch is, and why it is not the default

## ruts down the cart track

the road between the yard and the landing now shows what has been driven down it: two worn lines an axle apart, full where the traffic is and gone once the yard is out of reach.

- **added** `cart-ruts.ts` — the wheel lines as a ribbon of geometry traced along the track, five vertices across each rut and a cross-section every half metre
- **built it as geometry because paint cannot draw it**, which is the finding this run turned up rather than a preference. the first attempt painted ruts into the terrain's vertex colours and `scape:diff` reported `same` at all six poses: a terrain quad is 0.68 m across on the home island at the finest tier and 2.3 m on mobile, and a two-thirds-of-a-metre rut has no vertices to live on. widening it until the grid can hold it stops it being a rut. the readme already said this about footpath treads — it is the same rule, one step further down in scale
- **closed the seam with colour rather than with blending.** the ribbon's outer vertices are painted with the ground's own colour at that point, from the same `createTerrainPainter` the terrain patch beside them used, so there is nothing to sort, nothing to fade, and no second opinion about what colour the road is under this week's season and altitude band
- **laid it on the terrain as drawn rather than on the ground as authored**, which is the second finding. the mesh is a chord between vertices up to 2.3 m apart and stands tens of centimetres off `heightAt` wherever the ground curves, so a ribbon lifted a few centimetres off the *field* spends most of its length under the triangles it is lying on — the first capture showed the ruts as a dashed line for exactly this reason. `drawnSurfaceOf` rebuilds the plane of the triangle a point falls in, diagonal and all, so the lift is a depth margin and not a clearance
- **made both ruts wander together**, off a smoothed 1D value noise on the shared coordinate hash — interpolated between whole cells, because a rut jittered by a raw hash is gravel. deterministic and forked from nothing, so adding a prop does not move them
- **exposed** `cartRuts.gauge`, `.width`, `.reach` and `.wear`. build-time, so out of the overlay, like `footpath.*`. `wear` at 0 is a track nothing has driven down and the ribbon is not built at all — no second switch
- **gave the camera an opening focus**, `camera.focusX` and `camera.focusZ`, because the third finding was that the scape could not be photographed. every pose in `tour` looks at the middle of the world and the middle of the world is open sea; the farmyard is 17 m west of it and the track runs out to 44 m, so no combination of rotation and zoom could frame a rut. read once when the controls are built, clamped to the same box a drag is held in, and live state from then on
- **fixed two tests that were timing out on `main`**, which is what was holding the previous run's pull request red. the hull-clearance sweep now probes a polar lattice over the whole hull disc instead of 360 points on its rim at 5 cm steps — an eighth of the ground probes, and a *stronger* claim, because the rim never looked inside the disc where a shoal narrower than the beam could sit. the second-seed map test states its own budget, since a second full archipelago survey is seconds of work before a glyph is drawn. the suite is 27 s where it was 44 s
- **cost** zero draw calls: the ribbon merges into the terrain mesh with the seabed and the three islands. roughly a thousand vertices per island against the terrain's tens of thousands, and identical on every tier — `minimal` gets the ruts `ultra` gets

## three islands, and the boats between them

the home island no longer has to pretend its skerries are an archipelago. this run adds two inhabited neighbours with different ground, gives all three the same working life, and makes the water between their jetties into a road boats can actually survive.

- **added** `archipelago.ts`: the existing pure survey runs once per landmass in its own local coordinates, then height, paths and ports are projected into one 520-metre world. home keeps the original ground and fifteen skerries; ridge has sharper, higher relief; meadow is broader and lower. independent seed offsets and layout proportions make them different terrain rather than translated clones
- **gave** every island the whole holding — farmhouse, barn, aitta, woodshed, sauna, well, fields, pasture, beck, harbour, footpaths and jetty. reuse happens at the survey boundary, so there are not three almost-the-same settlement builders waiting to drift apart
- **reserved** each island's recognisable dressing before spending the shared tier budget. even `minimal` and `mobile` place hay poles, firewood, barrels and mooring stakes on every holding instead of exhausting a global batch on whichever island happened to be iterated first
- **made** a landing prove it reaches open sea. a shoreline pocket can be wet and still trap a boat behind its own island; the port search now rejects that cove before any route planner is asked to solve the impossible
- **added** `waterway.ts`: three world-space ports joined as one directed ring by deterministic `a*` over the composite seabed. the planner probes the full 1.85-metre hull envelope rather than the boat's centre, simplifies only across segments that remain wet, and rejects disconnected, shallow or colliding results. seed 7319 resolves to **3 legs · 809.7 m · 0.67 m minimum clearance**
- **dispatched** one boat from every jetty on a synchronized three-leg schedule. shorter crossings wait at their destination until the longest boat docks; all three then hold for **seven seconds** before leaving together on the next legs. the collision audit includes moving crossings, early waits and the common dwell instead of checking only fixed offsets; the default schedule keeps **115.79 m** between its closest pair against the configured seven
- **added** `boat-motion.ts`: the allocation-free schedule, route sampling and turn damping stay pure and headlessly testable. each hull aims across a ten-metre route chord and closes on it at no more than **1.4 rad/s**, so simplified path corners turn into a sweep rather than a snap
- **extended** `boats.ts` with stable live pose and wake records beside its one geometry, shared material and dynamic `InstancedMesh`. zero speed silences wakes and performs no matrix write or upload, and remains pinned by `scape:shot`
- **put wakes into the water draw already on screen.** each moving stern drives a distance-phased v wake and centre ripple in the existing shader; docked boats contribute nothing, ice suppresses the pattern, and `water.wakeStrength = 0` is the switch
- **kept that shader portable and bounded.** firefox's glsl compiler reserves `active`, so the wake scalar no longer uses it as a local name. disabled wakes return before the emitter loop, docked emitters skip it, and distant fragments reject before the sine — no full-frame transcendental tax for a thirty-two-metre trail
- **added** `camera-follow.ts`: click or tap an instanced hull for an eased 22-metre third-person chase looking six metres ahead. the camera reads the fleet's damped bearing rather than simulating motion twice; escape, terrain or empty-space selection, and pan or rotation drags exit, while wheel zoom keeps the selection
- **extended** the always-visible fps meter with camera **xyz** and orthographic **zoom** in world metres. `?debug` still adds calls and triangles; all fields come from the existing vitals sample rather than a second timer or camera poll
- **retuned** shared atmosphere and water for the 520-metre world. cloud and aurora sheets follow the archipelago while their tiles follow the maximum frame; mist reach follows the world, wisps remain 79-metre features and upright spacing follows live zoom; rain remains live-view-sized; the water plane reaches four world widths and scales the old ice pattern instead of tiling it across the larger sea
- **rebuilt** the rowboat geometry as a hollow 3.4-metre clinker hull: tapered stations, overlapping strakes, a keel and floorboards under three benches, narrow stems and two correctly laid oars. the solid rectangular block it replaces was neither boat-shaped nor open inside, iconic stuff :3
- **extended** `scape:map` across the 520-metre world. it keeps the old home fields for reference compatibility, adds three world-space landmass summaries, draws every settlement, jetty, waterway and dispatched boat, and reports connectivity, wetness, clearance, separation and conflicts in text and json. `scape:diff` tolerates old json and compares the new landmass and safety fields when present
- **proved** the contracts headlessly: three deterministic and distinct terrains; every holding complete; local paths, buildings and jetties translated without drift; one strongly connected ring; route endpoints on the matching ports; hull clearance independent of the planner; scheduled fleet separation through crossings, early waits and dwell; bounded turns; chase selection and exits; and atmosphere scale invariants
- **cost** the moving fleet one draw in the original archipelago landing. that run's recorded mobile swiftshader quick capture was **77 draws · 0.47M tris · 11.4 fps · 0 browser errors** at 6.2 seconds, against its older 50-draw, 0.20M-triangle sample. the follow-up reuses the fleet and water draws and adds no separate wake mesh; no new frame-rate comparison was measured for it

## the front, and the ground it leaves wet

the scape has had two clocks since the season run and no weather at all. this one adds the third: a front that crosses, rains, clears, and leaves the ground it fell on dark and glossy for a while afterwards.

- **added** `weather.ts` — a phase, a speed, and everything else derived from the phase, which is deliberately the same machine `daylight.ts` and `season.ts` already are. a front is two bands rather than one bell curve: the squall at full strength, a short clear spell, then a lighter trailing band, with better than half the cycle dry
- **cut each band against the cosine of the phase** rather than assembling it out of a gaussian, so it is exactly periodic. this clock runs for as long as the page is open, and a curve with a seam in it would find that seam
- **coupled the fall to the year instead of duplicating it.** what comes out of a cold sky is snow, and `season.snow` already says how cold this week is — so the weather owns *how hard* and the year owns *what*, and there is no snowfall strength anywhere in the config. the frozen share shortens the streak, slows it, and takes its colour toward `season.snowColor` live, so retuning lying snow retunes the snowfall with it
- **made wetness look backwards**, which is the part worth arguing about. rain stops in a minute and the ground takes an hour, so a surface response tied to the fall dries the instant the last drop lands and reads as somebody switching an effect off. `wetAmount` is a decaying maximum over the quarter-cycle behind the phase — never below the rain currently falling, and zero once the long clear spell has done its work
- **refused an integrator to get it**, on determinism rather than taste. an accumulator carries the frame rate and the page's load time into its answer, so two captures of the same phase would not agree. a function of the phase alone means scrubbing the overlay and letting the clock run put the ground in exactly the same state
- **added** `rain.ts`: the whole shower as **one draw call from one static buffer**, with nothing uploaded per frame. each drop is two triangles carrying its own cell in the column; falling is `mod` on a single scalar, so a drop reaching the floor reappears at the ceiling in the same instant
- **sized the column against the frame, not against the map**, which is the decision the module hangs off. sized to the island it would put the same drops over 196 metres at every zoom — thinning to nothing pulled out and packing into a wall zoomed in, the same mistake the mist and aurora tiles both had to be taken off. scaled to `viewSize`, the drop count *is* a screen density
- **kept metres fallen rather than seconds elapsed**, so `weather.fall` can be turned to zero and back up without the column jumping to where it would have been had it never stopped
- **quantised the fall speeds to five groups**, and that is a wrap bug rather than a style choice. the offset has to be wrapped or spend an hour growing into a float that can no longer resolve a metre, and wrapping is only invisible if every drop lands back where it started — which needs `wrap × rate` to be a whole number of column heights for *every* rate in the buffer. a continuous spread cannot do it; five steps of a fifth, wrapped at five column heights, does it for all of them
- **laid the streak along the projected fall rather than along the screen's vertical.** the same thing in still air and visibly not the same in wind — and the lean comes off `wind.strength`, the knob the grass is already bending on
- **gave a wet surface both of its halves.** albedo down, because a water film traps light dry grains would have scattered back out; specular up, because that film is smoother than anything under it. only the first is a scape with the lights turned down, only the second is a scape made of plastic. two arithmetic operations on values the fragment already holds, weighted by the same `lie` term the snow uses and applied before it, so a week doing both gets white over wet
- **answered the rain on the lake without a uniform or a fetch**: the fall drives `water.sparkle` down and `water.rippleStrength` up, which are two knobs the overlay was already driving. a shower kills the glitter because a sun lobe needs a facet to hold still long enough to catch it
- **added** `weather.speed` and `weather.fall` to `STILL` in `scape-shot.ts`. a system whose animation cannot be stopped cannot be photographed twice the same way, and would silently poison every visual diff taken after it landed
- **added** a `weather` section to the overlay — time in the front, fronts per minute, how hard it falls, fall speed, wet ground — with the time knob outside its switch for the same reason the other two clocks' are
- **added** `?skip=rain`, and pulled the four optional layers in the composition root through one `unless(skip, family, build)` helper rather than four ternaries, which is also what kept the root under the complexity ceiling
- **tests** fifteen new ones over the two pure curves and the sampler: the bands open and close, they clear between each other, the dry half is the longer half, the whole thing wraps, wet ground is never drier than the rain on it, it survives the clear spell and dries out across the long one, and a frozen year takes four fifths of the wet away
## the farm gets a street plan

the paths were a star. every leg left the well and ended somewhere, which is what you get from asking *how does a person reach each place* — and it is wrong in the one way a reader notices: getting from the barn to the woodshed meant walking to the middle of the yard and out again, past a door you were already standing at. this run makes it a network, cobbles it, and finds out on the way that no door in the scape was facing where it claimed to be.

- **planned** the legs instead of listing them. `network.ts` resolves places first — the well, five *doorways*, each field's gate, the meadow gateway, the landing, the harbour — then costs a minimum spanning tree over them, with a leg that would have to detour round a building priced at **2.6×** a clear one. that alone joins everything to everything by the shortest total length there is
- **added the loops back**, because a tree has none: two doors ten metres apart can be a forty-metre walk from each other through the well. any pair the tree makes a detour of **1.6×** or worse, under **30 m**, and clear of every building, gets a direct leg. that is what closes the ring round the yard. **12 legs became 21**, 20 of which survive tracing — 297 m of path against a longest single leg of 28.7 m
- **found** that `angle` on a building was a *bearing*, and a bearing is not a yaw. `rotateY(θ)` carries a prop's front to `(sin θ, cos θ)`; the code was handing it `atan2(dz, dx)`, which is the reflection of what it wanted. the two agree on exactly one diagonal, so the farm looked right on some seeds and stood the farmhouse with its door in the hedge on the rest — for as long as there has been a steading. `faceToward` is the one function everything that has to agree about a front now goes through
- **worn the paths to doors**, which is only a meaningful sentence now that the doors are where the comment always said they were. `doorstepOf` puts the anchor a pace outside the wall, further out than the clearance a route is pushed by, so arriving at a door is never mistaken for standing inside the building
- **cut a field's gate toward its neighbour** rather than toward the middle of the yard. aiming it at the yard and then running the leg to the barn put the gate round the wrong corner of the fence
- **paved it.** `pathStone` is 900 cobbles sampled *along the traced legs* — a segment picked in proportion to its length, a point along it, a jitter across the bare middle — rather than thrown at the island and tested. the island sampler was the wrong instrument: the treads are a few hundred square metres of a landmass that is tens of thousands, so all but a handful of darts miss and the budget that survives gravels a path instead of cobbling it. no legs, no paving: turn `footpath.wear` to zero and the stones go with the paths they were laid on
- **stopped the cobbles swaying.** the shore-and-scree cobble scatter was taking the foliage material, and the foliage material is the one with the wind in it
- **dropped the along-the-leg wear taper.** it made sense when every route started at the well; on a network it left a visible seam at each junction, where one leg's faded tail met the next leg's full-strength head
- **set the default pixel ratio to 1.0** on every tier that is actually detected. this scape is drawn through a per-pixel post chain — bloom, two tilt-shift pairs, god rays, the grade — so a retina desktop at 1.75 was paying roughly three times the fill to sharpen an image whose whole look is soft focus and grain. `runtime.pixelRatio` in the overlay still raises it for a still
- **split** the three candidate samplers out of `dressing.ts` into `samplers.ts`, which is what the file being over its line limit was telling us
- **tests** `network.test.ts` proves the claims rather than asserting them: every place reachable from every other, every field on the network, the well *not* on every leg, and the buildings still connected to each other with the well deleted from the graph — which is the difference between a network and a star, stated as a graph fact. plus the yaw identity, and that every doorstep is nearer the yard than its own building's middle. **346 pass**, up from 336
- **cost** one draw call — the second `InstancedMesh` of cobbles. 98 draws at the desktop tier

## the roof is a plane

the buildings described their roofs twice — once as a pitch measured from the overhang tip, once as a stack of shrinking gable courses — and the two descriptions did not agree. this run makes it one description, and builds the two instruments that would have caught it.

- **found** it by measuring rather than by looking: every gable end poked through its own shingles, by 0.21, 0.36, 0.51 and **0.66 m** on the farmhouse's four courses. that is the dark red scattered across the roofs in every screenshot since the steading landed, and it was on all five farmstead buildings, the meadow barn and the boathouse
- **replaced** `gableSteps` with `gableEnd` — one triangular prism, because a three-sided `CylinderGeometry` *is* one. its base width is `2 * halfDepth` and its height is `peakY - eaveY`, so its two upper edges lie **on** the roof plane by construction and it cannot poke through a roof built from the same plane. **12 triangles against 48**
- **added** `roofUnderside`, and made it the datum. every clearance question in a building now reduces to it, rather than to a second copy of the trigonometry — two descriptions of one plane is one description too many
- **re-anchored** `gabledRoof` to the slabs' **underside** instead of their centre-line, and split the wall half-depth from the overhang. placed by its centre-line the whole roof floated half a slab off the building, measured vertically: **0.17 m** of daylight under every eave in the scape, on all seven buildings at once
- **fixed** four more things the elevations showed the moment there were elevations. the porch canopy cut through the two inner front windows, which were at `x = ±1` under a 2.6 m canopy — they are at `±2.1` and `±3.6` now. the front door, the barn's sliding door and its hay all started at `y = 0` inside a plinth 0.5–0.6 m tall and proud of the wall, so their bottom quarter was swallowed; everything on a wall is raised onto `plinthY`. two 0.24 m steps left a 0.12 m lip under a 0.6 m plinth, and are three risers now. the white corner boards ran `wallY + 0.2` and came out through the eaves
- **built** the attic window a dormer to be. flat on the pitch it was a picture of a window rather than an opening — there was no depth anywhere in it. the helper clamps its own ridge 0.3 m under the main one, which has to cover the dormer's shingles and cap and not just the ridge line they sit on
- **landed** the woodshed's roof on its posts. it floated a clear 0.15 m above all four
- **added** `bun run prop:map` — one prop drawn as ascii from any of six angles, no browser, no gpu, no dependency, about 40 ms. the same bargain `scape:map` makes, one scale down, and for the same reason: the loop between changing a number and seeing what it did should not go through a screenshot
- **added** `--audit`, which names the palette entry every baked facet came from and the height band it covers, so *"where is this paint"* is one line of output. it is a reading instrument and not the proof: the old gable topped out at 6.30 too, because it poked *sideways* through the pitch rather than up through the ridge. what the audit is good for is the rest of the run — the door that now reads `0.60–2.60` where it read `0.00–2.40` is the plinth fix, visible as two numbers
- **learned** that the audit has to match in **linear** colour. three.js bakes the colour attribute out of srgb and that conversion is a power curve, not a scale, so a swatch compared in srgb does not point the same way as its own facets: the rust chimney landed in the falu bucket and hid the very fault the tool was built to find
- **made** `/props.html` land on a **contact sheet of all forty props** rather than on a guess. it opened on `farmhouse` because the page needed a prop and had no way to ask for one — but a name is a bad handle for a mesh, and arriving already knowing which of forty you want is the rare case. grouped, captioned with tris and metres, filterable, and flagging any prop whose base is off the ground plane. one webgl context draws every thumbnail and is handed straight back with `forceContextLoss` — `dispose` alone frees the resources and leaves the context attached
- **hit** a css specificity trap doing it, and it looked exactly like a page that rendered nothing: `#preview-canvas` scores 1-0-0 and outranks `body[data-mode='index'] .single-only`, so the hidden canvas was still laid out at full height and pushed the sheet a screen below the fold. the dom was right and the count was right and there was nothing on screen. everything the mode switch hides is styled by class now
- **added** `/props.html`, a four-viewport orthographic preview — top, front, left and the play angle, gridded, with wireframe and bounds. one renderer and four scissor rectangles rather than four canvases, so what you compare across panes is guaranteed to be the same upload. its own vite entry, importing the roster and nothing else from the scene, so it stays loadable exactly when the scape is what is broken
- **found**, immediately, that `setViewport` and `setScissor` apply the renderer's pixel ratio themselves. scaling them again squares it, and on a retina display every pane became the size of the whole canvas — four panes drawn on top of each other, only the last one visible
- **fixed** two faults in the ascii tool that its own tests found: a facet dark enough to shade to level zero was indistinguishable from empty space, so a missing part and a tarred one looked identical; and `triangles` counted only what survived projection, which is view-dependent and useless as a cost. level 0 is reserved for *nothing here* now, and the cost and the drawn count are separate numbers
- **tests** `timber.test.ts` pins the contract itself — a gable lies under the plane on both ridge axes, a roof's underside lands on it, a dormer never out-tops the roof it is set into however greedy the ask. `raster.test.ts` asks the six finished buildings the same question the audit does. **336 pass**, up from 323
- **cost** nothing. the gable change *removes* geometry, and the whole preview is a second entry that ships none of its editor chrome in the scape's bundle

## an island with a coastline

the scape has been a disc since the first commit. the falloff that drowns the rim is radial, so however well the ground inside it was modelled the shore was always a circle — and this run makes it a coast, on an island close to three times the land.

- **added** `coastWarp` to `noise.ts` and put it inside `sinkToIsland`: two octaves on the bearing, moving the falloff out into headlands and back into bays. the fix is deliberately not detail on the *height* — roughening the terrain under a circular falloff gives a rougher coastline that is still round. the falloff **is** the coastline
- **got, for free, everything written against that function rather than against a radius**: the beach shelving, the foam, the placement searches and the mist's land mask all follow the new shore without being told. that is the whole argument for having had one falloff all along
- **grew** the terrain plane from 132 to 196 units and the relief from 8.2 to 11.5. mainland land area goes **2269 → 6587 m²**, measured the same way at both settings — about **2.9× the ground and 1.7× across**
- **found** that `islandInner` and `islandOuter` stop being shorelines the moment the coast wanders, and that three different searches were quietly assuming they still were. they are now where an *average* bearing falls away; `landRadiusOf` subtracts the whole coast reach back off to answer the only question a placement search actually asks, which is what ground is dry whichever way you walk
- **fixed** a walled meadow with a third of its wall in the sea, twice over. `ringIsDry` cleared the ring against the ground *before* the beach shelving, which compresses the first metre above the waterline to about 0.44 of its height — a ring cleared at a metre of raw height comes back at half a metre of built height. and the beck was handed the pasture as a disc of exactly its own radius, which is the wall line, so it ran tangent to it and took four metres out from under the eastern wall. the avoid disc is the wall plus the water now
- **added** `MASSIF`, and with it the reason a bigger island is not simply a better one. the fbm averages to nothing at any size while the falloff still brings the whole rim down to the same sea, so a larger island built from noise alone is a larger *flat* island. at the old lift the beck sprang at 2.9 metres and reached the sea fifteen metres later; at the new one it springs at 7.9 on real high ground and has a hillside to run down
- **added** fifteen islets where there were ten, grouped rather than evenly spread — a close western pair, a southern chain thinning as it runs out, a substantial north-eastern outlier, and skerries between them. a ring of like-sized islets at even bearings reads as decoration however well each one is modelled
- **gave** the islets the same warp, sampled in each one's own frame with a seed of its own. at world scale the warp is nearly constant across a disc eight metres wide and would only nudge the whole thing sideways; sampled seven times tighter it reshapes the skirt, which on a small island is nearly all there is
- **verified** the ring numerically instead of by eye, and rewrote it twice on what came back: no islet overlaps the mainland, none runs off the plane, and none merges with its neighbour. the first arrangement failed all three — one skerry sat at 1.06 of the half-extent, which is outside the world
- **learned** that "clear the mainland's furthest possible headland" is the wrong test and cost an islet ring. an islet at one bearing only has to clear the coast *at that bearing*; the conservative bound left an annulus too narrow to hold anything bigger than a rock
- **found**, by looking at it, that everything sized in metres breaks when the world changes scale. the aurora and cloud decks scale with `terrain.size` but their field tiles did not, so both tiled half again as often and turned into wallpaper; the sea-ice floes did the same; the pasture's distance-from-the-farm term outranked the height it was there to break ties on; and the yard and pasture probe grids searched the same number of points over twice the ground. all of them are fractions of the terrain now
- **doubled** the dressing budgets, because a budget is a count and not a density — left alone they would have grown the island and thinned everything standing on it. the farm did not grow with it: one holding has the barrels, bales and firewood one holding has, whatever it is standing on
- **cost** nothing in draw calls — **109**, exactly what it was before, because every new tree goes into an `InstancedMesh` that already existed. triangles go 628k → 1215k for twice the dressing and the denser terrain, and the desktop tier holds 31–36fps uncapped at ratio 1.75 where it held about the same before
- **tests** the beck's "gone well off it" test was asserting a fixed sideways step, and on a course that now meanders back within twenty metres of its own midpoint that step lands in another bend and reads — correctly — as channel. it measures distance to the whole polyline instead
- **verified** in a real browser at both zooms and in two seasons: the coastline, the fifteen islets, the fjord cutting in from the north, zero console output, and the two tiling regressions found by looking rather than by reading

## what the frame costs, said out loud

every run so far has been about what is in the picture. this one is about what the picture costs: a counter that says so without anyone opening anything, three knobs that change it live, and the card in the top-left finally getting out of the way of the thing it describes.

- **added** `ui/fps-meter.ts` and the `.fps` plate in the bottom-left — `58 fps · 17.2 ms`, with `41 calls · 812k tris` under `?debug`. deliberately in neither the card nor the panel: both of those are things you put away, and a frame counter you have to open is a frame counter that was not measuring the thing you were looking at when it got slow
- **added** `VitalsSample` and a `sample` callback to `vitals.ts` rather than a second stopwatch. the frame has been measured all along — for the log and for the snapshot written the moment a context is lost — so the readout is a second *view* of the one measurement, on its own quarter-second accumulator so the log's four-second window is untouched
- **added** `ui/scape-card.ts` and `ui/overlay-state.ts`: the top-left card starts hidden, toggles on the chevron or `h`, and remembers the choice under `three-iso.overlay.v1`. the handle is pinned to the figure and not to the card, for the reason `.gfx-toggle` sits outside `.gfx` — a control that hides along with the thing it controls is a one-way door
- **kept** the card in the document rather than removing it. the diagnostics log lives inside it and is the only crash report a phone gives, so it goes on collecting whether or not anyone is watching; `inert` is what keeps a card parked off-screen out of the tab order and out of the hit test. `?debug` opens it whatever was last chosen, because a debugging surface you have to already know a shortcut to reach is not one
- **fixed**, by measuring the dom instead of trusting the css, a handle that landed *on top of* the card it had just opened. a percentage inside `translateX` resolves against the element's own width, so `--card-width` — carrying a `calc(100% - 2rem)` — came out as negative six pixels against a 26-pixel button. the same expression in `left` resolves against the containing block, which is the figure, which is what the card measures against too
- **added** `scene/runtime.ts` and a `runtime` block on the config: pixel ratio, frame cap and shadow cadence, applied live, mounted first so everything it changes is in force on the frame it changed them on
- **found** that three rebuilds the entire shadow depth pass — terrain, merged steading, all twenty-two scatter meshes — on **every frame it draws**, at up to 4096², because `shadowMap.autoUpdate` defaults on and nobody had ever said otherwise. nothing in this scape moves fast enough to need that: the sun crosses the sky over minutes and the sway is a slow shader animation
- **added**, with it, the exact gate rather than an epsilon. `atmosphere.ts` now fits the sun's frustum only on the frames the map is actually being rebuilt on — the fit is written into `sun.shadow.camera` and read only when the map renders, so on any other frame it is work with nowhere to go. no tolerance to tune, and identical output at cadence 1
- **measured** it instead of claiming it: headless chromium on an m5, desktop tier at ratio 1.75, cadence 1 draws **110 calls** a frame and cadence 4 draws **73**. the frame rate barely moves *there* — that machine is fill-rate bound, and the same run reads 18fps at ratio 1.75, 31 at 1.0 and 44 at 0.5. the cadence is for the devices where the depth pass is the bill, which is every phone this scape has lost a context on. the default is 2 on the tiers that have shadows, and 1 reproduces the old behaviour exactly
- **added** `persist?: boolean` to `ControlSection`, and set it false for the performance section alone. its three values are seeded from whatever tier resolved on *this* load, re-seeded when a loss buys a cheaper one, and re-seeded by `reset`. a pixel ratio kept from one session and replayed into the next is precisely how a device that has already lost a context gets handed back the budget that took it, underneath a tier `tier-memory.ts` had correctly held down
- **fixed** the seeding to `min(devicePixelRatio, tier ceiling)` rather than the ceiling itself. the tier's number is a *ceiling* on the display's and the knob is applied straight to the renderer, so seeding the ceiling on a device below it would have handed the scape more pixels than it had ever drawn. verified against the buffer: 2772×1650 before and after
- **added** two guards against the resize storm the mobile investigation kept circling. the library's `ResizeObserver` has no debounce and a phone's collapsing url bar fires it dozens of times a second with fractional css sizes, most of which round to the *same* drawing buffer — so the renderer is now built here rather than by `createApp`, with `setSize` wrapped to compare the buffer instead of the css box, and `post.ts` returns early from a resize to a size its targets already have. the comparison includes the pixel ratio, because a live ratio change keeps the css box and replaces everything behind it
- **added** a cheaper gate in front of the sky ramp. `paintSky` already refused to *upload* unchanged bytes — the fix that recovered the android context — and now it also declines to recompute them: the horizon and the sky top are its entire input, so colours that match can only produce bytes that match. sixty-four texels and a hundred and ninety-two gamma curves a frame that no longer happen on a stopped clock
- **backed off** the `getError` probe past the first fifteen seconds, from once a second to once every four. it is a synchronising call — it drains the command queue — and every loss on record landed inside that window, so a probe still answering `NO_ERROR` half a minute in is buying very little for a stall it charges for as long as the tab is open. `?debug` keeps the close watch
- **added** `matrixAutoUpdate = false` to the things that never move: the terrain, the lake, the merged steading and every scatter mesh. the swell and the sway are in the shaders; the meshes carrying them are fixed points
- **tests** `overlay-state.test.ts` covers the round trip, an unset key answering *nothing* rather than false, a value it did not write being ignored, and a store whose property reads throw. `vitals.test.ts` covers the first frame being reported as a build cost rather than a frame time, the renderer's own counter reset being turned off and put back, a sample arriving with real numbers on its own cadence, and resizes being counted. `settings-store.test.ts` gains the section that opted out contributing no paths and surviving a round trip unremembered
- **verified** in a real browser rather than argued about: card hidden on a first load and slid fully clear at x −464, `h` flipping it and the same key doing nothing while a panel slider has focus, the choice surviving a reload, `?debug` overriding a stored *hidden*, all three knobs seeded from the desktop tier, and the pixel-ratio knob resizing the buffer live from 2772×1650 to 792×471 and back with the composer following and no console output at all
- **cost** three comparisons a frame from `runtime.ts` and one `textContent` write four times a second. everything else in this entry is work that stopped happening
- **follow-up** the resize storm is only half-guarded. both new guards are downstream of the observer, so a genuine animated resize still fans out once per callback — coalescing to one per animation frame belongs in `threejs-scene`, not here. and the shadow cadence is still a fixed number rather than one that notices the sun has stopped: a scape with a frozen clock and a settled camera could hold one map indefinitely, and currently rebuilds it every other frame to arrive at the same picture

## the aurora, and the dark it needs

the scape has had a night since the clock run and nothing has ever happened in it. this run lights it up, for the half of the year that can hold a light: auroral veils overhead on a winter night, gone by dusk and gone again by may.

- **added** `aurora.ts` — additive veils above the cloud deck, over one baked 160² field, faded in as the view pulls back
- **added** the decision to build it as a *deck* rather than as a curtain on the horizon, which is a fact about the camera before it is a fact about the aurora. an orthographic view tipped fifty degrees down puts the far distance a couple of hundred world units above the top of the frame — there is no horizon in this scape to hang anything against, and a wall of light standing out at sea would have been rendered correctly and entirely off screen
- **named** the fiction that buys, rather than hiding it: a deck the camera looks *down* on is wrong by a hundred kilometres, and it is the same wrongness the sky deck has always had. this scape's camera flies above its own weather, and a layer it cannot see is a layer it does not have. the veils are stacked above the clouds so at least the order is right, and the clearance is enforced in the module rather than left to two sliders agreeing
- **fixed**, after looking at it, the version of the field that wrapped the way the mist and cloud fields wrap. mirrored repeat reflects a wandering arc into a hard chevron at every tile boundary, and a sky full of zigzags is the one thing an aurora never looks like. the field is periodic in `u` instead — sines for the arcs, and the ray noise cross-faded with a copy of itself one tile over until it has a period too
- **fixed**, also after looking at it, a first pass that painted the whole frame in green. an additive quad the size of the map does not need much opacity to stop being weather and start being a filter; the veils came down to about a quarter of what they were, the arcs were narrowed, and the violet fringe was pulled back to a fringe
- **added** `darkAmount` to `season.ts`, and with it the coupling the day/night clock does not have. `daylight.ts` runs one sun arc at one tilt for every week of the year — deliberately, since a scape with a real seasonal arc has a midwinter with no daylight in it — so a midsummer midnight there is exactly as dark as a midwinter one. that is fine for everything else in the scene and wrong for this one: the reason you cannot see an aurora in june at these latitudes is not that it has stopped, it is that the sky never gets past dusk
- **added** the fact that it is the only curve in `season.ts` with no lag in it, and could not have one. every other one is about heat and runs late — `LAG` and `ICE_LAG` are those weeks written down — and night length is geometry. the sun comes back up on the day the orbit says. full dark holds from equinox to equinox through the winter and gives out across the two months either side of midsummer
- **added** `auroraBrightness(day, dark, strength)`, which is those two gates and no third one. the sun is the hard gate — an aurora is up all day and simply outshone — and the year is the soft one. there is deliberately **no weather term**: solar activity is not something this scape models, and a random flare would be the one non-deterministic thing in a world that is otherwise a seed and a coordinate
- **added** colour to a baked field for the first time in the scape. the mist and cloud fields are white and take their tint from the clock; this one carries green and violet because the colour *is* the structure — an aurora is green where the curtain is dense and violet where it thins at the fringes, so the tint comes off the distance from an arc's centre line, the same number the alpha is computed from and impossible to keep in step with if it were a gradient applied afterwards
- **added** two arcs rather than one, combined with a **maximum rather than a sum**. two curtains overlapping do not add up to a brighter curtain; adding them fills in the dark gap between the arcs that the second arc exists to show. their centre lines are sums of sines in `u` and therefore periodic across the tile, so an arc leaves one edge at the height it enters the next
- **kept** the tile at 150 units against a 580-unit deck, which is the mist's lesson at the largest scale in the scape. a ribbon sized to the sheet is one blob bilinearly smoothed into a flat wash of colour over the whole picture; a tile a little wider than the widest frame puts one arc across the sky and leaves dark sky either side of it, and the dark either side is the entire read
- **kept** the cloud deck's zoom gate, for the cloud deck's reason: at the near zoom the camera sits *below* the ceiling, and the only thing a luminous sheet could do there is cover the frame
- **added** the clearance rule — the veils are held above `cloudHeight` whatever the ceiling is set to, so the weather passes beneath the light rather than through it. the slider stops at 70 because the camera at full zoom-out is only eighty metres up, and past that the deck climbs over the eye and the sky goes dark again
- **added** `atmosphere.aurora`, `auroraHeight` and `auroraSpeed` to the config and the overlay, live and persisted, grouped under the sky beside the cloud deck because the knobs that shape it are the same two the clouds have. `aurora` is also the switch; there is no separate flag. plus `palette.aurora` and `palette.auroraCrown`
- **added** `auroraLayers` to the quality tiers — 3 on `ultra`, 2 on `desktop`, 1 on `mobile`, 0 on `minimal` — and `?skip=aurora` to the audit families. the phone tier gets an aurora; the tier that only exists after a context loss gets a plain dark sky rather than a dimmer aurora, because a count of zero returns no module at all rather than an idle one
- **found**, by measuring instead of assuming, that one veil was costing two draws. three renders a transparent *double-sided* material in two passes — back faces then front — which is right for a curved shell and pure waste for a flat sheet, where both passes cover the same pixels in the same order. `forceSinglePass: true` took it back to one, and the a/b in the browser is what turned that from a shrug into a line of code
- **cost** one draw per veil, and none at all for most of the year. `?debug` reports **109 calls** on the desktop tier at the authored opening frame, which is exactly what it reported before this run, and **112** at a midwinter midnight pulled all the way out against **110** with `atmosphere.aurora` scrubbed to zero — two veils, two draws. on the `mobile` tier the same a/b is **51** against **50**, and **50** again at a midsummer midnight and **38** pushed back in. the material has the same shape as the cloud deck's, so three's cache hands it the program already linked and the scape gains none. veils are made *invisible* rather than transparent whenever the light is out, because a map-wide additive quad contributing nothing still costs every pixel it covers — and it is out for every daylight hour of every day and every hour of the white-night weeks
- **tests** `season.test.ts` covers the winter having a night and midsummer having none, full dark holding from equinox to equinox the winter way round, the curve being symmetric about midsummer because night length has no lag in it, the white nights being climbed back out of rather than switched on, and phases outside 0..1 wrapping. `aurora.test.ts` covers a lit winter midnight and an unlit winter noon, a midsummer night staying dark, the fade through the dusk being a fade, the brightness never exceeding what it was authored at across a whole year of hours, zero and negative strengths lighting nothing, and the veil reading the same darkness the rest of the year reads
- **verified** in a real browser rather than argued about: headless chromium over the dev server on the `mobile` and `desktop` tiers, with both clocks frozen and scrubbed live through the overlay, at a midwinter midnight in both zoom extremes, at a midsummer midnight, at the authored opening frame, and at a midwinter midnight with the aurora scrubbed to zero for the a/b. the first pass painted the entire frame green and the second wrapped into chevrons; both were found by looking, and neither would have been found by reading
- **follow-up** the aurora lights nothing. it is the brightest thing in a night frame and the water beneath it is still reflecting an empty sky, so a term in the lake's specular and a lift in the hemisphere's sky colour on a bright night are the same run. it also has no south — the veils drift on a seeded heading rather than lying along a magnetic parallel, which is the sort of thing that would matter if the scape ever gained a compass

## the smoke off the last open water

the scape has carried two winters since the ice run — the land's and the sea's — and the whole of `ICE_LAG` is the fact that they are weeks apart. this run draws what lives in the gap between them: for a fortnight either side of the fields going white, the sea is still warmer than the sky on it and the open water steams.

- **added** `seaSmokeAmount` to `season.ts`, which is not a curve. it is `max(0, snowAmount − freezeAmount)` — the difference between how much winter the land has taken and how much the water has. steam fog is *by definition* water warmer than the air on it, and the scape was already holding both halves of that subtraction
- **added**, for free and without writing it, the one-sidedness. come spring the lag runs the other way — the air is back and the bays are still shut — the difference goes negative, and the clamp takes it. a coast smokes on its way *into* the winter and not on its way out, the same way the leaf turn only happens on one of the two falls in warmth a year has
- **added**, also for free, the reason there is no ice test anywhere in the geometry or the shader. the smoke only ever has a strength during the weeks the sea has not shut, so the open water it wants is all the water there is. an ice-front check would have been a second opinion about the freeze, and two opinions about one thing eventually disagree by a week
- **kept** the peak at 0.83 rather than normalising it to 1. that number is not a scale wanting a correction — the most open water a cold sky ever gets is however much of the year the lag leaves between the two curves, and stretching it would be inventing weather the physics does not have
- **added** `smokeGeometry` to `mist.ts`: the ground mist's radial profile turned inside out. nothing over the island, full strength a couple of island-radii out, and gone again before the sheet's own straight edge, because a rim on a transparent quad reads as a quad. the two families therefore never overlap — the mist stands on the island all year and the smoke stands exactly where the mist has already faded to nothing
- **added** the decision *not* to give it upright slices, which is the one place it deliberately parts from the mist. sea smoke is a shallow layer — a metre or two against the mist's nine-metre column — so the thinning that argued the slices into existence is not a failure here but the shape of the thing. checked at the near zoom, where two sheets a metre apart present as a bank lying along the coastline
- **added** a colder white. the smoke takes the same horizon colour from the clock the mist does and is pulled twice as far toward white, because sea smoke is water that has just condensed out of the air standing on it where ground mist is haze the sky is lighting through
- **refactored** the per-layer frame work out of the update loop into `advance`, because there are three families reading two different strengths now and one loop with a branch in it was the alternative. `MistSheet` carries the live colour its family follows rather than the loop knowing which is which
- **changed** `landscape/index.ts` to publish its `SeasonState` the way the atmosphere publishes its daylight, and `create-isometric-scape.ts` to hand the mist both clocks. the landscape mounts ahead of the mist, so the week the sheets read has already been resolved for the frame — a second `sample` would have been a second week
- **added** `season.seaSmoke` to the config and the overlay, live and persisted, grouped under the year alongside the snow and the ice because it is the arithmetic between them. it is also the switch; there is no separate flag
- **cost** nothing until it exists, and two draws when it does. `?debug` reports **109 calls · 698k tris · 42 geo · 27 tex · 34 prog** on the desktop tier at midsummer — unchanged, byte for byte the opening frame it always was — and **111 · 705k · 43 · 27 · 34** at the peak of the smoke. the program count is the interesting one: the smoke's material has the same shape as the mist's, so three's cache hands it the program already linked and the scape gains none. a layer at zero strength is made *invisible* rather than transparent, because a map-wide transparent quad contributing nothing still costs every pixel it covers
- **sized** as `mistLayers / 2`, so `minimal` and `mobile` get one sheet, `desktop` two and `ultra` three. every tier gets the smoke, and the tier that has to be defended gets one extra transparent quad for a fortnight of its year
- **tests** `season.test.ts` covers no smoke in summer, none at the depth of the winter, a strong showing on the way in and exactly zero on the way out, the peak landing in the last fifth of the year, the amount never going negative across 520 weeks, the window being narrower than either winter it is the gap between, phases outside 0..1 wrapping, scaling by `season.seaSmoke` down to a coast that never steams, and the smoke and the freeze coming off one sample of one instant
- **verified** in a real browser rather than argued about: headless chromium over the dev server at midsummer, at the smoke's peak in both zoom extremes, and at midwinter, with the daylight clock frozen at the authored hour. the numbers above are read off `?debug` in those runs
- **follow-up** the smoke does not know about the wind's *direction*, only its speed — steam fog streams off a shore rather than drifting on it, and the fetch is what makes the banks. it also stops at the coastline, where the last run's paths stop at the waterline: a shore band where the smoke rolls up over the beach is the same run as the snow finally reaching the ice. and the mist and the smoke now bake two 1681-vertex sheets that differ only in one attribute, which is one sheet and two colour buffers if a later run wants it

## the paths people wear

the farm was a set of places with nothing between them. now the ground says where people go: a network of footpaths worn out from the well to every building's door, to the landing, to the boat harbour, to the pasture gate and to the edge of each field. it is the first thing in the scape whose *route* is relaxed into place rather than traced or searched for.

- **added** `landscape/footpath.ts` — a desire-line relaxation, plus the wear it leaves. every interior point of a route gets pulled toward the midpoint of its neighbours, which is the gradient of the route's own length, and pushed along the ground gradient by how much of a *bulge* it is against the two points either side of it
- **added** the sign on that second term, which is the whole idea. a point higher than both neighbours is a crest being climbed for nothing and slides downhill; a point lower than both is a hollow that has to be climbed back out of and slides up; a point *between* its neighbours is on a steady grade — a hillside path — and the term vanishes there however steep the ground is. a route therefore traverses slopes and refuses humps and dips, which is what a worn path does and what a shortest-path search does not
- **added** `SLACK`, a third of a metre, which is the difference between a bump and a footfall. without it the sidestep reads the ground's own grain as topography and the route wanders over centimetres
- **added** the star. the network hubs on the well, because the one errand everybody runs every day is water — so that is the ground that goes bare, and every other route leaves from it
- **added** `landscape/steading.ts`, and with it the arrangement of the farm buildings, moved out of the dressing. two copies of where the barn stands is how a path ends up leading to where the barn used to be. buildings carry a rough radius, and a route point that lands inside one is *projected* out of it after every pass rather than pushed by another force — a path that mostly misses the barn is not a path that misses the barn
- **added** `landscape/landing.ts`, the shoreline search moved out of the dressing for the same reason: the jetty is built at the landing and the path is worn to the landing, and two searches would eventually disagree by a few metres
- **fixed**, before it could ship, the version of this that painted a stain. eight routes converging on one well turned the middle of the farm into one brown patch. the wear now weighs itself by how green the ground already was — a path is turf that has been walked off, so it can only show where there was turf, and on the yard, the road and the tilled plots it barely registers. the same arithmetic the seasonal tint uses, on a colour the painter already holds
- **fixed** the falloff, which was backwards for the same reason. wear does concentrate at the hub, but the hub is a farmyard that is bare already — the only place the eye can read a path is out on the grass, so the loss along a route is mild rather than steep
- **changed** the scatter: the tread joins the yard, the track, the plots and the pasture as ground that is already spoken for, so nothing stands on it. the threshold sits at the middle of the tread and not at the verge, because eight two-metre corridors is a bald farmyard. cobbles go the other way and are *more* likely on a tread, because taking the turf off a hillside is how the stone under it surfaces
- **added** `footpath.width`, `verge`, `climb`, `wander` and `wear` to the config, and `palette.trodden` — greyer and darker than `track`, because a cart road is gravel laid down and a footpath is only the turf taken off. build-time knobs like `creek.*`, so deliberately not in the overlay; `wear` at 0 traces no route at all rather than painting one at zero strength, so the grass and the stones close back over it
- **cost** nothing. no draw call, no material, no texture, no pass — the routes are traced once at build in under a millisecond and baked into vertex colours that were already being written, and the per-vertex query is a bounding-box reject plus a segment walk, about 8 ms over an `ultra` terrain's fifty thousand vertices. `?debug` reports the same **109 calls · 698k tris** it did before. every tier gets the paths, `minimal` included
- **noticed** that the route to the landing is dropped on the authored seed, and correctly: the cart track already ends within a couple of metres of it, and a path worn alongside the road is the road. the rule that does this only counts ground *outside* the yard, because the track ends at the farm and inside the yard its corridor covers most of the ground people actually walk on
- **tests** `footpath.test.ts` covers determinism point for point, every route starting at the well and arriving where it was sent, no interior point inside a building, the tread worn and the ground off it not, a scape with `wear: 0` having no paths, a route that would only repeat the track being dropped, and — on a synthetic hill — the route going round rather than over, going straight when `climb` is 0, and not doubling the walk to do it. `steading.test.ts` covers the arrangement being stable, on the yard, and not standing two buildings on the same ground
- **follow-up** the paths are paint, and stop at the waterline. a slipway, a plank across the beck where a route fords it, and cart ruts in the track itself are all the same run. the wear does not know about the year either — a path under snow should be the last thing to whiten and the first to show through, since that is what being walked on does

## the winter the water gets

the year has been running for two runs and the sea has been a summer green all through january. it freezes now: the shallows shut first, the ice walks outward as the winter deepens, and everywhere it takes hold the surface gives up its swell, its ripple, its foam band and its glitter. it is the first system in the scape that both stages of one shader have to agree on exactly.

- **added** `freezeAmount` to `season.ts`, plus `freeze` and `iceColor` on the season state. the same shape as `snowAmount` and never the same timing
- **added** `ICE_LAG`, which is the whole of the physics that separates the two. a metre of water holds something like a thousand times the heat a metre of air does, so the fields whiten weeks before the bays close and are bare again while the ice is still in. the curve is also narrower than the snow's — a cold night whitens a field, and only the deepest weeks of a winter take the heat out of a column of water
- **added** the depth gate, which is the rest of it. a bank a foot deep gives its heat up in a week and a sound five metres deep takes the season, so the freeze starts at the shoreline and works outward — and it reads that depth from the *bathymetry mask the lake was already fetching* for its own depth tint. the freeze costs no texture read the water was not making anyway
- **added** `scapeFloe`, three sines rather than a noise fetch. depth alone draws a contour line around the island — a bathymetry chart with the ice-fill switched on — and the field is what breaks it into floes. it is analytic because the *vertex* stage needs the same ice front the fragment stage paints, and the cheap tier's two-tap budget has no room to read a map twice
- **added** the swell damping, which is why the two stages have to agree at all. under ice the vertex stage stops displacing and the fragment stage stops perturbing its normal; a swell rolling under a sheet that is not rising with it is the giveaway that the winter is paint. one vertex texture fetch of the bathymetry mask is the only new cost, on a plane of at most sixteen thousand vertices against a texture with no mipmaps and linear filtering
- **added** the rim, `4 · cover · (1 - cover)` — a ridge wherever the cover passes through a half, which is the front between the sheet and the open water. that is the only part of a frozen bay that is actually white, because that is where the floes grind and pile. two multiplies
- **fixed**, before it could ship, the obvious version of ice: a mix into the water's albedo. what is under a shelf stops mattering the moment the shelf is thick, and a depth tint showing through frozen water reads as blue plastic sheeting. the ice is composited over the finished water instead
- **fixed** the other obvious version, which is that new ice is glassy and should therefore drop the roughness. the camera's elevation sweeps across the sun's as it zooms, and a near-mirror plane at that crossing is exactly the white-out `water.roughness` exists to prevent — a frozen bay is that same flat plane with the swell taken *out* of it, so it is the better candidate for the failure, not the worse one. ice is *rougher* than the water it replaces, which is what snow-blown ice actually looks like and cannot blow out
- **added** `season.ice`, `water.iceReach` and `water.iceBreak` to the config and the overlay, all live and persisted, grouped under the year because the year is what drives them; plus `palette.ice`, colder and greyer than `palette.snow` because new ice is the water seen through it
- **changed** `Water.update` to take the season state, and `landscape/index.ts` to sample the year once and hand the same instant to the ground and to the lake. two samples would be two weeks of the year in one frame
- **cost** nothing measurable. `?debug` reports **109 calls · 698k tris · 42 geo · 27 tex · 34 prog** on the desktop tier at midsummer and the same at deep winter — no draw call, no texture, no material, no pass and no fragment tap. every tier gets the winter, `minimal` included, because there is nothing in it a phone could fail at
- **noticed** that the beck's tidal inlet shuts first and reopens last without being told anything about the freeze. it is simply the shallowest water on the map, which is what the depth gate was for
- **tests** `season.test.ts` covers the freeze shutting deep winter and clearing midsummer, arriving after the snow does, outlasting the snow it arrived behind, claiming fewer weeks of the year than the snow does, wrapping phases outside 0..1, and scaling by `season.ice` down to a sea that never freezes
- **follow-up** the ice is a surface state and not yet a surface anything sits on. at close zoom the lily pads are still green on a frozen bay and the rowboat is still floating in one; the reeds, the mooring stakes and a boat drawn up the slipway for the winter are the same run. the snow line stops at the waterline, so lying snow never reaches the ice it should be blowing across. and the freeze does not touch the atmosphere — sea smoke over the last open water is the effect the two systems are one uniform away from

## the beck, and the inlet it cuts

water runs off the high ground now. a beck springs on the highest interior ground the farm is not standing on, falls through a channel carved into the hillside, and flares out at the shore into a tidal inlet that reaches a good way inland. it is the first feature in the scape whose *shape* is found rather than authored — everything else is sited by a search and then drawn; this one is traced downhill and the terrain is cut to fit it.

- **added** `landscape/creek.ts` — a steepest-descent walk over the same fbm the terrain is built from, plus the channel it defines: a floor half-width that flares toward the mouth, an incision that ramps in below the spring, a tidal floor the mouth is dredged to, and allocation-free claim, course and clearance queries against the course
- **added** the two bribes that make a descent read as a watercourse. holding a heading is worth 0.55 m of drop, because a quantised twenty-four-bearing fan otherwise traces a staircase and spends as much of its length turning as descending. heading seaward is worth 0.3 m, because inside `islandInner` the island falloff has not started taking height away yet and the raw fbm has closed hollows a purely downhill walk sits in
- **added** the spill rule, which is what turned "usually terminates" into "always terminates". a stream that cannot descend out of a basin fills the basin and leaves over its lowest lip, so the seaward bribe grows with every step the walk fails to get further out and collapses the moment it makes ground. before it, two of four candidate courses ran out the step limit going round in circles
- **fixed**, before it could ship, the obvious source of springs: `layout.ridges`. those are ranked on the raw fbm over a square grid whose corners reach past `islandOuter`, so most of them are already under water once the falloff has had its say — traced from them, every course was a five-metre stub. the search now probes directly for real height on ground that survives the drowning
- **fixed** the beck taking the pasture's hilltop. the walled meadow sits on the highest ground on the island and so did the best spring. rather than teach the yard, plot and pasture searches the shape of a channel that does not exist yet — three chances to disagree about it — the beck is resolved *last* and handed one list of discs it has to miss. a course that cannot miss them is discarded rather than shaved, which is why the plots and the pasture are exactly where they were
- **added** the carve to `height.ts`, applied *after* the track and never before. the road grade is sampled from a ground with no channel in it and then smoothed, so levelling the track second would fill the crossing back in; carved second, the beck cuts under the road. the blend only ever lowers, because past the mouth the seabed is already deeper than any floor the channel asks for and a symmetric blend would build a causeway out into the sea
- **added** a running minimum over the beck's long profile. the descent obeys the raw fbm and the ground it is carved into is not that — the shore shelving lifts the bank and an islet lying across the mouth's path raises the seabed under it by several metres — so without it the channel inherits those rises and the scape gets a stream running up over a bar and back down
- **fixed** the smoothing of that profile from eight passes to four, the same count the road grade uses. eight passes over a fourteen-point profile is very nearly one average, and a long profile averaged flat carves a level canal
- **changed** the bridge from decoration to structure. it had been sitting in whatever low patch of track a seed happened to leave; it now spans the beck where the track runs deepest through the channel, with its deck resting on the nearest track points the channel does not claim — a bridge sat on the carved ground under it is a bridge lying in the beck
- **fixed** the bridge's rotation while it was being moved. it was turned by `heading + π/2`, which mirrors the track bearing about the diagonal and lay the deck across the road it carries. it takes `yawAlong` now, the same conversion the jetty and the net rack take
- **fixed** `findShore` mistaking the beck for the sea. the channel reaches within a couple of yard radii of the farm and is the nearest thing under the waterline that a walk outward from the yard finds, so without a rejection the jetty gets built across a stream two metres wide and the boathouse follows it in
- **added** `landscape/path.ts`, split out of `layout.ts`: `smoothPath`, `smoothPolyline`, `distanceToPath`, `pathLength` and a bounded `createPathQuery`. the track and the beck ask the same three questions of a polyline, and the beck cannot import the layout that is going to own it. the query keeps a bounding box so most of the map costs one compare rather than a walk of every segment, and returns a shared scratch because the terrain bake, the bathymetry bake and every placement query run it hundreds of thousands of times
- **added** `creek.width`, `creek.incision`, `creek.mouthDepth` and `creek.mouthFlare` to the config, plus `palette.streambed`. build-time knobs like `layout` and `dressing`, and deliberately not in the overlay for the same reason `harbourSpread` is not: the channel is baked into the terrain mesh and into the bathymetry mask, and a slider that needs a rebuild to be seen would lie about what a slider does
- **cost** nothing. `?debug` reports **109 calls · 698k tris · 42 geo · 27 tex · 34 prog** on the desktop tier with the beck and **109 · 698k · 42 · 27 · 34** without it — identical, because the lake is already one plane spanning the map drawn wherever the baked bathymetry says there is water under it, so anything carved below the waterline fills itself with the swell, depth tint, foam band and glitter the sea already has. the beck is a hole in the terrain. mobile reports 50 calls · 121k tris either way
- **sized** for the mobile tier deliberately: `mouthFlare` below about 2 leaves the lower reach unresolvable where a terrain quad is two metres across, and the bank taper reaches two and a half times the floor's half-width so the grid can carry two sides of it. checked on `?tier=mobile` at 64 segments, where the inlet still reads
- **tests** `creek.test.ts` covers the beck existing, springing dry and ending past `islandOuter`, descending monotonically for as long as it is still a channel, holding water in its lower reach and none in its upper, flaring toward the mouth, the claim being full on the centreline and gone off it, the course running 0 to 1, the course clearing the yard, the plots and the pasture, the carve never raising the ground anywhere on a 41×41 grid, a `null` beck carving nothing rather than throwing, and the same seed cutting the same channel; plus the polyline helpers, including the bounding-box rejection
- **follow-up** the beck does not know about the year yet, and it should: a channel that runs low in late summer and freezes at the edges before the middle is the seasonal system's most obvious next customer. a course that crosses the track is worth forty metres of length in the ranking and this seed still has none — routing one deliberately, rather than hoping for it, would give the bridge its reason on every seed. and the water in the channel is the lake's flat surface: a flow term along the course is a run of its own

## the year, alongside the day

the scape has had a clock since the third run and only ever one hand on it. `season.ts` adds the second: a phase of the year, a speed, and grass, leaves and ground derived from it the same way dusk and night are derived from noon. midsummer is the anchor, so at `season.time: 0.5` the opening frame is byte-for-byte the frame it always was, and the clock runs it down from there into a gold autumn and then a white winter.

- **added** `season.ts` — `growthAmount`, `turnAmount` and `snowAmount`, and a `createSeason` that resolves them into a tint, a tint weight, a snow amount and a snow line. pure, allocation-free, and shaped like `daylight.ts` on purpose: two clocks that work differently are two clocks somebody has to learn twice
- **added** the lag. growth peaks a twentieth of a year *after* midsummer, because ground warms and cools slower than the sun doing it, which is what makes autumn read as longer than spring rather than as its mirror
- **added** a one-sided turn. warmth falls twice a year and only one of those falls turns anything gold; spring loses its snow to bare ground and greens straight off it, which the growth curve already says on its own
- **fixed**, before it could ship, the obvious version of a seasonal tint: two materials carry the whole scape, so a flat mix takes the falu red off the barn and the grey off the granite along with the green off the meadow. the tint now weighs itself by how far the fragment's own albedo leans green, and then by how light that green is — which is the difference between a birch canopy that goes gold and a spruce that stays black-green through the winter. both terms are arithmetic on a colour the fragment already holds
- **added** lying snow, gated on world height so it stays off the beach the sea keeps warm and off the seabed under the shallows — **and it reads that height without a varying.** `vViewPosition` is minus the view-space position and the view matrix is rigid, so world height is the camera's height less that position projected onto the view matrix's second column. one dot product against two uniforms three already declares, on a program that has spent two runs arguing about sixty varying components
- **added** a wandering snow line, on a two-term sine field in world x and z. a fixed contour round an island reads as a stripe someone painted on it; the patches are what make it snow
- **changed** the ground's surface-normal varying from "emitted with the detail pass" to "emitted for whoever reads it" — the grain and the snow ask the same question of it, and the ground keeps it whether or not `?skip=detail` took the grain away
- **added** `season.time`, `season.speed`, `season.snow`, `season.snowLine` and `season.turn` to the config and to the overlay, all live, all persisted; plus `palette.snow` and `palette.autumn`, the two colours the year needs that the scape had no other use for
- **cost** nothing measurable. no draw call, no texture, no material, no pass, no varying, and about a dozen ALU per fragment on two programs. every tier gets it, the phone included, because there is nothing in it a phone could fail at
- **tests** `season.test.ts` covers midsummer contributing exactly zero, midwinter withering and whitening, the turn leaning the tint gold only on the autumn side, growth lagging the sun in both directions, snow being symmetric about midwinter, phases outside 0..1 wrapping onto the same week, and the same phase resolving the same year twice
- **follow-up** the water does not know about the year yet: ice, and a shore band that freezes before the middle does, are the obvious next thing and are a run of their own. so is a seasonal coupling into `daylight` — the noon height should fall with the year at this latitude, and right now midwinter noon is as high as midsummer's

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
