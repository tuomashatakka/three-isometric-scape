import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cyl, mergeParts, part, spread } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * The pier, built in world space along the line the survey solved.
 *
 * Not a roster prop, and it cannot be one. Every builder in `props/index.ts` is
 * a pure `(rng, palette)` factory whose result is a fixed shape standing on
 * `y = 0`, and a pier is neither: its length is whatever the shelf gave it and
 * every pile is cut to the bed under that particular bent. So it takes the same
 * shape `buildFenceRun` and `buildStoneWallRun` already took — a parametric run
 * handed straight to the dressing's merged hero draw, costing no draw call of
 * its own and carrying its own world coordinates.
 *
 * The long axis is the line from root to head. Deck at `deck`, level for the
 * whole run, because that is what makes a trestle read as a trestle: piles of
 * one length following the bottom down would be a ramp into the sea.
 */

/** One pair of piles, and the bed they are driven into. */
export interface PierBentPoint {
  x: number
  z: number

  /** Bed height under the bent, in metres. */
  bed: number
}

export interface PierRunOptions {

  /** Every bent, in world metres, root first and head last. */
  bents: readonly PierBentPoint[]

  /** World height of the deck, in metres. */
  deck: number

  /** The bearing the run is carried out on, in radians. */
  angle: number

  /** Width of the deck, in metres. */
  width: number

  /** Deck boards per metre of run — the tier's handle. See `quality.pierBoards`. */
  boards: number

  rng:     SeededRng
  palette: NordicPalette
}

/**
 * How far a pile is driven past the bed it stands in, in metres.
 *
 * A pile is driven, not stood: the timber goes on down into whatever the bottom
 * is made of. Half a metre is enough that the bed can be a facet or two out from
 * where the survey sampled it — the drawn terrain is tessellated per tier, and
 * the survey's height field is not — without a pile ending in open water above
 * it. That failure mode is invisible in a still and obvious in motion.
 */
const EMBED = 0.5

/** How far the piles stand out from the deck's centreline, as a share of its width. */
const GAUGE = 0.38

/** How far a bollard stands over the deck, in metres. */
const BOLLARD = 0.62

/**
 * Width of the deck, in metres.
 *
 * Wider than the jetty's 1.8 and for a reason a reviewer would otherwise have to
 * guess at: a jetty is walked along and a pier is *worked* on, so two people
 * pass on it with a creel between them. It is a constant rather than a config
 * knob because nothing about the scape wants it turned — it is the one number
 * here that is a fact about a plank and a pair of shoulders rather than about
 * this coast.
 */
export const PIER_WIDTH = 2.4

/**
 * The yaw that points a part's local `+z` along a bearing.
 *
 * The same quarter turn `layout.yawAlong` is, written out here rather than
 * imported: `props/` is the layer `landscape/` is built on top of, and a
 * geometry module reaching back up into the survey for one line of trigonometry
 * is the import that eventually makes the two impossible to test apart.
 */
const yawAlong = (bearing: number): number => Math.PI / 2 - bearing


/** The bents: two driven piles and the cap beam that ties them together. */
function trestle (
  parts:   BufferGeometry[],
  options: PierRunOptions,
  across:  number,
): void {
  const { bents, deck, angle, width, rng, palette } = options
  const cos                                         = Math.cos(across)
  const sin                                         = Math.sin(across)
  const gauge                                       = width * GAUGE
  const yaw                                         = yawAlong(angle)

  for (const bent of bents) {
    const rise = deck - bent.bed + EMBED

    for (const side of [ -1, 1 ])
      parts.push(part(cyl(0.15, 0.19, rise, 6), {
        at:     [ bent.x + cos * gauge * side, bent.bed - EMBED + rise / 2, bent.z + sin * gauge * side ],
        color:  palette.tarWood,
        jitter: 0.11,
        rng,
      }))

    parts.push(part(box(gauge * 2 + 0.42, 0.2, 0.24), {
      at:     [ bent.x, deck - 0.22, bent.z ],
      rotate: [ 0, yaw, 0 ],
      color:  palette.woodDark,
      jitter: 0.09,
      rng,
    }))
  }
}

/**
 * The head: a bollard on each side, and the ladder down to the water.
 *
 * The whole reason the pier is longer than the jetty is that a boat comes
 * alongside here rather than being pulled up a bank, so the head has to say so.
 * Two bollards to take a line and a ladder over the edge are the smallest pair
 * of details that do — and the ladder is what gives the deck a readable height
 * over the water at the near zoom, where the trestle is otherwise a plank.
 */
function head (
  parts:   BufferGeometry[],
  options: PierRunOptions,
  across:  number,
): void {
  const { bents, deck, angle, width, rng, palette } = options
  const last                                        = bents[bents.length - 1]

  if (!last)
    return

  const cos   = Math.cos(across)
  const sin   = Math.sin(across)
  const gauge = width * GAUGE
  const yaw   = yawAlong(angle)

  for (const side of [ -1, 1 ]) {
    parts.push(part(cyl(0.13, 0.15, BOLLARD, 7), {
      at:     [ last.x + cos * gauge * side, deck + BOLLARD / 2, last.z + sin * gauge * side ],
      color:  palette.tarWood,
      jitter: 0.1,
      rng,
    }))
    parts.push(part(box(0.34, 0.1, 0.2), {
      at:     [ last.x + cos * gauge * side, deck + BOLLARD, last.z + sin * gauge * side ],
      rotate: [ 0, yaw, 0 ],
      color:  palette.woodDark,
      jitter: 0.08,
      rng,
    }))
  }

  const drop = Math.max(deck - last.bed, 1.2)
  const rail = width * 0.5 + 0.12

  for (const side of [ -0.22, 0.22 ])
    parts.push(part(box(0.09, drop, 0.09), {
      at:    [ last.x + cos * rail + sin * side, deck - drop / 2, last.z + sin * rail - cos * side ],
      color: palette.wood,
      rng,
    }))

  // Turned by the run's own bearing rather than by `yaw`, and this is the one
  // place in the module where that distinction bites: a rung spans between the
  // two rails, which are offset *along* the pier, so a rung squared to the deck
  // like every beam above it would stick straight out over the water instead.
  for (const y of spread(Math.max(2, Math.round(drop * 2.2)), drop - 0.3))
    parts.push(part(box(0.62, 0.07, 0.07), {
      at:     [ last.x + cos * rail, deck - 0.2 + y - (drop - 0.3) / 2, last.z + sin * rail ],
      rotate: [ 0, yawAlong(across), 0 ],
      color:  palette.woodLight,
      jitter: 0.12,
      rng,
    }))
}


/**
 * One pier, as a single geometry in world space.
 *
 * The stringers run the whole length in one box each rather than bay by bay,
 * because a pier is read end-on more often than side-on and a continuous edge is
 * what stops the deck reading as a row of separate rafts. The boards are the
 * only thing here whose count moves with the tier — see {@link PierRunOptions.boards}.
 */
export function buildPierRun (options: PierRunOptions): BufferGeometry {
  const { bents, deck, angle, width, boards, rng, palette } = options
  const root                                                = bents[0]
  const last                                                = bents[bents.length - 1]

  if (!root || !last || bents.length < 2)
    throw new Error('a pier run needs a root and a head')

  const parts: BufferGeometry[] = []
  const across                  = angle + Math.PI / 2
  const run                     = Math.hypot(last.x - root.x, last.z - root.z)
  const midX                    = (root.x + last.x) / 2
  const midZ                    = (root.z + last.z) / 2
  const cos                     = Math.cos(across)
  const sin                     = Math.sin(across)
  const gauge                   = width * GAUGE
  const yaw                     = yawAlong(angle)

  trestle(parts, options, across)

  for (const side of [ -1, 1 ])
    parts.push(part(box(0.16, 0.18, run), {
      at:     [ midX + cos * gauge * side, deck - 0.11, midZ + sin * gauge * side ],
      rotate: [ 0, yaw, 0 ],
      color:  palette.woodDark,
      jitter: 0.07,
      rng,
    }))

  const count = Math.max(2, Math.round(run * boards))
  const pitch = run / count

  for (const along of spread(count, run - pitch))
    parts.push(part(box(width, 0.09, pitch * 0.84), {
      at:     [ midX + Math.cos(angle) * along, deck, midZ + Math.sin(angle) * along ],
      rotate: [ 0, yaw, 0 ],
      color:  palette.plank,
      jitter: 0.14,
      rng,
    }))

  head(parts, options, across)

  return mergeParts(parts, { grime: 2.2, grimeFloor: 0.42 })
}
