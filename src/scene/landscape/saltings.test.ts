import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG, landmassLayout, landmassTerrain } from '../config.ts'
import type { LandmassSpec, ScapeConfig } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { createHeightField } from './height.ts'
import { createScapeLayout } from './layout.ts'
import type { Vec2 } from './path.ts'
import { fillSaltings, measureSaltings, saltingsClaim, saltingsTurf, solveSaltings } from './saltings.ts'


/**
 * One island, resolved once for the whole file.
 *
 * The dune belt's arrangement and for its reason: a flat is a fact about one
 * island's own coast, and a whole-archipelago survey would pay for five more
 * islands to prove one thing about the sixth. The sound is the island with the
 * largest marsh on it — the home island has none, because its beck comes out
 * through the dune belt — so it is the one the numbers are stated about.
 */
function localConfig (spec: LandmassSpec): ScapeConfig {
  return {
    ...SCAPE_CONFIG,
    seed:    (SCAPE_CONFIG.seed ^ spec.seedOffset) >>> 0,
    terrain: landmassTerrain(SCAPE_CONFIG, spec),
    layout:  landmassLayout(SCAPE_CONFIG, spec),
  }
}

/** The same island with the silt taken back off — the bare coast, and the control. */
function withoutSilt (config: ScapeConfig): ScapeConfig {
  return {
    ...config,
    terrain: { ...config.terrain, saltings: { ...config.terrain.saltings, top: 0 }},
  }
}

const specs = SCAPE_CONFIG.archipelago.landmasses
const sound = localConfig(specs.find(spec => spec.id === 'sound')!)

const { waterLevel, saltings } = sound.terrain

const layout = createScapeLayout(sound)

/**
 * The same layout with the beck taken out of it.
 *
 * Only the comparison fields use it: the channel is carved *after* the fill and
 * cuts through the flat on its way to the sea, so a control that still had it
 * would differ from the silted field by the channel as well as by the silt.
 */
const dryLayout = { ...layout, creek: null }

const flat    = solveSaltings(sound, layout.creek)!
const control = createHeightField(withoutSilt(sound), dryLayout)
const silted  = createHeightField(sound, dryLayout, null, null, null, null, null, flat)

/** A point on a bearing, at a distance inland of that bearing's waterline. */
function inland (angle: number, metres: number): Vec2 {
  const radius = flat.shoreAt(angle) - metres

  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
}

/** Every metre of the flat's own middle bearing, from the seaward edge inward. */
function alongTheMiddle (): Vec2[] {
  const walk: Vec2[] = []

  for (let out = -saltings.out; out <= saltings.back; out += 1)
    walk.push(inland(flat.bearing, out))

  return walk
}


describe('where the silt is allowed', () => {
  test('the flat is centred on the beck\'s own mouth', () => {
    const mouth = Math.atan2(layout.creek!.mouth.z, layout.creek!.mouth.x)

    // Not near it, and not searched for: silt is delivered, so the bearing is
    // the channel's and there is nothing to find.
    expect(flat.bearing).toBeCloseTo(mouth, 6)
  })

  test('an island with no watercourse has no marsh', () => {
    expect(solveSaltings(sound, null)).toBeNull()
  })

  test('the weather shore and the headland refuse it', () => {
    const mouth = Math.atan2(layout.creek!.mouth.z, layout.creek!.mouth.x)
    const arc   = saltings.arc * Math.PI / 180

    // The two refusals, stated from the other side: a belt or a cliff sitting
    // on the mouth's own bearing takes the marsh away entirely, and `null` is
    // the answer rather than a marsh squeezed in beside them.
    expect(solveSaltings(sound, layout.creek, { bearing: mouth, arc })).toBeNull()
    expect(solveSaltings(sound, layout.creek, null, { bearing: mouth, arc })).toBeNull()

    // And a landform on the far side of the island decides nothing.
    expect(solveSaltings(sound, layout.creek, { bearing: mouth + Math.PI, arc })).not.toBeNull()
  })

  test('the working water off a berth is kept clear of silt', () => {
    const berth = inland(flat.bearing, 0)
    const kept  = solveSaltings(sound, layout.creek, null, null, [ berth ])!

    // The bank the boats use, and the two metres either side of it: a harbour
    // is the one place a deposit can take away rather than add. Stated at the
    // berth itself rather than across the gap, because what the rule protects
    // is the water a keel lies in.
    expect(kept.claimAt(berth.x, berth.z)).toBe(0)
    expect(saltingsClaim(flat, berth.x, berth.z)).toBeGreaterThan(0)
  })

  test('nothing outside the arc is claimed', () => {
    for (const away of [ Math.PI * 0.5, Math.PI, Math.PI * 1.5 ]) {
      const point = inland(flat.bearing + away, 0)

      expect(saltingsClaim(flat, point.x, point.z)).toBe(0)
    }
  })
})

describe('the fill', () => {
  test('it only ever raises ground', () => {
    // The landform's whole invariant. Silt is deposited: it can raise a hollow
    // to the height the tide floods to and it can never cut the bank behind it,
    // which is where the difference between the two heights is largest.
    for (const point of alongTheMiddle())
      expect(silted.heightAt(point.x, point.z)).toBeGreaterThanOrEqual(
        control.heightAt(point.x, point.z) - 1e-9,
      )
  })

  test('it never fills past the level the tide floods to', () => {
    const ceiling = waterLevel + saltings.top + 1e-6

    for (const point of alongTheMiddle()) {
      const before = control.heightAt(point.x, point.z)
      const after  = silted.heightAt(point.x, point.z)

      // Ground already standing over the marsh top keeps whatever height it
      // had; ground under it is never lifted past the top. A fill that
      // overshoots is a bank of silt standing out of its own tide.
      if (after > before)
        expect(after).toBeLessThanOrEqual(Math.max(before, ceiling))
    }
  })

  test('what it built is flat', () => {
    const levels = alongTheMiddle()
      .map(point => silted.heightAt(point.x, point.z))
      .filter(height => height > waterLevel - saltings.slob && height < waterLevel + saltings.top + 0.05)

    // The claim the landform is named for, as a fact about the vertices: the
    // whole intertidal band rises by less than the tide does. Measured over the
    // built ground only — the bank behind it is a bank, and is meant to be.
    expect(levels.length).toBeGreaterThan(8)
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThan(SCAPE_CONFIG.tide.range)
  })

  test('the gutters cut, and only into the flat', () => {
    const cuts = alongTheMiddle()
      .map(point => flat.gutterAt(point.x, point.z))
      .filter(share => share > 0.5)

    expect(cuts.length).toBeGreaterThan(0)

    // A gutter is a cut in the *level*, so it can only ever lower the surface
    // the fill was aiming at — never the ground the fill never reached.
    for (const point of alongTheMiddle()) {
      const gutter = flat.gutterAt(point.x, point.z)

      if (gutter > 0.5)
        expect(flat.levelAt(point.x, point.z)).toBeLessThan(flat.top)
    }
  })
})

describe('the tide that crosses it', () => {
  const report = measureSaltings(sound, flat, silted.heightAt)!

  test('the surface stands inside the spring range and outside the neap one', () => {
    const springs = SCAPE_CONFIG.tide.range * 0.5
    const neaps   = springs * (1 - SCAPE_CONFIG.tide.spring)

    // The definition of the ground rather than a taste, and the reason both
    // ends of the profile are written as heights over mean water: above high
    // water of every tide there is no salt and the turf would be a hay field;
    // below high water of all of them nothing roots at all.
    expect(saltings.top).toBeLessThan(springs)
    expect(saltings.top).toBeGreaterThan(neaps)
    expect(saltings.slob).toBeLessThan(springs)
    expect(saltings.slob).toBeGreaterThan(neaps)
  })

  test('the sea walks across the flat rather than up a beach', () => {
    // The claim the run was made for. The shore the tide poses are taken on
    // shelves at about a metre in four, which 0.4 m of rise walks under two
    // metres; the flat has to be an order past that or it is a muddy beach.
    expect(report.walk).toBeGreaterThan(10)
  })

  test('no turf was laid in the sea', () => {
    // The dune belt's `lowest`, from the other end: sand below mean water is
    // sand in the water, and a sward below the line the mud starts at is a
    // sward that drowned.
    expect(report.lowest).toBeGreaterThanOrEqual(saltings.sward)
    expect(report.tidal).toBeGreaterThan(0)
    expect(report.turf).toBeGreaterThan(0)
  })

  test('the turf is on the top of the flat and the mud is below it', () => {
    for (const point of alongTheMiddle()) {
      const height = silted.heightAt(point.x, point.z)
      const turf   = saltingsTurf(sound, flat, point.x, point.z, height)

      if (turf > 0)
        expect(height).toBeGreaterThan(waterLevel + saltings.sward)
    }
  })
})

describe('the archipelago it is part of', () => {
  const survey = surveyArchipelago(SCAPE_CONFIG)

  test('the islands that get one are the islands whose mouth is on a free coast', () => {
    const built = survey.landmasses.filter(landmass => landmass.survey.saltings !== null)

    // Not a law of the search — `null` is a real answer, and here it is half the
    // archipelago. What the count states is that the refusals are doing work:
    // every island has a beck, and three of the six bring it out on a coast the
    // sand or the rock already has.
    expect(built).toHaveLength(3)
  })

  test('every berth in the archipelago still has water in it', () => {
    for (const landmass of survey.landmasses) {
      const marsh   = landmass.survey.saltings
      const harbour = landmass.survey.harbour

      if (!marsh || !harbour)
        continue

      // The regression this rule exists for, stated as a fact rather than as a
      // number: the first cut of the flat silted the meadow island's harbour
      // until `solvePier` could no longer find a berth with a way out of it.
      expect(saltingsClaim(marsh, harbour.x, harbour.z)).toBe(0)
    }
  })

  test('the marsh is the same marsh every time it is solved', () => {
    const again = solveSaltings(sound, layout.creek)!
    const walk  = alongTheMiddle()

    for (const point of walk)
      expect(again.levelAt(point.x, point.z)).toBe(flat.levelAt(point.x, point.z))
  })

  test('a flat with no silt in it is the coast without one', () => {
    const none = solveSaltings(withoutSilt(sound), layout.creek)

    expect(none).toBeNull()

    for (const point of alongTheMiddle())
      expect(fillSaltings(null, point.x, point.z, 3)).toBe(3)
  })
})
