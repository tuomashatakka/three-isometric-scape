import { Color, DoubleSide, Mesh, ShaderMaterial, Vector2, Vector3 } from 'three'
import type { OrthographicCamera } from 'three'
import { defineModule } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import {
  FALL_PLACE_GLSL,
  fallColumnBase,
  fallGeometry,
  fallWrap,
  screenSize,
  sizeFallColumn,
} from './fall-column.ts'
import type { AtmosphereQuality } from './quality.ts'
import type { SeasonState } from './season.ts'
import type { WeatherState } from './weather.ts'
import type { WindState } from './wind.ts'
import { LAYER } from './layers.ts'


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

/**
 * Streak half-length and half-width, as **shares of the frame's height**.
 *
 * Read `screenSize` in `fall-column.ts` before touching either: this is the
 * pair that was inverted, and the form it is written in now is the whole of the
 * fix. `0.008` is eight thousandths of the frame however tall the canvas is —
 * about sixteen pixels of streak on a 1080-line viewport and eight on the
 * harness's 500 — at a ten-metre frame and at a fourteen-hundred-metre one
 * alike, which is what the module always claimed and never did.
 *
 * The ratio between them moved with the fix and had to. At the old numbers a
 * streak was sixteen times its own width, which is a fine proportion for the
 * sixty-pixel rods the close poses were drawing and a sub-pixel hairline at any
 * width a correct streak has. At four-to-one and a girth of 0.0018 the fall
 * measures **0.298 %** of the default frame against its own `--skip rain`
 * control, where the first correct length at the old ratio measured 0.137 %
 * and the shipped code measured 0.000 %.
 */
const STREAK = 0.008
const GIRTH  = 0.0018

/** What a flake keeps of a drop's length and of its speed. */
const FLAKE_LENGTH = 0.16
const FLAKE_SPEED  = 0.17

/** How far the wind pushes the fall sideways, in metres per metre fallen. */
const SLANT = 0.42

/** Opacity of one drop at the height of a squall. */
const DROP_ALPHA = 0.5

const RAIN_VERTEX = /* glsl */`
  ${FALL_PLACE_GLSL}

  uniform vec2 uStreak;
  varying vec2 vShape;

  void main () {
    vec4 view = modelViewMatrix * vec4(fallPlace(), 1.0);

    view.xy    += fallBasis() * (position.xy * uStreak);
    vShape      = position.xy;
    gl_Position = projectionMatrix * view;
  }
`

const RAIN_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vShape;

  void main () {
    // Soft on all four sides, and brighter at the leading end — a falling drop
    // is a smear of one bright head, not an evenly lit rod.
    float across = 1.0 - vShape.x * vShape.x;
    float along  = 1.0 - vShape.y * vShape.y;
    float head   = mix(0.55, 1.0, vShape.y * 0.5 + 0.5);

    gl_FragColor = vec4(uColor, uOpacity * across * along * head);

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
 * share of the fall the season has frozen, and it shortens the streak, slows it,
 * and takes it from a pale blue-grey toward the same white the ground is going —
 * three uniform writes, no branch, and one program for both halves of the year.
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
      uStreak:  { value: new Vector2(1, 1) },
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

  const box    = material.uniforms.uBox.value as Vector3
  const streak = material.uniforms.uStreak.value as Vector2
  const slant  = material.uniforms.uSlant.value as Vector2
  const tone   = material.uniforms.uColor.value as Color

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

      material.uniforms.uOpacity.value = falling * DROP_ALPHA
      mesh.visible                     = falling > 0.004

      if (!mesh.visible)
        return

      const viewSize = camera.userData.viewSize as number ?? config().camera.viewSize
      const focus    = camera.userData.target as readonly [number, number, number] | undefined
      const rise     = sizeFallColumn(viewSize, box)

      // Constant in screen terms: both are shares of the frame's height, so a
      // streak that reads as sixteen pixels at a ten-metre view reads as
      // sixteen pixels at a fourteen-hundred-metre one.
      streak.set(
        screenSize(GIRTH, viewSize),
        screenSize(STREAK, viewSize) * (1 - (1 - FLAKE_LENGTH) * sleet),
      )

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
