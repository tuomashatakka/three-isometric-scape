---
name: scape-studio
description: Look at the three-iso scape from a warm, long-lived headless browser — photograph poses in seconds instead of minutes, move the camera/hour/season/any knob live, hide meshes, probe what paints a pixel, and read a per-mesh triangle and draw census. Use whenever a run needs to see the scene, debug a visual, or check what a change did to the picture.
---

# scape studio

One chromium page, kept open in the background, serving the scape through vite's
dev server (:4175) and driven through the page's `?bridge` remote
(`src/bridge.ts`). The first look costs one scene build (~60 s under
swiftshader); every look after that is a few frames (~5–15 s). The page reloads
itself when a source file changes, so edit → look → edit needs no restart.

## start it once per session

```sh
bun run studio serve          # run with run_in_background; prints "studio ready on :4199 (vite :4175, swiftshader)"
bun run studio serve --gpu    # real adapter: faster, noisy — never for anything you will compare
bun run studio status         # is it up? which tier is the page on?
bun run studio stop
```

Wait for `studio ready` before the first look. A client call with no daemon exits
2 with `no studio on :4199`. `SCAPE_STUDIO_PORT` moves the control port. A change
to `scripts/scape-studio.ts` itself needs `stop` and `serve` again; a change
under `src/` reloads by itself.

## look

```sh
bun run studio shot --poses tour                       # default near far noon night winter
bun run studio shot --poses near,noon                  # comma list: names out of the tour
bun run studio shot --poses chapel                     # any named set in scripts/scape-poses*.ts (an unknown name shoots the default pose)
bun run studio shot --zoom 12 --time 0.5 --set camera.focusX=-12 --set camera.focusZ=11 --name yard
bun run studio shot --rot 135 --season 0.95 --name winter-lee      # yaw, and the year 0..1
bun run studio shot --set weather.time=0 --set wind.strength=0.6 --name clear-wind
bun run studio shot --set archipelago.worldSize=1800 --rebuild --name wider   # build-time knob
bun run studio shot --set runtime.effects=all --rebuild --name all            # every effect on the pinned tier
bun run studio shot --tier desktop --name desk          # reopens the page at that tier (sticky)
bun run studio shot --frames 12 --name settled          # frames drawn before the shutter (default 4)
bun run studio shot --poses near --census               # picture + top 12 meshes by triangles
bun run studio census                                   # top 40 of whatever is on screen now
bun run studio shot --hide sun-shafts,cloud- --name bare  # the same look without those meshes
bun run studio probe 0.5 0.2                            # meshes under that point of the last look
bun run studio eval "scape.read('season.time')"         # any expression in the page, `scape` is the bridge
bun run studio eval "scape.find('far-shore').geometry.attributes.color.count"
```

Output per pose: `name  secs  draws N  tris X.XXM  err N  -> .scape/studio/<name>.png`.
A non-zero `err` lists the page's console errors under it.

## the bridge (`window.scape`, what `eval` has in scope)

| call | does |
| --- | --- |
| `write(path, value)` / `read(path)` | a dotted config leaf, the same path the panel and `--set` use |
| `reset()` | every leaf back to the opening config; un-hides. Every `shot` calls it first |
| `rebuild()` | rebuild the scene in place (build-time knobs), no bundle reload |
| `hide(names)` | hide every object whose name *contains* one of these (layer mask); returns the count |
| `probe(x, y)` | named meshes under a canvas point (0..1 from top left), nearest first, max 8 |
| `find(name)` | first object whose name contains `name` — read one field off it |
| `census(limit)` | `{ name, kind, draws, triangles, instances }` rows, biggest first; points, lines, sprites included |
| `info()` | the renderer's counters for the last whole frame: `calls triangles programs geometries textures` |
| `drawn()` | frames drawn since this mount |

`eval` returns JSON: end the expression on a number, string or plain object, never
on a mesh. It runs in the same queue as looks, against the state the last look left.

## what paints that?

`probe` the point (names, nearest first), then `--hide` the suspects one shot at a
time — far cheaper than reasoning from pixels. When the culprit is a *shader term*
rather than a mesh, zero its knob instead (`--set atmosphere.cloudShadow=0`,
`terrain.detailGrain=0`, `terrain.detailMacro=0`, `look.lens=0`): one shot per
suspect. Hidden meshes come back on the next look.

## traps

- **Every look starts from the page's opening config** (`STILL` applied, clocks
  stopped), then applies the pose and `--set`s — poses never inherit each other.
- **`--rebuild` leaves its build behind.** The next look resets the *config* but
  not the built scene, so it photographs the wider world under default knobs.
  Give the next look `--rebuild` too, or `--tier` to reopen the page.
- **`--tier` is sticky**: the page stays at that tier until another `--tier`
  (a pose that names a tier, like the `wheel` set, moves it too). `status` says
  which one it is on.
- **The default tier is mobile**: no post chain (no lens, bloom, grain), the
  one-tap ground path, no shadows. A change to `post.ts`, `lens.ts`, ground
  detail or shadows is invisible there — look with `--tier desktop`, or with
  `--set runtime.effects=all --rebuild` to put it on the mobile build.
- **Captures are named by pose and overwrite.** `--poses tour` before and after a
  change writes the same six files; `cp -r .scape/studio .scape/studio-before`
  first, or give the before look `--name`s.
- Live knobs (camera incl. `camera.focusX/focusZ/viewSize/rotation`,
  `daylight.time`, `season.time`, weather, wind, `look.*`, anything read per frame)
  need nothing extra. Build-time knobs (`archipelago.*`, `layout.*`, `dressing.*`,
  `lod.tile`, `runtime.effects`, a prop's shape) need `--rebuild`.
- The studio has **no `--skip`, `--size`, `--post`, `--aa`** — those are url
  flags of `scape:shot`, and a pose's own `skip` is ignored here too. `--hide`
  stands in for `--skip`.
- A look on a page that threw before it was ready (a shader template that throws
  at import, a bad export) fails at once with `page error: …`. Fix the source
  and look again; the page reloads by itself.
- Read the png only when the numbers are not enough; one image costs far more
  tokens than the census line.
- The default pose is the whole archipelago (`camera.viewSize` 1400) mid-shower.
  At ground level: `--zoom 8..20`, `camera.focusX/Z`, a clear sky
  (`weather.time=0`), a daylight hour (`--time 0.45`). `scape:map --stats` gives a
  site's coordinates (home sites are world metres; other islands add their
  `@ (x,z)` origin).

## when to use the other instruments instead

- `bun run scape:map --stats` — structure, no browser, seconds. Always first.
- what the census *means* for cost, and the levers — the `scape-perf` skill.
- `bun run scape:diff --ref origin/main --poses tour` — the pixel table against
  main; the `scape-verify` skill. Slow (two builds): once, at the end.
- `bun run scape:shot` — a cold still (~90 s a pose) when the studio cannot do
  it: `--size`, `--skip`, `--dist dist`, `--post`, `--aa`. `--help` lists every set.
- `bun run prop:map <name> --view front,right` — one prop's mesh, ascii, 40 ms.
- every other tool — the `scape-tools` skill.
