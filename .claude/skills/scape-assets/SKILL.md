---
name: scape-assets
description: The three-iso asset catalog — every prop in the roster, every shared kit helper props are built through, and every texture the scape samples — as one text table (`bun run assets`), plus where each lives, how to look at one (ascii or the `/props.html` catalog page) and how to add or change one. Use before writing a prop, a helper or a texture (it probably exists), when asked what assets exist or what they cost, or when making props more detailed, generic or reusable.
---

# scape assets

Three lists are the whole inventory. One command prints all of them, without a
gpu, in about a second:

```sh
bun run assets                    # props, kit helpers, textures
bun run assets stone roof         # rows whose name, group or file contains any word
bun run assets --props            # or --kit, --textures
bun run assets --json             # the same rows, for a script
```

| section | source of truth | a row is |
| --- | --- | --- |
| **props** | `PROPS` in `src/scene/props/index.ts` | name · `hero` / `scatter` / `unplaced` · triangles · metres · the file that builds it |
| **kit** | exported non-`build*` functions in `src/scene/props/*.ts` | helper · `file:line` — what a prop is built *through* (`stonePart`, `soften`, the timber and wall helpers, the two shared materials in `material.ts`) |
| **textures** | `TEXTURES` in `src/scene/textures/catalogue.ts` | id · built here or baked from the survey · size · owning module · purpose |

`hero` props are placed by hand and merged into one draw; `scatter` props are one
`InstancedMesh` each (`HERO_PROPS`, `SCATTER_PROPS`). Which list is a cost
decision.

## look at one

```sh
bun run prop:map barn --view front,right      # ascii, ~40 ms, no gpu
bun run prop:map barn --audit                 # palette-by-height table
bun run prop:audit                            # floating / buried / heavy, whole roster (in the gate)
bun run dev                                   # then /props.html — the catalog page
```

`/props.html` is the catalog with pixels: bare, a filterable contact sheet of the
whole roster grouped the way the scape spends it; `?prop=<name>&seed=<n>`, four
orthographic views with grid, wireframe and bounds. The main page's title card
links to it ("asset catalog →") and it links back. It is its own vite entry and
imports only the roster, so it loads when the scene itself is broken.

## change one

- **A look that belongs to a kind of thing goes in the kit, not the prop.** Run
  `bun run assets --kit` first; extend the helper every stone / board / roof is
  built through, and every island gets it. A term keyed on the albedo
  (`heathFragment`, `weatheringFragment` in `props/material.ts` and
  `props/weathering.ts`) reaches every prop with no flag.
- **A new prop:** a pure `build*(rng, palette)` returning one merged
  `BufferGeometry` in `src/scene/props/`, a row in `PROPS`, and a place in
  `HERO_PROPS` or `SCATTER_PROPS`. Deterministic: fork the seeded rng by name.
  Check it with `prop:map` and `prop:audit`; it appears in `bun run assets` and
  on `/props.html` by itself.
- **A new texture:** an entry in `TEXTURES` (the roster test in
  `catalogue.test.ts` fails on a texture constructor the catalogue has not heard
  of). A tiling map is built in the catalogue and shared; a map baked from the
  survey stays beside its data and is registered.
- Colours come from the palette (`props/palette.ts`, `config-palette.ts`), never
  a literal in a prop.
