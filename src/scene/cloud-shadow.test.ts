import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { CLOUD_SHADOW_GLSL, shadeAmount, shadowThrow } from './cloud-shadow.ts'
import { SCAPE_CONFIG } from './config.ts'
import { KEY_FLOOR } from './daylight.ts'


const { cloudShadow, cloudCover, cloudHeight } = SCAPE_CONFIG.atmosphere

/** A key light halfway up the sky, on a bearing nothing else in here is on. */
const HALFWAY = { x: 0.6, y: 0.6, z: 0.52 }


describe('the shadow the cloud lays', () => {
  test('a light straight overhead throws the shadow nowhere', () => {
    const at = shadowThrow(0, 1, 0, cloudHeight)

    expect(at.x).toBeCloseTo(0, 12)
    expect(at.z).toBeCloseTo(0, 12)
  })

  /**
   * The claim the projection exists to make, stated as a fact about the ratio.
   *
   * A shadow is the horizontal run over the vertical rise. Halve the rise and
   * it goes exactly twice as far — not roughly, and not in one direction only,
   * which is the failure a lerp between two placements would have had.
   */
  test('half the elevation is twice the throw', () => {
    const high = shadowThrow(0.5, 0.8, 0.3, cloudHeight)
    const low  = shadowThrow(0.5, 0.4, 0.3, cloudHeight)

    expect(low.x).toBeCloseTo(high.x * 2, 10)
    expect(low.z).toBeCloseTo(high.z * 2, 10)
  })

  test('it lands downsun, never toward the light', () => {
    const at = shadowThrow(HALFWAY.x, HALFWAY.y, HALFWAY.z, cloudHeight)

    // The dot of the throw against the light's own horizontal bearing. A
    // shadow on the far side of what casts it can only ever be negative.
    expect(at.x * HALFWAY.x + at.z * HALFWAY.z).toBeLessThan(0)
  })

  /**
   * The throw cannot run away, and the reason is in `daylight.ts` rather than
   * in a clamp here: the key direction's `y` is held at `KEY_FLOOR`, so the
   * longest shadow this deck can cast is bounded by the sky rather than by a
   * number somebody remembered to write down beside it.
   */
  test('the floor under the key light is what bounds the throw', () => {
    const flat  = Math.sqrt(1 - KEY_FLOOR * KEY_FLOOR)
    const worst = shadowThrow(flat, KEY_FLOOR, 0, cloudHeight)

    expect(Math.hypot(worst.x, worst.z)).toBeCloseTo(cloudHeight * flat / KEY_FLOOR, 6)
    expect(Math.hypot(worst.x, worst.z)).toBeLessThan(cloudHeight * 7)
  })

  test('the throw is scale-invariant, so both callers agree', () => {
    // `scape:map` builds the key direction and does not normalise it; the
    // runtime hands the normalised one. Only the ratio is read, so the two
    // have to come out identical rather than merely close.
    const length = Math.hypot(HALFWAY.x, HALFWAY.y, HALFWAY.z)
    const raw    = shadowThrow(HALFWAY.x, HALFWAY.y, HALFWAY.z, cloudHeight)
    const unit   = shadowThrow(
      HALFWAY.x / length,
      HALFWAY.y / length,
      HALFWAY.z / length,
      cloudHeight,
    )

    expect(unit.x).toBeCloseTo(raw.x, 12)
    expect(unit.z).toBeCloseTo(raw.z, 12)
  })

  test('it writes into the record it was handed, and allocates nothing', () => {
    const into = { x: 1, z: 1 }

    expect(shadowThrow(0.5, 0.5, 0.5, cloudHeight, into)).toBe(into)
  })
})

describe('and how dark it is allowed to be', () => {
  test('a clear sky lays no shadow', () => {
    expect(shadeAmount(cloudShadow, 0, 1, 0)).toBe(0)
  })

  test('a night with nothing up lays no shadow', () => {
    expect(shadeAmount(cloudShadow, cloudCover, 0, 0)).toBe(0)
  })

  test('the authored darkness is the switch, at every hour and every cover', () => {
    for (let cover = 0; cover <= 1; cover += 0.05)
      for (let day = 0; day <= 1; day += 0.05)
        expect(shadeAmount(0, cover, day, 0.4)).toBe(0)
  })

  /**
   * The retune, as a fact rather than as a claim in the changelog: the ground
   * at noon under the default cover is shaded by exactly the 0.42 it was shaded
   * by before the cover was in the product at all.
   */
  test('noon under the default cover is the shade the ground always had', () => {
    expect(shadeAmount(cloudShadow, cloudCover, 1, 0)).toBeCloseTo(0.42, 6)
  })

  test('a moon shades a fraction of what a sun does', () => {
    const moonlit = shadeAmount(cloudShadow, cloudCover, 0, SCAPE_CONFIG.daylight.moonStrength)
    const noon    = shadeAmount(cloudShadow, cloudCover, 1, 0)

    expect(moonlit).toBeGreaterThan(0)
    expect(moonlit).toBeLessThan(noon * 0.25)
  })

  test('it never exceeds the authored darkness, however much light is up', () => {
    expect(shadeAmount(cloudShadow, 1, 1, 1)).toBeCloseTo(cloudShadow, 10)
    expect(shadeAmount(cloudShadow, 2, 4, 4)).toBeCloseTo(cloudShadow, 10)
  })
})

describe('the lookup itself', () => {
  test('it declares every uniform it reads', () => {
    for (const name of [ 'uCloudMap', 'uCloudOffset', 'uCloudScale', 'uCloudStrength' ])
      expect(CLOUD_SHADOW_GLSL).toContain(`uniform ${name === 'uCloudMap'
        ? 'sampler2D'
        : name === 'uCloudOffset' ? 'vec2' : 'float'} ${name};`)
  })

  /**
   * The chunk is written once and compiled into four programs, and the reason
   * it is a function rather than a statement is that its two callers name the
   * world position differently. A chunk that named either varying could not be
   * shared, so the parameter is the contract.
   */
  test('it names neither caller\'s varying', () => {
    expect(CLOUD_SHADOW_GLSL).toContain('float scapeCloudShade (vec2 ground)')
    expect(CLOUD_SHADOW_GLSL).not.toContain('vScapeGround')
    expect(CLOUD_SHADOW_GLSL).not.toContain('vWaterGround')
  })
})

/**
 * The cheap program is the one every still in this repository is taken of.
 *
 * `scape:shot` pins `--tier mobile`, because a detected tier is undiffable — so
 * an effect that only the full lake draws is an effect no capture here can see,
 * and the whitecaps run found that out by shipping one. The claim is about the
 * source rather than about a compiled program because the lake needs a baked
 * bathymetry mask to exist at all, and what is being asserted is a property of
 * the text: both programs, verbatim, with no tier gate between them.
 */
describe('and which lakes take it', () => {
  const lake = readFileSync(new URL('landscape/water.ts', import.meta.url).pathname, 'utf8')

  test('both water programs read the shadow, and read the same one', () => {
    const applied = lake.match(/diffuseColor\.rgb \*= scapeCloudShade\(vWaterGround\);/g)

    expect(applied).toHaveLength(2)
  })

  test('the lake declares the chunk once, and does not write its own', () => {
    expect(lake).toContain('${CLOUD_SHADOW_GLSL}')
    expect(lake).not.toContain('uniform sampler2D uCloudMap')
  })
})
