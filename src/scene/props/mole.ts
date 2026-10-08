import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, createRockGeometry, mergeParts, part } from 'threejs-scene/modules/assets'
import { resamplePath } from './fence.ts'
import type { FencePoint } from './fence.ts'
import type { NordicPalette } from './palette.ts'


/**
 * The breakwater, raised along the course the survey solved.
 *
 * Not a roster prop, and it cannot be one, for the reason the pier and the weir
 * are not: every builder in `props/index.ts` is a pure `(rng, palette)` factory
 * whose result is a fixed shape standing on `y = 0`, and an arm is a length the
 * bed chose, standing on a bottom that falls away under it. So it takes the
 * shape `buildPierRun` and `buildWeirRun` already took — a parametric run handed
 * straight to the dressing's merged hero draw, costing no draw call of its own
 * and carrying its own world coordinates.
 *
 * **A mound, and the mound is the point.** The two structures this coast
 * already had on the water are both *lines*: a trestle is piles under a deck and
 * a weir is a band of stone a foot proud of a flat. A breakwater is the first
 * thing in the scape with a cross-section — a wedge, wide at the bottom and
 * narrow at the top, and from the isometric camera that wedge is nearly all of
 * what you see. So the courses are laid by the batter rather than stacked
 * straight: each one is set on the half-width the slope has reached at its own
 * height, which is what makes the thing read as stone that was *tipped* instead
 * of stone that was *built*.
 *
 * **The crest is level and the bed is not.** Same rule as the pier's deck, and
 * for the same reason: a crest that followed the bottom down would be a ramp
 * into the sea. So every station is filled from whatever the bed gave it up to
 * one world height, which means the arm grows taller as it goes out — and the
 * foot grows wider with it, because the batter is a slope rather than an offset.
 */

export interface MoleRunOptions {

  /**
   * The course, in world metres, root first and head last.
   *
   * Points rather than the survey's own stations, and the bed that comes with
   * those is deliberately left behind: the course is **resampled** to the
   * tier's stone spacing before a single rock is placed, so most of what gets
   * built does not stand on a surveyed station at all. A bed carried in from
   * the survey would be right at one station in four and interpolated at the
   * rest, and the interpolation of a rock coast is a bar the mound would fly
   * over.
   */
  stations: readonly FencePoint[]

  /** Bed height, sampled per resampled station. */
  heightAt(x: number, z: number): number

  /** World height of the crest, in metres. */
  crest: number

  /** Metres across the crest. */
  width: number

  /** Metres the foot spreads either side, per metre of height over the bed. */
  batter: number

  /** Metres between stone stations — the tier's handle. See `quality.dykeSpacing`. */
  spacing: number

  /**
   * Metres between armour blocks on the seaward foot. 0 leaves the flank bare.
   *
   * See `quality.moleArmour`. The blocks are the only part of the arm that is
   * not load-bearing for the silhouette, which is why this is the knob allowed
   * to reach zero at all: without the blocks the mound is still a mound.
   */
  armour: number

  /** Which side of the course the open sea is on: `+1` or `-1`. */
  seaward: number

  rng:     SeededRng
  palette: NordicPalette
}

/**
 * The courses, as shares of the fill.
 *
 * `rise` is where the tops of that course come as a share of the height from
 * bed to crest; `across` is where its stones sit either side of the line, as a
 * share of the *half-width the batter has reached at that rise* rather than of
 * the crest. That second part is what makes this a wedge: the foot course
 * spreads to the full spread and the crest course sits inside the cart track.
 *
 * Five courses rather than the weir's two, because a weir is a third of a metre
 * of stone and an arm is three or four: the same two-course rule applied to this
 * height leaves a band of daylight through the middle of the mound.
 */
const COURSES = [
  { across: [ -1, -0.62, -0.22, 0.22, 0.62, 1 ], rise: 0.22 },
  { across: [ -1, -0.55, 0, 0.55, 1 ], rise: 0.46 },
  { across: [ -0.92, -0.4, 0.4, 0.92 ], rise: 0.68 },
  { across: [ -0.82, -0.3, 0.3, 0.82 ], rise: 0.86 },
  { across: [ -0.55, 0, 0.55 ], rise: 1 },
]

/** Stone radius as a share of the crest width. */
const STONE = 0.21

/** How a mound boulder sits: squarer than a weir's, because it was tipped rather than laid. */
const SHAPE: [ number, number, number ] = [ 1.18, 0.92, 1.1 ]

/**
 * Thickness of the capping, in metres.
 *
 * The one flat thing on the arm, and what tells a reader at the near zoom that
 * the top of it is walked on. Under about a tenth of a metre it disappears into
 * the stone it is laid over at every tier's spacing.
 */
const CAP_THICKNESS = 0.16

/**
 * How far an armour block sits outside the foot, as a share of its own radius.
 *
 * Just clear, so the blocks read as a separate apron tipped against the mound
 * rather than as the bottom course of it with the spacing wrong.
 */
const ARMOUR_STANDOFF = 0.8

/** Armour block radius as a share of the crest width. Bigger than the mound's own stone. */
const ARMOUR_STONE = 0.3


/** Half the width of the mound at one height over the bed, in metres. */
function spreadAt (options: MoleRunOptions, height: number, rise: number): number {
  return options.width / 2 + options.batter * height * (1 - rise)
}

/** The bearing of the course through one station, taken from its neighbours. */
function bearingAt (stations: readonly FencePoint[], index: number): number {
  const previous = stations[Math.max(0, index - 1)]
  const next     = stations[Math.min(stations.length - 1, index + 1)]

  return Math.atan2(next.z - previous.z, next.x - previous.x)
}

/** The mound itself: courses of tipped stone from the bed up to the crest. */
function mound (parts: BufferGeometry[], options: MoleRunOptions, stations: readonly FencePoint[]): void {
  const { heightAt, crest, width, rng, palette } = options
  const colors                                   = [ palette.granite, palette.graniteDark, palette.graniteWarm, palette.shingle ]
  const radius                                   = width * STONE

  for (const [ index, station ] of stations.entries()) {
    const bed    = heightAt(station.x, station.z)
    const height = Math.max(radius, crest - bed)
    const along  = bearingAt(stations, index)
    const across = along + Math.PI / 2
    const cos    = Math.cos(across)
    const sin    = Math.sin(across)

    for (const course of COURSES) {
      // The tops of this course rather than its middle, the way the weir's are:
      // a mound is read off the line its stones' crowns make, and a stone whose
      // centre was placed would stand a random share of its own height proud of
      // the one beside it.
      const top    = bed + height * course.rise - radius * SHAPE[1]
      const spread = spreadAt(options, height, course.rise)

      for (const offset of course.across)
        parts.push(part(
          createRockGeometry({ radius, detail: 0, rng, roughness: 0.4, scale: SHAPE }),
          {
            at:     [ station.x + cos * offset * spread, top, station.z + sin * offset * spread ],
            rotate: [ 0, along + rng.range(-0.5, 0.5), 0 ],
            color:  rng.pick(colors),
            jitter: 0.19,
            rng,
          },
        ))
    }
  }
}

/** The capping: a level track of dressed slabs along the crest. */
function capping (parts: BufferGeometry[], options: MoleRunOptions, stations: readonly FencePoint[]): void {
  const { crest, width, spacing, rng, palette } = options
  const colors                                  = [ palette.granite, palette.graniteWarm, palette.shingle ]

  for (const [ index, station ] of stations.entries())
    parts.push(part(box(spacing * 1.06, CAP_THICKNESS, width * 0.72), {
      at:     [ station.x, crest - CAP_THICKNESS / 2, station.z ],
      rotate: [ 0, -bearingAt(stations, index), 0 ],
      color:  rng.pick(colors),
      jitter: 0.08,
      rng,
    }))
}

/**
 * The armour: a single apron of larger blocks along the seaward foot.
 *
 * One side only, and that is the whole idea. An arm has a sea face and a
 * harbour face and they are not built the same way: everything that is going to
 * be hit goes on the outside, and the inside is whatever the stone did when it
 * stopped rolling. Which side is which came out of the survey — see
 * `Mole.hand` — so this does not have to guess.
 */
function armourFlank (parts: BufferGeometry[], options: MoleRunOptions, course: readonly FencePoint[]): void {
  const { heightAt, crest, width, armour, seaward, rng, palette } = options

  if (armour <= 0)
    return

  const colors   = [ palette.graniteDark, palette.granite, palette.wrack ]
  const stations = resamplePath(course, armour, false)
  const radius   = width * ARMOUR_STONE

  for (const [ index, station ] of stations.entries()) {
    const bed    = heightAt(station.x, station.z)
    const height = Math.max(radius, crest - bed)
    const along  = bearingAt(stations, index)
    const across = along + Math.PI / 2
    const out    = spreadAt(options, height, 0) + radius * ARMOUR_STANDOFF

    parts.push(part(
      createRockGeometry({ radius, detail: 0, rng, roughness: 0.46, scale: SHAPE }),
      {
        at: [
          station.x + Math.cos(across) * out * seaward,
          bed + radius * 0.52,
          station.z + Math.sin(across) * out * seaward,
        ],
        rotate: [ 0, along + rng.range(-0.7, 0.7), 0 ],
        color:  rng.pick(colors),
        jitter: 0.24,
        rng,
      },
    ))
  }
}

/**
 * One arm, as a single geometry in world space.
 *
 * @returns One merged, world-space, vertex-coloured geometry, or `null` when the
 *          course was too short to raise. The caller owns it.
 */
export function buildMoleRun (options: MoleRunOptions): BufferGeometry | null {
  const course = options.stations

  if (course.length < 2 || options.spacing <= 0)
    return null

  const parts: BufferGeometry[] = []
  const stations                = resamplePath(course, options.spacing, false)

  mound(parts, options, stations)
  capping(parts, options, stations)
  armourFlank(parts, options, course)

  return parts.length > 0
    ? mergeParts(parts)
    : null
}

// perf: one merged geometry for the whole arm, and no grime pass — this geometry
// is in world space, and grime darkens toward the *geometry's* base, which on a
// run walking out into deeper water would shade the shore end rather than the
// bottom of each stone.
