import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG, landmassLayout, landmassTerrain } from '../config.ts'
import type { LandmassSpec, ScapeConfig } from '../config.ts'
import { tideAmplitudeAt } from '../tide.ts'
import { solveCrag } from './crag.ts'
import { solveDunes } from './dunes.ts'
import { createHeightField } from './height.ts'
import { createScapeLayout, distanceToTrack, plotInfluence } from './layout.ts'
import { measureStack } from './stack.ts'


/**
 * One island, resolved once for the whole file.
 *
 * The crag test's arrangement and for its reason: a stack is a fact about one
 * headland, and a whole-archipelago survey would pay for five more islands to
 * prove one thing about the sixth.
 */
function localConfig (spec: LandmassSpec): ScapeConfig {
  return {
    ...SCAPE_CONFIG,
    seed:    (SCAPE_CONFIG.seed ^ spec.seedOffset) >>> 0,
    terrain: landmassTerrain(SCAPE_CONFIG, spec),
    layout:  landmassLayout(SCAPE_CONFIG, spec),
  }
}

/** The same island with the pillar taken back off. The control. */
function withoutPillar (config: ScapeConfig): ScapeConfig {
  return {
    ...config,
    terrain: { ...config.terrain, stack: { ...config.terrain.stack, stature: 0 }},
  }
}

const specs  = SCAPE_CONFIG.archipelago.landmasses
const home   = localConfig(specs.find(spec => spec.id === 'home')!)
const layout = createScapeLayout(home)
const belt   = solveDunes(home)

/** The beck taken out, for the crag test's reason: its profile moves the floor below it. */
const dryLayout = { ...layout, creek: null }

const crag  = solveCrag(home, belt, layout.creek)!
const stack = crag.stack!

const bare     = withoutPillar(home)
const control  = createHeightField(bare, dryLayout, null, null, null, belt, solveCrag(bare, belt, layout.creek))
const standing = createHeightField(home, dryLayout, null, null, null, belt, crag)

const { waterLevel, stack: settings, crag: cliff } = home.terrain
const springs                                      = tideAmplitudeAt(1, home.tide)

/**
 * Ground the farm has not levelled.
 *
 * The crag test's, and here for the same reason: the yard, the plots and the
 * cart track all blend the ground toward a level of their own *after* the rock
 * is raised.
 */
function unworked (x: number, z: number): boolean {
  const fromYard = Math.hypot(x - layout.yard.x, z - layout.yard.z)
  const onPlot   = layout.plots.some(plot => plotInfluence(plot, x, z) > 0)

  return fromYard > layout.yard.radius * 1.4 &&
    distanceToTrack(layout, x, z) > layout.track.width * 2 &&
    !onPlot
}


describe('the stack', () => {
  test('stands off the headland, outside its platform, on the weakest rock in the arc', () => {
    // The siting rule, as the three facts it is made of. It is on the crag's
    // own coast; it is far enough out that the wave-cut platform cannot reach
    // it; and of every line across the headland it is on the one the sea had
    // the best chance of cutting behind — which is the same field the clefts
    // are cut with, so the pillar and the geo are one piece of reasoning.
    const offset = Math.abs(Math.atan2(
      Math.sin(stack.bearing - crag.bearing),
      Math.cos(stack.bearing - crag.bearing),
    ))

    expect(offset).toBeLessThan(crag.arc)
    expect(stack.radius - stack.shore).toBeGreaterThanOrEqual(cliff.bench + settings.gut)

    // And the weakness is the crag's own, not a second opinion about the same
    // coast: the field that chose this line is the field that wanders the lip
    // and cuts the clefts, so the clifftop behind the pillar has to be *lower*
    // than the headland's mean. A stack standing off the boldest part of a
    // cliff would be a pillar with no story about how it got detached.
    const form  = { claim: 0, level: 0, foot: 0 }
    const lipAt = (angle: number): number => {
      const radius = crag.shoreAt(angle) - cliff.face

      return crag.formAt(Math.cos(angle) * radius, Math.sin(angle) * radius, form).level
    }

    const across = []

    for (let step = 0; step < 17; step += 1)
      across.push(lipAt(crag.bearing + (step / 16 * 2 - 1) * crag.arc * 0.78))

    const mean = across.reduce((total, level) => total + level, 0) / across.length

    expect(lipAt(stack.bearing)).toBeLessThan(mean)
  })

  test('is an island: the ground between it and the coast is under water the whole way', () => {
    // The landform's whole claim, and the one fact about it no still can carry
    // — from every pose this scape is drawn at, a pillar ten metres off a
    // headland and a pillar welded to the end of its own platform are the same
    // dark shape against the same sea.
    const report = measureStack(stack, standing.heightAt, waterLevel, springs)

    expect(report.gut).toBeGreaterThan(settings.gut * 0.5)
    expect(report.depth).toBeGreaterThan(settings.water)

    // Walked again here rather than trusted from the report: every sample from
    // the foot back to the platform's edge is sea, not just the run the report
    // happened to stop at.
    const cos = Math.cos(stack.bearing)
    const sin = Math.sin(stack.bearing)

    for (let walked = 0.25; walked <= report.gut; walked += 0.25) {
      const radius = stack.radius - stack.planAt(stack.bearing + Math.PI) - walked

      expect(standing.heightAt(cos * radius, sin * radius)).toBeLessThanOrEqual(waterLevel)
    }
  })

  test('stands clear of high springs, and under the cliff it came out of', () => {
    // Two ends of the same shape. A crown the spring tide covers is a skerry,
    // and this scape already has fifty-nine of those; a crown over the lip is a
    // pillar taller than the cliff it was cut from, which is the one thing a
    // stack cannot be.
    const report = measureStack(stack, standing.heightAt, waterLevel, springs)

    expect(report.freeboard).toBeGreaterThan(0)
    expect(standing.heightAt(stack.x, stack.z)).toBeLessThan(crag.lip)
    expect(stack.crown).toBeLessThan(crag.lip)
  })

  test('never takes a metre out of the island', () => {
    // The invariant the crag's is, inherited rather than restated: the gut is
    // the sea floor that was already there, so nothing here can find a harbour,
    // a fairway or a farm under water afterwards.
    const half = home.terrain.size * 0.5
    let raised = 0

    for (let row = 0; row < 120; row += 1)
      for (let col = 0; col < 120; col += 1) {
        const x = -half + (col + 0.5) * home.terrain.size / 120
        const z = -half + (row + 0.5) * home.terrain.size / 120

        if (!unworked(x, z))
          continue

        const lift = standing.heightAt(x, z) - control.heightAt(x, z)

        expect(lift).toBeGreaterThan(-1e-6)

        if (lift > 0.5)
          raised += 1
      }

    // And it did something. A pillar that raised nothing would pass the line
    // above and be no landform at all.
    expect(raised).toBeGreaterThan(4)
  })

  test('is the same rock twice from one seed', () => {
    const again = solveCrag(home, belt, layout.creek)!.stack!

    expect(again.x).toBe(stack.x)
    expect(again.z).toBe(stack.z)
    expect(again.crown).toBe(stack.crown)
    expect(again.weakness).toBe(stack.weakness)

    // The plan is a function rather than a number, so it is the *shape* that
    // has to come back the same and not only the siting.
    for (let step = 0; step < 16; step += 1) {
      const angle = step / 16 * Math.PI * 2

      expect(again.planAt(angle)).toBe(stack.planAt(angle))
    }
  })

  test('goes when its stature does, and when the water under it does', () => {
    // The switch, and the refusal. There is no boolean beside either of them.
    expect(solveCrag(bare, belt, layout.creek)!.stack).toBeNull()

    const shallow = {
      ...home,
      terrain: { ...home.terrain, stack: { ...home.terrain.stack, water: 99 }},
    }

    expect(solveCrag(shallow, belt, layout.creek)!.stack).toBeNull()
  })
})
