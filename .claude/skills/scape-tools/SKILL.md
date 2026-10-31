---
name: scape-tools
description: Index of every three-iso dev tool — command, when to reach for it, what it costs, and which skill or agents.md section has the detail — plus the traps of running them on a small cloud box. Use when unsure which instrument answers a question, before running an unfamiliar script, or for the tools the other scape skills do not cover (setup, brief, api digest, scape:map, prop:map, prop viewer, scape:shot, url overrides).
---

# the instruments

Cheapest first. Almost nothing needs a browser: world, props and palette are
pure typescript, so ascii and numbers come before pictures.

| command | reach for it when | cost | detail |
| --- | --- | --- | --- |
| `bun run setup [--ref r] [--no-prewarm]` | start of a run: install from lockfile, chromium check, api-digest check, then `brief` | install + **a detached `scape:diff --ref-only` build and capture** | agents.md, `bun run brief` |
| `bun run brief [--sections inventory,themes,api,prs,map,readme] [--themes 12] [--out f]` | where am i, which themes are done, which readme section to read | ~2 s, never fails | agents.md, `bun run brief` |
| `threejs-scene-api.md` · `node_modules/threejs-scene/llms.txt` | does the runtime already do this · its exact signature | one read | agents.md, `threejs-scene-api.md` |
| `bun run api:digest --check` | is the digest stale against the installed runtime | ~1 s | agents.md |
| `bun run scape:map [--stats\|--json] [--window x,z,size] [--layers …] [--seed n] [--set a.b=1]` | did the composition survive; where is a site; structure before/after every change | seconds, no browser | agents.md, `scape:map` |
| `bun run prop:map <name> [--view front,right] [--audit] [--all --cols 48] [--list]` · `prop:watch` | what one prop's mesh looks like; which palette entry is where | ~40 ms | agents.md, `prop:map` |
| `bun run prop:audit` | floating / buried / heavy props (in the gate) | <1 s, advisory | `scape-verify` |
| `bun run dev` → `/props.html[?prop=name&seed=n]` | a person looking at the roster or one prop in four views | one gpu context, :4174 | agents.md, `/props.html` |
| `bun run studio serve` · `shot` · `census` · `probe` · `eval` | see the scene, move any knob, find what paints a pixel | ~60 s once, ~5–15 s a look | `scape-studio` |
| `bun run studio … --census` · `scape:bench` · `bun --cpu-prof-md` | what a frame or the first load costs, and where | seconds | `scape-perf` |
| `bun run scape:shot [--poses set] [--tier] [--size] [--skip] [--dist dist] [--post] [--aa]` | a cold still when the studio cannot: no daemon, a built bundle, url-only flags | ~90 s a pose | agents.md, `scape:shot`; `--help` |
| `bun run gate [--full\|--only x\|--fix\|--base r]` | before every commit/push | 1–3 min | `scape-verify` |
| `bun test <files> [-t pattern]` · `lint` · `typecheck` · `build` | one check, targeted | seconds to ~2 min | `scape-verify` |
| `bun run scape:diff --ref origin/main --poses tour [--tier desktop]` | the pixel table against main, once at the end | minutes, two builds | `scape-verify` |
| url `?tier ?post ?effects=all ?set ?skip ?debug ?audit ?aa ?ratio` | the running page on a device; what `scape:shot` drives | — | agents.md, url overrides |
| `.github/workflows/pr-checks.yml` · `deploy.yml` | what CI runs on a pull request / on `main` | — | `scape-verify` |

## traps

- **No two heavy things at once on four cores.** `setup`'s prewarm, `scape:diff`,
  `gate`, `scape:shot` and the studio's scene build each want most of the box;
  the prewarm keeps running in the background after `setup` returns.
- **Not every script has `--help`.** `scape:shot`, `scape:diff`, `scape:map`,
  `prop:map` do; `studio` prints usage for an unknown command. `gate`, `setup`,
  `brief` and `scape:bench` ignore it and **run**; `api:digest` without
  `--check` **rewrites** the committed `threejs-scene-api.md`.
- **Everything visual defaults to the mobile tier**: no post chain, no shadows,
  the lite ground path. A change there needs `--tier desktop` or
  `--set runtime.effects=all` (studio: plus `--rebuild`).
- **A comma list of poses** (`--poses near,noon`) only finds names in `tour`;
  any other set is named whole (`--poses chapel`). A name found in neither is
  **not an error**: it photographs the default pose under that name.
- **Ports**: dev / `scape:shot` 4174, studio vite 4175, studio control 4199
  (`SCAPE_STUDIO_PORT`), `scape:diff` 4186–4187. A vite already on 4174/4175 is
  reused, never stopped.
- **Env**: `PLAYWRIGHT_CHROMIUM` (a chromium path), `PLAYWRIGHT_BROWSERS_PATH`,
  `SCAPE_READY_BUDGET` (ms a `scape:shot` page may take to come ready). No
  chromium: `bunx playwright install chromium`, or judge with `scape:map` and
  say so in the pull request.
- **`.scape/` is every artefact and is gitignored**: `shots/`, `studio/`,
  `baseline/`, `ref/` (cached worktrees), `ref-shots/`, `diff/`, `prof/`.
- The long form of every flag, and the traps that have already cost time, are
  in `agents.md`; read the one section you need, not the file.
