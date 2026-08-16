# instructions

this file is the standing brief for the **scene enhancement run** — a scheduled, unattended llm session whose job is to make `three-iso` bigger and more detailed, one increment at a time, without letting the codebase rot.

it is written to be read cold. a run starts with no memory of the previous one; everything it needs to know is here, in the [readme](README.md), or in the repository itself.

## the goal

**more scape, more detail, same discipline.**

each run should leave the world measurably larger, denser, or more finely observed than it found it — a new landform, a new prop family, a new atmospheric system, a wider archipelago, a richer material response. the scene is the product. everything else in the repository exists to keep the scene cheap to change.

what the run is explicitly *allowed* to do: anything. add files, split modules, rewrite a system, retune the config, extend the build, revise the readme. there is no protected directory and no "just tweak the numbers" restriction. a run that only nudged three floats did not do its job.

what the run may **not** do is ship something that does not lint, does not typecheck, does not build, drops frames on the mobile tier, or leaves the repository harder to read than it was.

## the run, stage by stage

### 1. sync

```sh
git fetch origin main
git checkout -B claude/scene-enhancement-<slug> origin/main
bun install --frozen-lockfile
```

branch from `origin/main`, always freshly fetched. never stack a run on top of a previous run's unmerged branch — if the last pull request is still open, that is a signal to *finish* it, not to build on it.

### 2. orient

before touching anything:

- read the [readme](README.md) end to end. it is not a summary, it is the design record — most of the non-obvious decisions in this scene are explained there, and several of them are explanations of bugs that will come straight back if the reasoning is discarded.
- read [`src/scene/config.ts`](src/scene/config.ts). it is the public tuning surface and the fastest map of what the scene currently has.
- read [`src/scene/quality.ts`](src/scene/quality.ts). every new cost has to have an answer for the mobile tier.
- run `bun run scape:map` once, before changing anything. it is about sixteen milliseconds and it is the fastest picture of what the scape currently *is* — where the farm stands, where the beck runs, which islets surface. it is also the "before" the run will be judged against in stage 5.
- list open pull requests. if one is open from a previous run, drive *that* to green and merged before opening another. two enhancement branches racing on the same scene is how the merge conflicts start.
- check the recently merged runs. do not repeat the last one's theme.

### 3. pick one thing

**one theme per run.** a run is a coherent, reviewable change with a single headline, not a sweep of unrelated improvements. "seasonal colour for the vegetation" is a run. "seasonal colour, a new islet, a lighthouse, and a refactor of the mist" is four runs badly merged.

size it so the diff stays readable — roughly the scale of one existing module. if the idea is genuinely bigger than that, land the foundation this run and note the follow-up in the pull request body.

directions that fit the goal, as a starting backlog rather than a queue:

- **more world** — a second mainland across the strait, a fjord cut into the existing one, a river with a mouth, a headland, an ice sheet, a coastal road running off the map edge
- **more settlement** — a boathouse, a smokehouse, a windmill, a chapel, drying racks, a net loft, a second steading on an islet, a pier that reaches the deep water
- **more life at ground level** — lichen on the erratics, cart ruts in the track, moss on the north faces, driftwood on the beach line, footpaths worn between the buildings, laundry lines, snow fences
- **more weather** — rain and its surface response, snow accumulation by slope and aspect, a wind that actually bends the grass it already scales, fog banks that roll rather than drift, aurora on the night palette
- **more water** — a shoreline foam band that follows the swell, a river surface with flow, caustics in the shallows, reeds that displace the water they stand in
- **more time** — a seasonal axis alongside the daily clock, deriving vegetation and ground palette from it the same way dusk is derived from noon
- **more depth of field** — richer prop geometry at close zoom, an lod pass so that richness costs nothing pulled out

### 4. build it

the house rules. these are not style preferences; each one is load-bearing for either performance or determinism.

**draw calls are the budget, vertices are not.** detail is close to free — a prop with four hundred parts and a prop with forty cost the same number of draws. a *new material* or a *new mesh that is not instanced or merged* is what costs. hero props merge into the steading geometry; anything placed in quantity goes through `scatterInstances` as one `InstancedMesh`; anything that must move independently needs a reason.

**prop builders are pure.** the shape is `(rng: SeededRng, palette: NordicPalette) => BufferGeometry` — no scene, no gl context, no module state, base at `y = 0`. that purity is what makes the whole roster unit-testable headlessly, so keep it. register new props in [`src/scene/props/index.ts`](src/scene/props/index.ts) and put them in `HERO_PROPS` or `SCATTER_PROPS` deliberately.

**everything generated is deterministic.** a seed plus a coordinate always produces the same world. no `Math.random`, no `Date.now`, no iteration-order dependence in generation code — fork the seeded rng (`rng.fork(name)`) so that adding a prop does not reshuffle every prop built after it.

**new knobs go in the config, and in the overlay.** if a run adds a number worth tuning, it belongs in `SCAPE_CONFIG` in [`src/scene/config.ts`](src/scene/config.ts) and, if it is visual, as a dotted path in [`src/ui/scape-controls.ts`](src/ui/scape-controls.ts) — which makes it persist and reset for free. read it per frame in the module's `update`; do not capture it at build time, or the overlay and the scene will drift apart.

**there is no `enabled` flag.** an effect is off when its strength is zero. do not add booleans that duplicate a number that already exists.

**anything that moves needs a speed that can reach zero.** the capture tools stop the scape by writing `0` to every speed in the config — `daylight.speed`, `season.speed`, `wind.strength`, `look.grain`, `atmosphere.cloudSpeed` and the rest. a new system whose animation is driven by a hard-coded rate rather than by a config knob cannot be stopped, which means it cannot be captured, which means it silently poisons every visual diff taken after it lands. if a run adds motion, it adds the knob that stops it, and it adds that knob to `STILL` in [`scripts/scape-shot.ts`](scripts/scape-shot.ts).

**every tier still has to run.** new cost is gated on `AtmosphereQuality`, and the mobile preset is the one that has to be defended. if a system cannot be made cheap, give it a tier gate and a graceful absence — not a lower-quality version that looks broken.

**lifecycle discipline.** generation in `build`, animation in `update`, viewport work in `resize`, teardown in `dispose`. `createApp` owns the only render loop — never add a `requestAnimationFrame`. anything allocated on the gpu (geometry, material, texture, render target, pass) is released in `dispose`, including the things a new system allocates on behalf of an old one.

**follow the lint config.** the repository uses [`@tuomashatakka/eslint-config`](https://www.npmjs.com/package/@tuomashatakka/eslint-config): no semicolons, single quotes, two-space indent, value-aligned object keys, stroustrup braces, spaces inside braces and brackets, two blank lines after the import block. do not hand-format against it — write the code and let

```sh
bunx eslint . --fix
```

settle the formatting, then read the diff it produced. `bun run lint` must be clean, warnings included.

**keep the codebase clean.** a module that grows past roughly four hundred lines wants splitting the way `landscape/` and `props/` already were. name things the way the neighbouring code names things. comment the decisions that are not obvious from the code — why an angle is clamped, why a threshold sits where it does — and not the ones that are. dead code, commented-out experiments, and `any` do not ship.

**dependencies are a last resort.** `three` and `threejs-scene` are the runtime, and the scene is built from primitives on purpose. adding a package needs a real justification in the pull request body; adding one to avoid writing forty lines of geometry does not qualify.

**tests come with the change.** new pure builders get a determinism test in the neighbouring `*.test.ts` — attributes present, base at zero, bounds sane, byte-for-byte stable per seed. new pure maths (a sampler, a curve, a palette derivation) gets the same treatment. rendering code is not unit-tested here; keep the logic that *can* be tested out of the parts that cannot.

**update the readme.** it documents the scene's systems and the reasoning behind them, and it has a project map that has to stay true. if the run added a system, the readme gains a section on it; if the run added a file, the map gains a line. a readme that lies is worse than no readme.

### 5. verify

all four, in this order, all clean:

```sh
bun run lint
bun run typecheck
bun test
bun run build
```

**then look at it.** the run is unattended, so "open the scape and see" is not available — these are what it looks with instead, and they are not optional. see [debugging the scape](README.md#debugging-the-scape) for what each one does.

```sh
bun run scape:map --stats                            # is the world still a world?
bun run scape:diff --ref origin/main --poses tour    # what did the change do to the picture?
```

read them in that order, because they answer different questions and the first is nearly free.

**`scape:map --stats`** is the structural check, and it catches the failures a still cannot. a beck that stopped tracing, an island that drowned under its own falloff, a pasture that no longer fits, footpaths that collapsed to zero, an isle that sank — every one of those is a single field in that block, and every one of them is invisible in a screenshot at the default pose. if a number moved that the run did not mean to move, that is the finding, and it comes before anything else.

**`scape:diff --ref origin/main --poses tour`** is the visual check. `tour` is the six frames this stage has always asked for — both zoom extremes, noon, night and winter — because most of this scene's historical bugs were angle- or time-dependent and invisible from the default pose. it prints a table of numbers and writes an image only for a pose that actually moved, so the run reads a few lines and opens at most one picture.

what the table means:

- **the poses the change was supposed to touch moved, and the others did not.** that is the good outcome. a change to the winter palette that also moved `noon` by eight per cent is a change that did something it did not intend, and finding that here is the whole point.
- **nothing moved at all** on a run that claims to have added something visible means the thing is not visible. that is a real failure, not a clean result.
- **`STRUCTURE MOVED`** on the `structural:` line without a deliberate reason is a regression in the world model. stop and read `scape:map` in full before going any further.

`scape:shot --poses tour` on its own is the fallback when there is no useful ref to compare against — a first run on a new system, say. it is a weaker check: it proves the scape builds and draws at six poses without errors or a lost context, and proves nothing about whether the change is an improvement.

if the tools themselves cannot run — no chromium on the machine, a build that will not serve — say so plainly in the pull request, quote what failed, and fall back to `scape:map`, which needs nothing but bun. do not claim it looks good without having looked.

### 6. commit and push

conventional commits, one logical change per commit:

```sh
git add -A
git commit -m "feat(scene): <what the world gained>"
git push -u origin claude/scene-enhancement-<slug>
```

retry a failed push up to four times with exponential backoff (2s, 4s, 8s, 16s) — network failures are not merge conflicts.

### 7. open the pull request

ready for review, never a draft. the body carries:

- **what the scape gained**, in a sentence someone can picture
- **how it was built** — the modules touched and why, and any decision that a reviewer would otherwise have to reverse-engineer
- **cost** — draw calls added, instance counts, texture memory, and what the mobile tier does with it
- **verification** — the four commands, plus the `scape:map --stats` block and the `scape:diff` table, quoted. embed a still only for a pose the diff actually flagged
- **follow-ups**, if the run deliberately left something for the next one

### 8. merge

the [`pr checks`](.github/workflows/pr-checks.yml) workflow runs lint, typecheck, test and build on every pull request into `main`. it is the gate.

- **all checks green → squash-merge into `main` and delete the branch.** deploying is automatic from there: [`deploy.yml`](.github/workflows/deploy.yml) builds `main` and publishes it to github pages.
- **any check red → fix it and push again.** a red run is the run's own problem, not the next one's. iterate until green.
- **cannot get it green → leave the pull request open, do not merge, and say in the body exactly what is failing and what was tried.** an open pull request with an honest failure note is a good outcome. a merged red branch is not, and neither is a silently abandoned one.
- **merge conflict with `main` → merge `origin/main` into the branch, resolve, re-verify, push.**

never force-push over `main`. never merge with failing checks, and never disable a check to make it pass.

## scheduling the run

the run is unattended and periodic. daily is the intended cadence — it keeps each increment small and the diffs reviewable.

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

## what a good run looks like

- one theme, landed completely
- the scene is visibly richer, and still smooth on the mobile tier
- `scape:diff` moved the poses the change was aimed at, and left the rest alone
- `lint`, `typecheck`, `test`, `build` all clean
- new tuning exposed in the config and the overlay
- the readme still describes the code that exists
- a diff a person could review over coffee, merged the same day

## what a bad run looks like

- a scattering of unrelated micro-edits with no headline
- new geometry that is neither merged nor instanced
- `Math.random` anywhere in generation
- a knob that only exists as a magic number inside a module
- lint warnings suppressed instead of fixed
- a headline about something visible that `scape:diff` reports as `same` at every pose
- an effect that only exists on the ultra tier because nobody sized it for mobile
- a merged branch with red checks
