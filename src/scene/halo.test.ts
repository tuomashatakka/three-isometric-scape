import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import { sunHeight, sunSwing } from './daylight.ts'
import {
  HALO_RING,
  ICE_INDEX,
  dogLight,
  haloHorizon,
  haloLight,
  haloPeak,
  haloPlace,
  haloSpan,
  haloVeil,
  parhelionAngle,
  pillarLight,
} from './halo.ts'
import { LADDER, atmosphereQuality, unlockEffects } from './quality.ts'
import { bowLight } from './rainbow.ts'
import { snowAmount } from './season.ts'
import { showerAmount } from './weather.ts'


const { latitude, axialTilt } = SCAPE_CONFIG.daylight
const YEAR                    = SCAPE_CONFIG.season.time
const LEAD                    = SCAPE_CONFIG.halo.lead
const DEGREES                 = Math.PI / 180

/** The sine of the sun's elevation at an hour of a week, on this coast's own arc. */
function sun (time: number, year = YEAR): number {
  return sunHeight(time, year, latitude, axialTilt)
}

/** The sine of an elevation in degrees, for reading the optics off an angle. */
function at (degrees: number): number {
  return Math.sin(degrees * DEGREES)
}

/** The frozen share of the fall at a week, exactly as `weather.ts` takes it. */
function sleet (year: number): number {
  return Math.min(1, Math.max(0, snowAmount(year) * SCAPE_CONFIG.season.snow))
}

/**
 * The claim the module is named for, as a fact about the numbers: a halo is
 * drawn about the sun itself. Get this wrong by a sign and the ring appears
 * opposite the sun, which is where the bow already is — and the two would
 * then be indistinguishable in a still taken from the right heading.
 */
describe('where the ring stands', () => {
  test('the centre is the sun, at its own height and bearing', () => {
    for (const time of [ 0.1, 0.25, 0.42, 0.5, 0.78, 0.95 ]) {
      const place = haloPlace(time, YEAR, latitude, axialTilt)

      expect(place.height).toBeCloseTo(sun(time), 12)
      expect(place.swing).toBeCloseTo(sunSwing(time, YEAR, latitude, axialTilt), 12)
    }
  })

  /**
   * The ring is where ice puts it, and ice does not move. 21.84° is the angle
   * of minimum deviation of a 60° prism at {@link ICE_INDEX}, and the constant
   * is checked against the arithmetic so a future edit to one cannot silently
   * leave the other behind.
   */
  test('the ring is the minimum deviation of a 60-degree ice prism', () => {
    const solved = 2 * Math.asin(ICE_INDEX * Math.sin(30 * DEGREES)) / DEGREES - 60

    expect(solved).toBeCloseTo(HALO_RING, 2)
  })

  /**
   * The horizon sits exactly the sun's own elevation below the centre, which is
   * what makes the sea take the bottom of the ring at sunrise and nothing else
   * at any other hour. The bow's cut runs the other way, and a sign slip here
   * would read as a ring hanging in the air with its feet cut off above the
   * water.
   */
  test('the sea cuts the quad below the centre, by the sun elevation', () => {
    expect(haloHorizon(at(0))).toBeCloseTo(0, 12)
    expect(haloHorizon(at(10))).toBeLessThan(0)
    expect(haloHorizon(at(30))).toBeLessThan(haloHorizon(at(10)))
    expect(haloHorizon(at(-5))).toBeGreaterThan(0)
  })

  /** Hung a share of a frame out, with its size following from the opening angle. */
  test('the span is frame-sized and scales with the view', () => {
    const near = haloSpan(100, 0.3)
    const far  = haloSpan(400, 0.3)

    expect(far.out).toBeCloseTo(near.out * 4, 10)
    expect(far.size).toBeCloseTo(near.size * 4, 10)
    expect(haloSpan(100, 0).out).toBe(0)
    expect(haloSpan(100, -1).out).toBe(0)
  })
})

/**
 * The claim `parhelionAngle` exists to make, as three numbers: a parhelion
 * starts on the ring when the sun is on the horizon and walks outward from it
 * as the sun climbs. A version pinned to 21.84° would pass every other test
 * in this file and be wrong in every frame but one.
 */
describe('the mock suns', () => {
  test('they start on the ring and walk outward with the sun', () => {
    const flat = parhelionAngle(at(0))
    const low  = parhelionAngle(at(20))
    const high = parhelionAngle(at(36))

    expect(flat).toBeCloseTo(HALO_RING, 1)
    expect(low).toBeGreaterThan(flat as number)
    expect(high).toBeGreaterThan(low as number)
  })

  /**
   * And the refraction runs out. Past about 60.75° the effective index passes
   * 2, `asin` has no answer and there are no mock suns at all — which is a fact
   * about ice rather than a gate, and the reason the function returns `null`
   * rather than a clamped angle.
   */
  test('they give out above 60.75 degrees of sun', () => {
    expect(parhelionAngle(at(60))).not.toBeNull()
    expect(parhelionAngle(at(62))).toBeNull()
    expect(parhelionAngle(at(89))).toBeNull()
    expect(parhelionAngle(1)).toBeNull()
  })

  /**
   * Long before the geometry runs out, the sight does. The fade is what keeps a
   * dragged `latitude` from hanging two patches off the edge of the quad, and
   * it has to be complete by the elevation {@link EDGE} was sized for.
   */
  test('they fade out well below where the geometry does', () => {
    expect(dogLight(at(0))).toBeCloseTo(1, 10)
    expect(dogLight(at(15))).toBeCloseTo(1, 10)
    expect(dogLight(at(32))).toBeLessThan(1)
    expect(dogLight(at(32))).toBeGreaterThan(0)
    expect(dogLight(at(46))).toBe(0)
  })

  /**
   * The furthest a mock sun can get while anything is left of it, plus its own
   * tail, has to fit inside the quad — otherwise the fade this scape never
   * reaches would be hiding a straight clipped edge rather than a glow.
   */
  test('every mock sun worth drawing fits inside the quad', () => {
    for (let degree = 0; degree <= 60; degree += 0.5) {
      const angle = parhelionAngle(at(degree))

      if (angle !== null && dogLight(at(degree)) > 0)
        expect(angle).toBeLessThan(44)
    }
  })
})

/** A pillar is the first and last hour of the day, and no other. */
describe('the shaft', () => {
  test('it stands at a low sun and is gone at a high one', () => {
    expect(pillarLight(at(0))).toBeCloseTo(1, 10)
    expect(pillarLight(at(4))).toBeLessThan(1)
    expect(pillarLight(at(4))).toBeGreaterThan(0)
    expect(pillarLight(at(9))).toBe(0)
    expect(pillarLight(at(40))).toBe(0)
  })
})

/**
 * The veil is the shower sampled a lead ahead, weighted by how little is
 * falling here — so its peak lands *before* a band rather than inside it.
 * That is the whole of what makes this the bow's opposite number in time, and
 * a lead of zero collapses the two onto one instant.
 */
describe('when the ring is out', () => {
  test('the veil peaks ahead of the fall it belongs to', () => {
    const peak = haloPeak(LEAD)

    expect(haloVeil(peak, LEAD)).toBeGreaterThan(haloVeil(peak + 0.1, LEAD))
    expect(haloVeil(peak, LEAD)).toBeGreaterThan(haloVeil(peak - 0.1, LEAD))
    expect(showerAmount(peak + LEAD)).toBeGreaterThan(showerAmount(peak))
  })

  /** Periodic, like every other reading of the front. */
  test('the veil is periodic in the front', () => {
    for (const phase of [ 0, 0.17, 0.38, 0.61, 0.94 ])
      expect(haloVeil(phase + 1, LEAD)).toBeCloseTo(haloVeil(phase, LEAD), 12)
  })

  /**
   * The claim the whole system rests on, and the one a still cannot state: a
   * bow and a ring are the same sunlight meeting two different states of water,
   * so the frozen share of the fall is the entire switch between them. Nothing
   * else in either module reads it, which is why this can be measured at one
   * instant with only the sleet moving — and why the ends are exact zeros
   * rather than small numbers.
   */
  test('the frozen share is what chooses between a bow and a ring', () => {
    const height = at(8)
    const ring   = (frozen: number): number =>
      haloLight(haloPeak(LEAD), 1, frozen, height, 1, LEAD)
    const bow = (frozen: number): number => bowLight(0.201, 1, frozen, height, 1)

    expect(ring(0)).toBe(0)
    expect(bow(1)).toBe(0)
    expect(ring(1)).toBeGreaterThan(0)
    expect(bow(0)).toBeGreaterThan(0)

    for (let step = 1; step <= 10; step += 1) {
      const frozen = step / 10

      expect(ring(frozen)).toBeGreaterThan(ring(frozen - 0.1))
      expect(bow(frozen)).toBeLessThan(bow(frozen - 0.1))
    }
  })

  /** No sun, no ring — whatever the front and the year are doing. */
  test('a sun under the sea takes the ring away', () => {
    const peak = haloPeak(LEAD)

    expect(haloLight(peak, 1, 1, at(-3), 1, LEAD)).toBe(0)
    expect(haloLight(peak, 1, 1, at(6), 1, LEAD)).toBeGreaterThan(0)
  })

  /** A fall of rain has nothing to refract a ring through. */
  test('an unfrozen fall takes the ring away', () => {
    const peak = haloPeak(LEAD)

    expect(haloLight(peak, 1, 0, at(6), 1, LEAD)).toBe(0)
    expect(haloLight(peak, 0, 1, at(6), 1, LEAD)).toBe(0)
    expect(haloLight(peak, 1, 1, at(6), 0, LEAD)).toBe(0)
  })

  /**
   * This coast gets one, and it gets it in the weeks it should. The window has
   * to exist — a system no week of the year can show is a system nobody finds —
   * and it has to sit either side of the dark rather than in midsummer, which
   * is what the `halo` poses are parked on.
   */
  test('the coast has a window, and it is at the edges of the dark', () => {
    const peak = haloPeak(LEAD)
    const lit  = (year: number): number => haloLight(
      peak,
      SCAPE_CONFIG.weather.rain,
      sleet(year),
      sun(0.5, year),
      SCAPE_CONFIG.halo.strength,
      LEAD,
    )

    expect(lit(0.125)).toBeGreaterThan(0.1)
    expect(lit(0.9)).toBeGreaterThan(0.1)
    expect(lit(0.5)).toBe(0)
    expect(lit(0)).toBeLessThan(0.01)
  })
})

/** The cheapest tier draws no quad at all, and every other one draws the ring. */
describe('every tier still has to run', () => {
  test('the ladder spends on the ring in the right order', () => {
    const tiers = LADDER.map(tier => atmosphereQuality(tier).haloArcs)

    expect(tiers[0]).toBe(0)
    for (const arcs of tiers.slice(1))
      expect(arcs).toBeGreaterThan(0)
  })

  /** Unlocking turns the system on without handing a phone a workstation's budget. */
  test('unlocking gives the cheapest tier the ring on its own', () => {
    const minimal  = atmosphereQuality(LADDER[0])
    const unlocked = unlockEffects(minimal)

    expect(minimal.haloArcs).toBe(0)
    expect(unlocked.haloArcs).toBe(1)
  })
})
