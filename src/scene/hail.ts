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
import { HAIL_CENTRE, HAIL_WIDTH } from './weather.ts'
import type { WindState } from './wind.ts'
import { LAYER } from './layers.ts'


export interface HailOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Live weather — `hail` is how hard it is coming down, `phase` is where the cell is. */
  weather: WeatherState

  /** Live year. A stone is ice, and the scape has one white for ice. */
  season: SeasonState

  /** The scape's one wind: the cell's track, and the little lean a stone has. */
  wind: WindState
}

/**
 * Stone radius and how far the fall smears it, as a share of the frame's
 * height.
 *
 * Screen-sized for `screenSize`'s reason, and larger than the rain's girth on
 * purpose: a drop is a smear of a thing too small and too fast to see and a
 * stone is a thing you can see, so the one mark in the fall that is meant to
 * read as an *object* is the one that gets three pixels rather than one.
 *
 * It is still a share of the frame rather than a size in metres, and that is
 * the honest compromise rather than an oversight. Real hail is fifteen
 * millimetres across; at the 1 400 m frame five of the tour's six poses are
 * taken at, fifteen millimetres is a ten-thousandth of a pixel. The scape draws
 * the *shower*, which is a thing you can see from the next island, and the
 * stones are its grain.
 */
const STONE   = 0.0055
const STRETCH = 1.8

/**
 * How much bigger the largest stone in the fall is than the smallest.
 *
 * Hail is graded — a shower drops a range of sizes at once, and a column of
 * identical dots reads as a texture rather than as weather. The grade is
 * hashed out of the cell the buffer already carries rather than taking a fifth
 * attribute, which keeps `fallGeometry` the one buffer builder both falls use.
 */
const GRADE = 0.76

/**
 * What a stone keeps of the wind's push, against a drop's.
 *
 * The thing that makes hail read as hail in a blow. `rain.ts` leans its column
 * 0.42 m sideways per metre fallen; a stone is a hundred drops' worth of water
 * in one object with a fraction of the surface, so it goes very nearly straight
 * down through the same gust — and a frame where the rain is laid over at forty
 * degrees and the stones are not is the picture of a hail squall.
 */
const SLANT = 0.11

/** How much faster a stone comes down than a drop. */
const RATE = 2.5

/**
 * How many frames of the view the column is laid across.
 *
 * Narrower than the rain's 2.8, and the reason is the cell. The rain's margin
 * buys cover for the tilted frustum's far half over a column that has to fill
 * the whole frame; this column is clamped to a cell that is usually *smaller*
 * than the frame, so the margin is spent on stones the mask throws away.
 * 1.7 views is still a column two views deep at the widest tilt, which covers
 * the footprint — and at the close frames where the cell is bigger than the
 * picture it is the difference between a stone every few metres and a stone
 * every ten.
 */
const SPAN = 1.7

/** Opacity of one stone at the height of a pulse. */
const STONE_ALPHA = 0.88

/** How much brighter the lit side of a stone is than the rest of it. */
const GLINT = 1.35

/**
 * How far the cell travels across the pulse, in its own radii.
 *
 * The cell arrives upwind, crosses, and is gone — which is the whole of what a
 * hail shower does and the reason this is a *track* rather than a position.
 * At the peak of the pulse it is centred on the world origin, which is where
 * the home island is, so the frame the scape opens on is a frame with stones in
 * it. End to end that is three radii — half as far again as the shower is
 * wide, which at the authored width is five hundred metres of sound crossed in
 * one pulse. A cell that travelled less than its own width would not have
 * crossed anything, and the pair of poses that says it moves would be one
 * picture twice.
 */
export const SWEEP = 1.5

/**
 * How much of the radius the edge is soft over.
 *
 * A hail cell has a *boundary* — the single most legible thing about one from
 * any distance is that it is hailing here and dry two fields away — so this is
 * deliberately a third of the radius rather than a falloff over the whole of
 * it. Any softer and the cell reads as a bright patch of rain.
 */
const EDGE = 0.34

const HAIL_VERTEX = /* glsl */`
  ${FALL_PLACE_GLSL}

  uniform vec2 uStone;
  uniform vec2 uCell;
  uniform vec2 uBand;
  varying vec2 vShape;
  varying float vCell;

  void main () {
    vec3 local = fallPlace();
    vec4 world = modelMatrix * vec4(local, 1.0);

    // Where the fall *is*, and the only world-sized number in the column. The
    // cell is a patch of the archipelago rather than a patch of the frame, so
    // panning across its edge shows the edge rather than carrying it along.
    vCell = 1.0 - smoothstep(uBand.x, uBand.y, distance(world.xz, uCell));

    // Graded out of the cell the buffer already carries. Two multiplies rather
    // than a fifth attribute and a second upload.
    float grade = ${(1 - GRADE * 0.5).toFixed(3)} + ${GRADE.toFixed(3)} *
      fract(aCell.x * 37.0 + aCell.z * 61.0);

    vec4 view = modelViewMatrix * vec4(local, 1.0);

    view.xy    += fallBasis() * (position.xy * uStone * grade);
    vShape      = position.xy;
    gl_Position = projectionMatrix * view;
  }
`

const HAIL_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform vec3 uGloss;
  uniform float uOpacity;
  varying vec2 vShape;
  varying float vCell;

  void main () {
    // Round rather than a streak, and that is the whole difference between the
    // two marks in the fall. A drop is a smear with a bright head; a stone is a
    // body with a lit side, so the falloff is radial and the highlight sits
    // where the quad's leading edge is.
    float core  = clamp(1.0 - dot(vShape, vShape), 0.0, 1.0);
    float gloss = pow(core, 5.0) * (0.45 + 0.55 * (vShape.y * 0.5 + 0.5));

    gl_FragColor = vec4(
      mix(uColor, uGloss, gloss),
      uOpacity * vCell * smoothstep(0.0, 0.45, core)
    );

    if (gl_FragColor.a < 0.004)
      discard;
  }
`

/** Signed distance from the pulse's centre, in half-widths, clamped to its own span. */
export function hailLead (phase: number): number {
  const offset = phase - HAIL_CENTRE

  return Math.max(-1, Math.min(1, (offset - Math.round(offset)) / HAIL_WIDTH))
}

/** Radius of one cell, in metres, from the world it falls on. */
export function hailCellRadius (worldSize: number, share: number): number {
  return Math.max(1, worldSize * share * 0.5)
}

/** How far that cell is carried over one pulse, in metres, end to end. */
export function hailCellTravel (radius: number): number {
  return radius * SWEEP * 2
}

/**
 * How wide to lay the column, in metres, for one view over one cell.
 *
 * The column has to cover **the part of the frame that is inside the cell**,
 * and that is the smaller of the two rather than either one of them. A column
 * sized to the frame over a small cell spends its stones outside the shower; a
 * column sized to the cell over a close frame puts a fifth of them in picture.
 */
export function hailColumnSpan (viewSize: number, radius: number): number {
  return Math.min(viewSize * SPAN, radius * 2)
}

/**
 * How far the column may follow the camera away from the cell's own middle, in
 * metres.
 *
 * Zero when the cell is the smaller of the two — then the column *is* the
 * shower and sits on it — and the slack inside a cell wider than the frame,
 * where the column follows the focus the way the rain's does. Continuous
 * across the crossover, which is what keeps a zoom through it from popping.
 */
export function hailColumnSlack (viewSize: number, radius: number): number {
  return Math.max(0, radius - hailColumnSpan(viewSize, radius) * 0.5)
}

/** Clamp one axis of the column's centre into that slack. */
export function hailColumnAxis (focus: number, centre: number, slack: number): number {
  return centre + Math.max(-slack, Math.min(slack, focus - centre))
}

/**
 * The stones.
 *
 * The second thing that comes out of this scape's cloud, and the first that is
 * not a surface response or a tint. It shares `rain.ts`'s column, buffer, wrap
 * and placement — see `fall-column.ts` — and differs in the four ways a hail
 * shower actually differs from a rain shower:
 *
 * - **when.** `weather.hail` is a narrow pulse on the squall's *leading* flank,
 *   weighed by the week of the year. The stones arrive ahead of the rain and
 *   are over before it is at its hardest. `weather.ts` owns that curve.
 * - **where.** Rain fills the frame, because a front is bigger than any frame
 *   this camera has. A hail shower is one convective cell a few hundred metres
 *   across, so it has an *edge*, and the edge is in world coordinates: the
 *   cell stands over a piece of the archipelago and the camera moves past it.
 * - **what.** Round, bright and opaque, where a drop is a long soft smear.
 * - **how fast, and how straight.** {@link RATE} times the rain's speed down
 *   and a quarter of its lean, out of the same `weather.fall` knob — which is
 *   what keeps the one line already in `STILL` able to stop both falls.
 *
 * Nothing here integrates a clock of its own. The fall rides `weather.fall`,
 * the cell's track is a function of `weather.phase`, and the bearing it travels
 * on is the wind's — all three already held by the capture harness.
 */
export function createHailLayer ({
  camera,
  config,
  quality,
  weather,
  season,
  wind,
}: HailOptions): ScapeModule | null {
  if (quality.hailStones < 1)
    return null

  const geometry = fallGeometry(quality.hailStones, config().seed ^ 0x5e27)
  const wetTone  = new Color(config().palette.rain)
  const material = new ShaderMaterial({
    name:            'hail',
    vertexShader:    HAIL_VERTEX,
    fragmentShader:  HAIL_FRAGMENT,
    transparent:     true,
    depthWrite:      false,
    side:            DoubleSide,
    forceSinglePass: true,
    fog:             false,
    uniforms:        {
      uBox:     { value: new Vector3(1, 1, 1) },
      uFallen:  { value: 0 },
      uStone:   { value: new Vector2(1, 1) },
      uSlant:   { value: new Vector2() },
      uCell:    { value: new Vector2() },
      uBand:    { value: new Vector2(1, 2) },
      uColor:   { value: new Color() },
      uGloss:   { value: new Color() },
      uOpacity: { value: 0 },
    },
  })

  const mesh         = new Mesh(geometry, material)
  mesh.name          = 'hail'
  mesh.renderOrder   = LAYER.hail
  mesh.visible       = false
  mesh.frustumCulled = false

  const box   = material.uniforms.uBox.value as Vector3
  const stone = material.uniforms.uStone.value as Vector2
  const slant = material.uniforms.uSlant.value as Vector2
  const cell  = material.uniforms.uCell.value as Vector2
  const band  = material.uniforms.uBand.value as Vector2
  const tone  = material.uniforms.uColor.value as Color
  const gloss = material.uniforms.uGloss.value as Color

  let fallen = 0

  return defineModule<ScapeConfig>({
    name: 'hail',

    build (ctx) {
      ctx.scene.add(mesh)
    },

    update (_state, frame) {
      const falling = weather.hail

      material.uniforms.uOpacity.value = falling * STONE_ALPHA

      if (falling <= 0.004) {
        mesh.visible = false
        return
      }

      const live     = config()
      const viewSize = camera.userData.viewSize as number ?? live.camera.viewSize
      const focus    = camera.userData.target as readonly [number, number, number] | undefined
      const radius   = hailCellRadius(live.archipelago.worldSize, live.weather.hailCell)
      const lead     = hailLead(weather.phase) * SWEEP * radius

      cell.set(wind.dirX * lead, wind.dirZ * lead)
      band.set(radius * (1 - EDGE), radius)

      // The cell is a patch of the world and the frame is a patch of the
      // screen, so most of the time they do not overlap at all — and a column
      // whose every stone is masked out still costs a draw and a vertex each.
      const focusX = focus?.[0] ?? 0
      const focusZ = focus?.[2] ?? 0
      const away   = Math.hypot(focusX - cell.x, focusZ - cell.y)

      mesh.visible = away < radius + viewSize * SPAN

      if (!mesh.visible)
        return

      const rise  = sizeFallColumn(viewSize, box, hailColumnSpan(viewSize, radius))
      const slack = hailColumnSlack(viewSize, radius)

      stone.set(screenSize(STONE, viewSize), screenSize(STONE, viewSize) * STRETCH)

      // A quarter of the lean the rain takes from the same gust. See SLANT.
      slant.set(wind.dirX * wind.strength * SLANT, wind.dirZ * wind.strength * SLANT)

      // The scape's one white for ice, taken live from the year for the reason
      // the rain takes its snow there: a run that retunes lying snow must not
      // leave the stones falling on it a different colour.
      tone.copy(season.snowColor).lerp(wetTone, 0.25)

      // The lit side, and it is the body's own colour lifted rather than a
      // second authored white — a stone is one material with a highlight on it,
      // and a palette entry beside the snow is one more thing to keep in step.
      gloss.copy(tone).multiplyScalar(GLINT)

      fallen += frame.delta * live.weather.fall * RATE
      fallen %= fallWrap(rise)

      mesh.position.set(
        hailColumnAxis(focusX, cell.x, slack),
        fallColumnBase(focus?.[1] ?? 0, rise),
        hailColumnAxis(focusZ, cell.y, slack),
      )
      material.uniforms.uFallen.value = fallen
    },

    dispose () {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  })
}

// perf: one draw call, one program, one static buffer and no allocation per
// frame beyond the colour the year is read into. The column is laid over the
// smaller of the frame and the cell, so every stone in the buffer is a stone
// somebody can see — the first build spent nineteen in twenty of them outside
// the shower. The layer goes invisible outside the pulse, which is better than
// nineteen twentieths of every front, and again whenever the camera is not
// within a cell's radius of the one patch that is hailing.
