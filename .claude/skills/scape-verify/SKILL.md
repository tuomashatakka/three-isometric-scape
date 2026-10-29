---
name: scape-verify
description: The cheapest correct way to verify a three-iso change before pushing — the light gate, the full gate, structure and pixel checks, and what each one costs on a cloud container. Use before every commit/push in this repository.
---

# verify a change

```sh
bun run gate               # light: lint of the changed files + typecheck, tests the diff reaches, vite build, prop audit (~1 min)
bun run gate --full        # what CI runs: every test, `bun run build` (~1.5 min)
bun run gate --only test   # one check
bun run scape:map --stats  # structure: did the world model move?
```

- The light gate selects tests with `bun test --changed=origin/main` (import
  graph). A change to `config.ts` reaches almost everything; a change to one
  prop reaches a handful of files.
- Run `--full` before merging anything that changes generation (survey, layout,
  dressing, props) — CI runs it anyway, but a red CI costs a round trip.
- The gate never runs more than two processes at once; do not run it alongside
  a `scape:diff` build on a small box.
- Lint is cached in `node_modules/.cache/eslint/`; fix warnings with
  `bunx eslint --fix <files>` and re-read what it changed.
- One survey of the default archipelago is ~12 s and is memoized per process,
  so a single `bun test <files>` invocation is far cheaper than several.

## a build-time optimisation must not move the world

```sh
bun run scape:bench [--tier ultra]   # survey + dressing timings, and a fingerprint of every placed instance
bun --cpu-prof scripts/scape-bench.ts  # where the time goes (read the .cpuprofile's self/inclusive times)
```

Run `scape:bench` and `scape:map --stats` on `origin/main` (a `git worktree`
with `node_modules` symlinked) and on the branch: identical fingerprint and
identical stats is the proof that a speed-up is exact. The levers that have
held so far are all exact — caches keyed on the exact inputs, bounds that skip
work whose answer is already decided, one root of a least square — and each
says so in its comment.
