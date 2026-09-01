import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from './config.ts'
import { atmosphereQuality } from './quality.ts'
import { showerAmount } from './weather.ts'
import {
  squallBandWidth,
  squallCover,
  squallOffset,
  squallReveal,
  squallSheetSize,
  squallTileSize,
} from './squall.ts'


const { camera, weather, squall } = SCAPE_CONFIG

/** The three frames every scale helper is judged at: closest, middle, widest. */
const VIEWS = [
  camera.minViewSize,
  (camera.minViewSize + camera.maxViewSize) / 2,
  camera.maxViewSize,
] as const

/** One pass of the front, at the resolution the claims below are made at. */
const CYCLE = Array.from({ length: 200 }, (_unused, step) => step / 200)

describe('squallCover', () => {
  test('never leaves the water dry while it is raining on it', () => {
    // The reason it is a maximum rather than the lead alone: the shower must not
    // vanish at the moment the drops start falling here.
    for (const phase of CYCLE)
      expect(squallCover(phase, squall.lead, 1)).toBeGreaterThanOrEqual(showerAmount(phase))
  })

  test('is standing on the water before the fall reaches the ground', () => {
    // The claim the module is named after, stated as a fact about the curve
    // rather than as a re-implementation of it: there is a stretch of the front
    // where the sea is under a shower and the farm is not.
    const early = CYCLE.filter(phase =>
      showerAmount(phase) < 0.01 && squallCover(phase, squall.lead, 1) > 0.2)

    expect(early.length).toBeGreaterThan(4)
  })

  test('a coast it never rains on has nothing crossing its water', () => {
    for (const phase of CYCLE)
      expect(squallCover(phase, squall.lead, 0)).toBe(0)
  })

  test('never leaves the unit range', () => {
    for (const phase of CYCLE) {
      expect(squallCover(phase, squall.lead, 1)).toBeGreaterThanOrEqual(0)
      expect(squallCover(phase, squall.lead, 1)).toBeLessThanOrEqual(1)
    }
  })

  test('wraps with the front rather than running off the end of it', () => {
    expect(squallCover(0.98, squall.lead, 1)).toBeCloseTo(squallCover(-0.02, squall.lead, 1), 10)
  })
})

describe('squallOffset', () => {
  test('stands the shower upwind while the front is still coming', () => {
    // Every phase where the sea is wet and the ground is not is a phase where
    // the band has to be somewhere the reader is not, or the shower is standing
    // on top of the farm claiming to be on its way.
    const approaching = CYCLE.filter(phase =>
      showerAmount(phase) < 0.01 && squallCover(phase, squall.lead, 1) > 0.2)

    for (const phase of approaching)
      expect(squallOffset(phase, squall.lead)).toBeGreaterThan(0)
  })

  test('has carried it downwind by the time the fall is over', () => {
    const clearing = CYCLE.filter(phase =>
      showerAmount(phase) > 0.2 && showerAmount(phase + squall.lead) < 0.01)

    expect(clearing.length).toBeGreaterThan(4)

    for (const phase of clearing)
      expect(squallOffset(phase, squall.lead)).toBeLessThan(0)
  })

  test('crosses the middle exactly once on the way through', () => {
    // A band that fades in where it stands is the failure this catches: the sign
    // has to change, and change from upwind to downwind, over the squall.
    //
    // Over *the squall*, and the window says so: the front has a trailing band
    // an hour behind the first one, and that band's own approach turns the sign
    // positive again on the way to it. Two crossings of the frame is two
    // crossings, and reading past 0.4 would be asserting that the second shower
    // does not happen.
    const across = CYCLE
      .filter(phase => phase > 0.15 && phase < 0.4)
      .map(phase => squallOffset(phase, squall.lead))

      // The crossing itself is an exact zero at the front's own centre, where
      // the two readings meet. Counting it would count one crossing as two.
      .filter(value => value !== 0)
    const flips = across.filter((value, index) =>
      index > 0 && Math.sign(value) !== Math.sign(across[index - 1]))

    expect(flips.length).toBe(1)
    expect(across[0]).toBeGreaterThan(0)
    expect(across[across.length - 1]).toBeLessThan(0)
  })

  test('parks the shower where it stands when there is no lead to read', () => {
    for (const phase of CYCLE)
      expect(squallOffset(phase, 0)).toBe(0)
  })
})

describe('squallReveal', () => {
  test('is gone at the closest frame and full at the widest', () => {
    expect(squallReveal(VIEWS[0], camera)).toBe(0)
    expect(squallReveal(VIEWS[2], camera)).toBe(1)
  })

  test('is already up at the middle of the range, unlike a sky deck', () => {
    // The distinction the module hangs off: a deck fades out on the way in
    // because the camera ends up under it, and a sheet on the water is something
    // the camera is always above. If this ever reads 0 the shower has quietly
    // become a deck.
    expect(squallReveal(VIEWS[1], camera)).toBe(1)
  })

  test('never leaves the unit range at any frame', () => {
    for (const view of [ ...VIEWS, 0, camera.maxViewSize * 4 ]) {
      expect(squallReveal(view, camera)).toBeGreaterThanOrEqual(0)
      expect(squallReveal(view, camera)).toBeLessThanOrEqual(1)
    }
  })
})

describe('squallSheetSize', () => {
  test('follows the frame rather than the world', () => {
    for (const view of VIEWS)
      expect(squallSheetSize(view)).toBeCloseTo(squallSheetSize(1) * view, 6)

    expect(squallSheetSize(VIEWS[1] * 2)).toBeCloseTo(squallSheetSize(VIEWS[1]) * 2, 6)
  })

  test('covers the frame at every zoom with its own rim outside it', () => {
    // The rim is faded from 0.46 of the sheet outwards, so the sheet has to reach
    // well past the frame or the fade itself is in the picture. A diagonal pan is
    // the worst case, hence the corner rather than the edge.
    for (const view of VIEWS)
      expect(squallSheetSize(view) * 0.46).toBeGreaterThan(view * Math.SQRT1_2)
  })
})

describe('squallTileSize', () => {
  test('keeps the same number of tiles in frame at every zoom', () => {
    // The whole reason the tile follows the frame: the repeat count is what the
    // shader divides one by the other for, and a field that does not wrap can
    // only be repeated a handful of times before the blend that hides its seams
    // stops being enough.
    const repeats = VIEWS.map(view => squallSheetSize(view) / squallTileSize(view))

    for (const repeat of repeats) {
      expect(repeat).toBeCloseTo(repeats[0], 10)
      expect(repeat).toBeLessThan(8)
    }
  })
})

describe('squallBandWidth', () => {
  test('reads span against the frame rather than against the sheet', () => {
    // The bug this exists to prevent, and it shipped once: a span authored as a
    // share of the frame but handed to a sheet several frames wide puts the
    // whole shower outside the picture, which looks exactly like no shower.
    const frames = squallSheetSize(1)

    expect(squallBandWidth(1)).toBeCloseTo(1 / frames, 10)
    expect(squallBandWidth(squall.span)).toBeLessThan(0.5)
  })

  test('never collapses to a band with no width', () => {
    expect(squallBandWidth(0)).toBeGreaterThan(0)
    expect(squallBandWidth(-1)).toBeGreaterThan(0)
  })
})

describe('the tier gate', () => {
  test('the cheapest tier has no shower at all, and every other tier does', () => {
    expect(atmosphereQuality('minimal').squallSheets).toBe(0)

    for (const tier of [ 'mobile', 'desktop', 'ultra' ] as const)
      expect(atmosphereQuality(tier).squallSheets).toBeGreaterThan(0)
  })

  test('a phone gets a shallower shower rather than a smaller one', () => {
    // The count is the only thing that moves between the tiers: nothing in the
    // module scales the sheet, the sweep or the span by it, so the mobile shower
    // covers the same water the desktop one does with less depth in it.
    expect(atmosphereQuality('mobile').squallSheets)
      .toBeLessThan(atmosphereQuality('desktop').squallSheets)
  })
})

describe('the default shower', () => {
  test('is on the water at the frame the captures open on', () => {
    // A headline about something visible that no pose can see is the failure
    // mode the brief names. The tour's wide poses are all taken at the authored
    // view size, so this is the assertion that says they can see it.
    const seen = squallCover(weather.time, squall.lead, weather.rain) *
      squall.strength *
      squallReveal(camera.viewSize, camera)

    expect(seen).toBeGreaterThan(0.2)
  })

  test('is still on its way in at that same frame', () => {
    // And the assertion that says what they can see is the *approach* rather
    // than a shower parked over the farmyard, which is the picture the run is
    // actually claiming.
    expect(squallOffset(weather.time, squall.lead)).toBeGreaterThan(0)
  })

  test('travels on the wind rather than on a clock of its own', () => {
    // A share, so `wind.speed=0` — which every capture sets — holds the stipple
    // without this knob being named separately. It is named in `STILL` anyway.
    expect(squall.drift).toBeGreaterThan(0)
  })
})
