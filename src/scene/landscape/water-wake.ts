/**
 * The water a hull leaves behind it.
 *
 * Its own file rather than a tenth chunk of `water.ts`, for the reason
 * `water-caps.ts`, `water-caustics.ts`, `water-gleam.ts`, `roost.ts` and
 * `shelter.ts` are their own files: this is a complete idea — one shader
 * function, three emitters and no texture read at all — and the lake is already
 * carrying the swell, the freeze, the surf, the caps, the race, the lee, the
 * net and the reflection. `water.ts` keeps the uniforms, because the uniforms
 * are the lake's: the fleet's own positions are written into them from the
 * boats' pose records every frame.
 *
 * Nothing in it is new. It was lifted out whole and unchanged when the shelter
 * map took the lake past the enforced line ceiling — the split the house rules
 * ask for, taken at the seam this file's neighbours already mark out.
 */

/** Three allocation-free wake emitters, packed as source xz + forward × strength. */
export const BOAT_WAKE_GLSL = /* glsl */`
  uniform vec4 uBoatWakes[3];
  uniform float uBoatWakePhases[3];
  uniform float uBoatWakeStrength;

  float scapeBoatWake (vec2 ground) {
    if (uBoatWakeStrength <= 0.001)
      return 0.0;

    float field = 0.0;

    for (int index = 0; index < 3; index++) {
      vec2 impulse     = uBoatWakes[index].zw;
      float wakeAmount = clamp(length(impulse), 0.0, 1.0);

      // Keep the expensive oscillation inside an active emitter's visible
      // footprint. Most water fragments are nowhere near any stern, and every
      // emitter is inactive for the whole synchronized dock window.
      if (wakeAmount > 0.001) {
        vec2 forward = impulse / wakeAmount;
        vec2 offset  = ground - uBoatWakes[index].xy;
        float behind = -dot(offset, forward);

        if (behind > 0.1 && behind < 32.0) {
          float side  = abs(dot(offset, vec2(-forward.y, forward.x)));
          float reach = smoothstep(0.1, 1.8, behind) *
            (1.0 - smoothstep(18.0, 32.0, behind));
          float arms = 1.0 - smoothstep(
            0.16,
            1.15,
            abs(side - (0.55 + behind * 0.34))
          );
          float stern = (1.0 - smoothstep(0.4, 3.2, side)) *
            (1.0 - smoothstep(7.0, 18.0, behind)) * 0.45;
          float shape = arms + stern;

          if (shape > 0.001) {
            float ripple = 0.5 + 0.5 * sin(
              (behind + side) * 2.3 - uBoatWakePhases[index] * 0.38 - uWaveTime * 1.2
            );

            field += wakeAmount * reach * shape * mix(0.45, 1.0, ripple);
          }
        }
      }
    }

    return clamp(field * uBoatWakeStrength, 0.0, 1.0);
  }
`
