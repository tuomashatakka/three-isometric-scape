import type { CroppingConfig } from '../config-cropping.ts'


/**
 * What one field is doing this year.
 *
 * Three states and not a number, because they are not three points on one
 * scale: a fallow is bare earth with full relief on it, a ley is green ground
 * with old relief under it, and corn is bare earth with a crop standing on it.
 * Any ordering of those three is a lie about one of the pairs.
 */
export type Course = 'corn' | 'ley' | 'fallow'

/**
 * The courses, as a stable iteration order.
 *
 * Not the order a field walks them — that is {@link rotationCycle}, and it
 * depends on how many years of each the rotation holds. This one exists so
 * that every reader that has to walk the three of them walks them the same
 * way, and so that gathering strips by course never depends on a `Map`'s
 * insertion order.
 */
export const COURSES: readonly Course[] = [ 'corn', 'ley', 'fallow' ]

/** The years of a rotation: how long the cycle is, and what is in it. */
export type Rotation = CroppingConfig['cropping']

/**
 * The cycle itself — one entry per year, in the order a field walks them.
 *
 * **The resting years are spread through the corn rather than stacked after
 * it**, and that is the decision in here that is neither arithmetic nor
 * cosmetic. A four-course rotation written out as corn, corn, grass, fallow is
 * a field that crops twice and then rests twice, which is not how any of them
 * were run: the Norfolk four-course — the one this is — alternates, cereal,
 * root or fallow, cereal, ley, because the point of the rest year is to come
 * *between* two crops rather than after both of them.
 *
 * It also decides what the small islands look like, and that is the part a
 * still shows. The fields of an island are dealt consecutive courses, and most
 * islands in this archipelago site two or three plots rather than four — so
 * with the resting years stacked at the end of the cycle, an island starting
 * two thirds of the way round it gets grass and fallow and **no standing crop
 * anywhere on it**. Three of these six did. Spread them, and any two
 * consecutive courses contain a corn year, which is as true of a farm as it is
 * of the picture.
 *
 * Clamped rather than validated. `ley` and `fallow` are counts a person types,
 * and the two together are allowed to exceed the cycle they are in; a farm with
 * three courses, two of grass and two of rest has asked for four years in a
 * three-year rotation. Taking the grass first and giving the rest whatever is
 * left is an answer. Throwing is not, because this runs inside the layout of
 * every island on the map.
 */
export function rotationCycle (rotation: Rotation): Course[] {
  const years  = Math.max(1, Math.floor(rotation.courses))
  const ley    = Math.min(years, Math.max(0, Math.floor(rotation.ley)))
  const fallow = Math.min(years - ley, Math.max(0, Math.floor(rotation.fallow)))

  const resting: Course[] = [
    ...Array.from({ length: ley }, (): Course => 'ley'),
    ...Array.from({ length: fallow }, (): Course => 'fallow'),
  ]

  const cycle: Course[] = Array.from({ length: years }, (): Course => 'corn')

  // Each resting year goes to the middle of its own even share of the cycle.
  // The share is at least one year wide, because the two counts above are
  // clamped to the cycle's own length, so no two of them ever land on the same
  // year and the corn that is left keeps the years between them.
  resting.forEach((course, index) => {
    cycle[Math.floor((index + 0.5) * years / resting.length)] = course
  })

  return cycle
}

/**
 * Which course each of an island's plots is in, in the order they were sited.
 *
 * The fields are dealt round the cycle rather than drawn from it, and that is
 * the decision in here that is not arithmetic. Rolling a course per field
 * independently gives a farm that is all corn one seed and all fallow the next,
 * because four draws from three states does that often enough to see; dealing
 * guarantees what a rotation actually guarantees — that over any `courses`
 * consecutive fields, every course appears exactly once.
 *
 * `shift` is where the island's first field is standing in the cycle. It is the
 * only part of this the seed touches, and it is what keeps six islands from
 * all having their corn in the same corner of the infield.
 */
export function courseRun (plots: number, rotation: Rotation, shift: number): Course[] {
  const cycle = rotationCycle(rotation)
  const start = (Math.floor(shift) % cycle.length + cycle.length) % cycle.length

  return Array.from({ length: Math.max(0, plots) }, (_unused, index) => cycle[(start + index) % cycle.length])
}

/**
 * How much of `rigs.crop` stands on a field in this course, 0..1.
 *
 * Corn, and nothing else. A ley has grass on it rather than a crop and the
 * ground colour is where that shows; a fallow has nothing on it at all, which
 * is the whole point of a fallow.
 */
export function cropShare (course: Course): number {
  return course === 'corn' ? 1 : 0
}

/**
 * How much of `rigs.crown` a field in this course still carries, 0..1.
 *
 * A fallow was ploughed this year like the corn beside it, so its relief is
 * full — a resting field is not an unworked one. Only the ley has had the
 * seasons to slump.
 */
export function crownShare (course: Course, rotation: Rotation): number {
  return course === 'ley' ? clamp01(rotation.leyCrown) : 1
}

/**
 * How far a standing crop has closed over its own furrows, 0..1.
 *
 * The corn course's ground, and nothing else uses it. The crowns lean further
 * — `rigs.crop` — so a cropped field still reads as rows close up and as green
 * pulled out, which is the pair this section needs and neither number gives on
 * its own.
 */
export function swardShare (rotation: Rotation): number {
  return clamp01(rotation.cornSward)
}

/**
 * How far a ley's ground has gone back to sward, 0..1.
 *
 * Here rather than read straight off the config because the clamp belongs
 * beside the other two: every share this section hands out is guaranteed to be
 * one, and the terrain painter should not have to know which of them a person
 * could have typed out of range.
 */
export function grassShare (rotation: Rotation): number {
  return clamp01(rotation.leyGrass)
}

function clamp01 (value: number): number {
  return Math.min(1, Math.max(0, value))
}
