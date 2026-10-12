import { DataTexture, LinearFilter, RGBAFormat } from 'three'
import type { ScapeConfig } from '../config.ts'
import type { ShelterConfig } from '../config-shelter.ts'
import type { HeightField } from './height.ts'
import { bakeDepthGrid } from './shore-mask.ts'


/**
 * The water the land keeps the weather off.
 *
 * Its own file rather than a ninth chunk of `water.ts`, for the reason
 * `water-caps.ts`, `water-caustics.ts` and `roost.ts` are their own files: this
 * is a complete idea — one search over a depth grid, one small map, one pure
 * reconstruction and one shader chunk — and the lake is already carrying the
 * swell, the freeze, the surf, the caps, the race, the wakes, the net and the
 * reflection.
 *
 * Every white thing this sea does has, until now, been a fact about the
 * *fragment*: how deep the water is here, which way the bank here faces, how
 * hard the wind is blowing here. A sea does not work like that. What the water
 * off a beach is doing is mostly a fact about what is a quarter of a mile
 * upwind of it, and this archipelago is six islands, fifty-nine skerries, a
 * breakwater and a causeway of upwind — none of which the sea could see. It
 * broke identically on both sides of every island, raised the same swell inside
 * the harbour as outside it, and put whitecaps in the lee of the mole that was
 * built to stop exactly that.
 *
 * Three parts, and the expensive one happens once:
 *
 * **the search** marches {@link BEARINGS} rays out of every texel of the depth
 * grid and records how far each one gets before it strikes land — see
 * {@link surveyShelter}. It is the same grid `shore-mask.ts` bakes the
 * bathymetry from, at a resolution of its own, because shelter is a field that
 * changes over hundreds of metres and the mask is sized for a waterline that
 * changes over one.
 *
 * **the harmonic** is what makes that storable. Shelter is a function of
 * bearing — sheltered from the north-west, open to the south — and a map cannot
 * hold a function per texel. But the function is smooth, because it is an
 * integral over an arc, so its mean and its first harmonic carry nearly all of
 * it: three numbers, `r` and `gb` of one map, and the shader turns them back
 * into the shelter for whatever bearing the wind is on with a single dot
 * product. No trigonometry, no second map, no loop, and the wind can veer
 * through a whole gale without a byte of it being rebaked.
 *
 * **the two seas** are separated, and they are the fourth channel. A wind sea
 * has to be rebuilt downwind of whatever stopped it, which takes most of a
 * kilometre and happens along one bearing; a swell is already made and merely
 * bends back into its own shadow, which takes a few hundred metres and happens
 * from every bearing at once. So the alpha carries the same search at the
 * shorter `shelter.swellReach` as a mean with no direction in it, and the two
 * halves of the lake read different channels: the whitecaps take the harmonic,
 * and the swell's own height takes the mean. `config-shelter.ts` is where that
 * asymmetry is argued.
 */

/**
 * Texels a side of the search, and of the map it writes.
 *
 * A quarter of the bathymetry mask's own default and an eighth of what the
 * ultra tier gives that mask, which is not a saving — it is the right
 * resolution. The thing being measured is how far away land is, which at this
 * span changes by a texel's worth over a texel; a 512² search would spend
 * sixteen times the marching to draw the same field with the gpu's own bilinear
 * filter doing the last step either way.
 *
 * It is also what makes the cost defensible on the tier that matters: at 128 a
 * ray out to `swellReach` is ninety-odd steps, the whole search is about twenty
 * million grid reads, and the map it uploads is 64 KB — small enough to sit in
 * texture cache, which is the argument for the fragment tap it costs. See
 * {@link WATER_SHELTER_GLSL}.
 */
export const SHELTER_RESOLUTION = 128

/**
 * Rays out of every texel.
 *
 * Sixteen is 22.5° apart, and the number is settled by what is kept rather than
 * by what is sampled: a first harmonic is two coefficients, and the smallest
 * honest estimate of two coefficients from a circle of samples wants enough of
 * them that one island does not land between two rays and vanish. At sixteen a
 * body subtending 22.5° — the home island seen from four hundred metres — is
 * struck by at least one ray from every texel it shelters, and the harmonic fit
 * averages the aliasing that is left.
 *
 * Doubling it costs twice the march and changes the stored field by under a
 * hundredth, because the thing stored is the first two Fourier terms of a
 * function that sixteen samples already over-resolve.
 */
const BEARINGS = 16

/**
 * How far past the local reach a ray strides, in steps.
 *
 * The long half of the march is looking for *land masses* — an island, a fell,
 * the far side of a sound — at a distance where a skerry shelters nothing
 * anyway, so it is walked two texels at a time. The near half, out to whichever
 * of the two reaches is shorter, is walked one, because that is where a
 * breakwater twenty-four metres long has to be found. Halves the cost of the
 * whole search and moves the far channel by less than a texel's worth of
 * distance.
 */
const LONG_STRIDE = 2

/** The shelter field, as it is held before it is a texture. */
export interface ShelterField {

  /**
   * Four floats per texel, row-major: the mean of the local shelter over all
   * bearings, its first harmonic as a pair of coefficients in the ground plane,
   * and the mean of the swell shelter. See {@link shelterAt}.
   */
  data: Float32Array

  /** Texels a side. */
  size: number
}

/**
 * What a ray that struck land at `distance` contributes, 0..1.
 *
 * Not linear in distance, and the curve is the one fact about fetch worth
 * writing down: a fetch-limited sea grows as about the square root of the
 * distance the wind has run over it, which is the JONSWAP fit and every
 * engineering table built on it. So the *deficit* — what the sea has not yet
 * got up, which is what shelter is — falls off as the square root too, and
 * water a quarter of the fetch downwind of an island has already lost half its
 * shelter rather than a quarter of it.
 *
 * That shape is why the lee of a twenty-four metre mole is worth drawing at
 * all. Linear in distance, a nine-hundred-metre reach would put a shelter of
 * 0.97 immediately behind the stone and 0.89 a hundred metres out, which is a
 * smear across the whole sound; on the root it is a half at a quarter of the
 * reach and a quarter at nine sixteenths of it, which is a harbour with an open
 * sound outside it.
 */
export function fetchShelter (distance: number, reach: number): number {
  if (!(reach > 0) || distance >= reach)
    return 0

  return 1 - Math.sqrt(Math.max(0, distance) / reach)
}

/**
 * The shelter stored at one texel, resolved for weather arriving from `upwind`,
 * 0..1.
 *
 * **The mirror of `scapeShelterLee` in {@link WATER_SHELTER_GLSL}**, and the
 * reason this is exported: the instruments and the tests have to ask the field
 * the same question the gpu asks it, and a second arithmetic for the same
 * reconstruction is a second answer waiting to disagree.
 *
 * `upwind` is a unit vector pointing *into* the weather — the direction a ray
 * would be marched to find the land that is doing the sheltering, which is the
 * opposite of the way the wind blows.
 */
export function shelterAt (
  field:   ShelterField,
  index:   number,
  upwindX: number,
  upwindZ: number,
): number {
  const at = index * 4

  return Math.min(1, Math.max(0, field.data[at] + field.data[at + 1] * upwindX + field.data[at + 2] * upwindZ))
}

/**
 * March every bearing out of every texel and keep the first two Fourier terms.
 *
 * Pure, `three`-free in everything but this module's import list, and free of
 * the height field: it reads the depth grid and nothing else, so `scape:map`
 * surveys the shelter of the whole archipelago without a gl context and the
 * tests state facts about a grid they wrote by hand.
 *
 * Land is any texel the depth grid does not call water. Off the edge of the
 * grid is open sea rather than land — the mask's border is already deep seabed
 * and the surface runs four times the world past it — so a ray that leaves the
 * grid has found nothing, which is the correct answer and also the cheap one.
 */
export function surveyShelter (
  depth:   Float32Array,
  size:    number,
  span:    number,
  shelter: ShelterConfig['shelter'],
): ShelterField {
  const data  = new Float32Array(size * size * 4)
  const step  = span / (size - 1)
  const wind  = Math.max(1, Math.round(shelter.reach / step))
  const swash = Math.max(1, Math.round(shelter.swellReach / step))
  const fine  = Math.min(wind, swash)
  const limit = Math.max(wind, swash)

  // The compass, once. Sixteen sines and cosines against sixteen million.
  const rayX = new Float32Array(BEARINGS)
  const rayZ = new Float32Array(BEARINGS)

  for (let ray = 0; ray < BEARINGS; ray += 1) {
    const angle = ray / BEARINGS * Math.PI * 2

    rayX[ray] = Math.cos(angle)
    rayZ[ray] = Math.sin(angle)
  }

  for (let row = 0; row < size; row += 1)
    for (let column = 0; column < size; column += 1) {
      let mean   = 0
      let alongX = 0
      let alongZ = 0
      let swell  = 0

      for (let ray = 0; ray < BEARINGS; ray += 1) {
        const hit = strike(depth, size, column, row, rayX[ray], rayZ[ray], fine, limit)

        if (hit < 0)
          continue

        const metres = hit * step
        const local  = fetchShelter(metres, shelter.reach)

        mean += local
        alongX += local * rayX[ray]
        alongZ += local * rayZ[ray]
        swell += fetchShelter(metres, shelter.swellReach)
      }

      const at = (row * size + column) * 4

      data[at]     = mean / BEARINGS
      data[at + 1] = alongX * 2 / BEARINGS
      data[at + 2] = alongZ * 2 / BEARINGS
      data[at + 3] = swell / BEARINGS
    }

  return { data, size }
}

/**
 * Steps along one ray to the first land, or -1 if it finds none inside `limit`.
 *
 * Walked a texel at a time out to `fine` — the shorter of the two reaches,
 * where a breakwater twenty-four metres long still has to be found — and
 * {@link LONG_STRIDE} texels at a time past it, where what is being looked for
 * is a landmass. Stopped the moment it leaves the grid. The returned distance
 * is in steps rather than metres because the caller holds the step and both
 * reaches want it.
 */
function strike (
  depth:  Float32Array,
  size:   number,
  column: number,
  row:    number,
  dirX:   number,
  dirZ:   number,
  fine:   number,
  limit:  number,
): number {
  for (let step = 1; step <= limit; step += step <= fine ? 1 : LONG_STRIDE) {
    const x = Math.round(column + dirX * step)
    const z = Math.round(row + dirZ * step)

    if (x < 0 || z < 0 || x >= size || z >= size)
      return -1

    if (!(depth[z * size + x] > 0))
      return step
  }

  return -1
}

/** Pack a −1..1 coefficient into a byte, the way `shore-mask.ts` packs a bearing. */
function encodeUnit (value: number): number {
  return Math.round(Math.min(255, Math.max(0, (value * 0.5 + 0.5) * 255)))
}

/**
 * The map as bytes, before it is a texture.
 *
 * Split out for the reason `bakeShoreData` is: a `DataTexture` is a handle with
 * an image behind it, and a test that reached into `texture.image.data` to
 * state a fact about the lee of an island would be a test about how three
 * stores an image.
 */
export function bakeShelterData (field: ShelterField): Uint8Array {
  const bytes = new Uint8Array(field.size * field.size * 4)

  for (let index = 0; index < bytes.length; index += 4) {
    bytes[index]     = Math.round(Math.min(1, Math.max(0, field.data[index])) * 255)
    bytes[index + 1] = encodeUnit(field.data[index + 1])
    bytes[index + 2] = encodeUnit(field.data[index + 2])
    bytes[index + 3] = Math.round(Math.min(1, Math.max(0, field.data[index + 3])) * 255)
  }

  return bytes
}

/**
 * The map, on the gpu.
 *
 * Takes the same arguments `bakeShoreMask` does and bakes its own depth grid
 * from them, at its own resolution. That is a second sampling of the composite
 * height field — 16k calls against the mask's million — and it is cheaper than
 * handing the mask's grid over and decimating it, because a decimated depth
 * grid is a coast averaged with the water beside it and this search is a search
 * for coasts.
 *
 * Linear and unmipped for the shore mask's reason: nothing is ever minified
 * past its own texel here, and a mip chain over a field whose whole content is
 * a long-wavelength gradient buys nothing.
 */
export function bakeShelterMask (
  config: ScapeConfig,
  field:  HeightField,
  span:   number,
  size:   number = SHELTER_RESOLUTION,
): DataTexture {
  const depth   = bakeDepthGrid(config, field, span, size)
  const data    = bakeShelterData(surveyShelter(depth, size, span, config.shelter))
  const texture = new DataTexture(data, size, size, RGBAFormat)

  texture.name        = 'water.shelterMask'
  texture.minFilter   = LinearFilter
  texture.magFilter   = LinearFilter
  texture.needsUpdate = true
  return texture
}

/**
 * The chunk, shared verbatim by both programs and by both stages.
 *
 * **Both programs**, for the whitecaps' reason: the capture harness pins
 * `--tier mobile`, so a system the cheap program cannot draw is a system no
 * instrument in this repository can see. **Both stages**, because the swell is
 * displaced in the vertex shader and shaded in the fragment one, and a sea that
 * lay down in the lee without its faces lying down with it would be a flat
 * plane still wearing the shading of a running sea.
 *
 * It costs the fragment one dependent read, which takes the full lake from
 * seven to eight and the cheap one from three to four — the first tap any
 * system has added to the cheap program since the whitecaps. The argument for
 * it is the size of the thing read: 128² RGBA is 64 KB against the bathymetry
 * mask's 384² to 1536², so it is resident in texture cache after the first few
 * fragments of a tile rather than being streamed on every one. A tap is not a
 * tap is not a tap, and this is the cheap kind.
 *
 * The vertex stage pays a second fetch of the same map, beside the bathymetry
 * fetch it already makes, on a plane of at most 128 segments a side.
 *
 * `uShoreScale` is the bathymetry mask's own, deliberately reused rather than
 * duplicated: both maps are baked over `maskSpan` in one call site in
 * `water.ts`, so a second uniform carrying the same number would be the copied
 * channel the shore mask's own note complains about.
 */
export const WATER_SHELTER_GLSL = /* glsl */`
  uniform sampler2D uShelterMap;
  uniform float uSwellLee;

  /**
   * The whole map, in one read: the mean lee in r, its first harmonic in gb,
   * and the swell's own lee in a.
   *
   * One fetch for three readers, for the reason \`scapeShore\` is one fetch for
   * five: a driver collapses two reads of one sampler only when they are
   * literally the same fetch, and the fragment wants two of these channels at
   * the same uv.
   */
  vec4 scapeShelter (vec2 ground) {
    return texture2D(uShelterMap, ground * uShoreScale + 0.5);
  }

  /**
   * How sheltered this water is from weather arriving on \`upwind\`, 0..1.
   *
   * The stored harmonic, resolved. \`upwind\` is a unit vector pointing into the
   * weather, so the caller passes \`-uSwell\` — the swell and the wind run
   * together in this scape and there is one bearing, not two.
   *
   * The clamp is not tidiness: a first-harmonic fit of a function that is 1 over
   * a quarter of the compass and 0 over the rest overshoots at both ends, and
   * the overshoot is what would otherwise put a *negative* shelter — a sea
   * whiter than the open sound — on the weather side of a long island.
   */
  float scapeShelterLee (vec4 shelter, vec2 upwind) {
    return clamp(shelter.r + dot(shelter.gb * 2.0 - 1.0, upwind), 0.0, 1.0);
  }

  /**
   * What the swell keeps here, as a gain on its own height.
   *
   * The mean channel and no bearing — see the note in \`config-shelter.ts\` on
   * why the two seas are measured over different distances and kept in
   * different shapes. 1 everywhere is the sea this scape had.
   */
  float scapeShelterCalm (vec4 shelter) {
    return mix(1.0, uSwellLee, shelter.a);
  }
`
