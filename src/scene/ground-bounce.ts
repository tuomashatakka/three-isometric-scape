import { Color } from 'three'

/**
 * The hemisphere's floor: the light the ground actually throws back up.
 *
 * It was two hand-set stand-ins. The hemisphere's ground colour was a fixed
 * share (0.7) of the meadow under the sky, at every hour and in every season,
 * and a second directional light — `bounce`, the meadow's colour, aimed from
 * the anti-sun a little above the horizon — stood in for the sunlit ground.
 * That second lamp was a directional light in every lit program on every tier,
 * lit the far side of every *roof* as brightly as a wall, and knew nothing of
 * snow: a midwinter yard under full cover bounced olive.
 *
 * A level ground of albedo `a` under sky irradiance `E_sky` and a key light at
 * height `y` (sine of elevation) with irradiance `E_key` sends up radiance
 * `a (E_sky + E_key y) / pi`; a face looking straight down at it receives
 * `pi` times that. three's hemisphere term is irradiance in the same units as
 * a directional light's `color * intensity * dotNL`, so the floor colour, at
 * the hemisphere's own intensity, is
 *
 *     ground = a * ( sky + key * keyIntensity * y * lit / skyIntensity )
 *
 * - **a** is the ground as it lies: the turf's albedo, blended to the snow's
 *   by the season's cover — a snowfield lights every eave, every bough's
 *   underside and every wall foot from below, as it does
 * - **lit** is the share of the ground the key reaches: the cloud shadow's
 *   mean darkness (`cover * shadow`) takes its cut, so the floor is warm in
 *   broken sun and goes to the sky's own grey under overcast
 * - **bounce** (`look.ao`, the indirect-light row) scales the key's share, so
 *   at zero the floor is the sky-lit ground alone and nothing else moves
 *
 * It rides the hemisphere term every program already evaluates: no light, no
 * uniform, no program — one directional light fewer in every lit program.
 */
export interface GroundBounce {

  /** The turf's linear albedo. */
  turf: Color

  /** The lying snow's linear albedo. */
  snow: Color

  /** Lying snow, 0..1. */
  cover: number

  /** The sky's colour, as the rig casts it. */
  sky: Color

  /** The sky light's intensity, as the rig casts it. */
  skyIntensity: number

  /** The key light's colour. */
  key: Color

  /** The key light's intensity. */
  keyIntensity: number

  /** Sine of the key's elevation. */
  keyHeight: number

  /** Mean cloud-shadow darkness over the ground, 0..1. */
  shade: number

  /** The key's share of the floor, `look.ao`. */
  bounce: number
}

/** The share of the snow's albedo a cover of 1 lays: the turf shows through tussocks and walls. */
export const SNOW_SHARE = 0.85

const albedo = new Color()
const keyed  = new Color()

/** The floor colour of the hemisphere, written into `out`. */
export function groundBounce (out: Color, ground: GroundBounce): Color {
  const cover = Math.min(1, Math.max(0, ground.cover)) * SNOW_SHARE
  const lit   = Math.max(0, 1 - ground.shade) * Math.max(0, ground.keyHeight) * Math.max(0, ground.bounce)
  const gain  = ground.keyIntensity * lit / Math.max(ground.skyIntensity, 1e-4)

  albedo.copy(ground.turf).lerp(ground.snow, cover)
  keyed.copy(ground.key).multiplyScalar(gain)

  return out.copy(ground.sky).add(keyed)
    .multiply(albedo)
}

// perf: a dozen scalar operations a frame on the cpu; the shader cost is a
// directional light *removed* from every lit program.
