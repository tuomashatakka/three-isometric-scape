import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { ball, box, cone, cyl, rock } from './primitives.ts'


/**
 * The seamark — a coastal light, and the beams it throws.
 *
 * Two builders, because they are two different things: the tower is masonry and
 * belongs in the merged settlement draw like every other building, while the
 * optic is light and cannot be. Nothing about a stone tower moves, and nothing
 * about a rotating beam can be baked into ground geometry.
 *
 * Local frame like the rest of the kit: base at `y = 0`, the door on `+z`. The
 * tower is deliberately short for a lighthouse — eleven metres, not thirty —
 * because this scape's buildings are five metres tall and a scale tower would
 * read as a chimney stack dropped into a model village. It is the tallest thing
 * in the archipelago all the same.
 */

/**
 * How far the tower is set into the rock it stands on, in metres.
 *
 * Read by `dressing.ts` when the tower is raised and by `landscape/index.ts`
 * when the lamp above it is placed — the same reason `MILL_SINK` is exported.
 * A sink applied at one end and defaulted at the other is a beam leaving the
 * lantern half a metre under its own floor.
 */
export const BEACON_SINK = 0.24

const PLINTH_TOP = 0.72

/** Course heights up the shaft, foot to gallery. Sum is the shaft's height. */
const COURSES = [ 1.7, 1.6, 1.5, 1.3, 1.2 ]

/** Outer radius at each course boundary, foot to gallery. One more than COURSES. */
const RADII = [ 1.6, 1.48, 1.36, 1.24, 1.12, 1.02 ]

/** The course the paintwork bands — the middle one, so the band reads from any angle. */
const BAND_COURSE = 2

const SHAFT_TOP   = PLINTH_TOP + COURSES.reduce((total, height) => total + height, 0)
const CORBEL      = 0.35
const GALLERY_Y   = SHAFT_TOP + CORBEL
const GALLERY_TOP = GALLERY_Y + 0.12
const LANTERN     = 1.45
const RAIL_POSTS  = 10
const RAIL_RADIUS = 1.58
const GLAZING     = 8

/**
 * Height of the lamp above the tower's own base, in metres.
 *
 * Derived from the courses rather than written down beside them: the lamp is the
 * middle of the lantern room, and a hand-summed height is a glow that drifts out
 * of its own glazing the first time a course changes.
 */
export const LANTERN_HEIGHT = GALLERY_TOP + LANTERN / 2

/**
 * The tower, its gallery and the lantern room on top.
 *
 * Built as courses rather than as one tapered cylinder because a lighthouse is
 * a *battered* wall — the taper steepens toward the foot — and a single cone
 * from foot to gallery gives a straight-sided funnel that reads as a silo. Five
 * courses is enough for the profile to bend where the eye expects it to.
 */
export function buildLighthouse (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []

  // Dry-laid granite footing. Two courses, the lower one proud of the upper, so
  // the tower reads as standing on the rock rather than growing out of it.
  parts.push(part(cyl(2.16, 2.44, 0.42, 9), {
    at:     [ 0, 0.21, 0 ],
    color:  palette.granite,
    jitter: 0.1,
    rng,
  }))
  parts.push(part(cyl(1.78, 2.04, 0.3, 9), {
    at:     [ 0, 0.57, 0 ],
    color:  palette.graniteWarm,
    jitter: 0.1,
    rng,
  }))

  // Storm boulders piled against the footing on the seaward side. Placed on a
  // ring by the seed, which is what stops the pile being a decoration repeated
  // at every bearing.
  for (let index = 0; index < 6; index += 1) {
    const around = index / 6 * Math.PI * 2 + rng.range(-0.2, 0.2)
    const reach  = rng.range(2.3, 2.9)

    parts.push(part(rock(rng.range(0.34, 0.58)), {
      at:     [ Math.cos(around) * reach, rng.range(0.06, 0.2), Math.sin(around) * reach ],
      rotate: [ rng.range(0, 1), around, rng.range(0, 1) ],
      scale:  [ 1, rng.range(0.5, 0.8), 1 ],
      color:  index % 2 ? palette.granite : palette.graniteDark,
      jitter: 0.12,
      rng,
    }))
  }

  // The shaft, course by course. Twelve sides: at this radius a coarser drum
  // shows its facets against the sky from the zoomed-in poses.
  let level = PLINTH_TOP

  for (const [ index, height ] of COURSES.entries()) {
    parts.push(part(cyl(RADII[index + 1], RADII[index], height, 12), {
      at:     [ 0, level + height / 2, 0 ],
      color:  index === BAND_COURSE ? palette.faluRed : palette.trimWhite,
      jitter: 0.05,
      rng,
    }))

    level += height
  }

  // Corbelled stone carrying the gallery out past the wall, and the gallery deck.
  parts.push(part(cyl(1.74, RADII[RADII.length - 1], CORBEL, 12), {
    at:     [ 0, SHAFT_TOP + CORBEL / 2, 0 ],
    color:  palette.graniteWarm,
    jitter: 0.06,
    rng,
  }))
  parts.push(part(cyl(1.76, 1.76, 0.12, 12), {
    at:     [ 0, GALLERY_Y + 0.06, 0 ],
    color:  palette.iron,
    jitter: 0.05,
    rng,
  }))

  // The rail: posts, and a handrail in chords between them rather than a disc.
  // A disc at hand height is what a rail looks like from the side and a lid from
  // above, and above is where this camera is.
  for (let index = 0; index < RAIL_POSTS; index += 1) {
    const around = index / RAIL_POSTS * Math.PI * 2
    const next   = (index + 0.5) / RAIL_POSTS * Math.PI * 2
    const chord  = 2 * RAIL_RADIUS * Math.sin(Math.PI / RAIL_POSTS)

    parts.push(part(box(0.07, 0.62, 0.07), {
      at:     [ Math.cos(around) * RAIL_RADIUS, GALLERY_TOP + 0.31, Math.sin(around) * RAIL_RADIUS ],
      color:  palette.iron,
      jitter: 0.06,
      rng,
    }))
    parts.push(part(box(chord, 0.06, 0.06), {
      at: [
        Math.cos(next) * RAIL_RADIUS,
        GALLERY_TOP + 0.58,
        Math.sin(next) * RAIL_RADIUS,
      ],
      rotate: [ 0, -next, 0 ],
      color:  palette.iron,
      jitter: 0.06,
      rng,
    }))
  }

  // The lantern room: a glazed drum in an iron frame, with the lamp inside it.
  // The lamp is glass rather than light — what glows is `buildBeaconOptic`, and
  // this is the thing the glow is seen to be coming out of.
  parts.push(part(cyl(1.02, 1.06, LANTERN, GLAZING), {
    at:     [ 0, GALLERY_TOP + LANTERN / 2, 0 ],
    color:  palette.glass,
    jitter: 0.08,
    rng,
  }))

  for (let index = 0; index < GLAZING; index += 1) {
    const around = (index + 0.5) / GLAZING * Math.PI * 2

    parts.push(part(box(0.09, LANTERN, 0.09), {
      at:     [ Math.cos(around) * 1.02, GALLERY_TOP + LANTERN / 2, Math.sin(around) * 1.02 ],
      rotate: [ 0, -around, 0 ],
      color:  palette.iron,
      jitter: 0.05,
      rng,
    }))
  }

  parts.push(part(ball(0.4, 8), {
    at:     [ 0, LANTERN_HEIGHT, 0 ],
    color:  palette.lampWarm,
    jitter: 0.04,
    rng,
  }))

  // The cap, and the vent finial that lets the lamp's heat out.
  const capBase = GALLERY_TOP + LANTERN

  parts.push(part(cone(1.3, 0.86, GLAZING), {
    at:     [ 0, capBase + 0.43, 0 ],
    color:  palette.iron,
    jitter: 0.07,
    rng,
  }))
  parts.push(part(cyl(0.05, 0.07, 0.46, 6), {
    at:     [ 0, capBase + 0.86 + 0.23, 0 ],
    color:  palette.iron,
    jitter: 0.05,
    rng,
  }))
  parts.push(part(ball(0.11, 6), {
    at:     [ 0, capBase + 0.86 + 0.5, 0 ],
    color:  palette.iron,
    jitter: 0.05,
    rng,
  }))

  // The door, its threshold, and three stair lights up the wall. On `+z`, which
  // is the bearing `dressing.ts` turns landward.
  parts.push(part(box(0.94, 1.5, 0.14), {
    at:     [ 0, PLINTH_TOP + 0.75, RADII[0] - 0.06 ],
    color:  palette.tarWood,
    jitter: 0.07,
    rng,
  }))
  parts.push(part(box(1.16, 0.16, 0.6), {
    at:     [ 0, PLINTH_TOP - 0.04, RADII[0] + 0.24 ],
    color:  palette.granite,
    jitter: 0.08,
    rng,
  }))

  for (const [ index, height ] of [ 3.1, 5.4, 7.2 ].entries()) {
    const side = index % 2 ? 1 : -1
    const rise = (height - PLINTH_TOP) / (SHAFT_TOP - PLINTH_TOP)
    const wall = RADII[0] - rise * (RADII[0] - RADII[RADII.length - 1])

    parts.push(part(box(0.1, 0.5, 0.34), {
      at:     [ side * (wall - 0.05), height, 0 ],
      color:  palette.glass,
      jitter: 0.06,
      rng,
    }))
  }

  return mergeParts(parts, { grime: 1.6, grimeFloor: 0.7 })
}

export interface BeaconOpticOptions {

  /** Panels in the optic — how many beams sweep at once. 0 leaves the lamp alone. */
  blades: number

  /** How far a beam reaches out over the water, in metres. */
  reach: number

  /** Radius of a beam where it dies, in metres. */
  spread: number
}

/**
 * The light itself: a halo at the lamp, and one beam per panel of the optic.
 *
 * Built at the origin and in the *lamp's* frame rather than the tower's, because
 * this geometry is carried by an `InstancedMesh` centred on each lantern —
 * see `scene/beacon.ts`. The beams lie level: a real optic throws at the horizon
 * and a beam pitched down at the water reads as a searchlight.
 *
 * The colour is faded out along each beam by hand after the merge. Additive
 * geometry with a flat tint ends in a visible cone base — a hard-edged plate of
 * light hanging in the dark a hundred metres offshore — and no amount of opacity
 * fixes that, because the edge is in the geometry rather than in the blend.
 */
export function buildBeaconOptic (
  rng:     SeededRng,
  palette: NordicPalette,
  options: BeaconOpticOptions,
): BufferGeometry {
  const { blades, reach, spread } = options
  const parts: BufferGeometry[]   = [
    part(ball(0.66, 10), { color: palette.lampWarm, jitter: 0, rng }),
  ]

  for (let index = 0; index < Math.max(0, Math.round(blades)); index += 1) {
    const around = index / Math.max(1, Math.round(blades)) * Math.PI * 2

    // `part` rotates x, then y, then z. Laying the cone down on x and swinging
    // it on y is therefore the one order that composes here: the apex ends up on
    // the bearing rather than somewhere off it, which a z-then-y pair would give.
    parts.push(part(cone(spread, reach, 5), {
      at:     [ Math.sin(around) * reach / 2, 0, Math.cos(around) * reach / 2 ],
      rotate: [ -Math.PI / 2, around, 0 ],
      color:  palette.lampWarm,
      jitter: 0,
      rng,
    }))
  }

  const geometry = mergeParts(parts)

  fadeFromLamp(geometry, reach)

  return geometry
}

/** Dim the baked colour toward nothing at `reach` metres from the lamp. */
function fadeFromLamp (geometry: BufferGeometry, reach: number): void {
  const position = geometry.getAttribute('position')
  const color    = geometry.getAttribute('color')

  for (let index = 0; index < color.count; index += 1) {
    const distance = Math.hypot(position.getX(index), position.getY(index), position.getZ(index))
    const fade     = Math.max(0, 1 - distance / reach) ** 1.7

    color.setXYZ(
      index,
      color.getX(index) * fade,
      color.getY(index) * fade,
      color.getZ(index) * fade,
    )
  }

  color.needsUpdate = true
}
