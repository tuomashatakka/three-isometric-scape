import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG, landmassLayout, landmassTerrain } from '../config.ts'
import type { LandmassSpec, ScapeConfig } from '../config.ts'
import { coastBedAt } from './coast.ts'
import { cragClaim, cragFoot, measureCrag, raiseCrag, solveCrag } from './crag.ts'
import type { Crag } from './crag.ts'
import { solveDunes } from './dunes.ts'
import { createHeightField } from './height.ts'
import { createScapeLayout, distanceToTrack, plotInfluence } from './layout.ts'
import type { Vec2 } from './path.ts'


/**
 * One island, resolved once for the whole file.
 *
 * The dune belt's arrangement and for its reason: a crag is a fact about one
 * island's own coast, and a whole-archipelago survey would pay for five more
 * islands to prove one thing about the sixth. The home island is the one under
 * the camera, and the one whose numbers the design record quotes.
 */
function localConfig (spec: LandmassSpec): ScapeConfig {
  return {
    ...SCAPE_CONFIG,
    seed:    (SCAPE_CONFIG.seed ^ spec.seedOffset) >>> 0,
    terrain: landmassTerrain(SCAPE_CONFIG, spec),
    layout:  landmassLayout(SCAPE_CONFIG, spec),
  }
}

/** The same island with the rock taken back off — the bare coast, and the control. */
function withoutRock (config: ScapeConfig): ScapeConfig {
  return {
    ...config,
    terrain: { ...config.terrain, crag: { ...config.terrain.crag, height: 0 }},
  }
}

const specs  = SCAPE_CONFIG.archipelago.landmasses
const home   = localConfig(specs.find(spec => spec.id === 'home')!)
const layout = createScapeLayout(home)
const belt   = solveDunes(home)
const crag   = solveCrag(home, belt, layout.creek)!

const { waterLevel, crag: settings } = home.terrain

/**
 * The same layout with the beck taken out of it.
 *
 * The belt's reason exactly: the channel's long profile is sampled from the
 * graded ground and then clamped to fall the whole way, so anything standing on
 * that profile moves the floor everywhere below it, and a probe far from the
 * rock would read a ground the rock moved.
 */
const dryLayout = { ...layout, creek: null }

const control  = createHeightField(withoutRock(home), dryLayout, null, null, null, belt, null)
const standing = createHeightField(home, dryLayout, null, null, null, belt, crag)

/** A point on a bearing, at a distance inland of that bearing's waterline. */
function at (angle: number, metres: number): Vec2 {
  const radius = crag.shoreAt(angle) - metres

  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
}

/**
 * Ground the farm has not levelled.
 *
 * The dune test's, and it exists here for the same reason: the yard, the plots
 * and the cart track all blend the ground toward a level of their own *after*
 * the rock is raised, so a probe under one of them reads back the farm's answer
 * rather than the crag's.
 */
function unworked (x: number, z: number): boolean {
  const fromYard = Math.hypot(x - layout.yard.x, z - layout.yard.z)
  const onPlot   = layout.plots.some(plot => plotInfluence(plot, x, z) > 0)

  return fromYard > layout.yard.radius * 1.4 &&
    distanceToTrack(layout, x, z) > layout.track.width * 2 &&
    !onPlot
}


describe('the crag', () => {
  test('stands on the steepest coast the island has left, and not on the sand', () => {
    // The siting rule, said as the two facts it is made of. The belt takes the
    // weather shore because sand is delivered there; the crag takes the coast
    // that climbs fastest out of the water, because that is the coast the sea
    // cuts rather than builds. Two landforms on one bearing would be one of
    // them drawn over the other.
    const gap = Math.abs(Math.atan2(
      Math.sin(crag.bearing - belt!.bearing),
      Math.cos(crag.bearing - belt!.bearing),
    ))

    expect(gap).toBeGreaterThanOrEqual(belt!.arc + crag.arc)
    expect(crag.steepness).toBeGreaterThanOrEqual(settings.steep)

    // And it is genuinely the steep coast rather than merely a legal one: the
    // bare coast on the headland climbs faster out of the water than the coast
    // on the opposite bearing does.
    const rise = (angle: number): number => {
      const shore = crag.shoreAt(angle)
      const probe = at(angle, 10)

      return shore <= 0 ? 0 : coastBedAt(home, probe.x, probe.z) - waterLevel
    }

    expect(rise(crag.bearing)).toBeGreaterThan(rise(crag.bearing + Math.PI))
  })

  test('never takes a metre out of the island', () => {
    // The invariant, and the whole reason this landform is safe to fold into a
    // ground the farm was already sited on. A cliff is the rock the sea did not
    // take: everything the crag does is upward, so no search that ran before it
    // can find its answer under water afterwards.
    const half = home.terrain.size * 0.5
    let raised = 0

    for (let row = 0; row < 96; row += 1)
      for (let col = 0; col < 96; col += 1) {
        const x = -half + (col + 0.5) * home.terrain.size / 96
        const z = -half + (row + 0.5) * home.terrain.size / 96

        if (!unworked(x, z))
          continue

        const lift = standing.heightAt(x, z) - control.heightAt(x, z)

        expect(lift).toBeGreaterThan(-1e-6)

        if (lift > 0.5)
          raised += 1
      }

    // And it did something: a headland that raised nothing would pass the line
    // above and be no landform at all.
    expect(raised).toBeGreaterThan(20)
  })

  test('is a face rather than a bank', () => {
    // The claim a still cannot check and the reason `scape:map` prints an
    // angle. Walked across the middle of the headland at a tenth of a metre,
    // which is finer than the terrain grid anywhere — what is being tested is
    // the ground the field describes, not the one a tier happens to draw.
    let steepest = 0
    let before   = 0

    for (let inland = -settings.bench; inland <= settings.back; inland += 0.1) {
      const spot  = at(crag.bearing, inland)
      const drawn = standing.heightAt(spot.x, spot.z)

      if (inland > 0)
        steepest = Math.max(steepest, (drawn - before) / 0.1)

      before = drawn
    }

    // Fifty degrees, against a coast the shore band grades to a beach: the
    // authored face is about seventy, and the margin is the terrain's own
    // relief riding on top of it.
    expect(Math.atan(steepest) * 180 / Math.PI).toBeGreaterThan(50)

    // The lip is a lip. Two metres inland of the top of the face the ground is
    // still up, rather than having crested and fallen back into the island.
    const top = at(crag.bearing, settings.face + 2)

    expect(standing.heightAt(top.x, top.z) - waterLevel)
      .toBeGreaterThan(settings.height * (1 - 0.25) - 0.5)
  })

  test('cuts its platform out of rock rather than out of open water', () => {
    // The ground's veto, and the number `scape:map` would otherwise report as a
    // plunge: a shore platform is rock the sea took down to its own working
    // level, so it can only be where there was rock within reach of the work.
    // Walked seaward across the whole headland rather than on one bearing,
    // because the bed falls away at a different rate on every one of them.
    let shelf = 0

    for (let step = -12; step <= 12; step += 1) {
      const angle = crag.bearing + step * crag.arc / 12

      for (let out = 0.2; out <= settings.bench + 3; out += 0.2) {
        const spot = at(angle, -out)

        if (cragClaim(crag, spot.x, spot.z) <= 0.02)
          continue

        const depth = waterLevel - coastBedAt(home, spot.x, spot.z)

        // The fade is 1.2 m wide past the authored depth, and a claim of a
        // fiftieth is the width of the feather rather than a shelf.
        expect(depth).toBeLessThan(settings.depth + 1.4)
        shelf += 1
      }
    }

    expect(shelf).toBeGreaterThan(30)

    // And what it does stand on is awash rather than dry: the platform is at
    // the level the sea does its cutting at, plus whatever talus has come down
    // on top of it.
    for (let step = -6; step <= 6; step += 1) {
      const angle = crag.bearing + step * crag.arc / 6
      const spot  = at(angle, -1)

      if (cragClaim(crag, spot.x, spot.z) < 0.9)
        continue

      expect(standing.heightAt(spot.x, spot.z) - waterLevel)
        .toBeLessThan(settings.awash + settings.talus + 0.3)
    }
  })

  test('puts its talus at the bottom of the face and nowhere else', () => {
    // The scatter's rule, stated as a fact about the shape rather than about
    // the boulders: what puts blocks on a platform is the face standing over
    // it, so the share has to peak at the foot, be gone at the top of the face
    // and be gone off the outer edge of the shelf.
    const base = at(crag.bearing, 0)
    const top  = at(crag.bearing, settings.face + 1)
    const off  = at(crag.bearing, -settings.bench - 1)

    expect(cragFoot(crag, base.x, base.z)).toBeGreaterThan(0.5)
    expect(cragFoot(crag, top.x, top.z)).toBeLessThan(0.05)
    expect(cragFoot(crag, off.x, off.z)).toBe(0)
  })

  test('does not stand where there is nothing to stand on', () => {
    // Two ways an island refuses a crag, and both of them leave the ground
    // exactly as it was rather than leaving a hole in it.
    expect(solveCrag(withoutRock(home), belt, null)).toBeNull()

    const gentle = {
      ...home,
      terrain: { ...home.terrain, crag: { ...home.terrain.crag, steep: 4 }},
    }

    expect(solveCrag(gentle, belt, null)).toBeNull()

    // And every reader survives the absence without a branch of its own.
    expect(cragClaim(null, 0, 0)).toBe(0)
    expect(cragFoot(null, 0, 0)).toBe(0)
    expect(raiseCrag(null, 0, 0, 3.5)).toBe(3.5)
    expect(measureCrag(home, null)).toBeNull()
  })

  test('comes out the same every time it is solved', () => {
    // Determinism, said about the shape rather than about the seed: the same
    // config has to give the same headland, or every capture taken after this
    // lands is a capture of a different island.
    const again = solveCrag(home, belt, layout.creek)!

    expect(again.bearing).toBe(crag.bearing)
    expect(again.lip).toBe(crag.lip)
    expect(measureCrag(home, again)).toEqual(measureCrag(home, crag)!)

    for (let step = 0; step < 40; step += 1) {
      const spot = at(crag.bearing + (step - 20) * 0.02, step * 0.7 - 4)

      expect(raiseCrag(again, spot.x, spot.z, 0)).toBe(raiseCrag(crag, spot.x, spot.z, 0))
    }
  })

  test('measures out as a headland rather than as a sea wall', () => {
    const report = measureCrag(home, crag)!

    // The invariant again, this time as the instrument reports it.
    expect(report.cut).toBe(0)

    // A face, a lip, and a coast to stand on.
    expect(report.face).toBeGreaterThan(50)
    expect(report.lip).toBeGreaterThan(settings.height * 0.6)
    expect(report.length).toBeGreaterThan(20)
    expect(report.standing).toBeGreaterThan(2)

    // And the line wanders: the lowest bearing of the cliff stands well under
    // the highest. A crag whose two ends came out at one height is a landform
    // laid out with a compass, which is the thing the weakness field exists to
    // prevent.
    expect(report.least).toBeLessThan(report.lip - 1)
    expect(report.least).toBeGreaterThan(0)

    // There is water off the end of the platform. Without it this is a step in
    // a field rather than a cliff.
    expect(report.plunge).toBeGreaterThan(1)
  })

  test('is refused the mouth of the beck', () => {
    // A headland thrown across an estuary dams it: the channel is cut into the
    // ground before the rock is raised, so the crag would stand in the cut and
    // the inlet would end in a wall. The refusal is a siting rule rather than a
    // repair, and this is the statement of it.
    const mouth = layout.creek?.mouth

    expect(mouth).toBeDefined()

    const angle = Math.atan2(mouth!.z, mouth!.x)
    const gap   = Math.abs(Math.atan2(
      Math.sin(crag.bearing - angle),
      Math.cos(crag.bearing - angle),
    ))

    expect(gap).toBeGreaterThan(crag.arc)
  })
})

describe('the archipelago', () => {
  test('has crags on its bold coasts and none on its gentle ones', () => {
    // The graceful absence, checked across every island rather than asserted
    // about one. An archipelago where every island grew a cliff would be an
    // archipelago with no reason for any of them.
    const solved = specs.map(spec => {
      const config = localConfig(spec)
      const island = createScapeLayout(config)

      return {
        id:   spec.id,
        crag: solveCrag(config, solveDunes(config), island.creek) as Crag | null,
      }
    })

    const withRock = solved.filter(entry => entry.crag)

    expect(withRock.length).toBeGreaterThan(2)
    expect(withRock.length).toBeLessThan(solved.length)

    // Every one that got one got it on a coast that qualified.
    for (const entry of withRock)
      expect(entry.crag!.steepness).toBeGreaterThanOrEqual(SCAPE_CONFIG.terrain.crag.steep)
  })
})
