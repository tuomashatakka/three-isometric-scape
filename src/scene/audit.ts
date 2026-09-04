// scene/audit.ts
// Which families of the scape the url may take away.
//
// The program audit that used to live here is `reportPrograms` in the runtime —
// reading LINK_STATUS before the first draw, and the varying census for the
// refusals a driver logs nothing about. What is left is the part that is about
// *this* scape: which families exist, and how `?skip=` names them.


/**
 * The pieces of the scape the url can take away, one at a time.
 *
 * The audit says which program the driver refused; this says whether removing
 * the thing that built it lets the scape live. A tier is a bundle of decisions
 * and cannot answer that — `?post=0` was the first crack at the idea and this
 * is the rest of it. `inject` is the interesting one: it strips every
 * `onBeforeCompile` in the scape and leaves the same meshes drawing the same
 * stock `MeshStandardMaterial` the library's own starters use, which is the
 * one configuration already known to run on the handset.
 */
export const SCAPE_FAMILIES = [
  'inject', 'detail', 'dressing', 'water', 'mist', 'clouds', 'aurora', 'nightsky', 'rain',
  'squall', 'storm', 'birds', 'beacon', 'hearth', 'windows', 'post', 'shadows',
] as const

export type ScapeFamily = typeof SCAPE_FAMILIES[number]

/** What the url asked to leave out. Empty in every ordinary run. */
export type ScapeSkips = ReadonlySet<ScapeFamily>

export const NOTHING_SKIPPED: ScapeSkips = new Set<ScapeFamily>()

function isFamily (value: string): value is ScapeFamily {
  return (SCAPE_FAMILIES as readonly string[]).includes(value)
}

/** `?skip=water,mist` — anything unrecognised is reported rather than ignored. */
export function readSkips (raw: string | null, report: (message: string) => void): ScapeSkips {
  if (!raw)
    return NOTHING_SKIPPED

  const asked   = raw.split(',').map(part => part.trim())
    .filter(Boolean)
  const skipped = new Set<ScapeFamily>()

  for (const name of asked)
    if (isFamily(name))
      skipped.add(name)
    else
      report(`?skip=${name} means nothing · try ${SCAPE_FAMILIES.join(', ')}`)

  if (skipped.size)
    report(`skipping ${[ ...skipped ].join(', ')} by the url`)

  return skipped
}
