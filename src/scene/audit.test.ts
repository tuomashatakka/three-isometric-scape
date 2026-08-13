import { describe, expect, test } from 'bun:test'
import { packedRows, readSkips, readVaryings, SCAPE_FAMILIES } from './audit.ts'


/**
 * The census exists to settle an argument that four rounds of fixes got wrong,
 * so it has to be right about the one thing that made them wrong: a varying
 * declared inside a branch the shader never takes is not a varying the driver
 * ever sees. `flatShading` is exactly that case — three wraps `vNormal` in
 * `#ifndef FLAT_SHADED`, and counting declarations flat says the scape spends
 * three components it does not spend.
 */
describe('readVaryings', () => {
  test('skips a declaration the preprocessor never reaches', () => {
    const source = [
      '#define FLAT_SHADED',
      'varying vec3 vViewPosition;',
      '#ifndef FLAT_SHADED',
      'varying vec3 vNormal;',
      '#endif',
    ].join('\n')

    expect(readVaryings(source).map(v => v.name)).toEqual([ 'vViewPosition' ])
  })

  test('keeps a declaration whose guard is satisfied', () => {
    const source = [
      'varying vec3 vViewPosition;',
      '#ifndef FLAT_SHADED',
      'varying vec3 vNormal;',
      '#endif',
    ].join('\n')

    expect(readVaryings(source).map(v => v.name)).toEqual([ 'vViewPosition', 'vNormal' ])
  })

  test('resolves an array length through the define that sets it', () => {
    const source = [
      '#define NUM_DIR_LIGHT_SHADOWS 2',
      '#if NUM_DIR_LIGHT_SHADOWS > 0',
      'varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];',
      '#endif',
    ].join('\n')

    expect(readVaryings(source)).toEqual([
      { name: 'vDirectionalShadowCoord', type: 'vec4', size: 2 },
    ])
  })

  test('drops an array whose count is zero', () => {
    const source = [
      '#if NUM_POINT_LIGHT_SHADOWS > 0',
      'varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];',
      '#endif',
    ].join('\n')

    expect(readVaryings(source)).toEqual([])
  })

  // The first cut of this parser computed branch liveness including the level
  // being opened, so `#else` after a false `#if` came out false as well and the
  // census silently under-counted. `vColor` is a live example: three declares it
  // through exactly this shape.
  test('takes the else branch when the if was not taken', () => {
    const source = [
      '#if defined( USE_COLOR_ALPHA )',
      'varying vec4 vColor;',
      '#else',
      'varying vec3 vColor;',
      '#endif',
    ].join('\n')

    expect(readVaryings(source)).toEqual([{ name: 'vColor', type: 'vec3', size: 1 }])
  })

  test('takes only the first true arm of an if/elif/else', () => {
    const source = [
      '#define USE_COLOR 1',
      '#if defined( USE_COLOR_ALPHA )',
      'varying vec4 vAlpha;',
      '#elif defined( USE_COLOR )',
      'varying vec3 vColor;',
      '#else',
      'varying vec2 vNeither;',
      '#endif',
    ].join('\n')

    expect(readVaryings(source).map(v => v.name)).toEqual([ 'vColor' ])
  })

  test('keeps a dead outer branch dead however its inner arms read', () => {
    const source = [
      '#ifdef NEVER_DEFINED',
      '#ifdef ALSO_NOT',
      'varying vec3 vA;',
      '#else',
      'varying vec3 vB;',
      '#endif',
      '#endif',
      'varying vec2 vReal;',
    ].join('\n')

    expect(readVaryings(source).map(v => v.name)).toEqual([ 'vReal' ])
  })

  test('ignores fragment outputs and built-ins', () => {
    const source = [
      'layout(location = 0) out vec4 pc_fragColor;',
      'out vec4 gl_Position;',
      'varying vec2 vScapeGround;',
    ].join('\n')

    expect(readVaryings(source).map(v => v.name)).toEqual([ 'vScapeGround' ])
  })

  test('reads a precision-qualified declaration', () => {
    expect(readVaryings('varying highp vec2 vScapeGround;')).toEqual([
      { name: 'vScapeGround', type: 'vec2', size: 1 },
    ])
  })

  /**
   * The number the whole investigation turned on. This is the scape's ground
   * program as three assembles it: flat-shaded, vertex-coloured, fogged, one
   * directional shadow, plus the two the scape injects. Fifteen components of
   * the sixty the handset reports — a quarter of the budget, not the ceiling it
   * was blamed on.
   */
  test('counts the scape ground program at fifteen components', () => {
    const source = [
      '#define FLAT_SHADED',
      '#define USE_COLOR',
      '#define USE_FOG',
      '#define NUM_DIR_LIGHT_SHADOWS 1',
      'varying vec3 vViewPosition;',
      '#ifndef FLAT_SHADED',
      'varying vec3 vNormal;',
      '#endif',
      '#ifdef USE_COLOR',
      'varying vec4 vColor;',
      '#endif',
      '#ifdef USE_FOG',
      'varying float vFogDepth;',
      '#endif',
      '#if NUM_DIR_LIGHT_SHADOWS > 0',
      'varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];',
      '#endif',
      'varying vec2 vScapeGround;',
      'varying float vScapeUp;',
    ].join('\n')

    const varyings  = readVaryings(source)
    const component = { vec4: 4, vec3: 3, vec2: 2, float: 1 } as Record<string, number>
    const total     = varyings.reduce((sum, v) => sum + component[v.type]! * v.size, 0)

    expect(varyings.map(v => v.name)).not.toContain('vNormal')
    expect(total).toBe(15)
    expect(packedRows(varyings)).toBeLessThanOrEqual(15)
  })
})

describe('packedRows', () => {
  test('gives every vec4 a row of its own', () => {
    expect(packedRows([
      { name: 'a', type: 'vec4', size: 1 },
      { name: 'b', type: 'vec4', size: 1 },
    ])).toBe(2)
  })

  test('lets a float ride along in a vec3 row', () => {
    expect(packedRows([
      { name: 'a', type: 'vec3', size: 1 },
      { name: 'b', type: 'float', size: 1 },
    ])).toBe(1)
  })

  test('pairs vec2s two to a row', () => {
    expect(packedRows([
      { name: 'a', type: 'vec2', size: 1 },
      { name: 'b', type: 'vec2', size: 1 },
      { name: 'c', type: 'vec2', size: 1 },
    ])).toBe(2)
  })

  test('spends a whole row per array element', () => {
    expect(packedRows([{ name: 'a', type: 'vec4', size: 3 }])).toBe(3)
  })

  test('spends a row per matrix column', () => {
    expect(packedRows([{ name: 'a', type: 'mat4', size: 1 }])).toBe(4)
  })

  test('holds the whole scape ground program well inside a phone budget', () => {
    // 15 rows is what the PowerVR handset reports; this must clear it easily.
    expect(packedRows([
      { name: 'vViewPosition', type: 'vec3', size: 1 },
      { name: 'vColor', type: 'vec4', size: 1 },
      { name: 'vFogDepth', type: 'float', size: 1 },
      { name: 'vDirectionalShadowCoord', type: 'vec4', size: 1 },
      { name: 'vScapeGround', type: 'vec2', size: 1 },
      { name: 'vScapeUp', type: 'float', size: 1 },
    ])).toBeLessThanOrEqual(5)
  })
})

describe('readSkips', () => {
  test('is empty when the url says nothing', () => {
    expect(readSkips(null, () => undefined).size).toBe(0)
    expect(readSkips('', () => undefined).size).toBe(0)
  })

  test('reads a comma-separated list, spaces and all', () => {
    const skipped = readSkips('water, mist', () => undefined)

    expect([ ...skipped ].sort()).toEqual([ 'mist', 'water' ])
  })

  test('reports a name it does not know rather than dropping it quietly', () => {
    const said: string[] = []
    const skipped        = readSkips('water,nonsense', message => said.push(message))

    expect(skipped.has('water')).toBe(true)
    expect(said.some(line => line.includes('nonsense'))).toBe(true)
  })

  test('accepts every family it advertises', () => {
    const skipped = readSkips(SCAPE_FAMILIES.join(','), () => undefined)

    expect(skipped.size).toBe(SCAPE_FAMILIES.length)
  })
})
