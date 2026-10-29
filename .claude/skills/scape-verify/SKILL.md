---
name: scape-verify
description: The cheapest correct way to verify a three-iso change before pushing — the light gate, the full gate, structure and pixel checks, and what each one costs on a cloud container. Use before every commit/push in this repository.
---

# verify a change

```sh
bun run gate               # light: lint+typecheck, tests the diff reaches, vite build, prop audit (~1–2 min)
bun run gate --full        # what CI runs: every test, `bun run build` (~3–4 min)
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
