/**
 * Light through the crown.
 *
 * A needle or a leaf is not opaque: the side of a spruce turned from the sun is
 * lit *through* the foliage, yellow-green, which is why a real stand is never
 * the black cut-out a lambert surface makes of it. On the tiers with no
 * environment map the shaded half of every tree had only the hemisphere term,
 * and a forest read as a row of silhouettes — which also hid any colour the
 * instances were given (`landscape/instance-tone.ts`).
 *
 * So the shared foliage material adds the key light again on the faces turned
 * *away* from it, through the albedo and a warm filter, at
 * {@link FOLIAGE_TRANSMIT} of what the lit side takes. No shadow term: the far
 * side of a crown is the side its own shadow falls on, and that is exactly the
 * light this is. It rides the foliage program every tier already links — one
 * dot product, no uniform, no varying, no texture.
 */

/** The share of the key light a crown passes to its far side, of what its near side reflects. */
export const FOLIAGE_TRANSMIT = 0.6

/** What chlorophyll does to the light it passes: red and green through, blue kept. */
export const TRANSMIT_FILTER = [ 1.12, 1, 0.5 ] as const

/** The transmitted share for a face whose normal makes `nDotL` with the direction to the light. */
export function transmitted (nDotL: number): number {
  return Math.max(0, -nDotL) * FOLIAGE_TRANSMIT
}

/** Replaces `#include <lights_fragment_end>` in the foliage program. */
export const TRANSMIT_FRAGMENT = /* glsl */`
  #include <lights_fragment_end>
  #if NUM_DIR_LIGHTS > 0
    reflectedLight.directDiffuse += directionalLights[0].color * material.diffuseColor
      * vec3(${TRANSMIT_FILTER.map(v => v.toFixed(2)).join(', ')})
      * (RECIPROCAL_PI * ${FOLIAGE_TRANSMIT.toFixed(2)} * max(0.0, -dot(geometryNormal, directionalLights[0].direction)));
  #endif
`
