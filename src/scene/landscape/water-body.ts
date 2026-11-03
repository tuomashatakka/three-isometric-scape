import { MAX_DEPTH } from './shore-mask.ts'


/**
 * The colour of the water itself: the bed seen through it, against the light
 * deep water sends back.
 *
 * It was a two-stop ramp, `shallowWater` to `deepWater` over the first half of
 * the mask, with both stops grey-green. Grey is what water is not. Light going
 * down to the bed and back up loses red first, then blue, then green — so a
 * sand shelf under a metre of coastal water is a pale turquoise, under three it
 * is a deep bottle-green, and past that the bed is gone and what is left is the
 * colour the water body scatters back, which off a northern coast is a dark
 * blue-green. That ring of turquoise around every island, going to blue in open
 * water, is most of what tells an aerial photograph of a coast from a model of
 * one, and it costs nothing: the depth is the mask fetch the lake already makes.
 *
 * One palette colour fewer. The shallow stop was a colour standing in for a
 * process; the process needs the bed, which is the beach's own sand (wetted),
 * and the water, which is `deepWater`.
 */

/**
 * Diffuse attenuation per metre, red, green, blue.
 *
 * Coastal water rather than ocean: the peat and the kelp put dissolved organic
 * matter in it that eats the blue end, so blue goes faster than green and the
 * shelves read green-turquoise rather than the caribbean cyan of clear water.
 * Red is absorbed by the water molecule itself and goes within a metre.
 */
export const WATER_ABSORPTION = [ 1.2, 0.42, 0.55 ] as const

/** Reflectance at normal incidence, for an index of refraction. */
export function normalReflectance (ior: number): number {
  return ((ior - 1) / (ior + 1)) ** 2
}

/** Sea water's, and the 1.5 three's standard material assumes for everything. */
export const WATER_F0 = normalReflectance(1.333)
export const THREE_F0 = 0.04

/** How much darker sand is under water than on the dry strand. */
export const BED_WET = 0.62

type Rgb = readonly [number, number, number]

/**
 * How much of the bed's light survives the trip down and back up, per channel,
 * for a depth as the shore mask stores it (a fraction of `MAX_DEPTH`).
 */
export function bedTransmission (depth: number): [number, number, number] {
  const metres = 2 * MAX_DEPTH * Math.min(1, Math.max(0, depth))

  return WATER_ABSORPTION.map(k => Math.exp(-k * metres)) as [number, number, number]
}

/** The body colour the fragment draws, in linear rgb — what the test reads. */
export function waterBody (depth: number, deep: Rgb, bed: Rgb): [number, number, number] {
  const through = bedTransmission(depth)

  return [ 0, 1, 2 ].map(i => deep[i] + (bed[i] * BED_WET - deep[i]) * through[i]) as [number, number, number]
}

const ABSORPTION_GLSL = `vec3(${WATER_ABSORPTION.map(k => (k * 2 * MAX_DEPTH).toFixed(4)).join(', ')})`

export const WATER_BODY_GLSL = /* glsl */`
  uniform vec3 uDeep;
  uniform vec3 uSeabed;

  vec3 scapeWaterBody (float depth) {
    return mix(uDeep, uSeabed * ${BED_WET.toFixed(2)}, exp(-${ABSORPTION_GLSL} * clamp(depth, 0.0, 1.0)));
  }
`
