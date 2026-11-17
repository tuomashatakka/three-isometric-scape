/**
 * Bedding on every steep stone face — the far range, the island cliffs, the
 * stacks, the crag and every boulder big enough to show it.
 *
 * Seen from a kilometre, a bare mountainside reads as rock by its beds before
 * anything else: horizontal partings the gullies cut across, each with a lip
 * that catches the sky and a dark recess under it. Until now the far coast was
 * painted by vertex colour on a sweep whose rings are tens of metres apart, so
 * the rock faces were one flat grey — and a stratum can never ride a vertex
 * colour that coarse; it would alias into rings.
 *
 * So it is a fragment term in the shared ground material, inside the stone
 * block of `weatheringFragment` (the albedo already decides what is stone; no
 * prop flag), keyed on world altitude and on how steep the face is. Two scales:
 *
 * - **beds**, {@link BED} metres, wandering up and down by {@link BED_WARP} over a
 *   couple of hundred metres so they are not contour lines — the read from the
 *   archipelago frame;
 * - **laminae**, {@link LAMINA} metres, fainter — the read on a boulder or a
 *   sea cliff at close zoom.
 *
 * Each is faded by its own screen width (a stratum under ~1.5 px is its mean
 * tone, never shimmer), so a wide frame costs a few multiplies and keeps its
 * colour. The lip turns the normal up, so the beds are lit, not drawn: under a
 * low sun the ledges catch it and under overcast the partings hold the shade.
 *
 * No texture, uniform, varying or program.
 */

/** Metres between beds, and how far they wander up and down. */
export const BED      = 8.5
export const BED_WARP = 6

/** Metres between the thin laminae inside a bed. */
export const LAMINA = 0.9

/** How dark the parting at the foot of a bed is, and of a lamina. */
export const BED_DARK    = 0.38
export const LAMINA_DARK = 0.16

/** Strata per pixel past which a scale has gone to its mean tone. */
export const STRATA_FADE = [ 0.25, 0.65 ] as const

/** The wander of the beds, metres — a sum of sines, so glsl and the cpu agree to the float. */
export function bedWarp (x: number, z: number): number {
  return BED_WARP * (0.6 * Math.sin(x / 61 + 1.3) * Math.sin(z / 47 - 0.4) + 0.4 * Math.sin((x + z) / 113))
}

/**
 * The parting profile of one stratum, 0 on the bed and 1 in the recess under
 * the lip: a sharp foot, a long smooth face. `coord` is altitude over spacing.
 */
export function parting (coord: number): number {
  const along = coord - Math.floor(coord)

  return Math.pow(1 - along, 6)
}

/** The darkening of a steep stone face at an altitude, 0..1, both scales, unfaded. */
export function strataShade (x: number, alt: number, z: number): number {
  const bed    = parting((alt + bedWarp(x, z)) / BED)
  const lamina = parting(alt / LAMINA)

  return 1 - (1 - BED_DARK * bed) * (1 - LAMINA_DARK * lamina)
}

const f = (v: number): string => v.toFixed(4)

/**
 * The glsl, for the inside of the stone block of `weatheringFragment`, before
 * the moss: reads `stone`, `alt`, `scapeFlat`, `vScapeGround` and
 * `viewMatrix`. Writes `diffuseColor` and `normal`.
 */
export const STRATA_GLSL = /* glsl */`
    float strataSteep = stone * (1.0 - smoothstep(0.6, 0.95, vScapeFace.x));
    if (strataSteep > 0.002) {
      vec2 sg = vScapeGround;
      float warp = ${f(BED_WARP)} * (0.6 * sin(sg.x / 61.0 + 1.3) * sin(sg.y / 47.0 - 0.4) + 0.4 * sin((sg.x + sg.y) / 113.0));
      vec2 coord = vec2((alt + warp) / ${f(BED)}, alt / ${f(LAMINA)});
      vec2 keep  = 1.0 - smoothstep(vec2(${f(STRATA_FADE[0])}), vec2(${f(STRATA_FADE[1])}), max(fwidth(coord), vec2(1e-4)));
      vec2 along = fract(coord);
      vec2 part  = pow(1.0 - along, vec2(6.0));

      // The mean of the profile is 1/7: a face too far to resolve its beds
      // keeps the same overall tone it has when it does.
      vec2 dark  = vec2(${f(BED_DARK)}, ${f(LAMINA_DARK)}) * strataSteep * mix(vec2(1.0 / 7.0), part, keep);
      diffuseColor.rgb *= (1.0 - dark.x) * (1.0 - dark.y);

      // The lip at the top of each bed leans up to the sky; the recess under it, down.
      float lip = (smoothstep(0.75, 1.0, along.x) - part.x) * keep.x * 0.55 + (smoothstep(0.8, 1.0, along.y) - part.y) * keep.y * 0.3;
      normal = normalize(normal + viewMatrix[1].xyz * lip * strataSteep);
    }
`
