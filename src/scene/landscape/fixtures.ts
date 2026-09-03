import type { HeightField } from './height.ts'
import type { Vec2 } from './path.ts'
import type { Standing } from './steading.ts'


/**
 * Carrying a point out of a building's own frame and into the world.
 *
 * Two things now ask a raised building where one of its own features ended up —
 * the chimneys in [`hearths.ts`](hearths.ts) and the windows in
 * [`windows.ts`](windows.ts) — and the transform is the same one both times.
 * It lives here rather than in either of them because a second copy of it is a
 * second chance to get the sign wrong, and a sign wrong here is smoke at the
 * far end of the house on the seeds where the farmhouse does not happen to face
 * square.
 */

/**
 * How deep a plopped building sits into the ground it is levelled onto.
 *
 * `Ploppable.plop`'s own default, restated because two things place something
 * against the same floor — the dressing raising the building and this finding
 * the top of its chimney — and a second answer to it is a plume hanging a hand's
 * breadth off its own stack.
 */
export const PLOP_SINK = 0.05

/** A point in the prop's own frame: base at `y = 0`, long axis on `x`. */
export interface LocalPoint {
  x: number
  y: number
  z: number
}

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
export function floorUnder (field: HeightField, place: Standing, x: number, z: number): number {
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
 * The floor a **merged** building was translated to.
 *
 * The counterpart of {@link floorUnder}, and the reason both exist. A plopped
 * building resolves its own floor from its footprint and grows a foundation down
 * onto whatever is under it, so the height that matters is the *highest* ground
 * it covers. A merged one is baked at build time and translated once — see
 * `placeHero` in `dressing.ts` — so the height that matters is the ground under
 * its origin and nothing else. Two rules, and a fixture that took the wrong one
 * is a chimney or a window hanging off the building it belongs to.
 */
export function mergedFloor (
  field:  HeightField,
  place:  Vec2,
  origin: Vec2,
  sink:   number,
): number {
  return field.heightAt(place.x + origin.x, place.z + origin.z) - sink
}

/**
 * One feature of a raised building, in world metres.
 *
 * The rotation is the same `rotateY` the building is raised with: it takes local
 * `+z` to `(sin θ, cos θ)` and local `+x` to `(cos θ, -sin θ)`, which is the
 * convention `steading.ts` faces every door by.
 *
 * @param floor The height the building's own `y = 0` ended up at, when the
 *   caller already knows it. Defaulted to the plopped answer — the highest
 *   ground under the footprint, less {@link PLOP_SINK} — because that is what
 *   every building in the yard is raised by.
 *
 *   A **merged** building is not raised that way and has to say so. `dressing.ts`
 *   translates one straight to `heightAt(x, z)` less its own sink, so the floor
 *   is the ground under the origin rather than under the high corner, and the
 *   two answers differ by the whole fall across the site. Left to default, a
 *   croft on a shelving islet gets its chimney and its windows lifted a third of
 *   a metre off the building they belong to.
 */
export function fixtureAt (
  field:  HeightField,
  place:  Standing,
  local:  LocalPoint,
  origin: Vec2,
  floor?: number,
): LocalPoint {
  const cos = Math.cos(place.angle)
  const sin = Math.sin(place.angle)
  const x   = place.x + origin.x
  const z   = place.z + origin.z

  return {
    x: x + local.x * cos + local.z * sin,
    y: (floor ?? floorUnder(field, place, x, z) - PLOP_SINK) + local.y,
    z: z - local.x * sin + local.z * cos,
  }
}
