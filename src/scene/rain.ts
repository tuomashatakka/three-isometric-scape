import { Color, DoubleSide, Mesh, ShaderMaterial, Vector2, Vector3 } from 'three'
import type { WebGLRenderer } from 'three'
import type { OrthographicCamera } from 'three'
import { defineModule } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import {
  FALL_MARK_GLSL,
  FLAKE_MARK,
  RAIN_MARK,
  fallColumnBase,
  fallGeometry,
  fallWrap,
  markPixel,
  sizeFallColumn,
} from './fall-column.ts'
import type { AtmosphereQuality } from './quality.ts'
import type { SeasonState } from './season.ts'
import type { WeatherState } from './weather.ts'
import type { WindState } from './wind.ts'
import { LAYER } from './layers.ts'
import { fallMarks } from './squall.ts'


export interface RainOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Live weather — how hard it is falling, and how much of it is frozen. */
  weather: WeatherState

  /** Live year. The fall takes its white from the same snow the ground does. */
  season: SeasonState

  /**
   * The scape's one wind, and where the slant comes from.
   *
   * The column used to integrate a heading of its own off `wind.speed`, which
   * made the rain lean on a bearing that had nothing to do with the one the
   * grass under it was leaning on. A shower falling one way through foliage bent
   * another is two systems that have not been introduced.
   */
  wind: WindState
}

/** How far the wind pushes the fall sideways, in metres per metre fallen. */
const SLANT = 0.42

/** What a flake keeps of a drop's speed. */
const FLAKE_SPEED = 0.17

/** Opacity of one drop at the height of a squall, before its cover. */
const DROP_ALPHA = 0.55

/** How much brighter a flake is than a drop: it scatters, a drop mostly lets light through. */
const FLAKE_ALPHA = 1.6

const RAIN_VERTEX = /* glsl */`
  ${FALL_MARK_GLSL}

  void main () {
    vec4 view = modelViewMatrix * vec4(fallPlace(), 1.0);

    view.xy    += fallMark();
    gl_Position = projectionMatrix * view;
  }
`

const RAIN_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uSleet;
  varying vec2 vShape;
  varying float vCover;
  varying float vBlur;

  void main () {
    // A drop is a smear with one bright head; a flake is a soft round body.
    // Both soften to a disc of confusion as they pass the glass.
    float across = 1.0 - vShape.x * vShape.x;
    float along  = 1.0 - vShape.y * vShape.y;
    float head   = mix(mix(0.55, 1.0, vShape.y * 0.5 + 0.5), 1.0, uSleet);
    float round  = clamp(1.0 - dot(vShape, vShape), 0.0, 1.0);
    float body   = mix(across * along * head, round * round, max(uSleet, vBlur));

    gl_FragColor = vec4(uColor, uOpacity * vCover * body);

    if (gl_FragColor.a < 0.004)
      discard;
  }
`

/**
 * The fall.
 *
 * A column of streaks that follows the camera's focus, drawn in one call from
 * one static buffer with one uniform advancing it. Nothing is respawned on the
 * cpu and nothing is uploaded per frame: the drops are a fixed cloud in a box,
 * and falling is that box's contents read at an offset that grows. The box, the
 * buffer, the wrap and the placement are `fall-column.ts`, shared with the hail
 * that falls through the same air.
 *
 * Following the focus is safe here in a way it is not for the mist, whose sheets
 * carry a pattern that would visibly drag across the ground as you pan. Rain has
 * no pattern to drag — one drop is any other drop — so the column can simply
 * live wherever the camera is looking, which is also the only place it can be
 * dense enough to see without covering the map in geometry nobody is looking at.
 *
 * What falls is the year's business, not this module's. `weather.sleet` is the
 * share of the fall the season has frozen, and it takes the mark from a drop's
 * thin streak to a flake's soft round body (`RAIN_MARK` to `FLAKE_MARK`, in
 * metres — see `fallMark`), slows it, brightens it, and takes it toward the
 * same white the ground is going: uniform writes, no branch, one program.
 * What falls *beside* it is the front's business and not the year's: hail is a
 * second layer rather than a third setting here, because a stone is not a drop
 * at a different temperature. See `hail.ts`.
 */
export function createRainLayer ({
  camera,
  config,
  quality,
  weather,
  season,
  wind,
}: RainOptions): ScapeModule | null {
  if (quality.rainDrops < 1)
    return null

  const geometry = fallGeometry(quality.rainDrops, config().seed ^ 0x3a91)
  const rainTone = new Color(config().palette.rain)
  const material = new ShaderMaterial({
    name:           'rain',
    vertexShader:   RAIN_VERTEX,
    fragmentShader: RAIN_FRAGMENT,
    transparent:    true,
    depthWrite:     false,
    side:           DoubleSide,

    // Two-sided and one draw. three splits a transparent double-sided material
    // into a back-face pass and a front-face pass, which is right for a curved
    // shell and pure waste for flat quads whose two passes cover the same pixels.
    forceSinglePass: true,
    fog:             false,
    uniforms:        {
      uBox:     { value: new Vector3(1, 1, 1) },
      uFallen:  { value: 0 },
      uMark:    { value: new Vector3(RAIN_MARK.girth, RAIN_MARK.streak, 0.02) },
      uSleet:   { value: 0 },
      uSlant:   { value: new Vector2() },
      uColor:   { value: new Color() },
      uOpacity: { value: 0 },
    },
  })

  const mesh       = new Mesh(geometry, material)
  mesh.name        = 'rain'
  mesh.renderOrder = LAYER.rain
  mesh.visible     = false

  // Every vertex is placed by the shader, so the bounding volume three would
  // cull against describes a box the drops are never actually in.
  mesh.frustumCulled = false

  const mark   = material.uniforms.uMark.value as Vector3

  // Metres per pixel, read where the buffer's height is known: the pixel
  // floor is the only screen-sized number left in the mark.
  const buffer = new Vector2()

  mesh.onBeforeRender = (renderer: WebGLRenderer) => {
    mark.z = markPixel(camera, renderer.getDrawingBufferSize(buffer).y)
  }

  const box   = material.uniforms.uBox.value as Vector3
  const slant = material.uniforms.uSlant.value as Vector2
  const tone  = material.uniforms.uColor.value as Color

  // Metres fallen, not seconds elapsed. Keeping the integral rather than the
  // clock is what lets `weather.fall` be turned down to zero and back up without
  // the whole column jumping to where it would have been had it never stopped.
  let fallen = 0

  return defineModule<ScapeConfig>({
    name: 'rain',

    build (ctx) {
      ctx.scene.add(mesh)
    },

    update (_state, frame) {
      const sleet   = weather.sleet
      const falling = weather.fall

      const viewSize = camera.userData.viewSize as number ?? config().camera.viewSize
      const seen     = falling * fallMarks(viewSize, config().camera)

      material.uniforms.uOpacity.value = seen * DROP_ALPHA * (1 + (FLAKE_ALPHA - 1) * weather.sleet)
      mesh.visible                     = seen > 0.004

      if (!mesh.visible)
        return

      const focus = camera.userData.target as readonly [number, number, number] | undefined
      const rise  = sizeFallColumn(viewSize, box)

      // The body and its smear, in metres, from a drop's to a flake's.
      mark.x                         = RAIN_MARK.girth + (FLAKE_MARK.girth - RAIN_MARK.girth) * sleet
      mark.y                         = RAIN_MARK.streak + (FLAKE_MARK.streak - RAIN_MARK.streak) * sleet
      material.uniforms.uSleet.value = sleet

      // The wind the grass already leans on, taken from the one place that
      // knows which way it is blowing. The gust is in `strength`, so a squall
      // arrives slanted harder without a second curve saying so.
      slant.set(
        wind.dirX * wind.strength * SLANT,
        wind.dirZ * wind.strength * SLANT,
      )

      // The same white the ground is going, taken live from the year rather than
      // from the palette — so a run that retunes lying snow retunes the snowfall
      // with it and the two can never be two different whites.
      tone.copy(rainTone).lerp(season.snowColor, sleet * 0.85)

      fallen += frame.delta * config().weather.fall * (1 - (1 - FLAKE_SPEED) * sleet)

      // Wrapped so the number a still is taken at never grows large enough to
      // lose precision, however long the page has been open — and wrapped at
      // `FALL_RATE_STEPS` column heights rather than at one, which is the
      // interval every quantised rate returns to its own starting height over.
      fallen %= fallWrap(rise)

      mesh.position.set(focus?.[0] ?? 0, fallColumnBase(focus?.[1] ?? 0, rise), focus?.[2] ?? 0)
      material.uniforms.uFallen.value = fallen
    },

    dispose () {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  })
}

// perf: one draw call for the whole shower, one program, one static buffer, and
// no allocation per frame. The column is sized to the view rather than to the
// map, so the drop count is a screen density and the mobile tier's 900 streaks
// cover the same picture the desktop tier's 2600 do, more thinly.
