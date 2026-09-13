import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { createRockGeometry, cyl, mergeParts, part } from 'threejs-scene/modules/assets'
import { resamplePath } from './fence.ts'
import type { FencePoint } from './fence.ts'
import type { NordicPalette } from './palette.ts'


/**
 * The fish weir, laid along the course the survey solved.
 *
 * Not a roster prop, and it cannot be one, for the reason the pier is not: every
 * builder in `props/index.ts` is a pure `(rng, palette)` factory whose result is
 * a fixed shape standing on `y = 0`, and a weir is a length and a radius the
 * flat chose. So it takes the shape `buildFenceRun`, `buildStoneWallRun` and
 * `buildPierRun` already took — a parametric run handed straight to the
 * dressing's merged hero draw, costing no draw call of its own.
 *
 * **It is a band rather than a wall, and that distinction is the whole reason
 * this is not `buildStoneWallRun` with a different palette.** A head dyke is a
 * metre of stone standing on a hillside, so its courses are narrow and its
 * stones are sized off its height. A weir is 0.34 m of stone lying on a flat —
 * and a run built by that same rule came out as a line of fourteen-centimetre
 * pebbles, which at any zoom this scape is seen from is shingle. What a trap
 * actually is, and what makes one legible from above in the one photograph
 * anybody has ever taken of one, is *width*: boulders a man can just move,
 * spread two or three metres across and standing barely a foot proud. So the
 * stone is sized against the band rather than against the crest, and the crest
 * is where the tops of the stones come rather than where a course ends.
 *
 * The other half of the silhouette is the wattle. A trap of loose stone leaks
 * fish at every joint, so the pound is staked and woven, and at low water those
 * stakes are the only part of the structure that stands high enough to catch a
 * light.
 */

export interface WeirRunOptions {

  /** The leader, in world metres, bank end first. */
  leader: readonly FencePoint[]

  /** The pound, in world metres, one end of the mouth round to the other. */
  pound: readonly FencePoint[]

  /** Bed height, sampled per station. */
  heightAt(x: number, z: number): number

  /** How far the crest stands over the bed, in metres. */
  height: number

  /** How wide the band of stone is at the crest, in metres. */
  width: number

  /** Metres between stone stations — the tier's handle. See `quality.dykeSpacing`. */
  spacing: number

  /** Metres between stakes on the pound. 0 leaves it unwoven. */
  stakes: number

  rng:     SeededRng
  palette: NordicPalette
}

/**
 * The two courses, as a share of the crest width and of the crest height.
 *
 * The foot is laid wide and low and the crest narrow and full, which is the
 * batter — and a batter is the only thing that separates a weir from a kerb when
 * the whole structure is a third of a metre tall. `across` is where the stones
 * of that course sit either side of the line, as a share of {@link
 * WeirRunOptions.width}; `rise` is where the tops of them come, as a share of
 * the height.
 */
const COURSES = [
  { across: [ -0.78, -0.4, 0, 0.4, 0.78 ], rise: 0.58 },
  { across: [ -0.3, 0, 0.3 ], rise: 1 },
]

/** Stone radius as a share of the band's crest width. */
const STONE = 0.19

/** How flat a weir boulder is: long along the run, low in the water. */
const SHAPE: [ number, number, number ] = [ 1.35, 0.66, 1.05 ]

/**
 * How far a stake stands over the crest it is driven behind, in metres.
 *
 * **Metres, and they stay metres.** A stake is a length of hazel cut off a
 * hillside and driven until it stops, so what decides this is the coppice and
 * the arm swinging the maul, not how wide the archipelago is or how far the
 * camera is pulled out. Two thirds of a metre is what the weave needs to hold,
 * and it is also what keeps the ring readable over a drained flat without
 * turning the pound into a palisade.
 */
const STAKE_RISE = 0.68

/** How far a stake may lean off plumb, in radians. */
const STAKE_LEAN = 0.17


/** One run of the course: stations along the line, stones across the band. */
function band (
  parts:   BufferGeometry[],
  options: WeirRunOptions,
  points:  readonly FencePoint[],
): void {
  const { heightAt, height, width, spacing, rng, palette } = options

  if (points.length < 2)
    return

  // Wrack on everything the water reaches twice a day, and the dry granite kept
  // out of it entirely — a weir painted in the head dyke's lichen would be a
  // hill wall somebody had left in the sea.
  const colors   = [ palette.wrack, palette.wrackDeep, palette.shingle, palette.graniteDark ]
  const stations = resamplePath(points, spacing, false)
  const radius   = width * STONE

  for (const [ index, station ] of stations.entries()) {
    const bed = heightAt(station.x, station.z)

    // The bearing of the run through this station, taken from its neighbours so
    // that the stones lie lengthwise along the band rather than across it. The
    // pound is a curve, so this is the only thing keeping the ring from reading
    // as a ring of stones laid radially.
    const previous = stations[Math.max(0, index - 1)]
    const next     = stations[Math.min(stations.length - 1, index + 1)]
    const along    = Math.atan2(next.z - previous.z, next.x - previous.x)
    const across   = along + Math.PI / 2
    const cos      = Math.cos(across)
    const sin      = Math.sin(across)

    for (const course of COURSES) {
      // The tops of this course, rather than its middle: a weir is read off its
      // crest, and a stone whose centre was placed would stand a random share of
      // its own height proud of the one beside it.
      const top = bed + height * course.rise - radius * SHAPE[1]

      for (const offset of course.across)
        parts.push(part(
          createRockGeometry({ radius, detail: 0, rng, roughness: 0.34, scale: SHAPE }),
          {
            at:     [ station.x + cos * offset * width, top, station.z + sin * offset * width ],
            rotate: [ 0, along + rng.range(-0.4, 0.4), 0 ],
            color:  rng.pick(colors),
            jitter: 0.17,
            rng,
          },
        ))
    }
  }
}

/** The wattle: stakes driven along the pound wall. */
function weave (
  parts:   BufferGeometry[],
  options: WeirRunOptions,
): void {
  const { pound, heightAt, height, stakes, rng, palette } = options

  if (stakes <= 0 || pound.length < 2)
    return

  const colors   = [ palette.deadWood, palette.driftwoodDark, palette.driftwood ]
  const stations = resamplePath(pound, stakes, false)
  const rise     = height + STAKE_RISE

  for (const station of stations)
    parts.push(part(cyl(0.055, 0.075, rise, 5), {
      at:     [ station.x, heightAt(station.x, station.z) + rise / 2, station.z ],
      rotate: [ rng.range(-STAKE_LEAN, STAKE_LEAN), 0, rng.range(-STAKE_LEAN, STAKE_LEAN) ],
      color:  rng.pick(colors),
      jitter: 0.14,
      rng,
    }))
}

/**
 * One weir, as a single geometry in world space.
 *
 * The leader and the pound are banded separately rather than as one bent
 * polyline, because they are two runs: a single line through both would put a
 * station at the joint carrying the average of two bearings, and the stones
 * there would lie across the band instead of along it.
 *
 * @returns One merged, world-space, vertex-coloured geometry, or `null` when the
 *          course was too short to build. The caller owns it.
 */
export function buildWeirRun (options: WeirRunOptions): BufferGeometry | null {
  const parts: BufferGeometry[] = []

  band(parts, options, options.leader)
  band(parts, options, options.pound)
  weave(parts, options)

  return parts.length > 0
    ? mergeParts(parts)
    : null
}

// perf: one merged geometry for the whole trap, and no grime pass — this
// geometry is in world space, and grime darkens toward the *geometry's* base,
// which on a run crossing a flat would shade the seaward end rather than the
// bottom of each stone.
