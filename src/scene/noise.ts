import { hash2, smoothstep } from 'threejs-scene'


function valueNoise (x: number, z: number, seed: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const tx = smoothstep(0, 1, x - x0)
  const tz = smoothstep(0, 1, z - z0)

  const a = hash2(x0 + seed * 0.013, z0 - seed * 0.017)
  const b = hash2(x0 + 1 + seed * 0.013, z0 - seed * 0.017)
  const c = hash2(x0 + seed * 0.013, z0 + 1 - seed * 0.017)
  const d = hash2(x0 + 1 + seed * 0.013, z0 + 1 - seed * 0.017)

  const top    = a + (b - a) * tx
  const bottom = c + (d - c) * tx
  return top + (bottom - top) * tz
}

/**
 * Where the central massif is, when nobody says otherwise.
 *
 * The lift exists so the island has high ground in the middle rather than a
 * uniform field of dunes, so it is a fact about the *island* — but this sampler
 * is also the field behind the clouds, the aurora and the mist, and those pass
 * coordinates in their own texture spaces where a lift centred on the world
 * origin means nothing at all. They get the default and ignore it; the terrain
 * passes its own radius, so a bigger island keeps its massif instead of
 * flattening out into the sea it grew into.
 */
const LIFT_RADIUS = 58

/**
 * How much of the amplitude the lift is worth at the centre.
 *
 * The fBm alone averages to nothing, so an island built from it is a field of
 * dunes with no shape at the scale you actually look at it — and the bigger the
 * island, the flatter it reads, because the falloff still has to bring the whole
 * rim down to the same sea. The lift is the massif: what makes the middle high
 * ground and the edges low, so a beck has somewhere to spring from and a
 * hillside to run down.
 */
const LIFT_AMOUNT = 0.16

export function sampleHeight (
  x:          number,
  z:          number,
  seed:       number,
  amplitude:  number,
  liftRadius: number = LIFT_RADIUS,
  liftAmount: number = LIFT_AMOUNT,
): number {
  let frequency   = 0.055
  let weight      = 1
  let total       = 0
  let weightTotal = 0

  for (let octave = 0; octave < 4; octave += 1) {
    total += valueNoise(x * frequency, z * frequency, seed + octave * 97) * weight
    weightTotal += weight
    frequency *= 2.04
    weight *= 0.48
  }

  const radialLift = Math.max(0, 1 - Math.hypot(x, z) / liftRadius) * liftAmount
  return (total / weightTotal * 2 - 1 + radialLift) * amplitude
}

/**
 * How far the coast stands out from the circle it would otherwise be.
 *
 * A radial falloff draws a perfect disc, and nothing in the sea is a disc. The
 * fix is not to add detail to the *height* — that only roughens a coastline
 * that is still round — but to move the falloff itself in and out with the
 * bearing, so the island grows headlands where the value is high and bays where
 * it is low. Everything downstream then inherits the shape for free: the beach
 * shelving, the foam, the placement searches and the mist's land mask are all
 * written against the falloff rather than against a circle.
 *
 * Two octaves, and deliberately not four. The first sets how many headlands
 * there are and the second stops them being identical; a third would be
 * roughness at a scale the beach shelving is about to smooth away anyway, and
 * this runs on every terrain vertex and every placement probe.
 *
 * @param x - World position.
 * @param z - World position.
 * @param seed - Scape seed. Offset internally, so the coast is not a contour of
 * the terrain that stands inside it.
 * @returns Signed, roughly -1..1, in fractions of the falloff band.
 */
export function coastWarp (x: number, z: number, seed: number): number {
  const broad = valueNoise(x * 0.0125, z * 0.0125, seed ^ 0x51ed)
  const fine  = valueNoise(x * 0.0289, z * 0.0289, seed ^ 0x2b7f)

  return (broad * 2 - 1) * 0.72 + (fine * 2 - 1) * 0.28
}
