import type { HearthStack } from '../hearth.ts'
import { FARMHOUSE_CHIMNEY, SAUNA_FLUE } from '../props/buildings.ts'
import type { StackMouth } from '../props/buildings.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { fixtureAt } from './fixtures.ts'
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
 *
 * The transform out of the prop's frame is [`fixtures.ts`](fixtures.ts), shared
 * with the lamplight in the windows of the same two buildings.
 */

/**
 * One stack, carried from the prop's own frame out into the world.
 *
 * The sign matters — a chimney is 2.6 m off the middle of the ridge, so getting
 * it wrong puts the smoke at the wrong end of the house, and only on the seeds
 * where the farmhouse does not happen to face square.
 */
export function stackAt (
  field:  HeightField,
  place:  Standing,
  mouth:  StackMouth,
  origin: Vec2,
): HearthStack {
  return fixtureAt(field, place, mouth, origin)
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
