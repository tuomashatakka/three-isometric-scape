# instructions

the standing brief for the **scene enhancement run** — a scheduled, unattended llm session that makes `three-iso` look more like a real place and draw it more cheaply, one increment at a time, without letting the codebase rot.

written to be read cold. a run starts with no memory of the previous one. everything it needs is here, in the project skills under [`.claude/skills/`](.claude/skills), in [`agents.md`](agents.md), in the [readme](README.md), or in the repository itself.

- **this file** — what to do, and in what order
- **`.claude/skills/scape-studio`** — how to *look*: a warm browser, seconds per picture
- **`.claude/skills/scape-perf`** — how to *measure*: the triangle and draw census, and the levers that exist
- **`.claude/skills/scape-verify`** — how to *check*: the light gate and the full one
- **`.claude/skills/scape-tools`** — which instrument: every dev tool, what it costs, and where its detail lives
- **[`agents.md`](agents.md)** — every script and flag, the module surface, the traps
- **[`README.md`](README.md)** — why the scene is the way it is

## the goal

**standing emphasis — whole-app refactors, not single props.** every run should refactor broadly while it is in there (the repository is experimental; destructive changes are welcome when they leave less code): make the general rendering more immersive and realistic; make props more detailed *and more generic and reusable* by pushing detail into the shared kit; texture the environment and make geometry less faceted; merge controls under more generic parameters; and tune or fold new shader stages into the global effect chain. a prop-only run is the exception, not the default. the overlay is part of the picture too: it follows one design system (the `--ui-*` tokens in [`src/style.css`](src/style.css), see the readme's *the graphics overlay*). a run that touches the ui uses those tokens and does not add one-off colours.

**a more realistic picture, drawn for less.**

the world already has more sites than most frames show — six islands, a hundred surveyed landforms and buildings. what it lacks is the *rendering*: light, material, atmosphere and scale that read as a photograph of a nordic coast rather than as a diorama of one. so a run's headline is about how the **whole frame** looks or what it costs, not about one more prop:

- **light** — shadow quality and softness, sky and bounce light, ambient occlusion where things meet the ground, a sun that warms and a cloud that cools, exposure that adapts between noon and a midsummer night. the camera is white-balanced to the light ([`white-balance.ts`](src/scene/white-balance.ts)), so a colour cast over the whole frame is a light's colour, not a palette entry's
- **material** — ground that reads as a quilt of moss, heather and peat rather than one green (`heathFragment`), smooth terrain with real normal detail, wet versus dry, specular water with the sky in it, roughness that varies, snow that sits on top of things and not inside them, foliage that transmits light, stone and timber with relief rather than flat facets
- **atmosphere** — aerial perspective with distance, haze that is denser low, fog that lies in the valleys, rain that darkens and streaks
- **scale and detail** — what close zoom shows (richer geometry, texture detail), what wide zoom shows (silhouettes, coastline, the sea), and an lod that makes the first cost nothing at the second
- **cost** — fewer draws, fewer triangles, cheaper passes, a faster first load (`scape:bench`); every tier, mobile first
- **the optical pipeline** — the post chain is a camera, not a stack of filters: one pass per physical stage (scene light, then the glass and the film in [`lens.ts`](src/scene/lens.ts)), merged rather than appended. a new screen-space effect folds into an existing pass when it reads the same pixels
- **the shared kit over the single prop** — a look that belongs to a *kind* of thing (every stone, every board, every roof) lands once, in the helper every prop of that kind is built through (`stonePart`, `soften`, the two scape materials), so one change reaches every island. a term keyed on what the albedo already is (`heathFragment` on greens, `weatheringFragment` on neutral greys) reaches every prop of a kind with no per-prop flag and no new program
- **fewer, broader knobs** — one parameter per physical decision (`look.lens` is defocus, fringe, vignette, halation and grain at once). a run that adds a knob should look for two it can merge or retire; the panel only shrinks

a new prop or site is still allowed, when it is the cheapest way to make a frame more believable. it is no longer the default.

**the open rendering backlog** — whole-frame candidates, roughly by what they would buy. strike one through when a run lands it:

- the phone has no post chain at all (`quality.post` false on mobile): a one-pass, no-depth grade and vignette that survives the context-loss budget would change every frame most people see
- terrain normals from the height field at close zoom, so slopes stop shading as broad facets
- height fog that lies in the valleys and thins up the slopes, on every tier, not only the haar sheets
- stone geometry: boulders and cairn blocks read as smooth blobs in silhouette; a shared displaced-stone builder in the kit, not per prop
- timber end grain and board seams on the upright path (the bark map is one stretched field)
- per-instance colour and scale variation on every scattered family, read from the instance matrix rather than authored per prop

what a run may **not** do is ship something that does not pass the gate, adds cost on the mobile tier without an answer for it, breaks determinism, or leaves the repository harder to read.

---

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
bun run studio shot --poses tour --census    # the before picture, and where the triangles go
```

read the six pngs only if the census does not already tell you what to work on. the `near` and `default` frames are the two most people see. when something in a frame reads wrong and you do not know what draws it, `studio probe x y` and `studio shot --hide <name>` find it in seconds.

then read, and only these: [`src/scene/config.ts`](src/scene/config.ts) (the tuning surface), [`src/scene/quality.ts`](src/scene/quality.ts) (the tiers), `node_modules/threejs-scene/llms.txt` (the runtime's exact signatures — read it rather than guessing), [`threejs-scene-api.md`](threejs-scene-api.md) (what exists before you write a helper), and the readme section `brief --sections readme` points at.

## 3. pick one thing

**one rendering theme per run, plus one refactor or cost cut that leaves the code smaller, the chain shorter, the panel smaller or the load faster** — the theme with a headline someone could picture or measure: "terrain normals from the height field", "contact shadows under every prop", "aerial perspective that blues the far islands", "half the draw calls at the default zoom". not a sweep of unrelated tweaks.

pick by looking: what in the `near` and `default` frames reads as least real, or what in the census costs most for least. do not repeat a theme `brief` lists.

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
- reading six screenshots where one census line would have answered the question
- a merged branch with red checks
