import { BufferAttribute, BufferGeometry, MathUtils } from 'three'
import type { Vector3 } from 'three'
import { createSeededRng } from 'threejs-scene'


/**
 * The column the falling weather is drawn in, and the one place its three
 * scales are written down.
 *
 * Two layers draw into it now — the rain and the hail — and they are two things
 * coming out of one cloud rather than two effects that happen to look alike. A
 * shower whose stones stopped at the edge of its drops, or leaned on a
 * different bearing, or wrapped at a different height, would be exactly the
 * "two systems that have not been introduced" the rain's own module warned
 * about when it took the heading off itself and asked the wind instead. So the
 * box, the wrap, the buffer and the placement are here, and what is left in
 * each layer is what actually differs: what a drop looks like, what a stone
 * looks like, how fast each comes down, and where it is allowed to fall.
 *
 * ## the three scales
 *
 * The readme's scale rule, applied to one module, because all three classes
 * meet here and getting any of them backwards is invisible in the code and
 * obvious in a still:
 *
 * - **frame-sized.** The *box*. It is {@link FALL_SPAN} views across and
 *   {@link FALL_RISE} views high, so the drop count is a screen density and
 *   2 600 drops look like 2 600 drops from anywhere on the zoom range. Never
 *   `archipelago.worldSize`: a column sized to the map would thin to nothing
 *   pulled out and pack into a wall zoomed in.
 * - **metre-sized.** The *mark* — a body's girth and the streak one exposure
 *   smears it into ({@link FallKind}), floored at under a pixel so it never
 *   falls between samples. See {@link fallMark}.
 * - **world-sized.** Where the fall *is*. Only the hail has one of these, and
 *   it is `weather.hailCell` against `archipelago.worldSize`.
 *
 * Pure of the scene graph and of any live config: everything here takes its
 * numbers as arguments, which is what lets the headless tests build a column
 * and measure it.
 */

/** How many frames of the view the column covers, across and along. */
export const FALL_SPAN = 2.8

/** Height of the column, as a multiple of the view. */
export const FALL_RISE = 0.85

/** How far below the focus point the column starts, as a share of its height. */
export const FALL_DROP = 0.3

/**
 * Distinct fall speeds, and the reason they are counted rather than drawn.
 *
 * A drop's height is `mod(cell - fallen * rate, height)`, so the offset has to
 * be wrapped somewhere or spend an hour growing into a float that can no longer
 * resolve a metre. Wrapping it is only invisible if every drop lands back where
 * it started, which needs `wrap * rate` to be a whole number of column heights
 * for *every* rate in the buffer — impossible with a continuous spread, and a
 * shower that jumps every few seconds with one. Quantised to `n` steps of `1/n`
 * around unity, a wrap at `n` column heights satisfies all of them at once, and
 * five speed groups is far more variety than a wall of rain can be read to have.
 */
export const FALL_RATE_STEPS = 5

/**
 * What one falling thing *is*, in metres: half its girth, and half the length
 * of the smear it leaves in one exposure (its fall speed times the shutter).
 *
 * The marks used to be screen-sized — a share of the frame's height — which
 * kept rain visible at every zoom by drawing it as something it is not. At
 * the farmyard frame a hailstone a centimetre across was a six-pixel opaque
 * white disc in front of everything, the loudest tell the `near` pose had.
 * A photograph of that yard resolves a hailstone as a thin bright streak and
 * a raindrop as a faint one, because both are smaller than a pixel across and
 * longer than one along: the shutter, not the body, makes the mark.
 */
export interface FallKind {

  /** Half the body's width, metres. A drop is 1 mm, a flake 6, a stone 5. */
  girth: number

  /** Half the streak one exposure smears it into, metres. */
  streak: number
}

/** A raindrop: two millimetres across, eight metres a second for a sixtieth. */
export const RAIN_MARK: FallKind  = { girth: 0.001, streak: 0.07 }

/** A wet snowflake: a loose aggregate a centimetre across, barely falling. */
export const FLAKE_MARK: FallKind = { girth: 0.006, streak: 0.012 }

/** A hailstone: a centimetre of ice at fifteen metres a second, shot faster. */
export const STONE_MARK: FallKind = { girth: 0.005, streak: 0.09 }

/**
 * The smallest half-extent a mark is drawn at, in pixels. Under it a quad
 * falls between samples and flickers; over it a sub-pixel body becomes a disc.
 */
export const MARK_FLOOR = 0.75

/** Share of the marks that pass close enough to the glass to be out of focus. */
export const MARK_NEAR = 0.12

/** How much wider a mark at the glass is drawn than one at the focus. */
export const MARK_BLUR = 4

/** A mark as drawn: its half-extents in metres, and the share of its light it keeps. */
export interface DrawnMark {
  width:  number
  length: number
  cover:  number
}

/**
 * The mark one falling thing draws, at `pixel` metres per pixel.
 *
 * Mirrors `fallMark` in {@link FALL_MARK_GLSL}, so the headless tests can hold
 * the claims the shader makes. Two things widen a mark past its body — the
 * pixel floor and the defocus — and both spread the *same* light over more of
 * the frame, so `cover` falls as the drawn area grows. It falls as the square
 * root rather than the ratio itself: a sub-pixel streak on film reads by its
 * contrast against the ground, and the eye (and the film's shoulder) is closer
 * to the root of the energy than to the energy, which is what keeps a shower
 * readable at the yard and faint, not gone, at a hundred metres.
 */
export function fallMark (kind: FallKind, pixel: number, grade = 1, blur = 1): DrawnMark {
  const girth  = kind.girth * grade
  const streak = Math.max(kind.streak * grade, girth)
  const least  = Math.max(pixel, 0) * MARK_FLOOR
  const width  = Math.max(girth * blur, least)
  const length = Math.max(streak + girth * (blur - 1), least)

  return { width, length, cover: Math.min(1, Math.sqrt(girth * streak / (width * length))) }
}

/** Metres per drawn pixel on an orthographic camera, given the buffer's height. */
type CameraType = { top: number, bottom: number, zoom: number }

export function markPixel (camera: CameraType, height: number): number {
  return (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6) / Math.max(height, 1)
}

/**
 * How much the camera's tilt foreshortens the ground along the view axis.
 *
 * The box is square on the ground plane and the frustum's footprint is not: at
 * 52° it is `viewSize / sin(52°) ≈ 1.27 * viewSize` deep but `viewSize` wide. A
 * column sized on `viewSize` alone leaves the far half of the frame dry — the
 * fall stops at the frustum's midline and the top third is clear.
 *
 * The ramp is the camera's own, restated rather than imported, because
 * `camera-controls.ts` resolves it against the live limits and this needs the
 * same answer in a headless test with no camera in it.
 */
export function fallTilt (viewSize: number): number {
  const degrees = 21 + (52 - 21) * Math.min(1, Math.max(0, (viewSize - 8) / (1600 - 8)))

  return Math.max(Math.sin(MathUtils.degToRad(degrees)), 0.5)
}

/**
 * Size the box for one view, in place, and give back its height.
 *
 * Allocation-free, because it runs every frame for every layer in the fall.
 *
 * `width` is how wide to lay it, in **metres**, and it defaults to the frame's
 * own {@link FALL_SPAN} views. Only the hail passes one: a shower that falls
 * inside a cell three hundred metres across gets no benefit from a column a
 * kilometre and a half wide, and every stone outside that cell is a vertex the
 * mask throws away — at the tour's frames that was better than nineteen in
 * twenty of them, and the first build of the hail changed **0.005 %** of its
 * own frame because of it. Rain passes nothing, because a front is larger than
 * any frame this camera has.
 *
 * The *height* is the frame's at any width. A column clamped sideways to a
 * cell is still a column of air reaching from the deck to the ground.
 */
export function sizeFallColumn (viewSize: number, box: Vector3, width?: number): number {
  const rise = viewSize * FALL_RISE
  const laid = width ?? viewSize * FALL_SPAN

  box.set(laid, rise, laid / fallTilt(viewSize))

  return rise
}

/** Where the column hangs, given the focus it follows and its own height. */
export function fallColumnBase (focusY: number, rise: number): number {
  return focusY - rise * FALL_DROP
}

/** The interval the fall integral wraps at, which every quantised rate returns over. */
export function fallWrap (rise: number): number {
  return Math.max(1, rise) * FALL_RATE_STEPS
}

/**
 * One buffer holding every falling thing, as screen-facing quads.
 *
 * Four vertices and two triangles each, with the quad corner carried in
 * `position` and the cell in the column carried alongside it. Nothing here is
 * instanced, and that is the cheaper choice at this size: an `InstancedMesh` of
 * a two-triangle geometry spends a whole 4×4 matrix per drop to say what three
 * floats already say, and the vertex shader has to place the corner in view
 * space regardless.
 *
 * Identical rates make a shower read as one sheet sliding down the glass,
 * because every streak keeps its neighbour exactly where it found it for as
 * long as the rain lasts. See {@link FALL_RATE_STEPS} for why the spread is
 * quantised rather than continuous.
 *
 * Deterministic in the seed and in nothing else: two calls with the same count
 * and seed give byte-identical attributes, which is what the roster tests hold.
 */
export function fallGeometry (count: number, seed: number): BufferGeometry {
  const rng      = createSeededRng(seed)
  const geometry = new BufferGeometry()
  const position = new Float32Array(count * 4 * 3)
  const cell     = new Float32Array(count * 4 * 3)
  const rate     = new Float32Array(count * 4)
  const index    = new Uint32Array(count * 6)

  const corners = [ -1, 1, -1, -1, 1, -1, 1, 1 ]

  for (let drop = 0; drop < count; drop += 1) {
    const x     = rng.next()
    const y     = rng.next()
    const z     = rng.next()
    const speed = (Math.floor(rng.next() * FALL_RATE_STEPS) + 3) / FALL_RATE_STEPS

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
 * The shared half of both vertex programs: where a falling thing is, and which
 * way its mark lies.
 *
 * `fallPlace` is wrapped rather than respawned. A drop that reaches the floor of
 * the column reappears at its ceiling in the same instant, which is what lets
 * the whole shower be one static buffer with one scalar animating it.
 *
 * `fallBasis` lays the mark along the *projected* fall rather than along the
 * screen's own vertical. They are the same thing in still air and visibly not
 * the same in wind, and a fall leaning one way while its marks lean another is
 * the kind of wrongness that reads before it can be named. The first column is
 * across the fall and the second is along it, so `fallBasis() * position.xy`
 * takes a quad corner straight to a view-space offset.
 */
export const FALL_PLACE_GLSL = /* glsl */`
  attribute vec3 aCell;
  attribute float aRate;
  uniform vec3 uBox;
  uniform float uFallen;
  uniform vec2 uSlant;

  vec3 fallPlace () {
    float drop = mod(aCell.y * uBox.y - uFallen * aRate, uBox.y);

    return vec3(
      (aCell.x - 0.5) * uBox.x + uSlant.x * drop,
      drop,
      (aCell.z - 0.5) * uBox.z + uSlant.y * drop
    );
  }

  mat2 fallBasis () {
    vec3 heading = normalize(vec3(uSlant.x, -1.0, uSlant.y));
    vec2 along   = normalize((modelViewMatrix * vec4(heading, 0.0)).xy);

    return mat2(vec2(-along.y, along.x), along);
  }
`

/**
 * The shared mark: {@link fallMark} in glsl, laid on the projected fall.
 *
 * `uMark` is girth, streak and metres-per-pixel. Each drop's grade (0.6–1.4)
 * and whether it is one of the {@link MARK_NEAR} passing close to the glass
 * come out of the cell the buffer already carries, so no attribute is added.
 * `vShape` is the quad corner, `vCover` the share of its light the mark keeps;
 * `vBlur` is 0 in focus and 1 at the glass, for the fragment to soften by.
 */
export const FALL_MARK_GLSL = /* glsl */`
  ${FALL_PLACE_GLSL}

  uniform vec3 uMark;
  varying vec2 vShape;
  varying float vCover;
  varying float vBlur;

  vec2 fallMark () {
    float grade = 0.6 + 0.8 * fract(aCell.x * 37.0 + aCell.z * 61.0);
    float near  = smoothstep(${(1 - MARK_NEAR).toFixed(3)}, 1.0, fract(aCell.x * 13.0 + aCell.y * 7.0 + aCell.z * 29.0));
    float blur  = 1.0 + ${(MARK_BLUR - 1).toFixed(1)} * near;
    float girth = uMark.x * grade;
    float streak = max(uMark.y * grade, girth);
    float least = uMark.z * ${MARK_FLOOR.toFixed(2)};
    vec2 drawn  = vec2(max(girth * blur, least), max(streak + girth * (blur - 1.0), least));

    vShape = position.xy;
    vCover = min(1.0, sqrt(girth * streak / (drawn.x * drawn.y)));
    vBlur  = near;

    return fallBasis() * (position.xy * drawn);
  }
`
