import type { InstancedMesh } from 'three'


/**
 * The live world-space pose of one fleet instance.
 *
 * Bearing follows the landscape convention: radians from world +x toward +z.
 */
export interface BoatFollowPose {
  x:       number
  y:       number
  z:       number
  bearing: number
}

/**
 * The smallest surface camera controls need from the landscape's moving fleet.
 *
 * Poses are stable records mutated by the fleet. Keeping them authoritative there
 * lets turn damping, docking and any later bobbing reach the camera without
 * duplicating simulation or copying a larger fleet-specific pose shape.
 */
export interface BoatFollowSource {
  readonly mesh:  InstancedMesh
  readonly poses: readonly BoatFollowPose[]
}

export interface BoatChaseTarget {
  x:       number
  y:       number
  z:       number
  heading: number
}

export interface BoatFollowController {
  readonly active: boolean
  readonly target: BoatChaseTarget
  select(source: BoatFollowSource, instanceId: number): boolean
  update(): boolean
  clear(): boolean
}

interface FollowSelection {
  source:     BoatFollowSource
  instanceId: number
}

/** Orthographic visible height in metres when a boat is first selected. */
export const BOAT_FOLLOW_VIEW_SIZE = 22

/** Put the selected hull low in frame so the route ahead stays readable. */
const LOOK_AHEAD = 6
const LOOK_LIFT  = 0.7

function wrapDegrees (degrees: number): number {
  return (degrees % 360 + 360) % 360
}

/**
 * Resolve the map camera's relative heading and look target for one boat pose.
 *
 * aimIsoCamera places the camera on a bearing FROM its focus. A chase camera
 * belongs opposite the boat's direction of travel, hence the half-turn.
 */
export function resolveBoatChaseTarget (
  pose:         BoatFollowPose,
  baseRotation: number,
  target:       BoatChaseTarget,
): BoatChaseTarget {
  target.x       = pose.x + Math.cos(pose.bearing) * LOOK_AHEAD
  target.y       = pose.y + LOOK_LIFT
  target.z       = pose.z + Math.sin(pose.bearing) * LOOK_AHEAD
  target.heading = wrapDegrees(pose.bearing * 180 / Math.PI + 180 - baseRotation)
  return target
}

/**
 * Hold one selection and refresh its chase target from the fleet each frame.
 *
 * This is deliberately camera-agnostic: controls decide how to damp and apply
 * the resolved target, while the controller owns selection validity and scratch.
 */
export function createBoatFollowController (baseRotation: number): BoatFollowController {
  const target: BoatChaseTarget = { x: 0, y: 0, z: 0, heading: 0 }
  let selection: FollowSelection | null = null

  function update (): boolean {
    const pose = selection?.source.poses[selection.instanceId]
    if (!pose) {
      selection = null
      return false
    }

    resolveBoatChaseTarget(pose, baseRotation, target)
    return true
  }

  return {
    get active () {
      return selection !== null
    },

    target,

    select (source, instanceId) {
      selection = { source, instanceId }
      return update()
    },

    update,

    clear () {
      const changed = selection !== null
      selection     = null
      return changed
    },
  }
}

// perf: free. Four scalar writes and two trig calls per followed frame, with no
// gpu resources, draw calls or allocation.
