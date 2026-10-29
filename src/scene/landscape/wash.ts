import { Color, DynamicDrawUsage, InstancedMesh, Object3D, Sphere, Vector3 } from 'three'
import type { BufferGeometry, Material } from 'three'
import { createSeededRng, smoothstep } from 'threejs-scene'
import type { SeededRng } from 'threejs-scene'
import type { ScapeConfig, LiveConfig } from '../config.ts'
import { dayAmount, sunHeight } from '../daylight.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import { LINEN_DROP, LINEN_WIDTH, buildWashLine, washRopeAt } from '../props/wash.ts'
import type { NordicPalette } from '../props/palette.ts'
import type { WindState } from '../wind.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from './archipelago.ts'


/**
 * The wash on every farm's line, as one draw.
 *
 * The line itself is merged into the steading by the dressing; this is the
 * cloth. It answers two questions every frame, and both come from clocks other
 * modules own: **is it out** — daylight off the sun's own arc, and dry, off the
 * front's fall — and **which way is it blowing** — the published `WindState`,
 * so the sheet and the grass beside it lean on one gust.
 */
export interface WashLines {
  mesh: InstancedMesh

  /** Re-hang and re-blow every cloth for this frame. */
  update(delta: number, wind: WindState, fall: number): void
  dispose(): void
}

/** One cloth, in world metres. */
export interface WashCloth {

  /** Where the pegs are on the rope. */
  x: number
  y: number
  z: number

  /** Yaw of the rope it hangs from — local `x` along the line. */
  angle: number

  /** Width and drop, in metres. */
  width: number
  drop:  number

  /** Index into {@link WASH_TONES}. */
  tone: number

  /** Where in the day this one is pegged out and taken in, 0..1 — staggered so a line fills one cloth at a time. */
  keen: number

  /** Phase of its own flap, 0..1. */
  phase: number
}

/** Where a line stands in the world: its middle, the ground under it, and its yaw. */
export interface WashLineFrame {
  x:     number
  y:     number
  z:     number
  angle: number
}

/** How far the posts are sunk under the ground the middle of the line stands on. */
export const WASH_SINK = 0.12

/**
 * What a farm hangs out. Mostly white and unbleached linen, which is what a
 * line of wash is from any distance; then the few dyed things that make it
 * read as clothes rather than sheets.
 */
export const WASH_TONES = [ '#ece8de', '#e2dccb', '#d8d2c2', '#6f8fae', '#a5503f', '#8e9a7a', '#c9b98f' ] as const

/** How likely each tone is, in the order above. */
const TONE_WEIGHT = [ 0.3, 0.22, 0.14, 0.12, 0.08, 0.07, 0.07 ]

/** Metres a cloth lifts as it is taken in, the hjell's trick at the hjell's scale. */
const LIFT = 0.12

/** The furthest a cloth is blown from plumb — level with the rope and no further. */
const LEVEL = Math.PI * 0.46

const TAU = Math.PI * 2

/**
 * Raise one farm's posts and rope into the steading's merged geometry, and
 * keep its ground clear. A line of zero height is a farm with no line.
 */
export function raiseWashLine (
  landmass: LandmassSurvey,
  config:   ScapeConfig,
  heightAt: (x: number, z: number) => number,
  rng:      SeededRng,
  palette:  NordicPalette,
  heroes:   BufferGeometry[],
  reserve:  (x: number, z: number, radius: number) => void,
): void {
  if (config.wash.height <= 0)
    return

  const line = washLineFrame(landmass, heightAt)

  heroes.push(buildWashLine({ length: config.wash.length, height: config.wash.height, rng, palette })
    .rotateY(line.angle)
    .translate(line.x, line.y, line.z))
  reserve(line.x, line.z, landmass.survey.places.washLine.radius)
}

/** Where one farm's line stands. One answer for the posts and the pegs. */
export function washLineFrame (
  landmass: LandmassSurvey,
  heightAt: (x: number, z: number) => number,
): WashLineFrame {
  const place = landmass.survey.places.washLine
  const x     = place.x + landmass.origin.x
  const z     = place.z + landmass.origin.z

  return { x, y: heightAt(x, z) - WASH_SINK, z, angle: place.angle }
}

function toneOf (roll: number): number {
  let left = roll

  for (const [ index, weight ] of TONE_WEIGHT.entries()) {
    left -= weight
    if (left < 0)
      return index
  }

  return 0
}

/**
 * Every peg on every line, dealt deterministically and thinned to the tier's
 * budget by stride, so a phone loses some of every farm's wash rather than all
 * of one farm's.
 */
export function planWash (
  archipelago: ArchipelagoSurvey,
  config:      ScapeConfig,
  budget:      number,
): readonly WashCloth[] {
  const { length, height, fill } = config.wash

  if (budget < 1 || height <= 0 || fill <= 0)
    return []

  const rng   = createSeededRng(config.seed).fork('wash')
  const count = Math.max(1, Math.floor(length * fill))
  const seats = archipelago.landmasses.flatMap((landmass, line) => {
    const frame   = washLineFrame(landmass, archipelago.field.heightAt)
    const lineRng = rng.fork(`line-${line}`)
    const cos     = Math.cos(frame.angle)
    const sin     = Math.sin(frame.angle)

    return Array.from({ length: count }, (_, index): WashCloth => {
      // Evenly spaced with a little slop, and kept off the last half-metre at
      // each end where the rope meets the crosstree.
      const t     = (index + 0.5 + lineRng.range(-0.2, 0.2)) / count
      const along = (t - 0.5) * (length - 1)
      const sheet = lineRng.next() < 0.35

      return {
        x:     frame.x + cos * along,
        y:     frame.y + washRopeAt(height, length, along / length + 0.5),
        z:     frame.z - sin * along,
        angle: frame.angle,
        width: sheet ? lineRng.range(1.1, 1.5) : lineRng.range(0.45, 0.75),
        drop:  sheet ? lineRng.range(0.9, 1.25) : lineRng.range(0.45, 0.75),
        tone:  sheet ? lineRng.int(0, 2) : toneOf(lineRng.next()),
        keen:  lineRng.range(0.15, 0.85),
        phase: lineRng.next(),
      }
    })
  })

  if (seats.length <= budget)
    return seats

  const stride = seats.length / budget

  return Array.from({ length: budget }, (_, index) => seats[Math.floor(index * stride)] as WashCloth)
}

/**
 * How much of the wash is out, 0..1.
 *
 * Daylight times dry: it goes out after the sun is properly up, comes in at
 * dusk, and comes in early when the front starts to fall. A share rather than
 * a flag so each cloth's own `keen` staggers the line in and out.
 */
export function washOut (day: number, fall: number): number {
  return smoothstep(0.35, 0.9, day) * (1 - smoothstep(0.08, 0.35, fall))
}

/** How much of one cloth is on the line, given the share of the wash that is out. */
export function clothOut (out: number, keen: number): number {
  return smoothstep(keen - 0.12, keen + 0.12, out)
}

/**
 * How far a cloth is blown off plumb, in radians, signed toward local `+z`.
 *
 * Only the wind across the rope counts: `cross` is the share of the wind
 * square to the line, so a wind along it leaves the wash hanging.
 */
export function washBillow (billow: number, strength: number, cross: number, flap: number): number {
  const lift = billow * strength * cross

  return Math.max(-LEVEL, Math.min(LEVEL, lift + flap * 0.22 * strength * Math.sign(cross || 1)))
}

function washBounds (cloths: readonly WashCloth[]): Sphere {
  const centre = new Vector3()

  for (const cloth of cloths)
    centre.add(new Vector3(cloth.x, cloth.y, cloth.z))
  centre.divideScalar(cloths.length)

  let radius = 0

  for (const cloth of cloths)
    radius = Math.max(radius, centre.distanceTo(new Vector3(cloth.x, cloth.y, cloth.z)))

  return new Sphere(centre, radius + 2)
}

export interface WashLinesOptions {
  config:   LiveConfig
  cloths:   readonly WashCloth[]
  material: Material
}

/**
 * @returns `null` on a tier that hangs nothing, or a config with no line — a
 *   graceful absence. The posts and rope are in the steading draw regardless.
 */
export function createWashLines ({ config, cloths, material }: WashLinesOptions): WashLines | null {
  if (!cloths.length)
    return null

  const geometry = buildProp('linen', createSeededRng(config().seed).fork('wash-lines'), resolvePalette())
  const mesh     = new InstancedMesh(geometry, material, cloths.length)

  mesh.name          = 'wash-lines'
  mesh.castShadow    = true
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false
  mesh.boundingSphere   = washBounds(cloths)

  const tones = WASH_TONES.map(tone => new Color(tone))

  for (const [ index, cloth ] of cloths.entries())
    mesh.setColorAt(index, tones[cloth.tone] ?? tones[0] as Color)

  const carrier = new Object3D()

  carrier.rotation.order = 'YXZ'

  // Flaps, not seconds, so `wash.flutter` can go to zero and back without the
  // line jumping to where it would have been.
  let flapped = 0

  function hang (wind: WindState | null, fall: number): void {
    const live = config()
    const out  = washOut(
      dayAmount(sunHeight(live.daylight.time, live.season.time, live.daylight.latitude, live.daylight.axialTilt)),
      fall,
    )

    for (const [ index, cloth ] of cloths.entries()) {
      const here = clothOut(out, cloth.keen)

      // Local `+z` under the rope's yaw is `(sin, cos)`; the wind across the
      // line is its share along that.
      const cross = wind ? wind.dirX * Math.sin(cloth.angle) + wind.dirZ * Math.cos(cloth.angle) : 0
      const flap  = Math.sin((flapped + cloth.phase) * TAU) + 0.4 * Math.sin((flapped * 2.7 + cloth.phase) * TAU)
      const swing = washBillow(live.wash.billow, wind?.strength ?? 0, cross, flap)

      carrier.position.set(cloth.x, cloth.y + (1 - here) * LIFT, cloth.z)
      // Rotating by +x carries the hem toward local -z, so the blow is negated
      // to send it downwind.
      carrier.rotation.set(-swing, cloth.angle, 0.06 * flap * (wind?.strength ?? 0))
      carrier.scale.set(cloth.width / LINEN_WIDTH * here, cloth.drop / LINEN_DROP * here, here)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  hang(null, 0)

  return {
    mesh,

    update (delta, wind, fall) {
      flapped = (flapped + delta * Math.max(0, config().wash.flutter)) % 1000
      hang(wind, fall)
    },

    dispose () {
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
    },
  }
}
