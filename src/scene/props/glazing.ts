import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { window } from './timber.ts'


/**
 * Where a building's glass is, in the building's own frame.
 *
 * The one table, read twice. `buildings.ts` sets the panes into the walls from
 * it, and `lamplight.ts` lights them from it — and those are the two things that
 * have to agree about where a window is. Before this existed the positions were
 * literals inside each builder, which is fine for exactly as long as nothing
 * else needs to know them: the moment something does, a second copy is a lamp
 * burning half a metre to the left of its own glazing on some seeds and none of
 * them on others.
 *
 * Base at `y = 0` and the long axis on `x`, like every prop in the kit. `z` is
 * the *outer* face of the wall the pane is set into, so its sign is which way
 * the pane looks — local `+z` is the side the door is on. There is no separate
 * `facing` field, because that would be a second name for the sign of a number
 * that is already here.
 */
export interface Pane {

  /** Along the wall, from the middle of the building. */
  x: number

  /** Sill-to-head centre, above the base — not above the plinth. */
  y: number

  /** The wall's outer face. Its sign is the way the pane looks. */
  z: number

  /** Full width of the glass, in metres. The frame is drawn around it. */
  width: number

  /** Full height of the glass, in metres. */
  height: number
}

/**
 * Every glazed building in the kit, and every pane in it.
 *
 * Three of the five farmstead buildings, and the three that would actually have
 * a lamp burning in them: the house lives in, the barn is worked in after dark,
 * and the sauna is lit for exactly as long as it is being used. The woodshed is
 * a lean-to and the aitta is a grain store on stilts, so neither has glass to
 * put light behind — an absence, not an omission.
 *
 * The order matters and is the order the builders place them in: `lamplight.ts`
 * decides which panes are lit from a pane's index, so a table reordered is a
 * settlement whose lit windows all move.
 */
export const GLAZING = {

  // Four across the front, clear of the 2.6 m porch canopy, and two at the back.
  farmhouse: [
    { x: -3.6, y: 2.4, z: 3.06, width: 0.8, height: 1.1 },
    { x: -2.1, y: 2.4, z: 3.06, width: 0.8, height: 1.1 },
    { x: 2.1, y: 2.4, z: 3.06, width: 0.8, height: 1.1 },
    { x: 3.6, y: 2.4, z: 3.06, width: 0.8, height: 1.1 },
    { x: -2.4, y: 2.4, z: -3.06, width: 0.8, height: 1.1 },
    { x: 2.4, y: 2.4, z: -3.06, width: 0.8, height: 1.1 },
  ],

  // One either side, and deliberately not opposite each other: a barn is glazed
  // where the light is wanted rather than symmetrically.
  barn: [
    { x: 3, y: 2.5, z: 2.75, width: 0.7, height: 0.7 },
    { x: -3.2, y: 2.5, z: -2.75, width: 0.7, height: 0.7 },
  ],

  // One small pane beside the door, which is all a sauna ever has.
  sauna: [
    { x: 1.3, y: 1.9, z: 1.76, width: 0.45, height: 0.4 },
  ],
} as const satisfies Record<string, readonly Pane[]>

/** A prop in {@link GLAZING} — a building with glass in it. */
export type GlazedProp = keyof typeof GLAZING

/** Whether a prop name is one the glazing table has an answer for. */
export function isGlazed (name: string): name is GlazedProp {
  return name in GLAZING
}

/**
 * Set a building's panes into its walls.
 *
 * The rng is drawn from in table order, once per pane, exactly as the open-coded
 * `window` calls this replaced did — so the geometry is byte-for-byte what it
 * was and the determinism tests did not have to be rewritten around it.
 */
export function glazeWindows (
  parts:  BufferGeometry[],
  rng:    SeededRng,
  frame:  string,
  glass:  string,
  panes:  readonly Pane[],
): void {
  for (const pane of panes)
    window(parts, rng, frame, glass, [ pane.x, pane.y, pane.z ], pane.width, pane.height, pane.z >= 0 ? 1 : -1)
}

/**
 * One pane of glass with a light behind it, in world metres.
 *
 * The lamp's own record, and the shape `lamplight.ts` draws from. `nx`/`nz` are
 * the way the pane looks, already turned by the building's yaw — a unit vector
 * rather than an angle, because every reader of it wants the direction and not
 * the bearing, and one conversion in one place is one place to get it wrong.
 */
export interface LitPane {
  x: number
  y: number
  z: number

  /** Outward normal, on the ground plane. Unit length. */
  nx: number
  nz: number

  /** Half the glass's width, in metres. */
  halfW: number

  /** Half the glass's height, in metres. */
  halfH: number
}

/**
 * Carry a pane out of its building's frame and into the world.
 *
 * `rotateY(θ)` takes local `+z` to `(sin θ, cos θ)` — the same fact
 * `steading.ts` writes down at greater length for the yaw that faces a door at
 * the yard — so the normal is the facing times that, and the offset rotates with
 * it. The floor `y` is the plopped building's own, because a `Ploppable` levels
 * itself against the highest corner of its footprint: sampling the height field
 * again here would put the lamps a few centimetres off the wall they belong to,
 * which at the near zoom is a glow hanging in front of the boards.
 */
export function paneToWorld (
  pane:  Pane,
  x:     number,
  floor: number,
  z:     number,
  angle: number,
): LitPane {
  const cos    = Math.cos(angle)
  const sin    = Math.sin(angle)
  const facing = pane.z >= 0 ? 1 : -1

  return {
    x:     x + pane.x * cos + pane.z * sin,
    y:     floor + pane.y,
    z:     z - pane.x * sin + pane.z * cos,
    nx:    facing * sin,
    nz:    facing * cos,
    halfW: pane.width * 0.5,
    halfH: pane.height * 0.5,
  }
}
