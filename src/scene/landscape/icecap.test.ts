import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG, landmassLayout, landmassTerrain } from '../config.ts'
import type { LandmassSpec, ScapeConfig } from '../config.ts'
import { createHeightField } from './height.ts'
import { crevasseAt, iceCapOf, iceClaim, measureIce, raiseIce } from './icecap.ts'
import { STEADING_BUILDINGS, steadingPlaces } from './steading.ts'
import { surveyScape } from './survey.ts'


/**
 * One island, surveyed once for the whole file.
 *
 * The fjord test's arrangement and for its reason: the cap is a fact about the
 * shield's own ground, and a whole-archipelago survey would pay for five more
 * islands to prove one thing about the sixth.
 */
function localConfig (spec: LandmassSpec): ScapeConfig {
  return {
    ...SCAPE_CONFIG,
    seed:    (SCAPE_CONFIG.seed ^ spec.seedOffset) >>> 0,
    terrain: landmassTerrain(SCAPE_CONFIG, spec),
    layout:  landmassLayout(SCAPE_CONFIG, spec),
  }
}

/** The same island with the ice taken back off — the bed, and the control. */
function withoutIce (config: ScapeConfig): ScapeConfig {
  return {
    ...config,
    terrain: { ...config.terrain, icecap: { ...config.terrain.icecap, crown: 0 }},
  }
}

const specs  = SCAPE_CONFIG.archipelago.landmasses
const shield = localConfig(specs.find(spec => spec.id === 'shield')!)
const survey = surveyScape(shield)
const cap    = iceCapOf(shield)!

const { waterLevel } = shield.terrain

/** The rock, with the same pool and cutting in it and no dome on top. */
const bed = createHeightField(
  withoutIce(shield),
  survey.layout,
  survey.tarn,
  survey.peat,
  null,
  survey.dunes,
).heightAt

/** How much ice stands over a point, in metres. */
function thicknessAt (x: number, z: number): number {
  return survey.field.heightAt(x, z) - bed(x, z)
}


describe('the ice cap', () => {
  test('one island in six keeps ice, and it is the one the world grew north for', () => {
    const capped = specs.filter(spec => iceCapOf(localConfig(spec)) !== null)

    expect(capped.map(spec => spec.id)).toEqual([ 'shield' ])
  })

  test('a crown of zero is an island the carve never touches', () => {
    const bare = withoutIce(shield)

    for (const at of [[ 0, 0 ], [ 12, 60 ], [ cap.x, cap.z ], [ -40, 90 ]] as const)
      expect(raiseIce(bare, at[0], at[1], 4)).toBe(4)

    expect(iceCapOf(bare)).toBeNull()
    expect(iceClaim(bare, cap.x, cap.z, 4)).toBe(0)
  })

  /**
   * The profile, checked where its shape is a number rather than a picture.
   *
   * `sqrt(1 - d/R)` is the whole landform — see `icecap.ts` — and the two places
   * it is worth stating are the middle, where the surface is the authored crown,
   * and three quarters of the way out, where a parabola still stands at half
   * height and a cone would be down to a quarter. A dome that quietly became a
   * cone would still photograph as white ground.
   */
  test('the surface is a parabola rather than a slope', () => {
    // A bed at the waterline: low enough that the dome is well above it
    // everywhere inside the reach, and high enough to be standing on the bottom
    // rather than afloat, which is the other thing `raiseIce` decides.
    const under = waterLevel

    expect(raiseIce(shield, cap.x, cap.z, under) - waterLevel).toBeCloseTo(cap.crown, 6)

    const outer = raiseIce(shield, cap.x + cap.reach * 0.75, cap.z, under) - waterLevel

    expect(outer / cap.crown).toBeCloseTo(0.5, 2)
    // At the reach the profile has come back to the waterline, so the lift is
    // the float gate's own ramp rather than a step — which is what stops the
    // margin from being a wall the terrain grid has to draw in one quad.
    expect(raiseIce(shield, cap.x + cap.reach, cap.z, under)).toBeCloseTo(under, 5)
    expect(raiseIce(shield, cap.x + cap.reach * 1.01, cap.z, under)).toBe(under)
  })

  test('the ice only ever goes upward, and never past the reach', () => {
    const steps = 40

    for (let ix = 0; ix <= steps; ix += 1)
      for (let iz = 0; iz <= steps; iz += 1) {
        const x    = -shield.terrain.size * 0.5 + ix / steps * shield.terrain.size
        const z    = -shield.terrain.size * 0.5 + iz / steps * shield.terrain.size
        const over = thicknessAt(x, z)

        expect(over).toBeGreaterThanOrEqual(-1e-9)

        if (Math.hypot(x - cap.x, z - cap.z) >= cap.reach)
          expect(over).toBeLessThan(1e-9)
      }
  })

  /**
   * Rock that stands above the dome stays rock.
   *
   * The claim that makes this a landform rather than a coat of paint, and it is
   * checked from the ground's side rather than the ice's: wherever the bed is
   * already higher than the surface the parabola asks for, the drawn ground has
   * to be the bed exactly, and the paint has to read it as bare.
   */
  test('a peak that stands above the dome is left as rock', () => {
    const steps = 60
    let nunataks = 0

    // The paint fades over the last metre and a half of rock — see
    // `MARGIN_FEATHER` — so a boulder standing a handspan proud of the ice is
    // still painted mostly white, and correctly. What has to read as bare is
    // rock that stands *clear* of the surface.
    const proud = 2

    for (let ix = 0; ix <= steps; ix += 1)
      for (let iz = 0; iz <= steps; iz += 1) {
        const x     = cap.x - cap.reach + ix / steps * cap.reach * 2
        const z     = cap.z - cap.reach + iz / steps * cap.reach * 2
        const floor = bed(x, z)
        const top   = waterLevel + cap.crown *
          Math.sqrt(Math.max(0, 1 - Math.hypot(x - cap.x, z - cap.z) / cap.reach))

        if (floor <= top + 1e-6)
          continue

        nunataks += 1

        // Asked of the carve rather than of the drawn field, and the difference
        // matters: the drawn field also carries the beck, whose long profile is
        // sampled from the ground and is therefore not the same channel on an
        // island with a dome on it as on one without. What is being stated here
        // is the ice's rule, so it is stated where the ice is applied.
        expect(raiseIce(shield, x, z, floor)).toBe(floor)

        if (floor > top + proud)
          expect(iceClaim(shield, x, z, floor)).toBe(0)
      }

    // Not a formality: a dome that had swallowed the island whole would pass
    // every assertion in the loop above by never entering it.
    expect(nunataks).toBeGreaterThan(0)
  })

  /**
   * The front, which is where the ice stops being the island's problem.
   *
   * Two directions, because only the pair says anything: no ice may stand in
   * water deeper than the grounding line, *and* the cap has to actually reach
   * the sea somewhere — a margin that ended on dry rock all the way round would
   * satisfy the first half by never being tested.
   */
  test('the front stands in the shallows and never floats off them', () => {
    const report = measureIce(shield, survey.field.heightAt, bed)!

    // The grounding line, plus the width of the band the footing is lost over.
    // Ice standing in the transition is ice half afloat, which is what a front
    // is; ice past it would be a shelf, and there is none in this scape.
    const floor = waterLevel - shield.terrain.icecap.grounding - 0.7

    expect(report.front).toBeGreaterThan(0)

    const steps = 80

    for (let ix = 0; ix <= steps; ix += 1)
      for (let iz = 0; iz <= steps; iz += 1) {
        const x = cap.x - cap.reach + ix / steps * cap.reach * 2
        const z = cap.z - cap.reach + iz / steps * cap.reach * 2

        if (thicknessAt(x, z) > 0.5)
          expect(bed(x, z)).toBeGreaterThan(floor)
      }
  })

  test('it covers a quarter of the island, and stands over every summit in the world', () => {
    const report = measureIce(shield, survey.field.heightAt, bed)!

    expect(report.share).toBeGreaterThan(0.15)
    expect(report.share).toBeLessThan(0.45)
    expect(report.thickest).toBeGreaterThan(10)

    // The fell is the highest rock in the archipelago at 14.9 m over the water.
    // An ice cap that did not stand over it would be a white patch on a hill.
    expect(report.apex).toBeGreaterThan(15)
  })

  /**
   * Nothing the farm uses is under the ice.
   *
   * The run's central claim, and the reason the dome is folded into the raw
   * ground rather than into the terrain alone: every search on this island sees
   * the ice as ground it cannot use, so the holding is sited around it. Stated
   * against the *drawn* field, which is the ground all of these things are
   * actually standing on.
   */
  test('the holding is sited off the ice, down to the last footpath', () => {
    const { layout } = survey
    const iceAt      = (x: number, z: number): number =>
      iceClaim(shield, x, z, survey.field.heightAt(x, z))

    const places = steadingPlaces(layout.yard)
    const spots  = [
      { name: 'yard', x: layout.yard.x, z: layout.yard.z },
      ...STEADING_BUILDINGS.map(name => ({ name, x: places[name].x, z: places[name].z })),
      ...layout.plots.map((plot, index) => ({ name: `plot ${index}`, x: plot.x, z: plot.z })),
      ...layout.track.points.map((point, index) => ({ name: `track ${index}`, ...point })),
      ...layout.pasture ? [{ name: 'pasture', x: layout.pasture.x, z: layout.pasture.z }] : [],
      ...layout.mill ? [{ name: 'mill', x: layout.mill.x, z: layout.mill.z }] : [],
      ...layout.chapel ? [{ name: 'chapel', x: layout.chapel.x, z: layout.chapel.z }] : [],
      ...survey.landing ? [{ name: 'landing', x: survey.landing.x, z: survey.landing.z }] : [],
      ...survey.harbour ? [{ name: 'harbour', x: survey.harbour.x, z: survey.harbour.z }] : [],
      ...survey.tarn ? [{ name: 'tarn', x: survey.tarn.x, z: survey.tarn.z }] : [],
      ...survey.peat ? [{ name: 'peat', x: survey.peat.floor.x, z: survey.peat.floor.z }] : [],
      ...survey.paths.paths.flatMap((path, index) =>
        path.points.map((point, step) => ({ name: `path ${index}.${step}`, ...point }))),
    ]

    const buried = spots.filter(spot => iceAt(spot.x, spot.z) > 0).map(spot => spot.name)

    expect(buried).toEqual([])
  })

  /**
   * Ice is smoother than the mountain it buries.
   *
   * The claim that separates a landform from a coat of paint, stated as a
   * statistic because that is what it is: a dome has one surface profile and the
   * rock under it has whatever the fBm gave it, so the ground inside the margin
   * has to *lose* fall when the ice arrives. A cap painted onto the terrain
   * rather than folded into it would leave every gully exactly as steep as it
   * found it and pass every other test in this file.
   */
  test('the ice lies smoother than the rock under it', () => {
    const rock  = createHeightField(withoutIce(shield), survey.layout, survey.tarn, survey.peat)
    const steps = 40
    let iced    = 0
    let bare    = 0
    let counted = 0

    for (let ix = 0; ix <= steps; ix += 1)
      for (let iz = 0; iz <= steps; iz += 1) {
        const x = cap.x - cap.reach + ix / steps * cap.reach * 2
        const z = cap.z - cap.reach + iz / steps * cap.reach * 2

        // The inner dome, where a cap is flat. The outer fifth of a parabola is
        // where all of its own fall is spent — the margin of an ice sheet is a
        // steep bank by construction — so a mean taken across the whole
        // footprint is a mean of the one part of the ice that is not smooth.
        if (Math.hypot(x - cap.x, z - cap.z) > cap.reach * 0.6)
          continue
        if (thicknessAt(x, z) < 2)
          continue

        counted += 1
        iced    += survey.field.slopeAt(x, z)
        bare    += rock.slopeAt(x, z)
      }

    expect(counted).toBeGreaterThan(60)
    expect(iced / counted).toBeLessThan(bare / counted * 0.8)
  })

  test('the crevasse field is on the flanks and not on the crown', () => {
    // The crown, at the fall a dome's middle actually has: nothing is pulling
    // there, so nothing opens. The ring below takes the fall the flanks run at.
    expect(crevasseAt(shield, cap.x + 20, cap.z, 0.2)).toBe(0)

    let cracked = 0

    for (let step = 0; step < 240; step += 1) {
      const angle = step / 240 * Math.PI * 2
      const x     = cap.x + Math.cos(angle) * cap.reach * 0.8
      const z     = cap.z + Math.sin(angle) * cap.reach * 0.8

      if (crevasseAt(shield, x, z, 1.1) > 0.25)
        cracked += 1
    }

    // Fractures, not a fracture: a field that fired nowhere on a whole ring of
    // steep ice is a noise fold that has gone flat, and one that fires
    // everywhere is a texture rather than a crevasse.
    expect(cracked).toBeGreaterThan(4)
    expect(cracked).toBeLessThan(180)
  })

  test('the same island is the same ice, every build', () => {
    const again = surveyScape(shield)
    const steps = 24

    for (let ix = 0; ix <= steps; ix += 1)
      for (let iz = 0; iz <= steps; iz += 1) {
        const x = cap.x - cap.reach + ix / steps * cap.reach * 2
        const z = cap.z - cap.reach + iz / steps * cap.reach * 2

        expect(again.field.heightAt(x, z)).toBe(survey.field.heightAt(x, z))
      }
  })
})
