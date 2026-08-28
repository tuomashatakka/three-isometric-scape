import { BufferAttribute, BufferGeometry, Color } from 'three'
import { mergeParts } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'
import { WINDOW_FRAME_PROUD, WINDOW_GLASS_PROUD } from './timber.ts'


/**
 * The light a lit window puts into the night.
 *
 * Not the glass — the glass is part of the building, cut by `glaze()` in
 * [`buildings.ts`](buildings.ts) and lit like every other surface. This is what
 * is laid over it once there is a lamp behind it: a bright pane, and the spill
 * that pane throws into the air around it.
 *
 * ## Everything here is in pane units
 *
 * Which is the one scale decision this geometry makes, and it is deliberate.
 * The `InstancedMesh` in `scene/windows.ts` scales each instance by its own
 * pane's width and height, so a length written here is a fraction of the window
 * rather than a number of metres — and the spill therefore grows with the
 * opening it comes out of. That is the honest coupling: a bigger window lets out
 * more light. Writing the spill in metres instead would need one geometry per
 * pane size, which is a draw call apiece for a difference nobody can see.
 */

/** Segments around the spill. Twelve is round enough at the near zoom. */
const SPILL_AROUND = 12

/**
 * How far the spill reaches from the middle of the pane, in pane units.
 *
 * Measured from the centre rather than from the edge, because the fan it builds
 * is radial and a rectangle has no single edge to measure out from. 2.6 is a
 * pool of light roughly a metre out from a farmhouse window, which is what the
 * captures are judged on: they are taken at the `mobile` tier, which has no
 * bloom, so the pane cannot spread by burning past white and the haze around it
 * is the only thing carrying the lamp at any distance.
 */
const SPILL_REACH = 2.6

/**
 * How bright the spill starts, against the pane's own 1.
 *
 * Low on purpose. The spill is *haze* — light caught in the air in front of the
 * glass — and at anything near the pane's brightness it stops reading as air and
 * starts reading as a lens flare stuck to the wall.
 */
const SPILL_PEAK = 0.45

/** How steeply the spill dies. Above 1 it hugs the pane; below, it hangs. */
const SPILL_FALL = 1.8

/**
 * Where the lit pane sits, in metres out from the wall the window is on.
 *
 * The one length in this file that is *not* in pane units, and it is in metres
 * for a reason the run that wrote this had already reasoned out and then got
 * backwards: the light belongs in the reveal — behind the surround's front face
 * and in front of the glass — and a reveal is a fixed depth of timber rather than
 * a fraction of a window. A hair off the glass, so the two do not z-fight.
 */
export const LAMP_PANE_PROUD = WINDOW_GLASS_PROUD + 0.01

/**
 * Where the haze in front of the pane sits, in metres out from the same wall.
 *
 * Clear of the surround, which is the whole of what went wrong before: the glow
 * was pushed 0.10 m *into* the house, the geometry is flat, and the depth test
 * did the rest — the entire system drew nothing at all, at every pose, for two
 * runs. The pane can live down in the reveal because the opening is empty now;
 * the haze cannot, because it is wider than the opening and would be clipped by
 * the surround it is supposed to be spilling past.
 */
export const LAMP_SPILL_PROUD = WINDOW_FRAME_PROUD + 0.02

/**
 * Minimum radius factor for the directional bias.
 *
 * Light escaping an aperture comes out roughly along the outward normal, not
 * evenly in all directions. `cos² θ` shapes the spill into a forward lobe
 * (brightest at the opening, hanging into the room) with just enough spread
 * at 90° for the frame edges to catch some glow. 0.287 keeps the outer ring
 * above 0.5 at the widest, which the test in `lamp.test.ts` requires.
 */
const SPILL_MIN = 0.287

export interface WindowGlowOptions {

  /**
   * Rings in the spill. 0 is a lit pane and nothing around it — which is a real
   * window seen on a clear night, and the graceful absence the cheapest tier
   * gets rather than a coarse version of the spill.
   */
  rings: number

  /** How far the spill reaches, as a multiple of {@link SPILL_REACH}. */
  halo: number
}

/**
 * A lit pane and the haze in front of it, built in the pane's own frame.
 *
 * Centred on the glass and looking down `+z`, so the carrier in
 * `scene/windows.ts` has only to place it on the wall and turn it to that wall's
 * outward bearing. It is *not* flat: the lit pane sits in the reveal at
 * {@link LAMP_PANE_PROUD} and the haze stands off in front of the surround at
 * {@link LAMP_SPILL_PROUD}, both in metres, because both are answering to a depth
 * of timber rather than to the size of the window.
 *
 * Nothing here is lit: the material is unlit and additive, and the
 * colour is baked per *vertex* rather than per facet so the spill falls to
 * nothing at its rim without the blend having to do it. See `buildBeaconOptic`
 * for the same argument at greater length — an additive edge lives in the
 * geometry, not in the opacity.
 */
export function buildWindowGlow (palette: NordicPalette, options: WindowGlowOptions): BufferGeometry {
  const rings = Math.max(0, Math.round(options.rings))
  const reach = Math.max(0, options.halo) * SPILL_REACH
  const lamp  = new Color(palette.lampWarm)
  const parts = [ buildPane(lamp) ]

  if (rings > 0 && reach > 0)
    parts.push(buildSpill(lamp, rings, reach))

  return mergeParts(parts)
}

/** The glass itself, at full brightness and one unit square. */
function buildPane (lamp: Color): BufferGeometry {
  return soup(lamp, LAMP_PANE_PROUD, push => {
    const at = (x: number, y: number): void => push(x, y, 1)

    at(-0.5, -0.5); at(0.5, -0.5); at(0.5, 0.5)
    at(-0.5, -0.5); at(0.5, 0.5); at(-0.5, 0.5)
  })
}

/**
 * The haze around it, graded to nothing at its rim and biased along the
 * outward normal so it reads as light escaping an opening rather than a
 * glow evenly smeared around the pane.
 *
 * `+z` is outward (toward the viewer), so `cos² θ` narrows the spill into
 * a forward lobe — brightest directly ahead, fading at the sides, absent
 * behind. It is flat, but not in the pane's plane: the whole fan stands at
 * {@link LAMP_SPILL_PROUD}, in front of the surround it would otherwise be
 * clipped by.
 */
function buildSpill (lamp: Color, rings: number, reach: number): BufferGeometry {
  return soup(lamp, LAMP_SPILL_PROUD, push => {
    const at = (ring: number, step: number): void => {
      const t     = ring / rings
      const turn  = step / SPILL_AROUND * Math.PI * 2
      const level = SPILL_PEAK * (1 - t) ** SPILL_FALL
      const bias  = SPILL_MIN + (1 - SPILL_MIN) * Math.cos(turn) ** 2

      push(Math.cos(turn) * t * reach * bias, Math.sin(turn) * t * reach * bias, level)
    }

    for (let ring = 0; ring < rings; ring += 1)
      for (let step = 0; step < SPILL_AROUND; step += 1) {
        at(ring, step)
        at(ring + 1, step)
        at(ring + 1, step + 1)

        at(ring, step)
        at(ring + 1, step + 1)
        at(ring, step + 1)
      }
  })
}

/**
 * Unindexed triangles with a colour per vertex.
 *
 * Built by hand rather than through `part()` for the reason `beamFan` next door
 * is: `part()` tints a whole facet, and a fan of facet-tinted quads has a
 * visible edge against every quad beside it. A glow made of visible edges is not
 * a glow.
 *
 * Every attribute the merge needs and nothing more. The normal is a constant
 * `+z` — nothing lights this geometry, but `mergeParts` requires every part to
 * carry the same attributes, and a merge is what this is for.
 */
function soup (
  lamp: Color,
  at:   number,
  fill: (push: (x: number, y: number, level: number) => void) => void,
): BufferGeometry {
  const positions: number[] = []
  const normals: number[]   = []
  const uvs: number[]       = []
  const colors: number[]    = []

  fill((x, y, level) => {
    positions.push(x, y, at)
    normals.push(0, 0, 1)
    uvs.push(x + 0.5, y + 0.5)
    colors.push(lamp.r * level, lamp.g * level, lamp.b * level)
  })

  const built = new BufferGeometry()

  built.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  built.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  built.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  built.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))

  return built
}
