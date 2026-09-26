import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, createRockGeometry, mergeGeometryList, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/** A point with a height — both ends of the lade know their own. */
export interface LadePoint {
  x: number
  y: number
  z: number
}

export interface LadeRunOptions {

  /** The mouth, cut into the channel's bank. `y` is the trough's floor there. */
  intake: LadePoint

  /** Where the trough lets go over the wheel. `y` is its floor there. */
  feed: LadePoint

  /** Ground height, sampled under every bent. */
  heightAt(x: number, z: number): number
  rng:     SeededRng
  palette: NordicPalette

  /** Inside width of the trough, in metres. @defaultValue 0.62 */
  width?: number

  /** Metres of trough per bay. The run is divided into a whole number. @defaultValue 1.15 */
  spacing?: number
}

/** How deep the trough's sides stand above its floor, in metres. */
const SIDE = 0.28

/** Bays between bents. A trestle under every bay is a boardwalk, not a launder. */
const BENT_EVERY = 2

/**
 * How far below its own floor a bent's legs reach when the ground is not there.
 *
 * The lade crosses a bank that the search has already checked the trough stands
 * clear of, so the ground under a bent is *below* the floor by anything from a
 * hand's width to a metre and a half. Legs are cut to the ground they find, and
 * this is only the floor under that — a bent standing on ground that has fallen
 * further than the search allowed still reaches something rather than hanging.
 */
const LEG_FLOOR = 1.7

/**
 * The lade — the timber trough that carries the beck to the wheel.
 *
 * A world-space run rather than a prop in the roster, and the reason is the one
 * thing about this structure nobody gets to choose: it is as long as the island
 * makes it. The home island's beck falls the wheel's own head in six metres and
 * the sound's takes nine, so a baked trough would be right on one island and
 * either short of the water or hanging over it on every other. The fences and
 * the drystone walls are built this way for the same reason and have been since
 * the first enclosure — see `props/fence.ts`.
 *
 * Two frames, deliberately. The trough itself is built along a local `+x` from
 * the feed to the intake and then tilted, yawed and carried into place as one
 * piece, because it is *straight* and a straight thing should be described once
 * rather than per bay. The bents underneath are built in world space, because
 * each one stands on its own ground — which is the whole argument the fence
 * makes about posts and rails, at a steeper pitch.
 *
 * @returns One merged, world-space, vertex-coloured geometry, or `null` when the
 *   two ends are the same place. The caller owns it.
 */
export function buildLadeRun (options: LadeRunOptions): BufferGeometry | null {
  const { intake, feed, rng, palette, width = 0.62, spacing = 1.15 } = options

  const dx   = intake.x - feed.x
  const dy   = intake.y - feed.y
  const dz   = intake.z - feed.z
  const flat = Math.hypot(dx, dz)
  const run  = Math.hypot(flat, dy)

  if (run < 1)
    return null

  const along = Math.atan2(dz, dx)
  const pitch = Math.atan2(dy, flat)
  const bays  = Math.max(2, Math.round(run / spacing))
  const bay   = run / bays

  const trough = layTrough(bays, bay, width, rng, palette)

  // Tilt about `z` lifts local `+x` to the pitch; the yaw then swings it onto
  // the bearing. Applied in this order and not the other — `rotateY` after
  // `rotateZ` composes as `Ry · Rz`, which is the only one of the two that
  // leaves the trough's sides plumb.
  trough.rotateZ(pitch)
  trough.rotateY(-along)
  trough.translate(feed.x, feed.y, feed.z)

  const parts = [ trough ]

  standBents(parts, options, { along, pitch, bays, bay, width })
  parts.push(cutHeadwall(intake, along, width, rng, palette))

  return mergeGeometryList(parts)
}

/** The trough, in its own frame: `+x` from the feed up to the intake. */
function layTrough (
  bays:    number,
  bay:     number,
  width:   number,
  rng:     SeededRng,
  palette: NordicPalette,
): BufferGeometry {
  const parts: BufferGeometry[] = []

  for (let index = 0; index < bays; index += 1) {
    const at = (index + 0.5) * bay

    parts.push(part(box(bay * 1.04, 0.09, width), {
      at: [ at, 0, 0 ], color: palette.woodDark, jitter: 0.1, rng,
    }))

    for (const side of [ -1, 1 ])
      parts.push(part(box(bay * 1.04, SIDE, 0.08), {
        at:     [ at, SIDE / 2 - 0.02, side * (width / 2 - 0.04) ],
        color:  index % 3 === 0 ? palette.plank : palette.wood,
        jitter: 0.12,
        rng,
      }))
  }

  return mergeParts(parts)
}

interface RunFrame {
  along: number
  pitch: number
  bays:  number
  bay:   number
  width: number
}

/**
 * The trestles, each on its own ground.
 *
 * Plumb, like a fence's posts and for the fence's reason: a bent tilted to match
 * its own patch of hillside zig-zags against its neighbours, and a lade is the
 * one structure here whose line the eye follows end to end.
 */
function standBents (
  parts:   BufferGeometry[],
  options: LadeRunOptions,
  frame:   RunFrame,
): void {
  const { feed, heightAt, rng, palette } = options
  const { along, pitch, bays, bay }      = frame
  const cos                              = Math.cos(along)
  const sin                              = Math.sin(along)
  const bents: BufferGeometry[]          = []

  for (let index = BENT_EVERY; index < bays; index += BENT_EVERY) {
    const at     = index * bay
    const reach  = at * Math.cos(pitch)
    const x      = feed.x + cos * reach
    const z      = feed.z + sin * reach
    const deck   = feed.y + at * Math.sin(pitch)
    const ground = Math.min(heightAt(x, z), deck - 0.12)
    const foot   = Math.max(ground, deck - LEG_FLOOR)
    const height = deck - foot

    for (const side of [ -1, 1 ]) {
      const lean = side * (frame.width / 2 + 0.06)

      bents.push(part(box(0.13, height, 0.13), {
        at:     [ x - sin * lean, foot + height / 2, z + cos * lean ],
        color:  palette.tarWood,
        jitter: 0.1,
        rng,
      }))
    }

    // The cap the trough sits on, laid across the run.
    bents.push(part(box(0.14, 0.12, frame.width + 0.36), {
      at:     [ x, deck - 0.11, z ],
      rotate: [ 0, -along, 0 ],
      color:  palette.woodDark,
      jitter: 0.09,
      rng,
    }))
  }

  if (bents.length > 0)
    parts.push(mergeParts(bents))
}

/**
 * The stone at the mouth, where the trough meets the bank.
 *
 * The one part of a lade that is not timber, and the part that says the
 * structure was cut *into* something rather than laid on it. Half of it is
 * usually under the ground on the steeper islands, which is correct: a mouth is
 * a hole in a bank.
 */
function cutHeadwall (
  intake:  LadePoint,
  along:   number,
  width:   number,
  rng:     SeededRng,
  palette: NordicPalette,
): BufferGeometry {
  const parts: BufferGeometry[] = []

  for (const side of [ -1, 1 ])
    for (let course = 0; course < 3; course += 1) {
      const lean = side * (width / 2 + 0.22)

      parts.push(part(
        createRockGeometry({ radius: 0.26, detail: 0, rng, roughness: 0.5, scale: [ 1.1, 0.8, 1.3 ]}),
        {
          at: [
            intake.x - Math.sin(along) * lean,
            intake.y - 0.34 + course * 0.26,
            intake.z + Math.cos(along) * lean,
          ],
          rotate: [ 0, -along + rng.range(-0.2, 0.2), 0 ],
          color:  rng.pick([ palette.granite, palette.graniteDark, palette.lichen ]),
          jitter: 0.17,
          rng,
        },
      ))
    }

  return mergeParts(parts)
}

// perf: one merged geometry for a whole lade, however long, folded into the
// steading's single hero draw. No draw call of its own and nothing per frame.
