import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG, landmassLayout, landmassTerrain } from '../config.ts'
import type { LandmassSpec, ScapeConfig } from '../config.ts'
import { coastBedAt } from './coast.ts'
import { duneClaim, measureDunes, solveDunes } from './dunes.ts'
import { createHeightField } from './height.ts'
import { createScapeLayout, distanceToTrack, plotInfluence } from './layout.ts'
import type { Vec2 } from './path.ts'


/**
 * One island, resolved once for the whole file.
 *
 * The ice cap's arrangement and for its reason: a belt is a fact about one
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

/** The same island with the sand taken back off — the bare coast, and the control. */
function withoutSand (config: ScapeConfig): ScapeConfig {
  return {
    ...config,
    terrain: { ...config.terrain, dunes: { ...config.terrain.dunes, height: 0 }},
  }
}

const specs = SCAPE_CONFIG.archipelago.landmasses
const home  = localConfig(specs.find(spec => spec.id === 'home')!)
const belt  = solveDunes(home)!

const { waterLevel } = home.terrain

const layout = createScapeLayout(home)

/**
 * The same layout with the beck taken out of it.
 *
 * Only the two comparison fields use it, and only because the channel is not a
 * local effect — see {@link unworked}. Everything else in this file reads the
 * island as it is.
 */
const dryLayout = { ...layout, creek: null }

const control = createHeightField(withoutSand(home), dryLayout)
const sanded  = createHeightField(home, dryLayout, null, null, null, belt)

/** A point on a bearing, at a distance inland of that bearing's waterline. */
function inland (angle: number, metres: number): Vec2 {
  const radius = belt.shoreAt(angle) - metres

  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
}

/**
 * Ground the farm has not levelled.
 *
 * The yard, the plots and the cart track all blend the ground toward a level of
 * their own *after* the sand is laid, so the lift a probe under one of them
 * reads back is the farm's answer rather than the belt's. Every test that
 * compares the two fields skips them by name rather than loosening its bound —
 * a tolerance wide enough to swallow a levelled yard is wide enough to swallow a
 * missing dune.
 *
 * The beck is the fourth, and it is not a local one: its long profile is sampled
 * from the graded ground and then clamped to fall the whole way, so a dune
 * standing anywhere on that profile moves the channel's floor *everywhere below
 * it*. That is the beck doing exactly what it is documented to do — cutting
 * through whatever is in front of it — and it means a probe far from the sand
 * can still read a ground the sand moved. So the two comparison fields are built
 * on a layout with no channel traced through it at all — see {@link dryLayout}.
 */
function unworked (x: number, z: number): boolean {
  const fromYard = Math.hypot(x - layout.yard.x, z - layout.yard.z)
  const onPlot   = layout.plots.some(plot => plotInfluence(plot, x, z) > 0)

  return fromYard > layout.yard.radius * 1.4 &&
    distanceToTrack(layout, x, z) > layout.track.width * 2 &&
    !onPlot
}

describe('the dune belt', () => {
  test('is solved on the shore the weather comes from, and nowhere else', () => {
    // `wind.bearing` is the direction the wind blows toward, so the coast it
    // arrives at is at the opposite bearing. The whole landform is that
    // sentence, and this is the test of it.
    const weather = home.wind.bearing * Math.PI / 180 + Math.PI

    let onWeather = 0
    let onLee     = 0

    for (let step = 0; step < 24; step += 1) {
      const at = 4 + step * 0.8

      onWeather += belt.depthAt(inland(weather, at).x, inland(weather, at).z)
      onLee     += belt.depthAt(inland(weather + Math.PI, at).x, inland(weather + Math.PI, at).z)
    }

    expect(onWeather).toBeGreaterThan(6)
    expect(onLee).toBe(0)
  })

  test('lays sand on dry ground the wind could reach, and on nothing else', () => {
    // Both of the ground's vetoes, walked over the whole island rather than
    // along the belt — the reach is measured radially and a coast is not a
    // circle, so what this catches is a bearing whose waterline or whose
    // hillside is not where the table thinks it is.
    //
    // Against the bed rather than against the drawn field, and the two are
    // different questions: the beck cuts its channel back out of the ridge and
    // the farm levels what ended up under a plot, both of them *after* the sand
    // was laid. What the belt was allowed is what the coast said, and the coast
    // is `coastBedAt`.
    const { climb } = home.terrain.dunes
    const half      = home.terrain.size * 0.5
    let dry          = 0

    for (let row = 0; row < 90; row += 1)
      for (let col = 0; col < 90; col += 1) {
        const x = -half + (col + 0.5) * home.terrain.size / 90
        const z = -half + (row + 0.5) * home.terrain.size / 90

        if (belt.depthAt(x, z) <= 0)
          continue

        const freeboard = coastBedAt(home, x, z) - waterLevel

        expect(freeboard).toBeGreaterThan(0)
        expect(freeboard).toBeLessThan(climb + 2)
        dry += 1
      }

    // And the walk actually found the belt, rather than passing because there
    // was no sand anywhere to test.
    expect(dry).toBeGreaterThan(40)
  })

  test('reaches no further inland than the island can afford', () => {
    // The cap that stopped a belt authored in metres from swallowing the
    // smallest island in the archipelago whole. Every bearing, including the
    // ones outside the arc — the reach is a fact about the island rather than
    // about where the belt happens to be pointed.
    for (let step = 0; step < 48; step += 1) {
      const angle = step / 48 * Math.PI * 2
      const shore = belt.shoreAt(angle)

      expect(belt.reachAt(angle)).toBeLessThanOrEqual(Math.max(shore * 0.4, 0) + 1e-9)
      expect(belt.reachAt(angle)).toBeLessThanOrEqual(home.terrain.dunes.back)
    }
  })

  test('stands its ridge where the profile says it does', () => {
    const weather        = home.wind.bearing * Math.PI / 180 + Math.PI
    const reach          = belt.reachAt(weather)
    const { foot, peak } = home.terrain.dunes

    let deepest = 0
    let at      = 0

    for (let metres = foot; metres <= reach; metres += 0.25) {
      const spot  = inland(weather, metres)
      const depth = belt.depthAt(spot.x, spot.z)

      if (depth > deepest) {
        deepest = depth
        at      = metres
      }
    }

    // Within a metre of where `peak` puts it. Not exact, because the ground's
    // own two vetoes are inside the profile and either of them can shave the
    // seaward or the landward side of a ridge on a real coast.
    expect(at).toBeCloseTo(foot + (reach - foot) * peak, 0)
  })

  test('is cut through by blowouts rather than running as one embankment', () => {
    const weather          = home.wind.bearing * Math.PI / 180 + Math.PI
    const ridges: number[] = []

    for (let step = -7; step <= 7; step += 1) {
      const angle = weather + step * Math.PI * 2 / 48
      const reach = belt.reachAt(angle)
      let ridge   = 0

      for (let metres = home.terrain.dunes.foot; metres <= reach; metres += 0.5) {
        const spot = inland(angle, metres)
        ridge = Math.max(ridge, belt.depthAt(spot.x, spot.z))
      }

      ridges.push(ridge)
    }

    // A ridge of one height along its whole length is a wall somebody built, and
    // it is exactly what this landform looks like with `blowout` at zero.
    expect(Math.max(...ridges) - Math.min(...ridges)).toBeGreaterThan(0.5)
  })

  test('is the same belt every time it is solved', () => {
    const again = solveDunes(home)!

    for (let step = 0; step < 48; step += 1) {
      const angle = step / 48 * Math.PI * 2
      const spot  = inland(angle, 7)

      expect(again.depthAt(spot.x, spot.z)).toBe(belt.depthAt(spot.x, spot.z))
      expect(again.shoreAt(angle)).toBe(belt.shoreAt(angle))
    }
  })

  test('is switched off by its own height and by nothing else', () => {
    expect(solveDunes(withoutSand(home))).toBeNull()
    expect(duneClaim(null, 0, 0)).toBe(0)

    const bare = createHeightField(withoutSand(home), layout)
    const spot = inland(home.wind.bearing * Math.PI / 180 + Math.PI, 9)

    expect(bare.heightAt(spot.x, spot.z)).toBe(control.heightAt(spot.x, spot.z))
  })
})

describe('the ground the belt is laid on', () => {
  test('is raised by exactly the sand the belt says is standing there', () => {
    // The claim this whole landform makes about the height field: what the
    // terrain draws is the bed plus the belt, with no second opinion in between.
    const weather = home.wind.bearing * Math.PI / 180 + Math.PI
    let checked   = 0

    for (let step = -6; step <= 6; step += 1) {
      const angle = weather + step * Math.PI * 2 / 48

      for (let metres = 3; metres <= belt.reachAt(angle); metres += 0.5) {
        const { x, z } = inland(angle, metres)

        if (!unworked(x, z))
          continue

        expect(sanded.heightAt(x, z) - control.heightAt(x, z))
          .toBeCloseTo(belt.depthAt(x, z), 6)
        checked += 1
      }
    }

    expect(checked).toBeGreaterThan(60)
  })

  test('keeps its claim inside the belt and at nothing outside it', () => {
    const weather = home.wind.bearing * Math.PI / 180 + Math.PI

    for (let step = 0; step < 40; step += 1) {
      const spot  = inland(weather, 3 + step * 0.5)
      const claim = duneClaim(belt, spot.x, spot.z)

      expect(claim).toBeGreaterThanOrEqual(0)
      expect(claim).toBeLessThanOrEqual(1)
    }

    const lee = inland(weather + Math.PI, 9)
    expect(duneClaim(belt, lee.x, lee.z)).toBe(0)
  })
})

describe('the belt as `scape:map` reads it', () => {
  const report = measureDunes(home, belt)!

  test('reports a ridge that stands on dry ground the whole way along', () => {
    expect(report.crest).toBeGreaterThan(1)
    expect(report.crest).toBeLessThanOrEqual(home.terrain.dunes.height)
    expect(report.lowest).toBeGreaterThan(0)
    expect(report.length).toBeGreaterThan(40)
    expect(report.sampled).toBeGreaterThan(8)
  })

  test('counts the refusals the ground made rather than hiding them', () => {
    expect(report.refused).toBeGreaterThanOrEqual(0)
    expect(report.refused).toBeLessThan(100)
  })

  test('has nothing to say about an island with no sand on it', () => {
    expect(measureDunes(home, null)).toBeNull()
  })
})
