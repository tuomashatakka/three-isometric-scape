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
 * - **screen-sized.** The *mark* — a streak's length and girth, a stone's
 *   radius. See {@link screenSize}, which is the half of this file that was
 *   wrong for as long as there has been rain.
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
 * A mark's size in view-space metres, from its size as a share of the frame.
 *
 * **The arithmetic this file exists to state once, because the rain had it
 * exactly inverted and no instrument in the repository could see it.** The
 * camera is orthographic with its frustum sized on `viewSize`, so a view-space
 * offset `d` lands `d * height / viewSize` pixels from where it started: a mark
 * that is to keep its size on screen has to *grow* with the view, not shrink
 * with it. The rain divided — `STREAK / viewSize` — which made a streak go as
 * the inverse *square* of the zoom, so it was a sixty-pixel rod at a ten-metre
 * frame and, at the 1 400 m frame five of the tour's six poses are taken at,
 * four thousandths of one pixel. `scape:shot --skip rain` against the same frame
 * with the fall drawing reported **0.000 % changed**: this scape has had rain
 * for its whole life and not one still in the repository has ever had any in it.
 *
 * So the number handed in is a **share of the frame's height**, which is the
 * only resolution-independent way to say "two pixels", and the pixels it
 * resolves to are `share * height` on any canvas at any zoom. It is the same
 * form `birds.ts` already uses for a wingspan that must not vanish.
 */
export function screenSize (share: number, viewSize: number): number {
  return share * Math.max(viewSize, 0)
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
