import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * The rack the catch dries on, and the catch hanging off it.
 *
 * Two builders that share a file because they share a structure and nothing
 * else: the frame is a parametric *run* in world coordinates, built once per
 * island out of whatever line the survey found, and the fish is a single pure
 * prop stamped a few hundred times through one `InstancedMesh`. They are in the
 * same file for the reason the pier's bents and its deck are — one subject, one
 * set of offsets, and two places to keep those offsets in step is one too many.
 *
 * The fish hangs from `y = 0` rather than standing on it, which makes it the one
 * thing in the roster that is not based on the ground. That is not an exception
 * to the convention so much as the same convention read from the other end: a
 * prop is placed where it meets whatever carries it, and what carries a
 * stockfish is a pole. So the origin is the *rail*, the fold of the nape
 * straddles it — which is the only part of the fish above `y = 0`, and what
 * keeps the roster's `max.y` rule true of this prop as of every other — and the
 * two halves fall away below.
 */

/** How far the feet of a trestle splay either side of the line, in metres. */
const SPLAY = 0.52

/** Thickness of a leg at the head and at the foot, in metres. */
const LEG_HEAD = 0.055
const LEG_FOOT = 0.075

/** How far a leg is driven into the ground, in metres. */
const EMBED = 0.35

/** How far a leg leans in over its own foot, in degrees. */
const LEAN = 7

export interface HjellRunStation {

  /** Where the trestle stands, in world metres. */
  x: number
  z: number

  /** Ground height under its feet, in metres. */
  level: number
}

export interface HjellRunOptions {

  /** Every trestle, in world metres, windward end first. */
  stations: readonly HjellRunStation[]

  /** The bearing the run is carried along, in radians. */
  angle: number

  /**
   * World height of the top rail, in metres.
   *
   * The survey's own `deck`, passed in rather than derived here. The rails are
   * level and the legs are cut to reach them, which is what a rack on a slope
   * actually is — see `landscape/hjell.ts`.
   */
  deck: number

  /** Metres from the highest ground under the run to the top rail. */
  height: number

  /**
   * Where the lower rail sits, as a share of {@link height}.
   *
   * Passed in rather than declared here, and it is the one number in this file
   * that is somebody else's. `landscape/hjell.ts` hangs the lower row of fish
   * from it, and a rail at two heights is a row of cod growing out of the air
   * beside it — a failure invisible in any still but a side-on one.
   */
  lower: number

  /**
   * How far out from the run's centreline each rail lies, in metres.
   *
   * The survey's own `HJELL_BEARER`, passed in for the reason {@link lower} is:
   * the catch is hung on these poles, and a rail the planner cannot find is a
   * row of cod hanging in the air beside it.
   */
  bearer: number

  rng:     SeededRng
  palette: NordicPalette
}

/** One trestle: two legs leaning in over a splayed pair of feet, and their tie. */
function trestle (
  parts:   BufferGeometry[],
  options: HjellRunOptions,
  station: HjellRunStation,
  across:  number,
): void {
  const { deck, height, rng, palette } = options
  const cos                            = Math.cos(across)
  const sin                            = Math.sin(across)

  // Cut to reach the rail from wherever this foot landed, which is why a run can
  // cross a bank at all: downhill trestles are longer, the rails stay level, and
  // `hjell.fall` is the cap on how much extra timber that costs.
  const stand                          = deck - station.level + EMBED

  for (const side of [ -1, 1 ])
    parts.push(part(cyl(LEG_HEAD, LEG_FOOT, stand, 6), {
      at: [ station.x + cos * SPLAY * side,
        station.level - EMBED + stand / 2,
        station.z + sin * SPLAY * side ],
      // Toward its partner, whichever way across the run that is: a tilt about
      // x carries the head toward -z and a tilt about z carries it toward -x,
      // so the two terms together lean the leg back along `across` itself.
      rotate: [ deg(sin * side * LEAN), 0, deg(cos * side * LEAN) ],
      color:  palette.tarWood,
      jitter: 0.11,
      rng,
    }))

  parts.push(part(box(0.06, 0.06, SPLAY * 2.1), {
    at:     [ station.x, station.level + height * 0.3, station.z ],
    rotate: [ 0, Math.PI / 2 - across, 0 ],
    color:  palette.woodDark,
    jitter: 0.1,
    rng,
  }))
}

/**
 * The whole run of drying racks on one island, as one merged geometry.
 *
 * Built rather than plopped, and world-space rather than local, for the pier's
 * reason: the line came from the ground the survey found and every leg was cut
 * to the level under its own foot, so there is no fixed shape to stamp. It
 * lands in the steading's one merged hero draw, which is why a coast full of
 * racks costs no draw call on any tier.
 *
 * The rails run the whole length in one piece rather than bay by bay. A real
 * hjell is built of poles a bay and a half long, lapped over the trestles — but
 * a lap is two centimetres of timber seen from forty metres, and a join is the
 * one place a run can open a gap that a still will show.
 */
export function buildHjellRun (options: HjellRunOptions): BufferGeometry {
  const { stations, angle, deck, height, lower, bearer, rng, palette } = options
  const root                                                           = stations[0]
  const last                                                           = stations[stations.length - 1]

  if (!root || !last || stations.length < 2)
    throw new Error('a hjell run needs a windward trestle and a lee one')

  const parts: BufferGeometry[] = []
  const across                  = angle + Math.PI / 2
  const run                     = Math.hypot(last.x - root.x, last.z - root.z)
  const midX                    = (root.x + last.x) / 2
  const midZ                    = (root.z + last.z) / 2
  const yaw                     = Math.PI / 2 - angle

  for (const station of stations)
    trestle(parts, options, station, across)

  for (const drop of [ 0, height * (1 - lower) ])
    for (const side of [ -1, 1 ])
      parts.push(part(box(0.07, 0.07, run + 0.5), {
        at: [ midX + Math.cos(across) * bearer * side,
          deck - drop,
          midZ + Math.sin(across) * bearer * side ],
        rotate: [ 0, yaw, 0 ],
        color:  palette.wood,
        jitter: 0.09,
        rng,
      }))

  return mergeParts(parts, { grime: 2, grimeFloor: 0.46 })
}

/**
 * One split cod, hung over a rail by the nape.
 *
 * Four parts, under the scatter budget in `vegetation.ts`, because this is
 * stamped over every rack on the coast as one `InstancedMesh` — a part here is
 * memory once and a triangle on every fish.
 *
 * Split and hung is the entire silhouette, and it is why this is not a fish
 * shape. A stockfish is a cod opened down the belly, the two halves still joined
 * at the neck, folded over a pole so it falls open into a long pale V. That V is
 * the read at every range this camera has: a rack of them is a row of pale
 * wedges with daylight between them, and drawn as whole fish it would be a row
 * of grey commas nobody could name.
 *
 * It hangs from the origin rather than standing on it — see the note at the head
 * of this file — so the roster's `min.y` is the tail of the fish and the
 * placement puts the origin on the pole.
 */
export function buildStockfish (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const drop                    = rng.range(0.42, 0.52)
  const open                    = deg(rng.range(5, 12))
  const hinge                   = 0.02

  // The nape, where the two halves are still joined, and the part that straddles
  // the pole. The reason the V has a point rather than a gap at the top, and the
  // one part of the fish standing over the rail rather than under it.
  parts.push(part(box(0.145, 0.085, 0.07), {
    at:     [ 0, -hinge, 0 ],
    color:  palette.stockfishBack,
    jitter: 0.15,
    rng,
  }))

  for (const side of [ -1, 1 ])
    parts.push(part(box(0.155, drop, 0.045), {
      // Hinged at the nape rather than turned about its own middle: a half
      // rotated in place swings its head out as far as its tail and the two
      // halves come apart at the top, which is a pair of planks rather than a
      // fish.
      at:     [ 0, -hinge - Math.cos(open) * drop / 2, side * Math.sin(open) * drop / 2 ],
      rotate: [ side * open, 0, deg(rng.range(-4, 4)) ],
      // Flesh out on one half and skin out on the other, which is what a fish
      // folded over a pole does and what keeps a rack off one flat tone.
      color:  side < 0 ? palette.stockfish : palette.stockfishBack,
      jitter: 0.2,
      rng,
    }))

  return mergeParts(parts, { grime: 1.1, grimeFloor: 0.6 })
}
