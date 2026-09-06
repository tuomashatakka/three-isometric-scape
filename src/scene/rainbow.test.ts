import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import { sunHeight, sunSwing } from './daylight.ts'
import { LADDER, atmosphereQuality, unlockEffects } from './quality.ts'
import { bowHorizon, bowLight, bowPlace, bowReveal, bowSpan } from './rainbow.ts'
import { showerAmount } from './weather.ts'


const { latitude, axialTilt } = SCAPE_CONFIG.daylight
const LIMITS                  = SCAPE_CONFIG.camera
const YEAR                    = SCAPE_CONFIG.season.time

/** The sine of the sun's elevation at an hour of a week, on this coast's own arc. */
function sun (time: number, year = YEAR): number {
  return sunHeight(time, year, latitude, axialTilt)
}

/** Wrap a bearing into (−π, π], so two headings half a turn apart can be compared. */
function wrap (angle: number): number {
  const turned = (angle + Math.PI) % (Math.PI * 2)

  return (turned < 0 ? turned + Math.PI * 2 : turned) - Math.PI
}

/**
 * The claim the module is named for, as a fact about the numbers rather than a
 * comment: a rainbow is drawn about the point exactly opposite the sun. Get
 * this wrong by a sign and the bow appears over the sun, which is the one place
 * in the sky it can never be.
 */
describe('bowPlace', () => {
  test('is the antisolar point at every hour of the day', () => {
    for (const time of [ 0, 0.12, 0.28, 0.42, 0.5, 0.61, 0.75, 0.94 ]) {
      const place = bowPlace(time, YEAR, latitude, axialTilt)

      expect(place.height).toBeCloseTo(-sun(time), 12)
      expect(Math.abs(wrap(place.swing - sunSwing(time, YEAR, latitude, axialTilt))))
        .toBeCloseTo(Math.PI, 12)
    }
  })

  test('sinks as the sun climbs, and stands as it sets', () => {
    const morning = bowPlace(0.3, YEAR, latitude, axialTilt)
    const noon    = bowPlace(0.5, YEAR, latitude, axialTilt)

    expect(sun(0.5)).toBeGreaterThan(sun(0.3))
    expect(noon.height).toBeLessThan(morning.height)
  })

  test('is the same place for the same hour of the same week, every time', () => {
    const once  = bowPlace(0.31, 0.44, latitude, axialTilt)
    const again = bowPlace(0.31, 0.44, latitude, axialTilt)

    expect(once).toEqual(again)
  })
})

describe('bowLight', () => {
  const RAIN     = SCAPE_CONFIG.weather.rain
  const STRENGTH = SCAPE_CONFIG.rainbow.strength

  /**
   * The phase at which half of the front's first band has come over, which is
   * where the parabola peaks and the brightest bow of the pass stands.
   */
  const HALF_COVER = 0.20163

  test('needs the sun up: nothing at all through the night', () => {
    expect(bowLight(HALF_COVER, RAIN, 0, sun(0.02, 0.78), STRENGTH)).toBe(0)
  })

  test('needs drops: nothing in the clear spell between the bands', () => {
    expect(showerAmount(0)).toBe(0)
    expect(bowLight(0, RAIN, 0, sun(0.3), STRENGTH)).toBe(0)
  })

  test('needs a gap: nothing under the heaviest fall of the front', () => {
    expect(showerAmount(0.3)).toBeCloseTo(1, 6)
    expect(bowLight(0.3, RAIN, 0, sun(0.3), STRENGTH)).toBeCloseTo(0, 6)
  })

  /**
   * The behaviour the parabola is there for. A bow belongs to the *edge* of a
   * shower — the minutes it is arriving and the minutes it is leaving — and the
   * failure this catches is a curve that simply followed the fall and put the
   * brightest bow of the front inside the darkest part of it.
   */
  test('stands brightest on the edges of a band and not in the middle of it', () => {
    const low = sun(0.3)

    expect(bowLight(HALF_COVER, RAIN, 0, low, STRENGTH))
      .toBeGreaterThan(bowLight(0.3, RAIN, 0, low, STRENGTH))
    expect(bowLight(0.38, RAIN, 0, low, STRENGTH))
      .toBeGreaterThan(bowLight(0.3, RAIN, 0, low, STRENGTH))
  })

  test('is a full-strength bow on a coast that gets a full-strength shower', () => {
    expect(bowLight(HALF_COVER, 1, 0, sun(0.3), 1)).toBeCloseTo(1, 2)
  })

  test('has no bow over a snow shower', () => {
    expect(bowLight(HALF_COVER, RAIN, 1, sun(0.3), STRENGTH)).toBe(0)
  })

  test('is off when the strength is, because that is the only switch it has', () => {
    expect(bowLight(HALF_COVER, RAIN, 0, sun(0.3), 0)).toBe(0)
  })

  /**
   * The geometry, stated as a fact. The outer bow is 51° from the antisolar
   * point, so a sun higher than that has pushed the whole phenomenon under the
   * sea — and a sun lower than 42° has both arcs standing over it.
   */
  test('goes out once the sun climbs past the outer arc', () => {
    const OVER  = Math.sin(53 * Math.PI / 180)
    const UNDER = Math.sin(35 * Math.PI / 180)

    expect(bowLight(HALF_COVER, RAIN, 0, OVER, STRENGTH)).toBe(0)
    expect(bowLight(HALF_COVER, RAIN, 0, UNDER, STRENGTH)).toBeGreaterThan(0)
  })

  /**
   * This coast, on the day the scape opens on. The sun tops out at about 45°
   * at midsummer, which is between the two arcs — so the middle of a midsummer
   * day here keeps the outer bow and loses the inner one, and the module has to
   * stay alive through it rather than switching off at 42°.
   */
  test('keeps the outer bow through a midsummer noon at this latitude', () => {
    const noon = sun(0.5)

    expect(Math.asin(noon) * 180 / Math.PI).toBeGreaterThan(42)
    expect(Math.asin(noon) * 180 / Math.PI).toBeLessThan(51)
    expect(bowLight(HALF_COVER, RAIN, 0, noon, STRENGTH)).toBeGreaterThan(0)
  })

  test('never leaves the range it promises', () => {
    for (let step = 0; step <= 60; step += 1) {
      const phase = step / 60
      const light = bowLight(phase, 1, 0, sun(phase), 1)

      expect(light).toBeGreaterThanOrEqual(0)
      expect(light).toBeLessThanOrEqual(1)
    }
  })
})

/**
 * The scale pass the brief asks of anything frame-sized: the minimum, the
 * middle and the maximum of the view.
 */
describe('bowSpan', () => {
  const VIEWS = [
    LIMITS.minViewSize,
    (LIMITS.minViewSize + LIMITS.maxViewSize) / 2,
    LIMITS.maxViewSize,
  ]

  test('hangs the bow the asked share of the frame out, at every view', () => {
    for (const view of VIEWS)
      expect(bowSpan(view, 0.42).out).toBeCloseTo(view * 0.42, 9)
  })

  test('holds one apparent size, because a sky does not grow with the eye', () => {
    const ratios = VIEWS.map(view => {
      const { out, size } = bowSpan(view, 0.42)

      return size / out
    })

    for (const ratio of ratios)
      expect(ratio).toBeCloseTo(ratios[0], 12)
  })

  /**
   * The quad has to hold the widest secondary the overlay can ask for. The
   * slider stops at 6°, the outer band is 1.6 times that across, and its centre
   * is 51° out — so the far edge of it lands at 55.8°, which must fall inside
   * the quad rather than being clipped square.
   */
  test('is wide enough to hold the widest bow the overlay offers', () => {
    const { out, size } = bowSpan(1_000, 0.42)
    const outer         = Math.tan((51 + 6 * 1.6 / 2) * Math.PI / 180) * out

    expect(size / 2).toBeGreaterThan(outer)
  })

  test('is nothing at all when the bow is hung nowhere', () => {
    expect(bowSpan(1_000, 0).out).toBe(0)
    expect(bowSpan(1_000, 0).size).toBe(0)
  })
})

/**
 * The claim the shader's cut has to keep: the top of the inner arc stands over
 * the sea by exactly 42° less the sun's own elevation, at every zoom and every
 * tilt. It is the number `scape:map --stats` prints as `apex`, so a bow that
 * disagreed with it would be a picture the instrument could not read.
 */
describe('bowHorizon', () => {
  const EDGE_TAN = Math.tan(58 * Math.PI / 180)
  const ring     = (degrees: number): number => Math.tan(degrees * Math.PI / 180) / EDGE_TAN

  test('is the quad’s own middle when the sun is on the horizon', () => {
    expect(bowHorizon(0)).toBe(0)
  })

  test('puts the inner arc exactly on the horizon when the sun stands at 42°', () => {
    expect(bowHorizon(Math.sin(42 * Math.PI / 180))).toBeCloseTo(ring(42), 12)
  })

  test('leaves the outer arc standing when the inner one has gone under', () => {
    const noon = bowHorizon(Math.sin(45.4 * Math.PI / 180))

    expect(noon).toBeGreaterThan(ring(42))
    expect(noon).toBeLessThan(ring(51))
  })

  test('rises with the sun, so a lower sun always shows more of the bow', () => {
    let last = -Infinity

    for (let degrees = 0; degrees <= 50; degrees += 2) {
      const cut = bowHorizon(Math.sin(degrees * Math.PI / 180))

      expect(cut).toBeGreaterThan(last)
      last = cut
    }
  })
})

describe('bowReveal', () => {
  test('is gone at the closest frame and whole at the widest', () => {
    expect(bowReveal(LIMITS.minViewSize, LIMITS)).toBe(0)
    expect(bowReveal(LIMITS.maxViewSize, LIMITS)).toBe(1)
  })

  test('is already whole at the frame the scape opens on', () => {
    expect(bowReveal(LIMITS.viewSize, LIMITS)).toBe(1)
  })

  test('never falls back as the view pulls out', () => {
    let last = -1

    for (let step = 0; step <= 40; step += 1) {
      const view    = LIMITS.minViewSize +
        (LIMITS.maxViewSize - LIMITS.minViewSize) * (step / 40)
      const reveal = bowReveal(view, LIMITS)

      expect(reveal).toBeGreaterThanOrEqual(last)
      last = reveal
    }
  })
})

describe('the tiers', () => {
  test('give the cheapest one a plain sky rather than a broken bow', () => {
    expect(atmosphereQuality('minimal').rainbowArcs).toBe(0)
  })

  /**
   * The claim the mobile count was corrected to make. Between 42° and 51° of
   * sun the secondary is the only arc over the sea, and this coast's midsummer
   * noon sits inside that band — so a phone given one arc would have a blank
   * sky through the middle of every summer day.
   */
  test('give a phone both arcs, because one of them is a season of sky', () => {
    expect(atmosphereQuality('mobile').rainbowArcs).toBe(2)
  })

  test('leave the primary alone as the floor an unlocked minimal gets', () => {
    expect(unlockEffects(atmosphereQuality('minimal')).rainbowArcs).toBe(1)
  })

  test('give every tier a bow once the effects are unlocked', () => {
    for (const tier of LADDER)
      expect(unlockEffects(atmosphereQuality(tier)).rainbowArcs).toBeGreaterThan(0)
  })

  test('never takes the outer arc off a tier that already had it', () => {
    const ultra = atmosphereQuality('ultra')

    expect(unlockEffects(ultra).rainbowArcs).toBe(ultra.rainbowArcs)
  })
})
