---
name: scape-studio
description: Look at the three-iso scape from a warm, long-lived headless browser — photograph poses in seconds instead of minutes, move the camera/hour/season/any knob live, and read a per-mesh triangle and draw census. Use whenever a run needs to see the scene, debug a visual, or check what a change did to the picture.
---

# scape studio

One chromium page, kept open in the background, serving the scape through vite's
dev server and driven through the page's `?bridge` remote (`src/bridge.ts`).
The first look costs one scene build (~60 s under swiftshader); every look after
that is a few frames (~5–15 s). The page reloads itself when a source file
changes, so edit → look → edit needs no restart.

## start it once per session

```sh
bun run studio serve          # run with run_in_background; prints "studio ready on :4199"
bun run studio status         # is it up?
```

Wait for `studio ready` in its output before the first look. Stop with
`bun run studio stop` (or let the session end).

## look

```sh
bun run studio shot --poses tour                       # the six standard poses
bun run studio shot --poses near                       # one pose out of the tour
bun run studio shot --zoom 12 --time 0.5 --set camera.focusX=-12 --set camera.focusZ=11 --name yard
bun run studio shot --set weather.time=0 --set wind.strength=0.6 --name clear-wind
bun run studio shot --set archipelago.worldSize=1800 --rebuild --name wider   # build-time knob
bun run studio shot --tier desktop --name desk          # reopens the page at that tier
bun run studio shot --poses near --census               # picture + where the triangles go
bun run studio census                                   # census of whatever is on screen now
bun run studio shot --hide sun-shafts,cloud- --name bare  # the same look without those meshes
bun run studio probe 0.5 0.2                            # the meshes under that point of the last look
bun run studio eval "scape.read('season.time')"         # any expression in the page, `scape` is the bridge
bun run studio eval "scape.find('far-shore').geometry.attributes.color.count"  # a mesh's own state
```

**What paints that?** `probe` the point (names, nearest first), then `--hide`
the suspects one shot at a time — far cheaper than reasoning from pixels. When the culprit is a *shader term*
rather than a mesh, zero its knob instead (`--set atmosphere.cloudShadow=0`,
`terrain.detailGrain=0`, `terrain.detailMacro=0`): one shot per suspect. Hidden
meshes come back on the next look. A change to `scripts/scape-studio.ts` itself
needs `studio stop` and `serve` again; a change under `src/` reloads by itself.

- A look on a page that threw before it was ready (a shader template that
  throws at import, a bad export) fails at once with `page error: …`. Fix the
  source and look again; the page reloads by itself.
- Captures land in `.scape/studio/<name>.png`. Read the png only when the numbers
  are not enough; one image costs far more tokens than the census line.
- Every look starts from the page's opening config (`STILL` applied, clocks
  stopped), then applies the pose and `--set`s — poses never inherit each other.
- Live knobs (camera, `daylight.time`, `season.time`, weather, wind, anything
  read per frame) need nothing extra. Build-time knobs (`archipelago.*`,
  `layout.*`, `dressing.*`, `lod.tile`, a prop's shape) need `--rebuild`.
- The default pose is the whole archipelago (`camera.viewSize` 1400) mid-shower.
  To see something at ground level, set `--zoom 8..20`, `camera.focusX/Z`, a
  clear sky (`weather.time=0`) and a daylight hour (`--time 0.45`).
- `scape:map --stats` gives a site's coordinates (home island sites are in world
  metres already; other islands add their `@ (x,z)` origin).

## when to use the other instruments instead

- `bun run scape:map --stats` — structure (no browser, ~20 s). Always first.
- `bun run scape:diff --ref origin/main --poses tour` — the pixel table against
  main. Slow (two builds); run it once at the end of a run, not to iterate.
- `bun run prop:map <name> --view front,right` — one prop's mesh, ascii.
