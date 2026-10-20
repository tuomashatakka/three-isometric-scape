import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial } from 'three'
import { defineModule } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { LAYER } from './layers.ts'
import type { ShoreLight } from './landscape/shore-lights.ts'
import { resolvePalette } from './props/index.ts'
import type { AtmosphereQuality } from './quality.ts'
import { householdWake } from './windows.ts'


/**
 * The lights of the places on the far coast.
 *
 * Its own layer rather than part of the landscape, for the reason the lit
 * windows and the coastal light are: it is lit by the *day*, and the day is
 * resolved by the atmosphere. A module mounted before the atmosphere reads the
 * hour it was on the previous frame, which for a light that comes up at dusk is
 * a coast one frame behind its own sky.
 *
 * ## points, not quads
 *
 * Every other lit thing in this scape is a piece of geometry at a known
 * orientation — a pane is in a wall, a lantern is in a tower — and is drawn as
 * a quad facing the way the thing it is set into faces. Nothing out here has a
 * wall. A window a kilometre away subtends a fraction of a pixel; what is drawn
 * is not the window, it is the *glare* of it, and glare faces the eye from every
 * bearing the reader can put the camera at.
 *
 * So this is one `Points` draw, which is camera-facing by construction and
 * costs a single vertex a light. The alternative — an `InstancedMesh` of quads
 * oriented inward toward the middle of the world — looks identical from the
 * bearings that face them and turns edge-on from the ones that do not, and this
 * camera turns all the way round.
 *
 * ## what it answers to
 *
 * The same two clocks the farmstead's lamps answer to, read through the same
 * two functions: the sun for whether a lamp is wanted at all, and
 * {@link householdWake} for whether anybody over there is still up. That reuse
 * is the point rather than a convenience — two coasts in one frame that
 * disagreed about when dusk was, or about when a household turns in, would be
 * the more obvious bug of the two. What this does *not* share is the
 * occupancy roll and the guttering: at this range a lit window is one sample of
 * additive light, and a flicker nobody can resolve is a buffer write a still
 * scape should not be making.
 *
 * It therefore integrates nothing. Where the coast is in its evening is a pure
 * function of `daylight.time`, the way the tide's level and the cart's round on
 * the road already are, so there is no rate here to put in `STILL` and no
 * capture needs a new switch to hold it.
 *
 * ## what it costs
 *
 * One draw call and about thirty vertices, on every tier, with no texture and
 * no per-frame buffer write — the lights do not move and their colours are
 * written once at build. There is no `AtmosphereQuality` number for it for the
 * same reason there is none for the far coast it stands on: a system that costs
 * a phone exactly what it costs a workstation does not need a budget, and a
 * tier knob reading the same on all four tiers is a knob lying about having a
 * choice in it. The whole per-frame cost is one uniform write and one
 * comparison against zero.
 */

/**
 * How far past white a light on the far coast burns, so the bloom can find it.
 *
 * Lower than the farmstead's `LAMP_BLOOM`, and the difference is the air: these
 * are a kilometre off through the same haze that takes the contrast out of the
 * range behind them, so a light that crossed the bloom threshold as hard as one
 * in the next field reads as a flare rather than as a window. A constant and
 * not a knob, for `LAMP_BLOOM`'s reason — `shoreLights.glow` is the amount, and
 * this is only the headroom that lets the amount cross the threshold instead of
 * clipping at it.
 */
const SHORE_BLOOM = 1.9

const VERTEX = /* glsl */`
  varying vec3 vTone;
  uniform float uScale;

  void main () {
    vTone        = color;
    gl_PointSize = uScale;
    gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAGMENT = /* glsl */`
  varying vec3 vTone;
  uniform float uOpacity;

  void main () {
    // A core with a halo round it rather than one falloff: a lamp seen through
    // a kilometre of sea air has a hard middle and a soft surround, and a
    // single smoothstep gives a disc that reads as a dot of paint.
    float away = length(gl_PointCoord - 0.5) * 2.0;
    float core = 1.0 - smoothstep(0.0, 0.35, away);
    float halo = 1.0 - smoothstep(0.2, 1.0, away);
    float lamp = core + halo * 0.45;

    if (lamp <= 0.0)
      discard;

    gl_FragColor = vec4(vTone * lamp * uOpacity, 1.0);
  }
`

/**
 * How brightly the far coast burns, 0..1 and up.
 *
 * `1 - day` squared, which is the curve the lighthouse and the farmstead's
 * windows both come up on, times how awake the households are. The only thing
 * of its own is `shoreLights.glow`.
 */
export function shoreLightLevel (config: ScapeConfig, day: number, time: number): number {
  const dusk = Math.min(1, Math.max(0, 1 - day))

  return Math.max(0, config.shoreLights.glow) * dusk * dusk * householdWake(config, time)
}

export interface ShoreLightOptions {
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Where the windows are, from the survey. */
  lights: readonly ShoreLight[]

  /** Live sky. Unlit geometry, so the light has to be handed to it. */
  daylight: DaylightState
}

/**
 * @returns `null` when the far coast has nobody on it — a scape with no
 *   mainland, or one whose `shoreLights.count` is zero, gets no draw call
 *   rather than an empty one.
 */
export function createShoreLights (options: ShoreLightOptions): ScapeModule | null {
  const { config, quality, lights, daylight } = options

  if (lights.length === 0)
    return null

  const position = new Float32Array(lights.length * 3)
  const colour   = new Float32Array(lights.length * 3)
  const warm     = new Color(resolvePalette().lampWarm)
  const burn     = quality.bloom ? SHORE_BLOOM : 1

  for (const [ index, light ] of lights.entries()) {
    position[index * 3]     = light.x
    position[index * 3 + 1] = light.y
    position[index * 3 + 2] = light.z

    // Every light is drawn at one size and the roll is in the colour alone. A
    // point's size is quantised to whole pixels on most drivers, so a per-light
    // size is a three-step ladder rather than a spread — and at this range a
    // smaller window and a dimmer one look the same anyway.
    colour[index * 3]     = warm.r * light.warmth * burn
    colour[index * 3 + 1] = warm.g * light.warmth * burn
    colour[index * 3 + 2] = warm.b * light.warmth * burn
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('color', new BufferAttribute(colour, 3))
  geometry.computeBoundingSphere()

  const material = new ShaderMaterial({
    name:           'shore-lights',
    vertexShader:   VERTEX,
    fragmentShader: FRAGMENT,
    uniforms:       {
      uOpacity: { value: 0 },
      uScale:   { value: config().shoreLights.size },
    },
    transparent:  true,
    depthWrite:   false,
    vertexColors: true,
    blending:     AdditiveBlending,

    // Unfogged, for the lit windows' reason: linear fog would mix the glow
    // toward the fog colour and then *add* that, which on a hazy night puts a
    // grey smear along the whole coast. A lit window is a light source — the
    // haze between it and the eye is the bloom's business, not the mesh's.
    fog: false,
  })

  const field            = new Points(geometry, material)
  field.name             = 'shore-lights'
  field.renderOrder      = LAYER.shoreLights
  field.visible          = false
  field.matrixAutoUpdate = false
  field.updateMatrix()

  /** Device pixels a light is drawn at, for the renderer's current buffer. */
  function sizeFor (ratio: number): number {
    return Math.max(0, config().shoreLights.size) * ratio
  }

  let ratio = 1

  return defineModule<ScapeConfig>({
    name: 'scape-shore-lights',

    build (ctx) {
      // Points are sized in device pixels, so a retina buffer needs the same
      // light to be twice as many of them or the whole coast halves on the one
      // display that can resolve it. The star field does this and for the same
      // reason; this reads the ratio back on every resize because the window
      // can be dragged between two displays with different ones.
      ratio = ctx.renderer.getPixelRatio()
      material.uniforms.uScale.value = sizeFor(ratio)
      ctx.scene.add(field)
    },

    resize (_size, ctx) {
      ratio = ctx.renderer.getPixelRatio()
      material.uniforms.uScale.value = sizeFor(ratio)
    },

    update () {
      const lamp = shoreLightLevel(config(), daylight.day, config().daylight.time)

      // A dark coast is not drawn at all rather than drawn at zero opacity: a
      // transparent draw is still a sorted draw, and daylight is the common
      // case.
      field.visible = lamp > 0.004

      if (!field.visible)
        return

      material.uniforms.uOpacity.value = Math.min(1, lamp)
      material.uniforms.uScale.value   = sizeFor(ratio)
    },

    dispose () {
      field.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  })
}

// perf: one `Points` draw for every lit window on the far coast, skipped
// outright while the sun is up, and two uniform writes on the frames it is not.
