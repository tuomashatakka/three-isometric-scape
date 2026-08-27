import { PointLight } from 'three'
import type { OrthographicCamera } from 'three'
import { defineModule } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'


export interface CursorLightOptions {
  config:   LiveConfig
  camera:   OrthographicCamera
  daylight: DaylightState
}

/**
 * How brightly the cursor light burns, 0..1 and up.
 *
 * `(1 - day)^2` rather than `dark` for the same reason the coastal lamp uses
 * `1 - day`: the cursor light should come up at dusk, not at astronomical
 * twilight. The square softens the ramp — the light is dim through the golden
 * hour and only reaches full strength well after sunset, which is when a
 * carried lantern would actually be useful.
 */
export function cursorLightStrength (config: ScapeConfig, day: number): number {
  const dusk = Math.min(1, Math.max(0, 1 - day))

  return Math.max(0, config.cursorLight.intensity) * dusk * dusk
}

/**
 * Exponential damping response, frame-rate independent.
 *
 * `1 - exp(-dt / tau)` approaches 1 asymptotically, so the light glides
 * toward its target without ever overshooting. At 60 hertz with tau = 0.15 s
 * the response per frame is 0.26 — fast enough to feel connected to the
 * pointer, slow enough to smooth out a sub-pixel twitch.
 */
export function dampingFactor (dt: number, tau: number): number {
  return 1 - Math.exp(-dt / Math.max(0.001, tau))
}

/**
 * The light that follows the cursor over the ground.
 *
 * Reads `camera.userData.pointerGround` fresh every frame — never captured at
 * build. When the pointer has not entered the canvas, has left, or has missed
 * the landscape, the light fades out rather than snapping off: a light that
 * blinks when the cursor crosses a gap between two islands is worse than no
 * light.
 *
 * Day-dependent the same way the coastal lamp is: a lantern at midday is
 * invisible and costs the same forward-lit pass as one at midnight, so the
 * strength scales with `(1 - day)^2`. At noon the module is still mounted
 * (the light exists and is positioned) but the intensity is zero, which means
 * the PointLight is in the scene at zero brightness — no forward-lit pass
 * fires on a zero-intensity light, so the cost is nothing.
 */
export function createCursorLight (options: CursorLightOptions): ScapeModule | null {
  const { config, camera, daylight } = options

  if (config().cursorLight.intensity <= 0)
    return null

  const light = new PointLight()

  light.name = 'cursor-light'

  const pos = light.position

  let targetX          = 0
  let targetY          = 0
  let targetZ          = 0
  let currentIntensity = 0

  return defineModule<ScapeConfig>({
    name: 'scape-cursor-light',

    build (ctx) {
      ctx.scene.add(light)
    },

    update (_state, frame) {
      const cfg      = config()
      const pointer  = camera.userData.pointerGround as [number, number, number] | undefined
      const strength = cursorLightStrength(cfg, daylight.day)
      const tau      = cfg.cursorLight.damping
      const dt       = frame.delta

      // Target position: the pointer point with the configured lift.
      if (pointer) {
        targetX = pointer[0]
        targetY = pointer[1] + cfg.cursorLight.lift
        targetZ = pointer[2]
      }

      // Damped position — glides toward the target and fades out when the
      // pointer is gone, because the target stays at the last known point
      // and the intensity ramps to zero.
      const alpha = dampingFactor(dt, tau)

      pos.x += (targetX - pos.x) * alpha
      pos.y += (targetY - pos.y) * alpha
      pos.z += (targetZ - pos.z) * alpha

      // Damped intensity — ramps up in dusk and fades out when the pointer
      // disappears. The same exponential form keeps the fade smooth.
      const targetIntensity = pointer ? strength : 0

      currentIntensity += (targetIntensity - currentIntensity) * alpha
      light.intensity   = currentIntensity

      // Read the colour every frame, because it is a knob in the panel.
      light.color.set(cfg.cursorLight.color)
      light.distance = cfg.cursorLight.distance
      light.decay    = cfg.cursorLight.decay

      // A light at zero intensity is in the scene but throws nothing — no
      // forward-lit pass fires on it, so the cost is nothing. Keeping it
      // mounted rather than toggling visibility avoids a scene-graph
      // mutation every frame the pointer crosses a gap.
    },

    dispose () {
      light.removeFromParent()
      light.dispose()
    },
  })
}
