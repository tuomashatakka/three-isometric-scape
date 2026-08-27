import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../src/scene/config.ts'
import type { ScapeConfig } from '../src/scene/config.ts'
import { SURVEY_BUDGET_MS, surveyArchipelago } from '../src/scene/landscape/archipelago.ts'
import { applyOverrides, coerce, parseArgs } from './args.ts'
import { ALL_LAYERS, LAND_RAMP, WATER_RAMP, glyphFor, renderGrid, surveyStats } from './scape-map.ts'
import { shotUrl } from './scape-shot.ts'


const clone       = (): ScapeConfig => structuredClone(SCAPE_CONFIG) as ScapeConfig
const config      = clone()
const archipelago = surveyArchipelago(config)
const WINDOW      = { x: 0, z: 0, size: archipelago.size }
const ISLANDS     = config.archipelago.landmasses.length

/**
 * A grid fine enough that every port gets a cell of its own.
 *
 * Not a resolution, a *cell size*: about three metres across. The jetty and the
 * harbour on one island are tens of metres apart, so a coarser cell merges them
 * and the map silently draws one glyph where there are two — which is how a
 * fixed 160x80 went from showing all the ports to showing one of five when the
 * world went from 520 m to 1520 m. Rows are half the columns because the glyphs
 * are twice as tall as they are wide.
 */
const DETAIL_W = Math.round(archipelago.size / 3.2)
const DETAIL_H = Math.round(DETAIL_W / 2)


describe('the height ramp', () => {
  const { waterLevel, height, seabedDrop } = SCAPE_CONFIG.terrain

  test('the seabed is deep water and the waterline itself is not land', () => {
    expect(glyphFor(waterLevel - seabedDrop, waterLevel, height, seabedDrop)).toBe(WATER_RAMP[0])
    expect(glyphFor(waterLevel - 0.1, waterLevel, height, seabedDrop)).toBe(WATER_RAMP[1])
    expect(glyphFor(waterLevel, waterLevel, height, seabedDrop)).toBe(WATER_RAMP[1])
  })

  test('it climbs without ever skipping a rung', () => {
    // The failure this catches: a band edited into the wrong order, which reads
    // as a terrace halfway up every hill and looks like a terrain bug.
    let last = -1

    for (let step = 0; step <= 40; step += 1) {
      const rung = LAND_RAMP.indexOf(
        glyphFor(waterLevel + step / 40 * height, waterLevel, height, seabedDrop) as typeof LAND_RAMP[number],
      )

      expect(rung).toBeGreaterThanOrEqual(last)
      last = rung
    }

    expect(last).toBe(LAND_RAMP.length - 1)
  })

  test('the crown of the amplitude is the last glyph', () => {
    expect(glyphFor(waterLevel + height, waterLevel, height, seabedDrop)).toBe(LAND_RAMP[LAND_RAMP.length - 1])
  })
})


describe('the map', () => {
  test('one seed draws one grid, byte for byte', () => {
    const a = renderGrid(config, archipelago, WINDOW, 48, 24, ALL_LAYERS)
    const b = renderGrid(config, archipelago, WINDOW, 48, 24, ALL_LAYERS)

    expect(a).toBe(b)
    expect(a.split('\n')).toHaveLength(24)
    expect(a.split('\n').every(row => [ ...row ].length === 48)).toBe(true)
  })

  // A second seed means a second full survey — every island resited, every
  // route retraced — and that is minutes of work on its own before a glyph is
  // drawn. The default per-test budget is written for assertions against a
  // survey that already exists, so this one takes the published survey budget.
  test('a different seed is a different archipelago', () => {
    const other = clone()

    other.seed = 7_318

    expect(renderGrid(other, surveyArchipelago(other), WINDOW, 48, 24, ALL_LAYERS))
      .not.toBe(renderGrid(config, archipelago, WINDOW, 48, 24, ALL_LAYERS))
  }, SURVEY_BUDGET_MS)

  test('dropping every overlay leaves only ground', () => {
    const bare = renderGrid(config, archipelago, WINDOW, 48, 24, {
      ...ALL_LAYERS,
      creek:     false,
      paths:     false,
      track:     false,
      waterways: false,
      boats:     false,
      buildings: false,
    })

    const ground: readonly string[] = [ ...WATER_RAMP, ...LAND_RAMP ]

    for (const glyph of bare.replace(/\n/gu, ''))
      expect(ground).toContain(glyph)
  })

  test('shows all jetties, the waterways and the dispatched boats', () => {
    const mapped = renderGrid(config, archipelago, WINDOW, DETAIL_W, DETAIL_H, ALL_LAYERS)

    expect(mapped.match(/J/gu)).toHaveLength(archipelago.ports.length)
    expect(mapped).toContain('·')
    expect(mapped.match(/b/gu)).toHaveLength(archipelago.waterways.boatOffsets.length)
  })

  test('can isolate a waterway layer without the height field', () => {
    const mapped = renderGrid(config, archipelago, WINDOW, 96, 48, {
      ...ALL_LAYERS,
      height:    false,
      creek:     false,
      paths:     false,
      track:     false,
      boats:     false,
      buildings: false,
    })

    expect(mapped).toContain('·')
    expect(mapped).not.toMatch(/[~\-.:=+*#]/u)
  })
})


describe('the stats', () => {
  const stats = surveyStats(config, archipelago, WINDOW, 96, 48)

  test('the authored scape is an island, not a puddle and not a continent', () => {
    expect(stats.land).toBeGreaterThan(5)
    expect(stats.land).toBeLessThan(60)
  })

  test('the peak stands above the waterline', () => {
    expect(stats.peak.height).toBeGreaterThan(config.terrain.waterLevel)
  })

  test('the beck runs downhill into water', () => {
    expect(stats.creek).not.toBeNull()
    expect(stats.creek!.head[2]).toBeGreaterThan(stats.creek!.mouth[2])
    expect(stats.creek!.mouth[2]).toBeLessThan(config.terrain.waterLevel)
  })

  test('the farm has paths, plots and a landing', () => {
    expect(stats.footpaths.routes).toBeGreaterThan(0)
    expect(stats.footpaths.length).toBeGreaterThan(0)
    expect(stats.plots).toBe(config.layout.plotCount)
    expect(stats.landing).not.toBeNull()
  })

  test('reports every inhabited landmass, all distinct', () => {
    expect(stats.landmasses).toHaveLength(ISLANDS)
    expect(new Set(stats.landmasses.map(landmass => landmass.id)).size).toBe(ISLANDS)
    expect(new Set(stats.landmasses.map(landmass => landmass.profile)).size).toBe(ISLANDS)

    for (const landmass of stats.landmasses) {
      expect(landmass.land).toBeGreaterThan(5)
      expect(landmass.peak.height).toBeGreaterThan(config.terrain.waterLevel)
      expect(landmass.footpaths.routes).toBeGreaterThan(0)
      expect(landmass.landing).not.toBeNull()
    }
  })

  test('reports every building in world coordinates', () => {
    for (const summary of stats.landmasses) {
      const landmass = archipelago.landmasses.find(candidate => candidate.id === summary.id)!

      for (const [ name, spot ] of Object.entries(landmass.survey.places))
        expect(summary.steading[name]).toEqual([
          Math.round(spot.x + landmass.origin.x),
          Math.round(spot.z + landmass.origin.z),
        ])
    }
  })

  test('reports a connected wet network and a separated boat at every port', () => {
    expect(stats.waterways.legs).toBe(stats.landmasses.length)
    expect(stats.waterways.connected).toBe(true)
    expect(stats.waterways.wet).toBe(true)
    expect(stats.waterways.clearance).toBeGreaterThanOrEqual(config.boats.clearance)
    expect(stats.boats.count).toBe(stats.landmasses.length)
    expect(stats.boats.separation).toBeGreaterThanOrEqual(config.boats.separation)
    expect(stats.boats.conflicts).toBe(0)
  })

  // A second survey of the same seed, for the same reason the second-seed test
  // above takes the budget: proving determinism costs a whole extra archipelago.
  test('it is the same survey twice', () => {
    const again = clone()

    expect(surveyStats(again, surveyArchipelago(again), WINDOW, 32, 16))
      .toEqual(surveyStats(config, archipelago, WINDOW, 32, 16))
  }, SURVEY_BUDGET_MS)
})


describe('the command line', () => {
  test('--key value and --key=value are the same thing', () => {
    expect(parseArgs([ '--w', '48' ]).num('w', 0)).toBe(48)
    expect(parseArgs([ '--w=48' ]).num('w', 0)).toBe(48)
    expect(parseArgs([]).num('w', 96)).toBe(96)
  })

  test('a bare flag is present but empty, and does not eat the next flag', () => {
    const args = parseArgs([ '--stats', '--json' ])

    expect(args.has('stats')).toBe(true)
    expect(args.has('json')).toBe(true)
  })

  test('--set collects rather than replaces', () => {
    expect(parseArgs([ '--set', 'a=1', '--set', 'b=2' ]).list('set')).toEqual([ 'a=1', 'b=2' ])
  })

  test('a value keeps its type — `0` must not arrive as a truthy string', () => {
    expect(coerce('0')).toBe(0)
    expect(coerce('false')).toBe(false)
    expect(coerce('nordic')).toBe('nordic')
    expect(coerce('0.42')).toBe(0.42)
  })

  test('overrides land on the path they name', () => {
    const config = clone()

    applyOverrides(config, [ 'seed=42', 'look.bloom=0', 'look.grade=noir' ])

    expect(config.seed).toBe(42)
    expect(config.look.bloom).toBe(0)
    expect(config.look.grade).toBe('noir')
  })

  test('a --set without a value is refused rather than half-applied', () => {
    expect(() => applyOverrides(clone(), [ 'seed' ])).toThrow()
  })
})


describe('the capture url', () => {
  const base = (extra: Partial<Parameters<typeof shotUrl>[0]> = {}): URLSearchParams =>
    new URL(shotUrl({
      base:   'http://x/',
      pose:   { name: 'p' },
      tier:   'mobile',
      ratio:  1,
      still:  true,
      clock:  false,
      chrome: false,
      extra:  [],
      frames: 40,
      ...extra,
    })).searchParams

  test('the tier is pinned, because a detected tier is undiffable', () => {
    expect(base().get('tier')).toBe('mobile')
    expect(base().get('ratio')).toBe('1')
  })

  test('a still capture stops every clock the scape runs on', () => {
    const set = base().get('set') ?? ''

    expect(set).toContain('daylight.speed=0')
    expect(set).toContain('season.speed=0')
    expect(set).toContain('wind.strength=0')
    expect(set).toContain('look.grain=0')
    expect(set).toContain('boats.speed=0')
  })

  test('a pose writes the knobs it names and no others', () => {
    const set = base({ pose: { name: 'near', zoom: 10, time: 0.25 }}).get('set') ?? ''

    expect(set).toContain('camera.viewSize=10')
    expect(set).toContain('daylight.time=0.25')
    expect(set).not.toContain('camera.rotation')
  })

  test('a raw --set is carried through last, so it wins', () => {
    const set = (base({ extra: [ 'look.bloom=0.9' ]}).get('set') ?? '').split(',')

    expect(set.at(-1)).toBe('look.bloom=0.9')
  })
})
