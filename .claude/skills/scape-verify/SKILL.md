---
name: scape-verify
description: The cheapest correct way to verify a three-iso change before pushing — the light gate and the full one (and its flags), targeted `bun test`, lint, typecheck, the prop audit, structure (`scape:map --stats`) and pixel (`scape:diff`) checks, what CI runs, and what each costs on a cloud container. Use before every commit/push in this repository.
---

# verify a change

```sh
bun run gate               # light: lint (changed files) ‖ typecheck, then the tests the diff reaches, vite build, prop audit (~1–2 min)
bun run gate --full        # what CI runs: whole-repo lint ‖ typecheck, every test, `bun run build`, prop audit (~2–3 min)
bun run gate --only test   # a subset: lint, typecheck, test, build, prop:audit (comma list)
bun run gate --fix         # light, letting eslint repair the changed files first (re-read the diff)
bun run gate --base HEAD~1 # what "changed" means (default origin/main)
bun run scape:map --stats  # structure: did the world model move? (no browser, seconds)
```

One line per check; only a failure prints its output; exit 1 on any failure.

- **What the light gate reads**: `git diff --name-only <base>` — committed and
  uncommitted, **not untracked**. A brand-new file is neither linted nor seen as
  changed until it is tracked (`git add -N <file>`), or lint it by hand. A change
  to `eslint.config*`, `package.json`, `bun.lock` or `tsconfig*` lints everything.
- Tests are picked by `bun test --changed=<base>` off the import graph. A change
  to `config.ts` reaches almost everything; a change to one prop, a handful.
- Run `--full` before merging anything that changes generation (survey, layout,
  dressing, props) — CI runs it anyway, but a red CI costs a round trip.
- The gate never runs more than two processes at once; do not run it alongside
  a `scape:diff`, a `setup` prewarm or a studio scene build on a four-core box.
- `bun run gate --help` has no help: it runs the gate.

## the pieces, on their own

```sh
bun test src/scene/lens.test.ts src/scene/quality.test.ts   # named files, one process
bun test lens quality                                       # path substrings: every file matching
bun test src/scene/lens.test.ts -t 'deterministic'          # tests whose name matches
bun test --changed=origin/main --only-failures              # the light gate's test stage
bunx eslint --max-warnings 0 --fix <files>                  # then re-read what it changed
bun run lint                                                # whole repo, cached in node_modules/.cache/eslint/
bun run typecheck                                           # tsc --noEmit
bun run prop:audit                                          # floating/buried/heavy props; advisory, exits 0
```

- One survey of the default archipelago is ~12 s and is memoized per process,
  so one `bun test a b c` is far cheaper than three invocations.
- Lint is warning-clean: a warning (line ceiling 666, 40 statements, complexity
  14, depth 6, no `Math.random`/`Date.now`/`requestAnimationFrame` in `src/`) is
  a failure. Do not hand-format; let `--fix` do it.
- `prop:audit` prints notes and only fails when a prop cannot be built. CI does
  not run it; the gate does — read the notes for the props you touched.

## pixels — once, at the end

```sh
bun run scape:diff --ref origin/main --poses tour                 # table: changed % · worst 32px block · verdict
bun run scape:diff --ref origin/main --poses tour --tier desktop  # for post, lens, shadows, ground detail
bun run scape:diff --ref-only                                     # prewarm the reference side (setup fires this)
bun run scape:diff --clean                                        # drop cached .scape/ref worktrees
bun run scape:diff --help                                         # --threshold --tolerance --size --accept …
```

- Minutes: a worktree build of the ref, a build of here, 2 × poses swiftshader
  captures. A matching prewarm (same commit **and** tier, size, `--set`…) leaves only this side's half.
- Exit 1 when any pose moved past `--threshold` — on a visible change that is the
  expected answer, not a failure. Diff images land in `.scape/diff/` only for
  poses that moved; a `structural:` line compares `scape:map --json` both sides.
- Mobile (the default) has no post chain and the lite ground path: a change
  there reads **0.00% everywhere** at mobile. Diff at `--tier desktop`.
- Noise floor is 0.00% at the default tolerance: a zero means zero.
- To iterate on a picture, use the `scape-studio` skill instead.

## CI

- `.github/workflows/pr-checks.yml` (pull request to `main`): `bun install
  --frozen-lockfile`, lint, typecheck, `bun test`, `bun run build`. `gate --full`
  is the same minus the install. A dependency change without its `bun.lock`
  fails the install step.
- `.github/workflows/deploy.yml` (push to `main`): lint, build, GitHub Pages.
- Read a pull request's checks with `gh pr checks <n>`, or the GitHub MCP tools
  when `gh` is unavailable. Never merge red, never disable a check.

## a build-time optimisation must not move the world

```sh
bun run scape:bench [--tier ultra]   # survey · terrain · dressing ms, and a fingerprint of every placed instance
bun run scape:map --stats            # every structural number
```

Run both on `origin/main` and on the branch: identical fingerprint and identical
stats is the proof that a speed-up is exact. For main, a `git worktree` with
`node_modules` symlinked — `scape:diff --ref` already leaves one at
`.scape/ref/<sha12>/`. The levers that have held so far are all exact — caches
keyed on the exact inputs, bounds that skip work whose answer is already
decided, one root of a least square — and each says so in its comment. Where
the time goes: the `scape-perf` skill.
