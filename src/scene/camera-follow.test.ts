import { describe, expect, test } from 'bun:test'
import { BoxGeometry, InstancedMesh, MeshBasicMaterial } from 'three'
import { createBoatFollowController, resolveBoatChaseTarget } from './camera-follow.ts'
import type { BoatChaseTarget, BoatFollowPose, BoatFollowSource } from './camera-follow.ts'


const target = (): BoatChaseTarget => ({ x: 0, y: 0, z: 0, heading: 0 })

describe('boat chase camera math', () => {
  test('looks ahead while sitting behind an eastbound boat', () => {
    const pose: BoatFollowPose = { x: 12, y: -1, z: 7, bearing: 0 }
    const chase                = resolveBoatChaseTarget(pose, 45, target())

    expect(chase.x).toBe(18)
    expect(chase.y).toBeCloseTo(-0.3)
    expect(chase.z).toBe(7)
    expect(chase.heading).toBe(135)
  })

  test('tracks the landscape bearing convention around a turn', () => {
    const pose: BoatFollowPose = { x: 0, y: 0, z: 0, bearing: Math.PI / 2 }
    const chase                = resolveBoatChaseTarget(pose, 45, target())

    expect(chase.x).toBeCloseTo(0)
    expect(chase.z).toBe(6)
    expect(chase.heading).toBe(225)
  })

  test('wraps the camera heading across north', () => {
    const pose: BoatFollowPose = { x: 0, y: 0, z: 0, bearing: Math.PI }
    const chase                = resolveBoatChaseTarget(pose, 45, target())

    expect(chase.heading).toBe(315)
  })

  test('drops a selected instance when its fleet pose expires', () => {
    const geometry                 = new BoxGeometry()
    const material                 = new MeshBasicMaterial()
    const mesh                     = new InstancedMesh(geometry, material, 1)
    const poses                    = [{ x: 2, y: -1, z: 3, bearing: 0 }]
    const source: BoatFollowSource = { mesh, poses }
    const controller               = createBoatFollowController(45)

    expect(controller.select(source, 0)).toBe(true)
    expect(controller.active).toBe(true)
    expect(controller.target.x).toBe(8)

    poses.length = 0

    expect(controller.update()).toBe(false)
    expect(controller.active).toBe(false)

    mesh.dispose()
    geometry.dispose()
    material.dispose()
  })
})
