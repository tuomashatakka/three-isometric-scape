import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  SphereGeometry,
} from 'three'
import type { BufferGeometry } from 'three'


/**
 * Terse primitive constructors for the prop builders.
 *
 * Every one is handed straight to `part()`, which consumes it — so these are
 * deliberately factories, never cached singletons.
 */

export const box = (width: number, height: number, depth: number): BufferGeometry =>
  new BoxGeometry(width, height, depth)

export const cyl = (top: number, bottom: number, height: number, sides = 8): BufferGeometry =>
  new CylinderGeometry(top, bottom, height, sides)

export const cone = (radius: number, height: number, sides = 7): BufferGeometry =>
  new ConeGeometry(radius, height, sides)

export const ball = (radius: number, segments = 6): BufferGeometry =>
  new SphereGeometry(radius, segments, Math.max(3, segments - 2))

export const rock = (radius: number, detail = 0): BufferGeometry =>
  new IcosahedronGeometry(radius, detail)

/** A thin plank lying in the xz plane, long axis on x. */
export const plank = (length: number, thickness: number, width: number): BufferGeometry =>
  new BoxGeometry(length, thickness, width)

/** Degrees to radians, for readable `rotate` options. */
export const deg = (value: number): number => value * Math.PI / 180

/** Evenly spaced offsets from `-span/2` to `+span/2`, inclusive. */
export function spread (count: number, span: number): number[] {
  if (count <= 1)
    return [ 0 ]

  const step          = span / (count - 1)
  const out: number[] = []

  for (let index = 0; index < count; index += 1)
    out.push(-span / 2 + step * index)

  return out
}
