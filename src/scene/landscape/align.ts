import { Euler, Quaternion, Vector3 } from 'three'
import type { GroundNormal } from './height.ts'


/**
 * Standing a prop on ground that is not level.
 *
 * Every scattered thing in the scape used to be raised with `rotate: [0, yaw,
 * 0]` — spun about its own axis and otherwise plumb, whatever the hillside under
 * it was doing. On flat ground that is right and invisible. On a fifteen-degree
 * slope it is a boulder standing to attention, a cobble hovering on its downhill
 * edge, and a line of stumps that reads as fence posts because every one of them
 * is vertical in a landscape where nothing else is.
 *
 * The fix is a rotation, not a placement: tip the prop's own up axis onto the
 * ground's normal, then spin it about that. Which is what this is.
 */

const UP = new Vector3(0, 1, 0)

// Scratch, reused. This runs once per instance at build — a few tens of
// thousands of times across the archipelago — and four allocations apiece is
// four allocations more than the samplers next door are allowed.
const lean   = new Vector3()
const tilt   = new Quaternion()
const spin   = new Quaternion()
const facing = new Euler()

/**
 * How much of the ground's lean a prop takes.
 *
 * A number rather than a flag, because the honest answer differs by what the
 * thing is. A stone was left where it rolled and takes all of it; a tree grows
 * toward the light whatever it is rooted in and takes almost none; a hay bale
 * was set down by somebody and takes a little.
 */
export type TiltWeight = number

/**
 * The euler that stands a prop on a slope, written into `target`.
 *
 * @param normal - The ground's unit normal, from `HeightField.normalAt`.
 * @param yaw - Which way the prop faces, about its own up axis.
 * @param weight - How much of the lean to take, 0..1. See {@link TiltWeight}.
 * @returns `target`, as the `[x, y, z]` euler `scatterInstances` expects.
 *
 * @remarks The composition is `tilt * yaw`, and the order is the whole of it: the
 * prop is spun about its *own* axis first and the result is tipped, so a rock
 * turned to a new bearing still sits flush. Tipping first and yawing after spins
 * the rock about the world's vertical instead, which slides it off the slope it
 * was just placed on.
 *
 * `Object3D.rotation.set` reads its three numbers in three's default `XYZ`
 * order, which can express any rotation — so this goes through a quaternion and
 * comes back out as an euler rather than trying to write one down directly.
 */
export function alignToSlope (
  normal: GroundNormal,
  yaw:    number,
  weight: TiltWeight,
  target: [number, number, number],
): [number, number, number] {
  // Nothing to do, and worth the branch: level ground is most of the island, and
  // a quaternion round trip that ought to come back as [0, yaw, 0] comes back as
  // [-0, 1.3699999999999999, -0] instead. Every prop on a flat field would move
  // by a rounding error, which is a visual diff nobody asked for.
  if (weight <= 0 || normal.y >= 1 - 1e-12) {
    target[0] = 0
    target[1] = yaw
    target[2] = 0
    return target
  }

  // Toward the normal rather than to it, so a weight is a share of the lean and
  // not a switch. Normalising after the lerp is what keeps a partial tilt a
  // rotation rather than a squash.
  lean.set(
    normal.x * weight,
    normal.y * weight + (1 - weight),
    normal.z * weight,
  ).normalize()

  tilt.setFromUnitVectors(UP, lean)
  spin.setFromAxisAngle(UP, yaw)
  facing.setFromQuaternion(tilt.multiply(spin))

  target[0] = facing.x
  target[1] = facing.y
  target[2] = facing.z
  return target
}
