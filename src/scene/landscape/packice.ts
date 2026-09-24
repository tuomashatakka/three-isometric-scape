import { createSeededRng, smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { depthUnit, floeScale, freezeToClose, iceCover } from './water-ice.ts'
import type { Vec2 } from './path.ts'


/**
 * The plates on the frozen sound, and the week each one of them arrives.
 *
 * The survey half of the pack — `landscape/floes.ts` is the half with a mesh in
 * it. Nothing here knows about geometry, a tide or a wind; it answers one
 * question about the world, once, at build: *where can a plate of ice stand,
 * and how much of the winter does that water need first.*
 *
 * ### where
 *
 * A grid of seats over the whole archipelago, and three refusals:
 *
 * - water too shallow to float a plate is fast ice, and the surface already
 *   draws it — `pack.draught`
 * - water the front never closes over is open sea, and nothing stands on it —
 *   `pack.sheet`, through the same `iceCover` the shader paints with
 * - water the ferries use is a lead, and it is kept open — `pack.fairway`
 *
 * There is no fourth switch saying "there is ice here". The search either finds
 * water a floe can lie on or it does not, which is why a run that turns
 * `water.iceReach` down finds the pack has drawn itself back toward the shore
 * without anything in this file having been touched.
 *
 * ### when
 *
 * {@link freezeToClose} is the interesting half. The front does not arrive
 * everywhere in one week, so every seat carries the freeze at which *its* water
 * closes and the pack fills in as the year deepens — off the year's own clock,
 * with nothing anywhere keyframing a month, and with a seat whose water never
 * closes never given a plate at all.
 *
 * **It fills in lobes rather than in rings, and that is the surface's answer
 * rather than a choice made here.** The obvious story is that a pack grows out
 * from the shore — and `scapeIce` does shut the shallows first, but its depth
 * term saturates at 0.55 of the mask's 3.2 m, which is about a metre and three
 * quarters of water. Past that the front is decided entirely by the break-up
 * field, whose lobes are some nine hundred metres across, so what actually
 * happens in this archipelago is that half the sound closes a fortnight before
 * the other half. Twenty-one of twelve hundred seats are in water shallow enough
 * for the depth to be what orders them.
 *
 * Which is fine, and it is the point of mirroring rather than inventing: the
 * pack arrives where the paint arrives, in the same lobes, in the same weeks. A
 * survey that told the tidier story would be standing plates of ice on water the
 * surface was still drawing as open.
 *
 * **Every length here is metres and stays metres**, and every position is world
 * space — the pack is dealt across the whole archipelago rather than per island,
 * because the sea between the islands is one sea.
 */

/** One plate of ice, seated once against mean water. */
export interface IceFloe {

  /** World metres. Where the plate lies when nothing is working it. */
  x: number
  z: number

  /** Metres across, the long way. A floe is not a disc. */
  length: number

  /** Metres across, the short way. */
  width: number

  /** Metres the rafted plate stands over the water it floats in. */
  rise: number

  /** Which way the long axis lies, in radians. */
  angle: number

  /**
   * The freeze, 0..1, at which the sheet under this plate closes.
   *
   * The seasonal coupling, and it is a property of the *water* rather than of
   * the ice: two plates a hundred metres apart in different depths arrive weeks
   * apart, which is what makes the pack advance rather than appear.
   */
  onset: number

  /** Metres of water under it at mean tide. Reported, and used by nothing else. */
  depth: number

  /**
   * How readily this plate is part of a thinned pack, 0..1.
   *
   * The per-floe half of `pack.cover`, and the same device `haulout.ashore`
   * uses: a plate is in the field while its roll is under the share the config
   * asks for, so turning the knob down thins the pack the same way every time
   * instead of reshuffling which plates are in it.
   */
  keen: number

  /** Radians of phase for the working, so a field does not breathe in unison. */
  phase: number
}

/**
 * Freeze between a plate's own onset and its full size.
 *
 * A floe does not switch on. New ice makes as a skim and thickens for weeks, so
 * the plates come up out of the water over about a twentieth of a year — which
 * at the season's default speed is a few seconds of watching and, more to the
 * point, is what stops a tour frame taken one week either side of a front from
 * being a different scene.
 */
const MAKING = 0.06

/**
 * How much of a plate is standing, 0..1, at a freeze.
 *
 * Pure, and the whole of what the drawer asks the survey per frame. Separate
 * from the placement for the reason `sealAshore` is separate from
 * `planHaulouts`: where the ice is belongs to the build and how much of it is
 * there belongs to the week, and a still that names a week has to be able to
 * get the second without re-running the first.
 */
export function floeExtent (floe: IceFloe, freeze: number, cover: number): number {
  if (!(cover > 0) || floe.keen >= cover)
    return 0

  return smoothstep(floe.onset, floe.onset + MAKING, freeze)
}

/** Metres from a point to the nearest ferry leg, or `Infinity` with no route. */
export function fairwayClearance (point: Vec2, legs: readonly (readonly Vec2[])[]): number {
  let nearest = Infinity

  for (const leg of legs)
    for (let index = 1; index < leg.length; index += 1)
      nearest = Math.min(nearest, segmentDistance(point, leg[index - 1], leg[index]))

  return nearest
}

/** Metres from a point to a segment, in the ground plane. */
function segmentDistance (point: Vec2, from: Vec2, to: Vec2): number {
  const runX = to.x - from.x
  const runZ = to.z - from.z
  const span = runX * runX + runZ * runZ

  if (span < 1e-6)
    return Math.hypot(point.x - from.x, point.z - from.z)

  const along = Math.max(0, Math.min(1,
                                     ((point.x - from.x) * runX + (point.z - from.z) * runZ) / span))

  return Math.hypot(point.x - (from.x + runX * along), point.z - (from.z + runZ * along))
}

/**
 * Every plate of ice the archipelago can carry, out to the tier's budget.
 *
 * Deterministic: one rng forked per seat off the scape's seed and the seat's own
 * grid index, so a pack that gains a plate does not reshuffle the field — the
 * same discipline every scatter in the scape is held to.
 *
 * The budget is taken off the *front* of a deal ordered by each seat's own roll
 * rather than by where it is, which is the only ordering that survives a tier
 * change: a phone's forty plates are forty of a workstation's two hundred, in
 * the places the workstation puts them and spread over the same water, rather
 * than a solid raft round one island and open sea everywhere else.
 *
 * @param budget Plates the tier will draw. 0 is a sound that freezes flat, and
 *   the whole system is then absent rather than cheap.
 */
export function planPackIce (
  survey: ArchipelagoSurvey,
  config: ScapeConfig,
  budget: number,
): readonly IceFloe[] {
  const room = Math.max(0, Math.floor(budget))
  const pack = config.pack

  if (room < 1 || !(pack.spacing > 0) || !(pack.plate > 0))
    return []

  const { waterLevel }         = config.terrain
  const { iceReach, iceBreak } = config.water
  const scale                  = floeScale(config.terrain.size, config.archipelago.worldSize)
  const legs                   = survey.waterways.route.legs.map(leg => leg.points)
  const half                   = survey.size * 0.5
  const steps                  = Math.floor(survey.size / pack.spacing)
  const seats: IceFloe[]       = []
  const rng                    = createSeededRng(config.seed ^ 0x1ce)

  for (let row = 0; row <= steps; row += 1)
    for (let column = 0; column <= steps; column += 1) {
      const index = row * (steps + 1) + column
      const stone = rng.fork(`seat-${index}`)

      // Jittered off the lattice before anything is asked about the water, so
      // the field has no rows in it at any angle. Kept inside half a cell, which
      // is what stops two neighbours from trading places and reshuffling the
      // deal the next time the spacing is retuned.
      const x = -half + column * pack.spacing + stone.range(-0.45, 0.45) * pack.spacing
      const z = -half + row * pack.spacing + stone.range(-0.45, 0.45) * pack.spacing

      const depth = waterLevel - survey.field.heightAt(x, z)

      if (depth < pack.draught)
        continue

      // A plate is dealt its size before anything else refuses it, so which
      // plates survive a cut cannot change how big any of them is — and because
      // the lead below is kept clear of the *ice* rather than of the point it is
      // centred on, which needs the size in hand.
      const spread = 1 + stone.range(-1, 1) * pack.ragged
      const length = pack.plate * Math.max(0.2, spread)
      const width  = length * (0.55 + stone.next() * 0.4)

      if (fairwayClearance({ x, z }, legs) < pack.fairway + length * 0.5)
        continue

      const onset = freezeToClose(
        x, z, depthUnit(depth), pack.sheet, iceReach, iceBreak, scale)

      if (!Number.isFinite(onset))
        continue

      seats.push({
        x,
        z,
        length,
        width,
        rise:  length * pack.rise,
        angle: stone.next() * Math.PI * 2,
        onset,
        depth,
        keen:  stone.next(),
        phase: stone.next() * Math.PI * 2,
      })
    }

  // Ordered by the roll each seat was already dealt, and tied on nothing: two
  // seats cannot share a roll, because each is drawn from its own forked stream.
  return seats.sort((first, second) => first.keen - second.keen).slice(0, room)
}

/**
 * How closed the sheet is over a plate at a week of the year.
 *
 * The check the test uses and the number `scape:map` reports — the surface's own
 * answer at the floe's own place, so "no plate stands on water the sheet has not
 * closed" is a statement anything can verify rather than a claim in a comment.
 */
export function sheetOver (floe: IceFloe, config: ScapeConfig, freeze: number): number {
  return iceCover(
    floe.x,
    floe.z,
    depthUnit(floe.depth),
    freeze,
    config.water.iceReach,
    config.water.iceBreak,
    floeScale(config.terrain.size, config.archipelago.worldSize),
  )
}
