import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  MathUtils,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three'
import type { OrthographicCamera } from 'three'
import { createSeededRng, defineModule } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
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
 * How many frames of the view the column covers, across and along.
 *
 * Sized against the *frame*, not against the map, and that is the one decision
 * the whole module hangs off. A column sized to the island would put the same
 * drops over a hundred and ninety metres at every zoom, so pulling back would
 * thin the rain to nothing and zooming in would pack it into a wall — the same
 * mistake the mist and the aurora both had to have their tiles taken off them
 * for. Scaled to `viewSize` instead, the drop count *is* a screen density: 2600
 * drops look like 2600 drops from anywhere on the zoom range.
 */
const SPAN = 2.8

/** Height of the column, as a multiple of the view. */
const RISE = 0.85

/** How far below the focus point the column starts, as a share of its height. */
const DROP = 0.3

// Streak length and half-width, as fractions of the default view. These are
// constant in screen terms rather than world terms: a streak that grows with
// `viewSize` reads as a rod at close zoom and a dot at far zoom. Tied to the
// default viewSize (the value `viewSize` has at mid-range) and divided by the
// live `viewSize` in the update, so the streak stays the same number of pixels
// however far out the map is drawn.
const STREAK = 0.026 * 260
const GIRTH  = 0.0016 * 260

/** What a flake keeps of a drop's length and of its speed. */
const FLAKE_LENGTH = 0.16
const FLAKE_SPEED  = 0.17

/** How far the wind pushes the fall sideways, in metres per metre fallen. */
const SLANT = 0.42

/**
 * Distinct fall speeds, and the reason they are counted rather than drawn.
 *
 * A drop's height is `mod(cell - fallen * rate, height)`, so the offset has to be
 * wrapped somewhere or spend an hour growing into a float that can no longer
 * resolve a metre. Wrapping it is only invisible if every drop lands back where
 * it started, which needs `wrap * rate` to be a whole number of column heights
 * for *every* rate in the buffer — impossible with a continuous spread, and a
 * shower that jumps every few seconds with one. Quantised to `n` steps of `1/n`
 * around unity, a wrap at `n` column heights satisfies all of them at once, and
 * five speed groups is far more variety than a wall of rain can be read to have.
 */
const RATE_STEPS = 5

/** Opacity of one drop at the height of a squall. */
const DROP_ALPHA = 0.5

const RAIN_VERTEX = /* glsl */`
  attribute vec3 aCell;
  attribute float aRate;
  uniform vec3 uBox;
  uniform float uFallen;
  uniform vec2 uStreak;
  uniform vec2 uSlant;
  varying vec2 vShape;

  void main () {
    // Wrapped rather than respawned. A drop that reaches the floor of the column
    // reappears at its ceiling in the same instant, which is what lets the whole
    // shower be one static buffer with one scalar animating it.
    float drop = mod(aCell.y * uBox.y - uFallen * aRate, uBox.y);
    vec3 local = vec3(
      (aCell.x - 0.5) * uBox.x + uSlant.x * drop,
      drop,
      (aCell.z - 0.5) * uBox.z + uSlant.y * drop
    );

    vec4 view = modelViewMatrix * vec4(local, 1.0);

    // The streak is laid along the *projected* fall, not along the screen's own
    // vertical. They are the same thing in still air and visibly not the same in
    // wind, and rain leaning one way while its streaks lean another is the kind
    // of wrongness that reads before it can be named.
    vec3 heading = normalize(vec3(uSlant.x, -1.0, uSlant.y));
    vec2 along   = normalize((modelViewMatrix * vec4(heading, 0.0)).xy);
    vec2 across  = vec2(-along.y, along.x);

    view.xy += across * (position.x * uStreak.x) + along * (position.y * uStreak.y);
    vShape   = position.xy;
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
 * One buffer holding every drop, as screen-facing streaks.
 *
 * Four vertices and two triangles each, with the quad corner carried in
 * `position` and the drop's own cell in the column carried alongside it. Nothing
 * here is instanced, and that is the cheaper choice at this size: an
 * `InstancedMesh` of a two-triangle geometry spends a whole 4×4 matrix per drop
 * to say what three floats already say, and the vertex shader has to place the
 * corner in view space regardless.
 */
function rainGeometry (count: number, seed: number): BufferGeometry {
  const rng      = createSeededRng(seed)
  const geometry = new BufferGeometry()
  const position = new Float32Array(count * 4 * 3)
  const cell     = new Float32Array(count * 4 * 3)
  const rate     = new Float32Array(count * 4)
  const index    = new Uint32Array(count * 6)

  const corners = [ -1, 1, -1, -1, 1, -1, 1, 1 ]

  for (let drop = 0; drop < count; drop += 1) {
    const x = rng.next()
    const y = rng.next()
    const z = rng.next()

    // Identical rates make a shower read as one sheet sliding down the glass,
    // because every streak keeps its neighbour exactly where it found it for as
    // long as the rain lasts. See RATE_STEPS for why the spread is quantised.
    const speed = (Math.floor(rng.next() * RATE_STEPS) + 3) / RATE_STEPS

    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = drop * 4 + corner

      position[vertex * 3]     = corners[corner * 2]
      position[vertex * 3 + 1] = corners[corner * 2 + 1]
      position[vertex * 3 + 2] = 0
      cell[vertex * 3]         = x
      cell[vertex * 3 + 1]     = y
      cell[vertex * 3 + 2]     = z
      rate[vertex]             = speed
    }

    const base = drop * 4

    index[drop * 6]     = base
    index[drop * 6 + 1] = base + 1
    index[drop * 6 + 2] = base + 2
    index[drop * 6 + 3] = base
    index[drop * 6 + 4] = base + 2
    index[drop * 6 + 5] = base + 3
  }

  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('aCell', new BufferAttribute(cell, 3))
  geometry.setAttribute('aRate', new BufferAttribute(rate, 1))
  geometry.setIndex(new BufferAttribute(index, 1))

  return geometry
}

/**
 * The fall.
 *
 * A column of streaks that follows the camera's focus, drawn in one call from
 * one static buffer with one uniform advancing it. Nothing is respawned on the
 * cpu and nothing is uploaded per frame: the drops are a fixed cloud in a box,
 * and falling is that box's contents read at an offset that grows.
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

  const geometry = rainGeometry(quality.rainDrops, config().seed ^ 0x3a91)
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
      const rise     = viewSize * RISE

      // The tilt foreshortens the ground along the view axis: at 52° the footprint
      // is `viewSize / sin(52°) ≈ 1.27 * viewSize` deep but `viewSize` wide.
      // A square column sized on `viewSize` alone leaves the far half of the frame
      // dry — the rain stops at the frustum's midline and the top third is clear.
      const tiltRad  = MathUtils.degToRad(
        21 + (52 - 21) * Math.min(1, Math.max(0, (viewSize - 8) / (1600 - 8))),
      )
      const sinTilt  = Math.max(Math.sin(tiltRad), 0.5)

      box.set(viewSize * SPAN, rise, viewSize * SPAN / sinTilt)

      // Constant in screen terms: the streak and girth are authored at the
      // default viewSize and scaled inversely with the live one, so a streak
      // that reads as two pixels at 260 m reads as two pixels at 1600 m.
      streak.set(
        GIRTH / viewSize,
        STREAK / viewSize * (1 - (1 - FLAKE_LENGTH) * sleet),
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
      // `RATE_STEPS` column heights rather than at one, which is the interval
      // every quantised rate returns to its own starting height over.
      fallen %= Math.max(1, rise) * RATE_STEPS

      mesh.position.set(focus?.[0] ?? 0, (focus?.[1] ?? 0) - rise * DROP, focus?.[2] ?? 0)
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
