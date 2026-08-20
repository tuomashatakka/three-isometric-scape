# instructions

the standing brief for the **scene enhancement run** — a scheduled, unattended llm session whose job is to make `three-iso` bigger and more detailed, one increment at a time, without letting the codebase rot.

written to be read cold. a run starts with no memory of the previous one. everything it needs is here, in [`agents.md`](agents.md), in the [readme](README.md), or in the repository itself.

- **this file** — what to do, and in what order
- **[`agents.md`](agents.md)** — what you have to do it with: every script, every flag, the module surface, the traps
- **[`README.md`](README.md)** — why the scene is the way it is. the design record, and several entries are explanations of bugs that come straight back if the reasoning is discarded

## the goal

**more scape, more detail, same discipline.**

each run should leave the world measurably larger, denser, or more finely observed than it found it — a new landform, a new prop family, a new atmospheric system, a wider archipelago, a richer material response. the scene is the product. everything else in the repository exists to keep the scene cheap to change.

what a run is explicitly *allowed* to do: anything. add files, split modules, rewrite a system, retune the config, extend the build, revise the readme. there is no protected directory and no "just tweak the numbers" restriction. a run that only nudged three floats did not do its job.

what a run may **not** do is ship something that does not lint, does not typecheck, does not build, drops frames on the mobile tier, or leaves the repository harder to read than it was.

---

## 1. sync

```sh
git fetch origin main
git checkout -B claude/scene-enhancement-<slug> origin/main
bun run setup
```

branch from `origin/main`, always freshly fetched. never stack a run on a previous run's unmerged branch — if the last pull request is still open, that is a signal to *finish* it, not to build on it.

`bun run setup` installs from the lockfile, **checks for a chromium before anything depends on one**, reports whether the api digest is current, and starts building
the reference side of `scape:diff` in the background. that last one is the important one: the reference half depends on nothing this run is about to write, so it
builds and photographs itself while the change is being authored, and stage 5 costs seconds instead of minutes. it is best-effort — it cannot fail, it cannot block,
and `scape:diff` still does the work itself if the prewarm did not finish.

if setup says chromium is **NOT FOUND**, decide now: either `bunx playwright install chromium`, or pick a theme the ascii instruments can judge and say plainly in
the pull request that no picture was taken. discovering it at stage 5 means discovering it after the budget is spent.

## 2. orient

before touching anything:

```sh
bun run brief      # ~2 s. inventory, recent themes, open pull requests, scape:map --stats
```

that is the "before" stage 5 judges against, and it answers in one read most of what used to take four documents: what is here and how big it is, what the last
eight runs were about, whether a pull request is still open, and the full structural survey. `--sections readme` prints the design record's index — every heading
with the line it starts on, so the section you are about to change is one offset rather than seven hundred lines of skimming.

it is advisory and never fails. orienting is not verifying.

then read, and only these:

- **[`src/scene/config.ts`](src/scene/config.ts)** — the public tuning surface and the fastest map of what the scene currently has.
- **[`src/scene/quality.ts`](src/scene/quality.ts)** — every new cost needs an answer for the mobile tier.
- **[`threejs-scene-api.md`](threejs-scene-api.md)** — every symbol the runtime exports and whether this scape uses it. **read it before writing a helper.** most
of what a run is tempted to build by hand already exists there, and this file is the only thing that says so.
- **the [readme](README.md)** section `brief --sections readme` pointed you at.
- **[`agents.md`](agents.md)** when you need the tool reference in full.

if `brief` reports an open pull request from a previous run, drive *that* to green and merged before opening another — two enhancement branches racing on the same
scene is how the merge conflicts start. do not repeat a theme it lists.

## 3. pick one thing

**one theme per run.** a run is a coherent, reviewable change with a single headline, not a sweep of unrelated improvements. "seasonal colour for the vegetation" is a run. "seasonal colour, a new islet, a lighthouse, and a refactor of the mist" is four runs badly merged.

size it so the diff stays readable — roughly the scale of one existing module. if the idea is genuinely bigger, land the foundation this run and note the follow-up in the pull request body.

directions that fit the goal, as a backlog rather than a queue:

- **more world** — an outer island chain, a fjord, a river with a mouth, a headland, an ice sheet, a coastal road running off the map edge
- **more settlement** — a smokehouse, a windmill, a chapel, a net loft, a second steading on an islet, a pier that reaches deep water, cart ruts in the track
- **more life at ground level** — lichen on the erratics, moss on the north faces, laundry lines, snow fences, a woodpile that grows through the year
- **more weather** — hail, a wind that bends the grass it already scales, fog banks that roll rather than drift, lightning on the far islands
- **more water** — a foam band that follows the swell, river flow, caustics in the shallows, reeds that displace the water they stand in
- **more time** — a second sun arc that actually changes with the season, so midwinter has no daylight in it
- **more depth of field** — richer prop geometry at close zoom, an lod pass so that richness costs nothing pulled out

## 4. build it

the house rules. each is load-bearing for either performance or determinism, and [`agents.md`](agents.md) has the longer version of each.

**draw calls are the budget, vertices are not.** hero props merge into the steading geometry; anything placed in quantity goes through `scatterInstances` as one `InstancedMesh`; anything that must move independently needs a reason.

**prop builders are pure.** `(rng: SeededRng, palette: NordicPalette) => BufferGeometry` — no scene, no gl context, no module state, base at `y = 0`. that purity is what makes `prop:map` and the headless roster tests work at all. register in [`props/index.ts`](src/scene/props/index.ts) and choose `HERO_PROPS` or `SCATTER_PROPS` deliberately.

**everything generated is deterministic.** no `Math.random`, no `Date.now`, no iteration-order dependence. fork the seeded rng (`rng.fork(name)`) so adding a prop does not reshuffle every prop built after it.

**new knobs go in the config, and in the overlay** — if they are visual *and* read per frame. a build-time knob (`archipelago.*`, `layout.*`, `creek.*`, `footpath.*`, `dressing.*`, or route-shaping `boats.*`) stays out of the panel, because a slider that needs a rebuild to be seen lies about what a slider does. read config per frame in `update`; never capture it at build.

**name the scale before changing it.** shared sheet and surface extents follow `archipelago.worldSize`; screen composition follows `camera.maxViewSize` or the live `viewSize`; a real-world detail such as a wisp, ripple or streak speed remains metres. when either the world or camera grows, audit all three classes in clouds, mist, aurora, rain and water. replacing every old `terrain.size` with the same larger number is not a scale pass.

**there is no `enabled` flag.** an effect is off when its strength is zero. do not add a boolean that duplicates a number that already exists.

**anything that moves needs a speed that can reach zero**, and that speed goes into `STILL` in [`scripts/scape-shot.ts`](scripts/scape-shot.ts). a hard-coded rate cannot be stopped, so it cannot be captured, so it poisons every visual diff taken after it lands.

**moving state has one authority.** cameras, wakes and diagnostics consume stable pose records from the simulation; they do not resample the route or derive a second turn clock. a selectable moving thing also needs an explicit way back to manual control — escape plus the direct-manipulation gestures that would otherwise fight the follow target.

**every tier still has to run.** gate new cost on `AtmosphereQuality`; defend `mobile`. a system that cannot be made cheap gets a tier gate and a graceful *absence*, not a broken-looking cheap version.

**lifecycle discipline.** generation in `build`, animation in `update`, viewport work in `resize`, teardown in `dispose`. `createApp` owns the only render loop. everything allocated on the gpu is released in `dispose`, including what a new system allocates on behalf of an old one.

**follow the lint config.** do not hand-format. write the code, run `bunx eslint . --fix`, then read the diff it produced.

**keep the codebase clean.** a module past **666 lines** — the enforced limit, counted with comments and blank lines skipped — wants splitting the way `landscape/` and `props/` already were — and the lint config will tell you. name things the way the neighbouring code names them. comment the decisions that are not obvious, and not the ones that are. dead code, commented-out experiments and `any` do not ship.

**dependencies are a last resort.** `three` and `threejs-scene` are the runtime, and the scene is built from primitives on purpose. adding a package needs a real justification in the pull request body; adding one to avoid writing forty lines of geometry does not qualify.

**tests come with the change.** new pure builders and new pure maths get a determinism test in the neighbouring `*.test.ts` — attributes present, base at zero, bounds sane, byte-for-byte stable per seed. and where a change makes a *claim* — "everything connects to everything", "no gable pokes through its roof" — write the test that states the claim as a fact about the data, not a test that re-implements the code. schedules are tested through moving legs *and* stationary dwell; follow controllers are tested through select, refresh and every documented exit; scale helpers are tested at the minimum, middle and maximum view.

**update the documentation.** the readme is the design record and its project map has to stay true: a new system gains a section, a new file gains a line. a new tool or script gains an entry in `agents.md`. a readme that lies is worse than no readme.

## 5. look at it

the run is unattended, so "open the scape and see" is not available. these are what it looks with, and they are **not optional**. the full flag reference is in [`agents.md`](agents.md).

read them in this order, cheapest first:

```sh
bun run scape:map --stats                            # is the world still a world?
bun run prop:map <name> --view front,right           # only if you touched a prop
bun run scape:diff --ref origin/main --poses tour    # what did it do to the picture?
```

if `bun run setup` ran at stage 1, the reference side is already built and photographed, and this prints `ref side reused from a prewarm` before doing only the half
that depends on your change — **about forty seconds rather than several minutes.** the reuse is keyed on the commit, so a reference of the wrong commit is rebuilt
rather than trusted.

```sh
```

**`scape:map --stats`** is the structural check and it catches what a still cannot. a beck that stopped tracing, an island that drowned under its own falloff, a pasture that no longer fits, footpaths that collapsed to zero — every one is a single field in that block and every one is invisible in a screenshot at the default pose. if a number moved that the run did not mean to move, that is the finding, and it comes first.

**`prop:map`** is the same instrument for a mesh. a building forty metres off, at one fixed angle, under a colour grade is exactly the viewing condition that let a gable end poke through its own roof for months. if the run touched a prop builder, look at the prop — from `right`, where you can measure, not only from `iso`.

**`scape:diff`** is the visual check. `tour` is six frames — both zoom extremes, noon, night and winter — because most of this scene's historical bugs were angle- or time-dependent and invisible from the default pose. it prints a table of numbers and writes an image only for a pose that actually moved.

what the table means:

- **the poses the change was aimed at moved, and the others did not.** that is the good outcome. a change to the winter palette that also moved `noon` by eight per cent did something it did not intend, and finding that here is the whole point.
- **nothing moved at all**, on a run claiming to have added something visible, means the thing is not visible. a real failure, not a clean result.
- **`STRUCTURE MOVED`** on the `structural:` line without a deliberate reason is a regression in the world model. stop and read `scape:map` in full before going further.

`scape:shot --poses tour` alone is the fallback when there is no useful ref — a first run on a new system. it is a weaker check: it proves the scape builds and draws at six poses without errors or a lost context, and nothing about whether the change is an improvement.

if the tools cannot run at all — no chromium, a build that will not serve — say so plainly in the pull request, quote what failed, and fall back to `scape:map`, which needs nothing but bun. **do not claim it looks good without having looked.**

## 6. verify

one command, and it is all four:

```sh
bun run gate
```

it runs lint, typecheck, test and build at once and prints one four-line summary, dumping the full output only of whatever failed. the wall clock is the slowest check rather than the sum. `--sequential` if the box is small; the four scripts underneath still work on their own.

`bun run lint` runs with `--max-warnings 0`, so a warning *is* a failure rather than a thing to notice. that is the rule these documents always stated; until recently it was not the rule the command enforced.

## 7. commit and push

conventional commits, one logical change per commit:

```sh
git add -A
git commit -m "feat(scene): <what the world gained>"
git push -u origin claude/scene-enhancement-<slug>
```

retry a failed push up to four times with exponential backoff (2s, 4s, 8s, 16s) — network failures are not merge conflicts.

## 8. open the pull request

ready for review, never a draft. the body carries:

- **what the scape gained**, in a sentence someone can picture
- **how it was built** — the modules touched and why, and any decision a reviewer would otherwise have to reverse-engineer
- **cost** — draw calls added, instance counts, texture memory, and what the mobile tier does with it. only quote before/after fps or frame time when both were measured with the same command, tier and pose; otherwise state the structural budget and say the comparison was not measured
- **verification** — the four commands, plus the `scape:map --stats` block and the `scape:diff` table, quoted. embed a still only for a pose the diff actually flagged
- **follow-ups**, if the run deliberately left something for the next one

also add the entry to [`CHANGELOG.md`](CHANGELOG.md): one headline, then what it cost. newest first.

## 9. merge

the [`pr checks`](.github/workflows/pr-checks.yml) workflow runs lint, typecheck, test and build on every pull request into `main`. it is the gate.

- **all green → squash-merge into `main` and delete the branch.** deploying is automatic: [`deploy.yml`](.github/workflows/deploy.yml) builds `main` and publishes it to github pages.
- **any check red → fix it and push again.** a red run is the run's own problem, not the next one's.
- **cannot get it green → leave the pull request open, do not merge, and say in the body exactly what is failing and what was tried.** an open pull request with an honest failure note is a good outcome. a merged red branch is not, and neither is a silently abandoned one.
- **merge conflict with `main` → merge `origin/main` into the branch, resolve, re-verify, push.**

never force-push over `main`. never merge with failing checks, and never disable a check to make it pass.

---

## scheduling the run

unattended and periodic. daily is the intended cadence — it keeps each increment small and the diffs reviewable.

with the claude code routine api, from a session in this repository:

```text
create_trigger(
  name: 'scene enhancement run',
  cron_expression: '0 3 * * *',        # 03:00 utc, daily
  create_new_session_on_fire: true,
  prompt: 'read instructions.md in the repository root and carry out one scene enhancement run, end to end, through to the merge decision.'
)
```

or as a scheduled github actions workflow, if the repository carries an `ANTHROPIC_API_KEY` secret:

```yaml
name: Scene enhancement

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  enhance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: >-
            read instructions.md in the repository root and carry out one scene
            enhancement run, end to end, through to the merge decision.
```

either way the prompt stays a pointer to this file. the brief lives in the repository so that changing how the runs behave is a reviewed commit rather than an edit to a schedule nobody can see.

---

## what a good run looks like

- one theme, landed completely
- the scene is visibly richer, and still smooth on the mobile tier
- `scape:diff` moved the poses the change was aimed at, and left the rest alone
- `lint`, `typecheck`, `test`, `build` all clean
- new tuning exposed in the config and, where it belongs, the overlay
- a test that states the run's claim as a fact about the data, including waits and exit paths rather than only the moving happy path
- every larger-world extent is classified as world-sized, frame-sized or metre-sized instead of scaled by reflex
- the readme still describes the code that exists, and `agents.md` still describes the tools that exist
- a diff a person could review over coffee, merged the same day

## what a bad run looks like

- a scattering of unrelated micro-edits with no headline
- new geometry that is neither merged nor instanced
- `Math.random` anywhere in generation
- a knob that only exists as a magic number inside a module
- lint warnings suppressed instead of fixed
- a headline about something visible that `scape:diff` reports as `same` at every pose
- an effect that only exists on the ultra tier because nobody sized it for mobile
- a screenshot where an ascii render would have answered the question in a fortieth of the time
- a merged branch with red checks
