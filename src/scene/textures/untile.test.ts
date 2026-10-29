import { describe, expect, test } from 'bun:test'
import { CLOUD_SHADOW_GLSL } from '../cloud-shadow.ts'
import { SCAPE_CONFIG } from '../config.ts'
import { UNTILE_GLSL, UNTILE_RATIO, UNTILE_TURN, nearestRepeat, untiledUv } from './untile.ts'


/** The 92 m cloud tile and the 34 m ripple tile, in tiles across the world. */
const CLOUD_REACH  = Math.ceil(SCAPE_CONFIG.archipelago.worldSize / SCAPE_CONFIG.atmosphere.cloudScale)
const RIPPLE_REACH = Math.ceil(SCAPE_CONFIG.archipelago.worldSize / 34)


describe('the untiled read', () => {
  test('the second lattice is turned and rescaled, not merely shifted', () => {
    // A shift alone repeats wherever the first lattice does; a turn of a whole
    // quarter, or a ratio of one, is the same lattice again.
    expect(UNTILE_TURN % (Math.PI / 2)).toBeGreaterThan(0.1)
    expect(Math.abs(UNTILE_RATIO - 1)).toBeGreaterThan(0.1)
  })

  test('within a frame of tiles, the pair never comes within an eighth of a tile of repeating', () => {
    expect(nearestRepeat(8)).toBeGreaterThan(0.125)
  })

  test('across the cloud tiles the world holds, it never comes within a sixteenth', () => {
    expect(CLOUD_REACH).toBeGreaterThanOrEqual(16)
    expect(nearestRepeat(16)).toBeGreaterThan(1 / 16)
  })

  test('a single lattice is what it replaced, and that one repeats at every tile', () => {
    // The control: the same measure over the identity is exactly zero, so the
    // numbers above are a property of the turn and not of the instrument.
    const [ ox, oy ] = untiledUv(0, 0)
    const [ x, y ]   = untiledUv(RIPPLE_REACH, 0)

    expect(Math.hypot(x - ox, y - oy)).toBeCloseTo(RIPPLE_REACH * UNTILE_RATIO, 6)
    expect(nearestRepeat(0)).toBe(Infinity)
  })

  test('the glsl turns by the same matrix the pure function does', () => {
    const c = (Math.cos(UNTILE_TURN) * UNTILE_RATIO).toFixed(6)
    const s = (Math.sin(UNTILE_TURN) * UNTILE_RATIO).toFixed(6)

    expect(UNTILE_GLSL).toContain(`mat2(${c}, ${s}, -${s}, ${c})`)
    expect(UNTILE_GLSL.match(/texture2D/g)).toHaveLength(2)
  })

  test('the cloud shadow reads its detail through it', () => {
    expect(CLOUD_SHADOW_GLSL).toContain('scapeUntiled(uCloudMap')
    expect(CLOUD_SHADOW_GLSL).toContain('#ifndef SCAPE_UNTILED')
  })
})
