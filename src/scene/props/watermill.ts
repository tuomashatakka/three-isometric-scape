import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, createRockGeometry, cyl, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { claddingPlanks, gableEnd, gabledRoof } from './timber.ts'


/**
 * The watermill — a boarded mill house with a breastshot wheel on its wet side.
 *
 * Modelled in the farmstead's own frame: base at `y = 0`, long axis on `x`, door
 * on local `+z`. That is what lets it be walked to with `doorstepOf` like every
 * other building in the kit. What is different from all of them is that the
 * *other* three sides are spoken for, and by water rather than by taste:
 *
 * - **local `-z` is the wet side.** The wheel hangs off that wall with its axle
 *   running through it, because a breastshot wheel drives a pit wheel and a pit
 *   wheel is indoors. The siting search is what guarantees the channel is on
 *   that side — see `landscape/watermill.ts`.
 * - **local `-x` is upstream.** The lade arrives along the wall rather than
 *   across it, which is the only bearing water can be delivered from onto a
 *   wheel whose axle runs on `z`: it has to come in tangentially, at the rim,
 *   or it hits the shroud broadside and turns nothing.
 * - **local `+z` is dry, so the door is there**, facing the farm the flour goes
 *   back to.
 *
 * The wheel is a geometry of its own and not part of this one, for the reason
 * the post mill's sails are: it is the part that turns. See
 * `landscape/mill-wheels.ts`.
 *
 * The lade is not here either, and for the opposite reason: it is as long as the
 * island's beck makes it, and a baked trough is one length forever. It is a
 * world-space run that resolves its own ground, like the fences and the walls —
 * see `props/lade.ts`.
 */

/** How far the mill is set into the ground it stands on, in metres. */
export const WATERMILL_SINK = 0.14

/**
 * How far out on local `-z` the wheel's axle stands, in metres.
 *
 * Clear of the wall by more than the wheel's own radius, so the shroud turns
 * beside the building rather than through it. Named here and read by the two
 * callers that place things in the wheel's frame — `landscape/index.ts` for the
 * hub and `dressing-watermill.ts` for the lade's mouth — because a reach read
 * from one end and defaulted at the other is a wheel hanging off the end of its
 * own axle.
 */
export const WHEEL_REACH = 2.6

/** The wheel's radius, in metres. A little over two metres across the shrouds. */
export const WHEEL_RADIUS = 1

/** Height of the axle above the mill's own base, in metres. */
export const WHEEL_AXLE = 1.15

/**
 * Where the lade lets go of its water, in the mill's own frame.
 *
 * The lip of the wheel, a hand's width above the axle: a breastshot wheel is
 * filled at about its own centre, which is the whole reason this scape can have
 * one. An overshot wheel is fed over its crown and needs a head of better than
 * two and a half metres — and exactly one island in six has a beck that falls
 * that far in the length of a lade somebody would dig.
 *
 * `x` is a *magnitude*. Which end of the wall the trough comes in over is the
 * ground's decision and not the builder's, and the wheel turns whichever way it
 * is filled — see `WatermillSite.feedSide`.
 */
export const LADE_FEED = {
  x: WHEEL_RADIUS + 0.15,
  y: WHEEL_AXLE + 0.22,
  z: -WHEEL_REACH,
} as const

/**
 * How far below the sill the wheel's cheek posts reach, in metres.
 *
 * The wet side falls away toward the channel and the mill's socle is baked at
 * one height, so the frame that carries the axle is deliberately longer than it
 * looks: whatever of it the bank does not need is buried. `WHEEL_DROP` in
 * `landscape/watermill.ts` is the same number seen from the other end — the
 * fall the search refuses to exceed, so the posts always find ground.
 */
const CHEEK_FOOT = -0.74

/** The room: half its length on `x`, half its depth on `z`, at the wall face. */
const HALF_LENGTH = 2
const HALF_DEPTH  = 1.45

/**
 * How far the underbuilding reaches below the mill's own base, in metres.
 *
 * A mill on a beck bank stands on more stone than any other building on these
 * islands, and it is not decoration: the bank is the side of a channel, so it is
 * tilted by construction, and there is no flat on it to find. Every other merged
 * building in the kit answers that by refusing the ground; this one answers it
 * the way a mill does, by being built up off the low side.
 *
 * Buried on the high side, which is correct and invisible. `SILL_FALL` in
 * `landscape/watermill.ts` is the same number seen from the other end — the fall
 * the search refuses to exceed, so the stone always reaches the ground, and the
 * test beside that file holds the two in step.
 *
 * The ceiling on it is the roster's own: `props.test.ts` asks every prop in the
 * table to stand within three quarters of a metre of its base, which is the rule
 * that stops a building being modelled as a tower with most of itself
 * underground. This is the deepest thing in the kit and it is still inside that.
 */
const SOCLE_DEEP = 0.7

/** Top of the socle, the wall head, and the ridge. */
const PLINTH = 0.3
const EAVE   = PLINTH + 1.95
const PEAK   = EAVE + 1.05

/** Boards along each long wall, and courses of stone in the underbuilding. */
const BOARDS  = 11
const COURSES = 4

/** Spokes and rim segments in each of the wheel's two shrouds. */
const SPOKES = 8
const RIM    = 16

const TAU = Math.PI * 2

/**
 * The mill house, its socle, the frame the wheel turns in, and the tail race.
 *
 * Boarded rather than built of stone, unlike the shieling and unlike the
 * smokehouse: a mill is a machine in a shed, it is rebuilt around the gearing
 * every generation or two, and the one thing nobody does is lay four courses of
 * granite round a thing they expect to take apart.
 */
export function buildWatermill (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const roof                    = { eaveY: EAVE, peakY: PEAK, halfDepth: HALF_DEPTH }

  // The underbuilding, laid in courses of field stone from the bottom of what
  // the bank might ask for up to the sill. The courses are drawn rather than
  // cast as one block because the wet gable stands in spray for eight months of
  // the year, and a mill's stonework is the part of it always being repointed.
  const socle = PLINTH + SOCLE_DEEP

  for (let course = 0; course < COURSES; course += 1) {
    const rise = socle / COURSES

    parts.push(part(box(HALF_LENGTH * 2 + 0.3, rise, HALF_DEPTH * 2 + 0.3), {
      at:     [ 0, -SOCLE_DEEP + rise * (course + 0.5), 0 ],
      color:  course === 0 ? palette.graniteDark : palette.granite,
      jitter: 0.13,
      rng,
    }))
  }

  for (const side of [ -1, 1 ])
    claddingPlanks(
      parts, rng,
      side < 0 ? palette.tarWood : palette.plank,
      BOARDS, HALF_LENGTH * 2, EAVE - PLINTH, 0.13, side * HALF_DEPTH, PLINTH,
    )

  for (const side of [ -1, 1 ])
    gableEnd(parts, rng, palette.woodDark, { ...roof, thick: 0.2, at: side * (HALF_LENGTH - 0.05) })

  gabledRoof(parts, rng, palette.shingle, palette.shingleWorn, {
    ...roof, length: HALF_LENGTH * 2 + 0.55, overhang: 0.38, thickness: 0.2,
  })

  // The door, on the dry side. The sack hoist over it is what says the building
  // is a mill rather than a boathouse that wandered inland.
  parts.push(part(box(0.8, 1.5, 0.12), {
    at: [ HALF_LENGTH * 0.4, PLINTH + 0.75, HALF_DEPTH + 0.08 ], color: palette.faluDark, jitter: 0.09, rng,
  }))
  parts.push(part(box(0.5, 0.42, 0.7), {
    at: [ HALF_LENGTH * 0.4, EAVE + 0.1, HALF_DEPTH + 0.3 ], color: palette.woodDark, jitter: 0.08, rng,
  }))

  // One small window on the dry side, because a mill is worked at night in a
  // harvest week and the glazing is what carries the lamp out of it.
  parts.push(part(box(0.44, 0.5, 0.1), {
    at: [ -HALF_LENGTH * 0.45, PLINTH + 1.15, HALF_DEPTH + 0.07 ], color: palette.glass, jitter: 0.06, rng,
  }))

  raiseWheelFrame(parts, rng, palette)
  layTailRace(parts, rng, palette)

  return mergeParts(parts, { grime: 1.7, grimeFloor: 0.42 })
}

/**
 * The two cheeks the axle turns in, and the axle's run into the wall.
 *
 * Long on purpose — see {@link CHEEK_FOOT}. The bearing blocks are the only iron
 * on the outside of the building, and they are what stops the wheel reading as a
 * cartwheel somebody leaned against a shed.
 */
function raiseWheelFrame (parts: BufferGeometry[], rng: SeededRng, palette: NordicPalette): void {
  const top = WHEEL_AXLE + 0.4

  for (const side of [ -1, 1 ]) {
    const x = side * (WHEEL_RADIUS + 0.42)

    parts.push(part(box(0.26, top - CHEEK_FOOT, 0.26), {
      at:     [ x, (top + CHEEK_FOOT) / 2, -WHEEL_REACH ],
      color:  palette.tarWood,
      jitter: 0.1,
      rng,
    }))

    // The brace back to the wall head, which is what keeps the frame out of the
    // water when the wheel is loaded.
    parts.push(part(box(0.18, 0.18, WHEEL_REACH - HALF_DEPTH + 0.3), {
      at:     [ x, top - 0.12, -(WHEEL_REACH + HALF_DEPTH) / 2 ],
      color:  palette.woodDark,
      jitter: 0.09,
      rng,
    }))
  }

  parts.push(part(box(WHEEL_RADIUS * 2 + 1.1, 0.24, 0.24), {
    at: [ 0, top, -WHEEL_REACH ], color: palette.woodDark, jitter: 0.09, rng,
  }))

  // The axle, from the bearing out at the wheel back through the wall.
  parts.push(part(cyl(0.16, 0.16, WHEEL_REACH + HALF_DEPTH, 8), {
    at:     [ 0, WHEEL_AXLE, -(WHEEL_REACH + HALF_DEPTH) / 2 + HALF_DEPTH ],
    rotate: [ deg(90), 0, 0 ],
    color:  palette.iron,
    jitter: 0.07,
    rng,
  }))
}

/**
 * The stone the spent water runs away over.
 *
 * A short apron rather than a cut channel, because the terrain under a merged
 * hero is the terrain the height field drew and this prop cannot dig. What it
 * can do is put the stone where a race would be, which is what the eye reads.
 */
function layTailRace (parts: BufferGeometry[], rng: SeededRng, palette: NordicPalette): void {
  for (let stone = 0; stone < 10; stone += 1) {
    const across = -1.15 + stone % 5 / 4 * 2.3
    const along  = -WHEEL_REACH - 0.46 - Math.floor(stone / 5) * 0.55

    parts.push(part(
      createRockGeometry({ radius: 0.3, detail: 0, rng, roughness: 0.55, scale: [ 1.2, 0.45, 1.1 ]}),
      {
        at:     [ across, -0.12, along ],
        rotate: [ 0, rng.range(0, TAU), 0 ],
        color:  rng.pick([ palette.graniteDark, palette.granite, palette.wrack ]),
        jitter: 0.18,
        rng,
      },
    ))
  }
}

/**
 * The wheel, in its own frame: a disc in `xy` turning about `z`.
 *
 * The same frame the post mill's sail wheel is built in, and deliberately so —
 * both are placed by an `InstancedMesh` that composes a yaw and a spin in
 * `'YXZ'` order, and one convention for "a thing that turns" is one fewer place
 * for the two to disagree. Base is *not* at `y = 0` here, for the same reason it
 * is not there: a wheel is placed by its axle, not by its lowest bucket.
 *
 * `buckets` is the tier's handle on the one moving draw the mill costs. It is a
 * count rather than a switch and it never reaches zero — a shroud with nothing
 * between its rims is a cartwheel, and the graceful absence a cheap tier is owed
 * is not a broken-looking wheel.
 */
export function buildWaterWheel (
  rng:     SeededRng,
  palette: NordicPalette,
  radius:  number,
  buckets: number,
): BufferGeometry {
  const parts: BufferGeometry[] = []
  const width                   = radius * 0.62

  parts.push(part(cyl(0.17, 0.17, width + 0.5, 8), {
    at: [ 0, 0, 0 ], rotate: [ deg(90), 0, 0 ], color: palette.iron, jitter: 0.07, rng,
  }))

  for (const side of [ -1, 1 ]) {
    const z = side * width / 2

    parts.push(part(cyl(0.3, 0.3, 0.2, 8), {
      at: [ 0, 0, z ], rotate: [ deg(90), 0, 0 ], color: palette.woodDark, jitter: 0.08, rng,
    }))

    for (let spoke = 0; spoke < SPOKES; spoke += 1) {
      const around = spoke / SPOKES * TAU

      parts.push(part(box(radius * 0.94, 0.11, 0.09), {
        at:     [ Math.cos(around) * radius * 0.48, Math.sin(around) * radius * 0.48, z ],
        rotate: [ 0, 0, around ],
        color:  palette.wood,
        jitter: 0.09,
        rng,
      }))
    }

    // The shroud, as segments laid end to end rather than as a disc: the gap
    // between the rims is what the buckets are visible through, and a solid
    // cylinder here reads as a millstone on its side.
    for (let segment = 0; segment < RIM; segment += 1) {
      const around = (segment + 0.5) / RIM * TAU

      parts.push(part(box(TAU * radius / RIM * 1.08, 0.13, 0.08), {
        at:     [ Math.cos(around) * radius, Math.sin(around) * radius, z ],
        rotate: [ 0, 0, around + Math.PI / 2 ],
        color:  palette.tarWood,
        jitter: 0.08,
        rng,
      }))
    }
  }

  // The buckets, canted back off the radius so they hold water on the way down
  // and spill it at the bottom. A radial board holds nothing and is the one
  // thing that makes a wheel read as a fan.
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const around = bucket / buckets * TAU

    parts.push(part(box(radius * 0.36, 0.07, width * 0.94), {
      at:     [ Math.cos(around) * radius * 0.83, Math.sin(around) * radius * 0.83, 0 ],
      rotate: [ 0, 0, around + 0.55 ],
      color:  bucket % 2 === 0 ? palette.plank : palette.woodDark,
      jitter: 0.11,
      rng,
    }))
  }

  return mergeParts(parts)
}
