import { smoothstep } from 'threejs-scene'
import type { RoostConfig } from '../config-roost.ts'


/**
 * The water the narrows hurry.
 *
 * Its own file rather than an eighth chunk of `water.ts`, for the reason
 * `water-caps.ts` and `water-caustics.ts` are their own files: this is a
 * complete idea — one search over the bathymetry, one spare channel of a mask
 * that was already being baked, one pure curve and one shader chunk — and the
 * lake is already carrying the swell, the freeze, the surf, the caps, the
 * wakes, the net and the reflection.
 *
 * The scape has had a tide for a while and the only thing it did was move the
 * water up and down. But a tide is a wave crossing a shelf, and the sea it
 * raises has to arrive from somewhere and leave again six hours later — which
 * means that between two islands a quarter of a mile apart, a sound's worth of
 * water goes through whatever gap there is, four times a day. Where the gap is
 * wide nothing shows. Where it is tight the water stands up on itself: a roost,
 * flat calm at slack and white an hour later, with no wind anywhere in it.
 *
 * Three parts, and two of them cost nothing at all:
 *
 * **the gates** are found once, at build, in the depth grid `shore-mask.ts` is
 * already building for the bathymetry — see {@link surveyRoosts} — and packed
 * into the alpha channel of that mask, which has carried a constant 255 since
 * the file was written. No second map, no second fetch, no second bake of the
 * height field, and nothing for a tier gate to take away.
 *
 * **the stream** is the tide's own rate of change, resolved on the cpu into one
 * uniform — see {@link roostAmount} and `tide.stream`. It is zero at both slacks
 * and hardest at half ebb and half flood, and it is smaller at neaps than at
 * springs because the same six hours have less water to move. Nothing in the
 * shader integrates a clock; stop the day and the race stops with it, which is
 * what makes it photographable and why `STILL` gains nothing for it.
 *
 * **the overfalls** are the white, and they stand still. That is the one thing
 * about a race that is not like a whitecap: a cap is a piece of sea travelling
 * downwind, and an overfall is a standing wave over a fixed piece of ground
 * with the water running through it. So the pattern is written in world
 * coordinates with no drift term at all — see {@link WATER_ROOST_GLSL} — and
 * costs no texture read, because there is no second field to fetch.
 */

/** One gate in the archipelago, as the instruments report it. */
export interface RoostGate {

  /** Where the narrowest water is, in world metres. */
  x: number
  z: number

  /** Metres between the two shores there. */
  gap: number

  /** How hard it runs at the top of the stream, 0..1. */
  strength: number
}

export interface RoostSurvey {

  /**
   * How hard each texel of the bathymetry mask runs, 0..1.
   *
   * The same grid `shore-mask.ts` handed in, in the same order, so the caller
   * packs it straight into a channel without a second index arithmetic.
   */
  field: Float32Array

  /** The gates themselves, strongest first, one entry per piece of water. */
  gates: RoostGate[]
}

/**
 * The four axes the search tries, as texel offsets.
 *
 * Four rather than eight because an axis is a line and not a direction — the
 * search walks both ways along each — and four rather than two because a
 * channel in this archipelago runs whichever way the two islands making it
 * happen to lie. The diagonals are a texel longer than the orthogonals and that
 * is left alone: every length this file reports is measured out of the distance
 * field rather than out of the step count, so a diagonal walk covering more
 * ground per step reaches its answer in fewer of them and reports the same
 * metres.
 */
const AXES = [[ 1, 0 ], [ 0, 1 ], [ 1, 1 ], [ 1, -1 ]] as const

/**
 * How much of the gate's strength the water against the bank keeps.
 *
 * Not zero and not one. A race is hardest down the middle, where the whole
 * section of the channel is being pushed through at once, and the water in the
 * lee of either headland is in an eddy rather than in the stream — but it is
 * not *slack*, and a band that fades to nothing at the shore reads as a stripe
 * painted down the channel rather than as the channel running.
 */
const BANK_SHARE = 0.45

/**
 * Texels a side the search itself runs at, whatever the mask is baked at.
 *
 * The one number in this file that is about cost rather than about the sea, and
 * it buys two separate things.
 *
 * The first is that the search stays affordable. It walks the coastal band and
 * then walks the channel at every texel of it, so its cost goes as the *cube* of
 * the resolution — the band holds four times the texels at twice the size and
 * each of them walks twice as far. The ultra tier bakes its mask at 1536, where
 * that is minutes rather than the third of a second this is.
 *
 * The second is the one that actually matters. A gate is a fact about the plan
 * of a coast: where two islands pinch a channel is not a thing a phone and a
 * workstation are allowed to disagree about, and a search run at the mask's own
 * resolution would have found a different archipelago on every tier — and a
 * different one again from the one `scape:map` reports. Capping it here and
 * resampling into whatever the mask is means the mobile, desktop and ultra tiers
 * and the instruments all draw the same races in the same water, which is what
 * makes the capture harness's pinned `--tier mobile` a picture of the scape
 * rather than of one tier. The `minimal` tier bakes a coarser mask than this and
 * searches at that, so its coast is blockier and a marginal gate can go missing
 * — the same trade every other count on that tier makes.
 *
 * 512 against a 1550 m world is a texel every three metres, which resolves the
 * six-metre channel between the home island and its nearest islet.
 */
export const ROOST_RESOLUTION = 512

/**
 * The gates, and the field that draws them.
 *
 * Pure, free of `three` and free of the height field: it reads the depth grid
 * the mask bake has already paid for, which is the expensive half. That is what
 * lets `scape:map` report the archipelago's gates without building a vertex of
 * it, and what lets the test below state a fact about a strait it wrote by hand.
 *
 * `depth` is `shore-mask.ts`'s own grid — a fraction of `MAX_DEPTH`, clamped at
 * both ends, so zero is dry ground and anything over it is water. Nothing here
 * reads how *deep* the water is, only whether it is water: a gate is a fact
 * about the plan of a coast, not about its section.
 *
 * The field comes back at the caller's own `size` however the search was run.
 * The search is settled at {@link ROOST_RESOLUTION} and resampled, for the two
 * reasons written down there.
 */
export function surveyRoosts (
  depth: Float32Array,
  size:  number,
  span:  number,
  roost: RoostConfig['roost'],
): RoostSurvey {
  const grid = Math.min(size, ROOST_RESOLUTION)

  if (grid === size)
    return searchGates(depth, size, span, roost)

  const found = searchGates(nearest(depth, size, grid), grid, span, roost)

  return { field: nearest(found.field, grid, size), gates: found.gates }
}

/**
 * One grid resampled onto another, nearest texel wins.
 *
 * Nearest and not bilinear, in both directions. Going down, the grid being
 * resampled is a *mask*: an average of a coast and the water beside it is a
 * depth that is neither, and a channel decimated by averaging silts up. Going
 * back up, the field is already smooth over the spread — tens of metres, which
 * is a dozen texels of the search — and the gpu's own linear filter is the
 * interpolation that actually reaches the eye.
 */
function nearest (from: Float32Array, size: number, want: number): Float32Array {
  const to = new Float32Array(want * want)

  for (let row = 0; row < want; row += 1) {
    const source = Math.min(size - 1, Math.round((row + 0.5) * size / want - 0.5)) * size

    for (let column = 0; column < want; column += 1)
      to[row * want + column] =
        from[source + Math.min(size - 1, Math.round((column + 0.5) * size / want - 0.5))]
  }

  return to
}

/** The search itself, on one grid, at whatever resolution it was handed. */
function searchGates (
  depth: Float32Array,
  size:  number,
  span:  number,
  roost: RoostConfig['roost'],
): RoostSurvey {
  const field              = new Float32Array(size * size)
  const gates: RoostGate[] = []

  const half = Math.max(0, roost.gate) * 0.5

  if (!(roost.strength > 0) || !(half > 0))
    return { field, gates }

  const step   = span / (size - 1)
  const toLand = distanceToLand(depth, size, step)

  // The tight end of the narrowness ramp. A third of the gate rather than zero:
  // the ramp has to saturate somewhere a real channel actually reaches, and a
  // gate that ran hardest only as it closed to nothing would be at a tenth of
  // its strength in every channel the archipelago has.
  const tight  = half * 0.3
  const walk   = Math.max(1, Math.round(roost.reach / step))
  const across = Math.max(1, Math.round(half / step))

  const seeds: RoostGate[] = []

  for (let row = 1; row < size - 1; row += 1)
    for (let column = 1; column < size - 1; column += 1) {
      const index = row * size + column
      const near  = toLand[index]

      // Open sea and dry ground, thrown out before anything is walked. Half the
      // gate is the furthest the middle of a qualifying channel can be from
      // either shore, so this one comparison is what keeps the cost of the whole
      // search in the coastal band rather than over the map.
      if (near <= 0 || near > half)
        continue

      let width = Infinity

      for (const [ ax, az ] of AXES) {
        // The channel's own width on the axis across this one, measured out of
        // the distance field rather than by counting texels to the bank: the
        // ridge of that field down the middle of a channel *is* its half width,
        // and every texel in the section reads the same number off it. Which is
        // the point — a race is the same race two metres from the bank as it is
        // in the fairway, and a strength taken from the local distance to land
        // would put the hardest water hard against the rock.
        const reach = channelHalf(toLand, size, column, row, -az, ax, across)

        if (reach > half || reach >= width)
          continue
        if (!opensBothWays(toLand, size, column, row, ax, az, walk, roost.opening))
          continue

        width = reach
      }

      if (!Number.isFinite(width))
        continue

      // Hardest down the middle. `near / width` is how far across the section
      // this texel is, which the distance field has already answered.
      const middle   = Math.min(1, near / Math.max(width, step))
      const strength = smoothstep(half, tight, width) * (BANK_SHARE + (1 - BANK_SHARE) * middle)

      if (strength <= 0)
        continue

      field[index] = strength

      if (middle > 0.92)
        seeds.push({
          x:        -span / 2 + column * step,
          z:        -span / 2 + row * step,
          gap:      width * 2,
          strength: smoothstep(half, tight, width),
        })
    }

  spreadOut(field, depth, size, step, roost.spread)

  return { field, gates: clusterGates(seeds, Math.max(roost.gate, step)) }
}

/** Whether a column or a row is on the grid. */
function inside (at: number, size: number): boolean {
  return at >= 0 && at < size
}

/**
 * Metres from every texel to the nearest dry ground, by two chamfer passes.
 *
 * Two passes over the grid instead of a search per texel, which is the whole
 * reason this is affordable at the mask's resolution. Out-of-grid neighbours are
 * skipped rather than treated as land: past the border of the mask the world is
 * open sea by construction, and a border that counted as coast would hang a
 * false gate round the whole edge of the map.
 */
function distanceToLand (depth: Float32Array, size: number, step: number): Float32Array {
  const far  = size * step * 2
  const grid = new Float32Array(size * size)

  for (let index = 0; index < grid.length; index += 1)
    grid[index] = depth[index] > 0 ? far : 0

  sweep(grid, size, step, 1)
  sweep(grid, size, step, -1)

  return grid
}

/**
 * One chamfer pass, down the grid at `way` 1 and back up it at −1.
 *
 * One function and not two mirrored copies, because the backward pass is the
 * forward one with every offset negated — and two copies of a distance sweep
 * that disagreed by a sign would give a field that is correct on one diagonal
 * and short on the other, which is invisible until a gate comes out of it the
 * wrong width.
 */
function sweep (grid: Float32Array, size: number, step: number, way: number): void {
  const cross = step * Math.SQRT2
  const first = way > 0 ? 0 : size - 1
  const stop  = way > 0 ? size : -1

  for (let row = first; row !== stop; row += way)
    for (let column = first; column !== stop; column += way) {
      const index = row * size + column

      if (grid[index] === 0)
        continue

      const back  = inside(column - way, size)
      const above = inside(row - way, size)
      let best    = grid[index]

      if (back)
        best = Math.min(best, grid[index - way] + step)
      if (above)
        best = Math.min(best, grid[index - way * size] + step)
      if (above && back)
        best = Math.min(best, grid[index - way * size - way] + cross)
      if (above && inside(column + way, size))
        best = Math.min(best, grid[index - way * size + way] + cross)

      grid[index] = best
    }
}

/** The widest the channel gets walking both ways along one axis, in metres. */
function channelHalf (
  toLand: Float32Array,
  size:   number,
  column: number,
  row:    number,
  ax:     number,
  az:     number,
  steps:  number,
): number {
  let best = toLand[row * size + column]

  for (const way of [ 1, -1 ])
    for (let k = 1; k <= steps; k += 1) {
      const c = column + ax * way * k
      const r = row + az * way * k

      if (c < 0 || r < 0 || c >= size || r >= size)
        break

      const at = toLand[r * size + c]

      if (at <= 0)
        break

      best = Math.max(best, at)
    }

  return best
}

/**
 * Whether the channel comes out into open water at *both* ends.
 *
 * The test that separates a gate from a bay, and the reason a tarn, a harbour
 * and the head of every cove in the archipelago stay smooth however narrow they
 * are: narrow water is only hurried if the sea is trying to get through it, and
 * a dead end has nothing going through. Running off the edge of the mask counts
 * as open — past its border the world is deep seabed by construction.
 */
function opensBothWays (
  toLand:  Float32Array,
  size:    number,
  column:  number,
  row:     number,
  ax:      number,
  az:      number,
  steps:   number,
  opening: number,
): boolean {
  for (const way of [ 1, -1 ]) {
    let open = false

    for (let k = 1; k <= steps && !open; k += 1) {
      const c = column + ax * way * k
      const r = row + az * way * k

      if (c < 0 || r < 0 || c >= size || r >= size) {
        open = true
        break
      }

      const at = toLand[r * size + c]

      if (at <= 0)
        break

      open = at >= opening
    }

    if (!open)
      return false
  }

  return true
}

/**
 * Carry the band out of the gate and let it die.
 *
 * A frontier rather than a pass over the grid per metre of spread: the gates are
 * a fraction of a per cent of the map, so a relaxation that only ever touches
 * water it reached last round costs what the channels cost rather than what the
 * archipelago does. Water only — the stream cannot carry broken water across a
 * headland.
 *
 * Bounded by the *rounds* and not only by the values, and that is the fix rather
 * than a tidy-up. A queue that simply ran until nothing improved is a
 * Bellman-Ford relaxation in disguise: every texel can be improved again by a
 * neighbour that was improved after it, and at the tiers that bake a fine mask
 * that re-work compounds until the build stops finishing. A round is one metre
 * of `step` of travel, there are `spread / step` of them, and a texel joins the
 * next round's frontier at most once however many neighbours reached it.
 */
function spreadOut (
  field:  Float32Array,
  depth:  Float32Array,
  size:   number,
  step:   number,
  spread: number,
): void {
  if (!(spread > step))
    return

  const decay  = step / spread
  const rounds = Math.ceil(spread / step)
  const stamp  = new Int32Array(size * size).fill(-1)
  let frontier: number[] = []

  for (let index = 0; index < field.length; index += 1)
    if (field[index] > 0)
      frontier.push(index)

  for (let round = 0; round < rounds && frontier.length; round += 1) {
    const next: number[] = []

    for (const index of frontier)
      spill(field, depth, size, { stamp, next, round }, index, field[index] - decay)

    frontier = next
  }
}

/** The bookkeeping one round of {@link spreadOut} carries between texels. */
interface Frontier {
  stamp: Int32Array
  next:  number[]
  round: number
}

/**
 * One texel's worth of that spill, into the eight around it.
 *
 * The texel itself needs no special case: it already holds `value + decay`, and
 * the comparison below refuses anything that is not an improvement.
 */
function spill (
  field:    Float32Array,
  depth:    Float32Array,
  size:     number,
  frontier: Frontier,
  index:    number,
  value:    number,
): void {
  if (value <= 0)
    return

  const column = index % size
  const row    = (index - column) / size

  for (let dz = -1; dz <= 1; dz += 1)
    for (let dx = -1; dx <= 1; dx += 1) {
      const c = column + dx
      const r = row + dz

      if (!inside(c, size) || !inside(r, size))
        continue

      const to = r * size + c

      if (depth[to] <= 0 || field[to] >= value)
        continue

      field[to] = value

      if (frontier.stamp[to] === frontier.round)
        continue

      frontier.stamp[to] = frontier.round
      frontier.next.push(to)
    }
}

/**
 * One entry per piece of water, strongest first.
 *
 * The centreline of a gate is hundreds of texels and they are all the same
 * gate. Greedy, over a list sorted by strength and then by position, so the
 * report is a property of the archipelago rather than of the iteration order.
 */
function clusterGates (seeds: RoostGate[], apart: number): RoostGate[] {
  const sorted = [ ...seeds ].sort((a, b) =>
    b.strength - a.strength || a.x - b.x || a.z - b.z)
  const kept: RoostGate[] = []

  for (const seed of sorted) {
    if (kept.some(gate => Math.hypot(gate.x - seed.x, gate.z - seed.z) < apart))
      continue

    kept.push(seed)

    if (kept.length >= 16)
      break
  }

  return kept
}

/**
 * How hard the race is running, before anything about the fragment is known.
 *
 * `stream` is the tide's own, signed and already scaled by where the month is
 * between neaps and springs — see `tide.ts`. Only its size matters here: a
 * roost runs on the ebb and on the flood alike, and which way the water is
 * going is what {@link WATER_ROOST_GLSL} uses the sign for.
 *
 * Squared rather than straight, and that is the physics rather than a taste:
 * what a stream does to the surface goes as the square of how fast it is
 * running, so a neap that moves the water at half the rate of a spring gets a
 * quarter of the white rather than half of it. It is also what keeps slack
 * water genuinely slack — the hour either side of high water is nearly flat on
 * a squared curve and merely quiet on a linear one.
 */
export function roostAmount (stream: number, strength: number): number {
  if (!(strength > 0))
    return 0

  const running = Math.min(1, Math.abs(stream))

  return strength * running * running
}

/**
 * Metres between one rank of standing water and the next — and the width of the
 * noise tile the pattern is cut out of.
 *
 * A metre quantity and not a knob, and deliberately finer than `CAP_SPACING`'s
 * 35 m: a whitecap is a patch of sea a wind has torn the top off, and an
 * overfall is the water piling on itself over one piece of ground. 14 m puts
 * three or four ranks across a gate that is fifty metres wide, which is what
 * makes the band read as broken rather than painted, and keeps the tile — five
 * times that, see {@link ROOST_CYCLES} — coarse enough to survive the mip level
 * a 330 m frame reads it at.
 *
 * Folded into the chunk at build rather than carried as a uniform, the way
 * `CAP_SPACING` is: a constant nothing can change at runtime does not need a
 * slot, and a slot invites somebody to change it.
 */
const ROOST_SPACING = 14

/**
 * Cycles of the broadest blob across one tile of `water.wave`.
 *
 * Not a choice — it is the `frequency: 5` that texture is baked at, written
 * down here for the reason `CAP_CYCLES` writes it down: the *tile* is the wrong
 * thing to size a rank of broken water against, and getting it wrong is
 * invisible except as a race with nothing in it.
 */
const ROOST_CYCLES = 5

/**
 * How much narrower a rank is along the stream than across it.
 *
 * The one thing that makes this pattern a race rather than a patch of chop. The
 * standing waves in a roost lie *abeam* — they are reflections off both banks
 * meeting in the fairway — so the field is sampled faster along the stream than
 * across it, which draws features that are long across the channel and short
 * along it. Turn the channel and they turn with it, without a second term
 * saying so.
 */
const ROOST_ABEAM = 0.55

/**
 * How far downstream the ranks sit, in metres per unit of stream.
 *
 * The only thing the sign of the stream is for, and the reason it is worth
 * carrying. Overfalls do not stand *in* the narrowest place; they stand just
 * downstream of it, where water that was squeezed through spreads out and falls
 * back on itself. So the whole pattern shifts one way on the flood and the other
 * on the ebb, and a gate does not simply brighten and dim twice a day in exactly
 * the same shape.
 */
const ROOST_SET = 7

/**
 * Where the cut into `water.wave` sits, and how white what clears it gets.
 *
 * Measured off that texture's own distribution rather than chosen, exactly as
 * `water-caps.ts` had to: four octaves of seamless value noise spans 0.22 to
 * 0.89 with a mean of 0.557, so a cut written anywhere near 0.9 is above the
 * map's maximum and draws a race with nothing in it. 0.54 is a little under the
 * mean, which puts about half of a running gate under white — which is what a
 * roost is. It is *not* walked by the stream the way the caps' cut is: a race
 * does not cover more water as it gets up, it covers the same water harder, and
 * the coverage is the gate's own.
 *
 * `ROOST_TORN` is how white the whitest rank is, and it is higher than
 * `CAP_TORN`'s 0.62 on purpose. A whitecap is a crest with the top torn off it
 * seen from four hundred metres; an overfall is a standing wave breaking on
 * itself in the same place all day, and there is genuinely more air in it.
 */
const ROOST_CUT  = 0.54
const ROOST_TORN = 0.85

/**
 * What the pattern averages, for the frame that cannot resolve one rank.
 *
 * Read off the cut rather than chosen, for the reason `CAP_MEAN` is: a rank of
 * broken water is fourteen metres across and the widest frame this camera opens
 * is 1400 m, where fourteen metres is eight pixels. What a pattern draws there
 * is a scatter of specks that reads as a moiré on the sea; what a race actually
 * does at that distance is go pale. If {@link ROOST_CUT} or `ROOST_TORN` move,
 * this moves with them, and the symptom of forgetting is a gate that changes
 * brightness as you zoom.
 */
const ROOST_MEAN = 0.38

/**
 * The chunk, shared verbatim by both programs.
 *
 * **Both**, for the reason `WATER_CAPS_GLSL` is: the capture harness pins
 * `--tier mobile`, so a system the cheap program cannot draw is a system no
 * still in this repository can see.
 *
 * It costs one dependent read of the fractal map, and that read is **behind the
 * gate rather than in front of it**, which is the whole of why it is affordable
 * on the tier that is already down to three. Six per cent of the water in this
 * archipelago is in a gate; everywhere else the function returns before it
 * touches a sampler, and a warp with no gate in it never issues the fetch at
 * all. The mask tap it branches on is the caller's own. There is nothing here
 * for a tier to take away, which is why nothing in `quality.ts` mentions it.
 *
 * A procedural field was tried first and is the build this replaced. Two sines
 * folded together draw a lattice of serpentine stripes that is legible as a
 * *pattern* at every zoom this camera has — the exact failure `WATER_CAPS_GLSL`
 * writes down at length, arrived at independently, and it looked like corduroy
 * laid over the sound.
 */
export const WATER_ROOST_GLSL = /* glsl */`
  uniform float uRoost;
  uniform float uRoostSet;
  uniform float uRoostChop;

  float scapeRoost (vec2 ground, vec4 shore, float depth) {
    float gate = shore.a;

    if (uRoost <= 0.001 || gate <= 0.004)
      return 0.0;

    // Which way the water is running, out of the fetch the caller already made.
    // The mask's spare channels carry the seaward bearing, which inside a
    // channel leans across it — the deep line of a gate runs *along* it — so the
    // perpendicular of that bearing is the fairway. Where the bearing has no
    // length the water is too deep for the mask to have one, and the ranks fall
    // back to the world's own axis rather than spinning on a normalised zero.
    vec2 seaward = shore.gb * 2.0 - 1.0;
    float lean   = length(seaward);
    vec2 along   = lean < 0.02 ? vec2(1.0, 0.0) : vec2(-seaward.y, seaward.x) / lean;
    vec2 abeam   = vec2(-along.y, along.x);

    // World-fixed, with no travel term anywhere in it: the water goes through an
    // overfall, the overfall does not go anywhere. All the sign of the stream
    // does is decide which side of the gate the ranks stand on.
    vec2 stand = vec2(
      dot(ground, along) + uRoostSet * ${ROOST_SET.toFixed(1)},
      dot(ground, abeam) * ${ROOST_ABEAM.toFixed(2)}
    ) * ${(1 / (ROOST_SPACING * ROOST_CYCLES)).toFixed(7)};

    float white = smoothstep(
      ${ROOST_CUT.toFixed(2)},
      ${(ROOST_CUT + 0.09).toFixed(2)},
      texture2D(uWaveMap, stand).r
    ) * ${ROOST_TORN.toFixed(2)};

    // And where a pixel is wider than a rank, the same water is its own mean
    // instead of its own pattern. Not a fallback: it is what broken water does
    // at four hundred metres, which is go pale.
    return mix(white, ${ROOST_MEAN.toFixed(2)},
        smoothstep(${(1 / (ROOST_CYCLES * 5)).toFixed(3)}, ${(1 / (ROOST_CYCLES * 2)).toFixed(3)}, fwidth(stand.x)))
      * gate * uRoost * smoothstep(0.0, 0.03, depth);
  }
`
