import { BARN_WINDOWS, FARMHOUSE_WINDOWS, SAUNA_WINDOWS } from '../props/buildings.ts'
import type { WindowPane } from '../props/buildings.ts'
import type { WindowLight } from '../windows.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { fixtureAt } from './fixtures.ts'
import type { HeightField } from './height.ts'
import type { Vec2 } from './path.ts'
import type { Standing } from './steading.ts'


/**
 * Every pane of glass in the archipelago, in world space.
 *
 * The window equivalent of [`hearths.ts`](hearths.ts), and its neighbour for
 * exactly that reason: where a window *is* is a fact about the survey and the
 * prop's own frame, and whether a lamp is burning behind it answers to the hour
 * — which is `scene/windows.ts`'s business, one layer up with the daylight.
 *
 * Three of the five buildings are glazed. The aitta is a storehouse on staddle
 * stones and the woodshed is open on one side; neither was modelled with a
 * window, and inventing one here would be light coming out of a wall the
 * geometry does not have.
 */

/**
 * How lived-in a building is after dark, 0..1.
 *
 * The reason the barn does not read like the house. Not an occupancy switch —
 * `windows.occupancy` is that, and it is one number for the whole archipelago —
 * but a weight on it, so turning the scape's evening up lights the farmhouse
 * before it lights the byre, which is the order a farm actually lights up in.
 */
const DWELLING = {
  farmhouse: 1,
  sauna:     0.55,
  barn:      0.3,
} as const

/**
 * One pane, carried out of the prop's frame and turned to face the world.
 *
 * The yaw is the outward normal's bearing rather than the building's: a pane on
 * the far wall looks the other way, so it is the standing's angle turned half a
 * circle. Getting that wrong is a glow on the inside of the wall it belongs to,
 * which from the default pose looks like no glow at all.
 */
export function paneAt (
  field:    HeightField,
  place:    Standing,
  pane:     WindowPane,
  origin:   Vec2,
  dwelling: number,
): WindowLight {
  const at = fixtureAt(field, place, pane, origin)

  // The wall's own bearing before the pane's side of it is applied. A gable is
  // the long wall turned a quarter circle, which falls straight out of the
  // `rotateY` convention: local `+z` goes to `(sin θ, cos θ)` and local `+x` to
  // `(cos θ, -sin θ)`, and the second is the first a quarter turn on.
  const wall = pane.axis === 'x' ? place.angle + Math.PI / 2 : place.angle

  return {
    ...at,
    width:  pane.width,
    height: pane.height,
    angle:  pane.facing > 0 ? wall : wall + Math.PI,
    dwelling,
    centre: { x: place.x + origin.x, z: place.z + origin.z },
  }
}

/** Every glazed pane on every holding, ready to be lit. */
export function surveyWindows (archipelago: ArchipelagoSurvey): WindowLight[] {
  const { field } = archipelago

  return archipelago.landmasses.flatMap(landmass => {
    const { places } = landmass.survey

    return [
      ...FARMHOUSE_WINDOWS.map(pane => paneAt(field, places.farmhouse, pane, landmass.origin, DWELLING.farmhouse)),
      ...SAUNA_WINDOWS.map(pane => paneAt(field, places.sauna, pane, landmass.origin, DWELLING.sauna)),
      ...BARN_WINDOWS.map(pane => paneAt(field, places.barn, pane, landmass.origin, DWELLING.barn)),
    ]
  })
}
