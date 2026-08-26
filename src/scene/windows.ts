import { AdditiveBlending, Color, InstancedMesh, MeshBasicMaterial, Object3D } from 'three'
import { createSeededRng, defineModule } from 'threejs-scene'
import { lanternBounds } from './beacon.ts'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { LAYER } from './layers.ts'
import { resolvePalette } from './props/index.ts'
import { buildWindowGlow } from './props/lamp.ts'
import type { AtmosphereQuality } from './quality.ts'


/**
 * The lamps behind the farmstead windows.
 *
 * Its own layer rather than part of the landscape, for the reason the coastal
 * light is: it is lit by the *day*, and the day is resolved by the atmosphere. A
 * module mounted before the atmosphere reads the hour it was on the previous
 * frame, which for a lamp that comes up at dusk is a light one frame behind its
 * own sky.
 *
 * One `InstancedMesh` carries every pane in the archipelago — nine a holding,
 * forty-five across the five islands — which is one draw for the whole system
 * however many farms a later run puts up. The glow is additive and writes no
 * depth, so it lays light over the wall without occluding it, and it is tested
 * against depth, so a window on the far side of a house is hidden by the house.
 *
 * ## What it answers to
 *
 * The sun, for whether a lamp is wanted at all, and the *clock*, for whether
 * anybody is awake to have lit one. Those are two different questions and the
 * second is the interesting one: the lighthouse burns all night because a
 * lighthouse is a machine, and the farm does not, because a farm is a household.
 * At three in the morning in this scape the outer rock is still sweeping and
 * every window is dark but one — which is the whole point of the system.
 */
export interface WindowLight {

  /** Middle of the glass, in world metres. */
  x: number
  y: number
  z: number

  /** The pane's own size, which the glow is scaled by. See `props/lamp.ts`. */
  width:  number
  height: number

  /** Bearing of the wall's outward normal, in radians. */
  angle: number

  /** How lived-in the building is after dark, 0..1. See `landscape/windows.ts`. */
  dwelling: number

  /**
   * The placed middle of the building this pane is set into, in world metres.
   *
   * Carried rather than derived, and not read by the lamps at all — it is here
   * so that the one claim this system can silently get wrong is checkable from
   * the record instead of from the arithmetic. A pane's outward bearing has to
   * point *away* from this; the mirrored version paints the glow on the inside
   * of the wall, which from the default pose looks exactly like no lamps. Both
   * `windows.test.ts` and `scape:map --stats` state it against this field.
   */
  centre: { x: number, z: number }
}

export interface WindowLampOptions {
  config:  LiveConfig
  quality: AtmosphereQuality
  panes:   readonly WindowLight[]

  /** Live sky. Unlit geometry, so the light has to be handed to it. */
  daylight: DaylightState
}

const TAU = Math.PI * 2

/**
 * How far past white a lit pane burns, so the bloom can find it.
 *
 * A constant rather than a knob, unlike the lighthouse's `beacon.glow`. The
 * lamp in the lantern room is a *character* — how hard it burns is part of what
 * the light is — where a paraffin lamp in a kitchen window is only ever as
 * bright as a paraffin lamp, and a slider for it would be a slider whose whole
 * range is wrong. `windows.glow` is the amount of it; this is only the headroom
 * that lets the amount cross the bloom's threshold instead of clipping at it.
 */
const LAMP_BLOOM = 2.6

/** How much of a pane's width the glow is pushed clear of the wall, in metres. */
const OFF_THE_WALL = 0.04

/**
 * Width of the ramp the household wakes and turns in over, as a fraction of the
 * day. Roughly twenty minutes — long enough not to be a switch, short enough
 * that a still taken an hour either side is unambiguous.
 */
const TURN_IN = 0.014

/** Smoothstep from 0 to 1 across {@link TURN_IN}, starting at `edge`. */
function past (phase: number, edge: number): number {
  const t = Math.min(1, Math.max(0, (phase - edge) / TURN_IN))

  return t * t * (3 - 2 * t)
}

/**
 * How awake the household is, 0..1.
 *
 * 1 between `windows.rising` and `windows.bedtime`, falling to `windows.banked`
 * outside them — not to nothing, because a farmhouse at four in the morning
 * still has a stove in it, and a scape whose farms go absolutely black reads as
 * abandoned rather than asleep.
 *
 * Both edges are phases of the same day and the ramps are one-directional, so
 * there is no wrap to get wrong. A `bedtime` at or before `rising` is a
 * household that never gets up: every window sits at `banked` all day, which is
 * the honest reading of that pair rather than an error.
 */
export function householdWake (config: ScapeConfig, time: number): number {
  const { rising, bedtime } = config.windows
  const banked              = Math.min(1, Math.max(0, config.windows.banked))
  const phase               = time - Math.floor(time)
  const up                  = Math.max(0, past(phase, rising) - past(phase, bedtime))

  return banked + (1 - banked) * up
}

/**
 * How brightly a lit pane burns, 0..1 and up.
 *
 * `1 - day` rather than `dark`, and squared, which is the same curve the
 * lighthouse comes up on — see `lampBrightness`. Two lights on one coast that
 * disagreed about when dusk was would be the more obvious bug of the two.
 */
export function lampLevel (config: ScapeConfig, day: number, time: number): number {
  const dusk = Math.min(1, Math.max(0, 1 - day))

  return Math.max(0, config.windows.glow) * dusk * dusk * householdWake(config, time)
}

/**
 * Whether the pane at `roll` has a lamp behind it.
 *
 * The draw is made once at build and kept, and the comparison happens every
 * frame — so `windows.occupancy` is a live knob rather than a rebuild, and
 * turning it up lights the farmhouse before the byre because the roll is
 * weighted by how lived-in the building is.
 */
export function isLit (roll: number, dwelling: number, occupancy: number): boolean {
  return roll < Math.min(1, Math.max(0, occupancy)) * dwelling
}

/**
 * @returns `null` when the archipelago has no glazed building on it — a scape
 *   dressed without a steading gets no lamps rather than lamps in mid-air.
 */
export function createWindowLamps (options: WindowLampOptions): ScapeModule | null {
  const { config, quality, panes, daylight } = options

  if (panes.length === 0)
    return null

  const geometry = buildWindowGlow(resolvePalette(), { rings: quality.lampSpill, halo: 1 })
  const material = new MeshBasicMaterial({
    vertexColors: true,
    transparent:  true,
    blending:     AdditiveBlending,
    depthWrite:   false,

    // Fog would mix the glow toward the fog colour and then *add* that, which on
    // a hazy night puts a grey square on the wall. A lit window is a light
    // source: haze between it and the eye is the bloom's and the mist's
    // business, not the mesh's.
    fog:     false,
    opacity: 0,
  })

  material.color.setScalar(quality.bloom ? LAMP_BLOOM : 1)

  const mesh = new InstancedMesh(geometry, material, panes.length)

  mesh.name             = 'window-lamps'
  mesh.matrixAutoUpdate = false
  mesh.boundingSphere   = lanternBounds(panes, Math.max(...panes.map(pane => pane.width + pane.height)))
  mesh.renderOrder      = LAYER.windows
  mesh.visible          = false

  // Written once. A pane does not move, so the only per-frame write is the
  // instance colour that puts it out or wobbles it.
  const carrier = new Object3D()

  for (const [ index, pane ] of panes.entries()) {
    carrier.position.set(
      pane.x + Math.sin(pane.angle) * OFF_THE_WALL,
      pane.y,
      pane.z + Math.cos(pane.angle) * OFF_THE_WALL,
    )
    carrier.rotation.set(0, pane.angle, 0)
    carrier.scale.set(pane.width, pane.height, 1)
    carrier.updateMatrix()
    mesh.setMatrixAt(index, carrier.matrix)
  }

  mesh.instanceMatrix.needsUpdate = true

  // One draw per pane, kept: which window is occupied, how warm its lamp is and
  // where in its own flicker it sits. Forked by name so a later run adding a
  // building does not reshuffle which of the existing windows are lit.
  const rng   = createSeededRng(config().seed).fork('window-lamps')
  const rolls = panes.map(() => rng.next())
  const warms = panes.map(() => rng.range(0.72, 1))
  const beats = panes.map(() => rng.next())

  const tint = new Color()
  let clock  = 0

  // What the instance colours were last written from. Compared rather than
  // recomputed every frame: with the flicker held at zero — which is how every
  // capture is taken — nothing about the lit set moves, and a still scape should
  // not be writing forty-five colours a frame to say so.
  let painted = { occupancy: NaN, unsteady: NaN, clock: NaN }

  /** The lit set and the wobble, written into the instance colours. */
  function writeColors (occupancy: number, unsteady: number): void {
    for (const [ index, pane ] of panes.entries()) {
      const wobble = Math.sin((clock + beats[index]) * TAU) * 0.5 + 0.5
      const level  = isLit(rolls[index], pane.dwelling, occupancy)
        ? warms[index] * (1 - unsteady * wobble)
        : 0

      tint.setScalar(level)
      mesh.setColorAt(index, tint)
    }

    if (mesh.instanceColor)
      mesh.instanceColor.needsUpdate = true

    painted = { occupancy, unsteady, clock }
  }

  writeColors(config().windows.occupancy, 0)

  return defineModule<ScapeConfig>({
    name: 'scape-windows',

    build (ctx) {
      ctx.scene.add(mesh)
    },

    update (_state, frame) {
      const knobs = config().windows
      const lamp  = lampLevel(config(), daylight.day, config().daylight.time)

      material.opacity = Math.min(1, lamp)

      // A dark farm is not drawn at all rather than drawn at zero opacity: a
      // transparent mesh still costs a sorted draw, and midday is the common
      // case.
      mesh.visible = lamp > 0.004

      if (!mesh.visible)
        return

      // Zero holds every lamp where it is, which is what makes the system
      // capturable — see `STILL` in `scripts/scape-shot.ts`.
      const unsteady = Math.min(1, Math.max(0, knobs.unsteady))

      clock += frame.delta * Math.max(0, knobs.flicker)

      if (clock !== painted.clock || knobs.occupancy !== painted.occupancy || unsteady !== painted.unsteady)
        writeColors(knobs.occupancy, unsteady)
    },

    dispose () {
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
      material.dispose()
    },
  })
}

// perf: one instanced draw for every window in the archipelago, skipped outright
// while the sun is up, and one colour write per pane on a frame the flicker
// actually advanced.
