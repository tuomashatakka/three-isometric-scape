import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { createRockGeometry, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * The howe — a turf barrow with a kerb of set stones round its foot and a hole
 * in the top of it where somebody went looking for the gold.
 *
 * Modelled in the farmstead's own frame: base at `y = 0`, and the one side that
 * is not symmetrical — the dig, and the spoil thrown out of it — on local `+z`.
 * That is what lets it be sited with `faceToward` like the shieling, and it is
 * not decoration: a barrow that was opened was opened from whichever side the
 * people doing it walked up, and `landscape/howe.ts` sites the thing by the
 * sightline from the yard, so the yard is that side by construction.
 *
 * It is piled rather than built, and the geometry says so in three ways:
 *
 * - the dome is a stack of frusta on a cosine profile rather than a sphere cut
 *   off at the waterline. A barrow slumps: it is steepest a third of the way up
 *   and almost flat at the top, which a cosine gives and a hemisphere does not.
 *   Six courses and twelve sides is where the ascii render stops showing the
 *   stack and starts showing the curve.
 * - the kerb is set *into* the foot rather than standing round it. Half of each
 *   stone is under the turf line, which is how a kerb that has been there three
 *   thousand years looks and also what stops the ring floating when the mound
 *   is plopped onto ground with any fall in it at all.
 * - there is no cairn of bare stone anywhere on it. Every barrow in this
 *   archipelago's weather is grassed over within a generation, and the only
 *   stone that shows is the kerb, the spoil, and whatever the dig turned up.
 *
 * The dig is the one detail that earns its vertices at the tour's far zoom:
 * without it a howe is a green hemisphere, which at forty metres is a bush.
 * With it there is a dark notch in the crest with pale stone beside it, and the
 * eye reads a made thing.
 */

/** The foot, and the crest over it. Kept in step with `landscape/howe.ts` by the test. */
const FOOT  = 3.6
const CREST = 2.6

/** Courses in the dome, and sides to each. */
const COURSES = 6
const SIDES   = 12

/**
 * How the radius falls away with height.
 *
 * A cosine raised a little under one, which is the slump: steep through the
 * middle, nearly flat on top. At an exponent of 1 the profile is a dome; at 0.5
 * it is a drum.
 */
const SLUMP = 0.78

/** Stones in the kerb, and how much of one stands over the turf line. */
const KERB_STONES = 28
const KERB_SHOW   = 0.7

/** The dig: how wide the hollow is, how deep, and how many stones came out. */
const DIG_RADIUS = 1.3
const DIG_DEPTH  = 0.55
const SPOIL      = 7

/** Radius of the dome's turf at a point on the raw profile, 0..1. */
function slumpAt (t: number): number {
  return FOOT * Math.cos(t * Math.PI / 2) ** SLUMP
}

/**
 * Where on that raw profile the turf stops, 0..1.
 *
 * The cosine comes to a *point*, and a barrow with a hole in it has a rim
 * instead. So the dome is drawn only as far up the profile as the dig's own
 * radius, and the heights are then stretched so that rim lands at
 * {@link CREST} — which keeps the mound exactly as tall as `HOWE_HEIGHT` says
 * it is, and `HOWE_HEIGHT` is what the siting raises its sightline to.
 *
 * Drawing the cap and then setting the hollow into it was the first cut, and
 * from above it reads as a brown lid on a green drum: the dig is wider than the
 * point the cosine ends in, so there is no turf left round it to be a rim.
 */
const RIM = Math.acos((DIG_RADIUS / FOOT) ** (1 / SLUMP)) / (Math.PI / 2)

/** Height of a point on the raw profile, in metres. */
function riseAt (t: number): number {
  return t / RIM * CREST
}

/**
 * Height of the dome's turf at a given radius from the axis, in metres.
 *
 * {@link slumpAt} read the other way round, so the spoil lies *on* the flank
 * rather than inside it or in the air over it. Clamped at both ends, where the
 * profile's own inverse runs out.
 */
function flankAt (radius: number): number {
  return radius >= FOOT
    ? 0
    : riseAt(Math.min(RIM, Math.acos(Math.min(1, (radius / FOOT) ** (1 / SLUMP))) / (Math.PI / 2)))
}

export function buildHowe (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  // The dome. Each course is a frustum between two readings of the profile, so
  // the seams line up exactly and the silhouette is the curve rather than a
  // staircase approximating one.
  for (let course = 0; course < COURSES; course += 1) {
    const low  = course / COURSES * RIM
    const high = (course + 1) / COURSES * RIM

    parts.push(part(cyl(slumpAt(high), slumpAt(low), riseAt(high) - riseAt(low), SIDES), {
      at:     [ 0, (riseAt(low) + riseAt(high)) / 2, 0 ],
      // Darker toward the top, because the crown is the part the wind keeps
      // cropped and the flanks are the part the sheep cannot reach.
      color:  course < COURSES - 2 ? palette.grass : palette.moss,
      jitter: 0.1,
      rng,
    }))
  }

  // The kerb, set into the foot. Each stone is sunk to the turf line and turned
  // to lie along the ring rather than across it, which is how a set kerb differs
  // from a row of field clearance somebody left in a curve.
  for (let stone = 0; stone < KERB_STONES; stone += 1) {
    const around = stone / KERB_STONES * Math.PI * 2

    parts.push(part(
      createRockGeometry({ radius: 0.44, detail: 0, rng, roughness: 0.46, scale: [ 0.6, 1.3, 1.1 ]}),
      {
        at:     [ Math.cos(around) * FOOT, KERB_SHOW - 0.44 * 1.3, Math.sin(around) * FOOT ],
        rotate: [ deg(rng.range(-7, 7)), around, deg(rng.range(-9, 9)) ],
        // Two granites to one lichen: a stone that has been face up since it
        // was set is the stone that grew it, and most of this one is buried.
        color:  rng.pick([ palette.granite, palette.graniteWarm, palette.lichen ]),
        jitter: 0.18,
        rng,
      },
    ))
  }

  // The dig, set inside the rim the dome stops at. A plug of cut earth a little
  // narrower than the hole and a little below its lip, so what the camera gets
  // from above is turf, then a step down, then the floor somebody left — rather
  // than the inside of a cone, which at this material's culling is nothing at
  // all.
  parts.push(part(cyl(DIG_RADIUS * 0.9, DIG_RADIUS * 0.68, DIG_DEPTH, SIDES), {
    at: [ 0, CREST - DIG_DEPTH / 2 - 0.08, 0 ], color: palette.soil, jitter: 0.16, rng,
  }))

  // The lip the spade left on the side of the hollow the diggers stood on, and
  // the spoil run out of it down the flank. Both on local `+z`, which the siting
  // turns back at the yard.
  parts.push(part(cyl(DIG_RADIUS * 0.5, DIG_RADIUS * 0.75, 0.2, SIDES), {
    at: [ 0, CREST - 0.06, DIG_RADIUS * 0.75 ], color: palette.peatDry, jitter: 0.16, rng,
  }))

  for (let stone = 0; stone < SPOIL; stone += 1) {
    const out   = DIG_RADIUS + 0.5 + stone / SPOIL * (FOOT - DIG_RADIUS - 0.9)
    const drift = rng.range(-0.8, 0.8)

    parts.push(part(
      createRockGeometry({ radius: 0.3, detail: 0, rng, roughness: 0.58, scale: [ 1.1, 0.7, 1 ]}),
      {
        at:     [ drift, flankAt(Math.hypot(drift, out)) + 0.1, out ],
        rotate: [ 0, deg(rng.range(-180, 180)), 0 ],
        color:  rng.pick([ palette.granite, palette.graniteDark, palette.driftwoodDark ]),
        jitter: 0.2,
        rng,
      },
    ))
  }

  return mergeParts(parts, { grime: 2.4, grimeFloor: 0.5 })
}
