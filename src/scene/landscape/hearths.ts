import type { HearthStack } from '../hearth.ts'
import { FARMHOUSE_CHIMNEY, SAUNA_FLUE } from '../props/buildings.ts'
import type { StackMouth } from '../props/buildings.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import type { HeightField } from './height.ts'
import type { Vec2 } from './path.ts'
import type { Standing } from './steading.ts'


/**
 * Where the smoke comes out, across the whole archipelago.
 *
 * Pure, and its own module for the reason `colony.ts` is one: it is an answer
 * about the ground and the arrangement standing on it, not about geometry. The
 * plume that rises out of these lives in `scene/hearth.ts`, and neither of them
 * has to know how the other works.
 *
 * Two stacks a holding — the farmhouse's brick chimney and the sauna's iron flue
 * — because those are the two buildings in the kit that were modelled with one.
 * The barn, the aitta and the woodshed have no fire in them, and giving them a
 * plume apiece would be smoke coming out of a hay loft.
 */

/**
 * How deep a plopped building sits into the ground it is levelled onto.
 *
 * `Ploppable.plop`'s own default, restated because two things now place
 * something against the same floor — the dressing raising the building and this
 * finding the top of its chimney — and a second answer to it is a plume hanging
 * a hand's breadth off its own stack.
 */
export const HEARTH_SINK = 0.05

/**
 * The floor a building will be levelled onto, near enough.
 *
 * *Approximated* rather than resolved, and it is worth being plain about that.
 * `Ploppable.plop` levels onto the highest ground under the building's own
 * footprint, and the footprint does not exist until the geometry has been built
 * — which happens in the dressing, on a tier that may not build it at all. So
 * the corners of the standing's claim are probed instead and the high one taken,
 * which is the same rule applied to a square rather than to an outline. On a
 * yard the layout has already flattened the two agree to a few centimetres, and
 * the error is inside a chimney either way.
 */
function floorUnder (field: HeightField, place: Standing, x: number, z: number): number {
  const cos = Math.cos(place.angle)
  const sin = Math.sin(place.angle)

  let floor = field.heightAt(x, z)

  for (const [ lx, lz ] of [[ -1, -1 ], [ 1, -1 ], [ 1, 1 ], [ -1, 1 ]]) {
    const cx = x + (lx * cos - lz * sin) * place.radius
    const cz = z + (lx * sin + lz * cos) * place.radius

    floor = Math.max(floor, field.heightAt(cx, cz))
  }

  return floor
}

/**
 * One stack, carried from the prop's own frame out into the world.
 *
 * The rotation is the same `rotateY` the building is raised with: it takes local
 * `+z` to `(sin θ, cos θ)` and local `+x` to `(cos θ, -sin θ)`, which is the
 * convention `steading.ts` faces every door by. The sign matters — a chimney is
 * 2.6 m off the middle of the ridge, so getting it wrong puts the smoke at the
 * wrong end of the house, and only on the seeds where the farmhouse does not
 * happen to face square.
 */
export function stackAt (
  field:  HeightField,
  place:  Standing,
  mouth:  StackMouth,
  origin: Vec2,
): HearthStack {
  const cos = Math.cos(place.angle)
  const sin = Math.sin(place.angle)
  const x   = place.x + origin.x
  const z   = place.z + origin.z

  return {
    x: x + mouth.x * cos + mouth.z * sin,
    y: floorUnder(field, place, x, z) - HEARTH_SINK + mouth.y,
    z: z - mouth.x * sin + mouth.z * cos,
  }
}

/** Every chimney and flue in the archipelago, at the mouth and in world space. */
export function surveyHearths (archipelago: ArchipelagoSurvey): HearthStack[] {
  const { field } = archipelago

  return archipelago.landmasses.flatMap(landmass => {
    const { places } = landmass.survey

    return [
      stackAt(field, places.farmhouse, FARMHOUSE_CHIMNEY, landmass.origin),
      stackAt(field, places.sauna, SAUNA_FLUE, landmass.origin),
    ]
  })
}
