import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG, landmassLayout, landmassTerrain } from '../config.ts'
import type { LandmassSpec, ScapeConfig } from '../config.ts'
import { tideAmplitudeAt } from '../tide.ts'
import { measureArch } from './arch.ts'
import { solveCrag } from './crag.ts'
import { solveDunes } from './dunes.ts'
import { createHeightField } from './height.ts'
import { createScapeLayout } from './layout.ts'


/** One island, resolved once for the whole file. The stack test's arrangement. */
function localConfig (spec: LandmassSpec): ScapeConfig {
  return {
    ...SCAPE_CONFIG,
    seed:    (SCAPE_CONFIG.seed ^ spec.seedOffset) >>> 0,
    terrain: landmassTerrain(SCAPE_CONFIG, spec),
    layout:  landmassLayout(SCAPE_CONFIG, spec),
  }
}

const specs  = SCAPE_CONFIG.archipelago.landmasses
const home   = localConfig(specs.find(spec => spec.id === 'home')!)
const layout = createScapeLayout(home)
const belt   = solveDunes(home)

/** The beck taken out, for the crag test's reason: its profile moves the floor below it. */
const dryLayout = { ...layout, creek: null }

const crag = solveCrag(home, belt, layout.creek)!
const arch = crag.arch!

const ground = createHeightField(home, dryLayout, null, null, null, belt, crag)

const { waterLevel } = home.terrain
const springs        = tideAmplitudeAt(1, home.tide)


describe('the hole the sea cut', () => {
  test('the home headland carries one', () => {
    expect(arch).not.toBeNull()
  })

  test('it is a hole: the legs do not touch', () => {
    const between = Math.hypot(arch.outer.x - arch.inner.x, arch.outer.z - arch.inner.z)

    expect(arch.opening).toBeGreaterThan(0)
    expect(between).toBeCloseTo(arch.girth * 2 + arch.opening, 6)
  })

  // The claim the landform is named for, stated as a fact about the numbers
  // rather than as an intention. Rock over water and sky over the rock: the
  // underside has to clear the highest tide of the year everywhere across the
  // opening, and the crown has to stand over the underside everywhere.
  test('there is daylight under it at every state of the tide', () => {
    for (let across = 0; across <= 1; across += 0.05) {
      expect(arch.soffitAt(across)).toBeGreaterThan(waterLevel + springs)
      expect(arch.crown).toBeGreaterThan(arch.soffitAt(across))
    }
  })

  test('the underside is highest in the middle of the opening', () => {
    expect(arch.soffitAt(0.5)).toBeGreaterThan(arch.soffitAt(0))
    expect(arch.soffitAt(0.5)).toBeGreaterThan(arch.soffitAt(1))
    expect(arch.soffitAt(0)).toBeCloseTo(arch.soffitAt(1), 6)
  })

  test('the curve is clamped, so a block placed off the ends is still rock', () => {
    expect(arch.soffitAt(-0.4)).toBeCloseTo(arch.soffitAt(0), 6)
    expect(arch.soffitAt(1.6)).toBeCloseTo(arch.soffitAt(1), 6)
  })

  // The sequence this landform exists to complete: a spur cut through, and the
  // seaward end of one that has already fallen. The pillar is the later stage,
  // so it is the taller and it stands in the deeper water.
  test('it stands below the pillar beside it, and further in', () => {
    const stack = crag.stack!

    expect(arch.crown).toBeLessThan(stack.crown)
    expect(Math.hypot(arch.outer.x, arch.outer.z)).toBeLessThan(Math.hypot(stack.x, stack.z))
  })

  test('it is cut on a different line from the pillar', () => {
    const stack = crag.stack!
    const along = stack.z * Math.cos(crag.bearing) - stack.x * Math.sin(crag.bearing)

    expect(Math.abs(arch.along - along)).toBeGreaterThanOrEqual(home.terrain.arch.apart)
  })

  test('the portal faces out, inside the headland it was cut through', () => {
    const off = Math.abs((arch.bearing - crag.bearing + Math.PI) % (Math.PI * 2) - Math.PI)

    expect(off).toBeLessThanOrEqual(crag.arc)
  })

  test('the outer leg is the seaward one', () => {
    expect(Math.hypot(arch.outer.x, arch.outer.z))
      .toBeGreaterThan(Math.hypot(arch.inner.x, arch.inner.z))
    expect(arch.outer.water).toBeGreaterThan(arch.inner.water)
  })

  test('it is the same arch every time it is solved', () => {
    const again = solveCrag(localConfig(specs.find(spec => spec.id === 'home')!), belt, layout.creek)!.arch!

    expect(again.bearing).toBe(arch.bearing)
    expect(again.along).toBe(arch.along)
    expect(again.inner).toEqual(arch.inner)
    expect(again.outer).toEqual(arch.outer)
    expect(again.crown).toBe(arch.crown)
  })
})


describe('the switch, and the refusals', () => {
  const without = (over: Partial<ScapeConfig['terrain']['arch']>): ScapeConfig => ({
    ...home,
    terrain: { ...home.terrain, arch: { ...home.terrain.arch, ...over }},
  })

  test('nothing is cut at zero stature, and no boolean says so twice', () => {
    expect(solveCrag(without({ stature: 0 }), belt, layout.creek)!.arch).toBeNull()
  })

  test('an opening narrower than nothing is no arch', () => {
    expect(solveCrag(without({ reach: 2 }), belt, layout.creek)!.arch).toBeNull()
  })

  test('a span with no rock left in it is refused rather than drawn as a lintel', () => {
    expect(solveCrag(without({ clear: 5 }), belt, layout.creek)!.arch).toBeNull()
  })

  test('a coast that plunges has nowhere to stand the outer leg', () => {
    expect(solveCrag(without({ founded: 0.2 }), belt, layout.creek)!.arch).toBeNull()
  })

  test('a portal the sea has stopped running through is a bridge', () => {
    expect(solveCrag(without({ drowned: 20 }), belt, layout.creek)!.arch).toBeNull()
  })

  // The landform changes no ground at all, which is what makes it safe to fold
  // into a coast the harbour, the fairway and the waterway router were already
  // solved against. Stated against the height field rather than trusted.
  test('it raises nothing: the ground is the same with it and without it', () => {
    const flat  = createHeightField(without({ stature: 0 }), dryLayout, null, null, null, belt, solveCrag(without({ stature: 0 }), belt, layout.creek))
    const reach = arch.girth * 3

    for (let step = 0; step <= 12; step += 1) {
      const at = step / 12
      const x  = arch.inner.x + (arch.outer.x - arch.inner.x) * at
      const z  = arch.inner.z + (arch.outer.z - arch.inner.z) * at

      expect(ground.heightAt(x, z)).toBe(flat.heightAt(x, z))
      expect(ground.heightAt(x + reach, z - reach)).toBe(flat.heightAt(x + reach, z - reach))
    }
  })
})


describe('the arch, measured on the ground it stands over', () => {
  const report = measureArch(arch, ground.heightAt, waterLevel, springs)

  test('the sea still runs through the hole on the drawn terrain', () => {
    expect(report.wetted).toBeGreaterThan(0)
    expect(report.wetted).toBeLessThanOrEqual(report.opening)
    expect(report.depth).toBeGreaterThan(0)
  })

  test('the headroom it reports is the daylight at springs, not at mean water', () => {
    expect(report.headroom).toBeCloseTo(arch.soffitAt(0.5) - waterLevel - springs, 2)
    expect(report.headroom).toBeGreaterThan(0)
  })

  test('the span carries rock, and stands under the cliff it was cut through', () => {
    expect(report.thickness).toBeGreaterThan(0)
    expect(report.crown).toBeLessThan(report.lip)
  })

  test('the bearing it prints is a compass bearing', () => {
    expect(report.bearing).toBeGreaterThanOrEqual(0)
    expect(report.bearing).toBeLessThan(360)
  })
})
