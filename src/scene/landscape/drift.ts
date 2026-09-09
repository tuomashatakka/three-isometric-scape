import { smoothstep } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import { faceAmount, shadeDirection } from './aspect.ts'
import type { GroundNormal } from './height.ts'
import type { Vec2 } from './path.ts'


const DEGREES = Math.PI / 180

/**
 * Where the wind puts the snow it has already dropped.
 *
 * The scape has had lying snow since the year did: a height where cover starts,
 * swung up and down the hill by how much sun a face takes. Both of those are
 * facts about *melt* — where the snow survives — and neither is a fact about
 * where it landed. At this latitude the second one is the stronger. Snow falls
 * through a wind that never stops, and a winter's worth of it ends up scoured
 * off every face turned into the weather and banked against every face turned
 * out of it, in a band metres deep. A hillside evenly whitened to one contour is
 * a hillside in a place with no wind in it.
 *
 * So the snow line takes a second swing, off the same normal the first one reads
 * and against `wind.bearing` instead of `daylight.azimuth`: **down** in the lee,
 * where the drift banks, and **up** on the weather face, where the ground blows
 * bare. It is `aspect.ts`'s rule with a different compass in it, which is why
 * the geometry lives there and only the bearing lives here.
 *
 * The gpu half is `seasonFragment` in `props/material.ts`, and it is a *mirror*
 * rather than a copy: every constant this module shapes the cover with is
 * interpolated into that shader from the exports below, so the two cannot drift
 * apart the way a hand-copied number can.
 */

/**
 * The horizontal direction a fully sheltered face points in, as a unit vector.
 *
 * `wind.bearing` is the direction the weather blows *toward* — the same reading
 * `wind.ts` takes when it resolves the gust, and the opposite of the one
 * `treeline.ts` takes when it walks upwind for fetch. A face in the lee of a
 * hill points the way the wind is going, so the lee direction *is* the wind's
 * own, and no negation belongs here.
 *
 * The *base* bearing rather than this instant's, exactly as the shade direction
 * is the season's sun rather than this hour's: a drift is a winter's worth of
 * weather, and one that veered with the gust would be a hillside changing shape
 * between one breath and the next.
 *
 * Writes into a caller-owned record for the reason `aspect.ts`'s does:
 * the material resolves this every frame and its update allocates nothing.
 */
export function driftDirection (bearing: number, target: Vec2 = { x: 0, z: 0 }): Vec2 {
  const heading = bearing * DEGREES

  target.x = Math.cos(heading)
  target.z = Math.sin(heading)

  return target
}

/**
 * Metres of altitude the cover fades over, once the line has been placed.
 *
 * A snow line is an edge in the model and a band on the ground — a fortnight of
 * thaw leaves patches for a couple of metres under it before the cover goes
 * continuous.
 */
export const SNOW_BAND = 1.6

/** Metres the line itself wanders, so it is not a contour someone painted on. */
export const SNOW_WANDER = 0.85

/** The two frequencies that wander it, per metre of ground. */
export const WANDER_ALONG  = 0.37
export const WANDER_ACROSS = 0.29

/**
 * How far the line has wandered from the contour at a point on the ground.
 *
 * Two trig calls rather than a fetch, because it is read per fragment on a tier
 * that counts its samplers, and because a wandering line only has to be
 * *irregular* — it carries no information a texture would carry better.
 */
export function snowWander (x: number, z: number): number {
  return Math.sin(x * WANDER_ALONG) * Math.cos(z * WANDER_ACROSS)
}

/**
 * The height, in metres, where cover starts on one particular face.
 *
 * The base line, less what the sun's aspect takes off it, less what the wind's
 * does. Both swings are subtracted for the same reason: a positive amount is a
 * face turned *away* from the agent — out of the sun, out of the weather — and
 * that is the face that keeps its snow lowest.
 */
export function snowLineAt (
  base:     number,
  swing:    number,
  aspect:   number,
  drift:    number,
  exposure: number,
): number {
  return base - swing * aspect - drift * exposure
}

/**
 * How much of a point is under snow, 0..1.
 *
 * The `smoothstep` the shader takes, evaluated on the cpu so a survey can state
 * what the cover *is* rather than what it was meant to be. Nothing in the scene
 * calls this — the gpu owns the pixels — and everything that measures the cover
 * does.
 */
export function snowCover (altitude: number, x: number, z: number, line: number): number {
  return smoothstep(line, line + SNOW_BAND, altitude + snowWander(x, z) * SNOW_WANDER)
}

/** What one island's ground does with the winter the wind brings it. */
export interface DriftSurvey {
  id: string

  /** Share of the island's land turned into the weather, per cent. */
  scoured: number

  /** And out of it. */
  drifted: number

  /** Share of the land under cover at deep winter, per cent, as it now is. */
  cover: number

  /** And as it would be with the wind's swing at zero. */
  even: number

  /** Share the wind takes the cover off — ground that whitens without it. */
  bared: number

  /** And the share it puts cover on that an even winter leaves bare. */
  banked: number

  /**
   * Metres between the highest and lowest snow line the island's own ground
   * earns from the wind.
   *
   * The knob says how far the line *may* swing; this says how far it does. A
   * hillside too gentle to hold an aspect earns none of it, so an island whose
   * `realised` is a fraction of `season.snowDrift` is an island the effect
   * cannot reach — which is a fact about the ground rather than about the knob.
   */
  realised: number
}

/** How many samples a side the survey walks the world with. */
const DRIFT_WALK = 220

/**
 * The cover, measured, with the wind's swing and without it.
 *
 * The pair is the whole instrument. A single cover share says nothing — it moves
 * when the snow line moves, when the year moves, when the ground moves — and the
 * *difference* between the same winter with and without this run's term is
 * exactly the claim the run makes, in two numbers no still can carry: a hillside
 * whose windward face has come out from under the snow looks, at fifteen hundred
 * metres, like a hillside with slightly less snow on it.
 *
 * Deep winter rather than the configured phase, because the phase is a clock and
 * this is a question about the ground: at `season.time` in high summer every
 * island reports nothing and the survey would be measuring the calendar.
 */
type FieldType = { heightAt(x: number, z: number): number
  normalAt(x: number, z: number, target: GroundNormal): GroundNormal
  landmassAt(x: number, z: number): { id: string } | null }

export function measureDrift (
  field:      FieldType,
  config:     ScapeConfig,
  landmasses: readonly { id: string }[],
  size:       number,
  samples:    number = DRIFT_WALK,
): DriftSurvey[] {
  const { waterLevel }       = config.terrain
  const base                 = waterLevel + config.season.snowLine
  const shade                = shadeDirection(config.daylight.azimuth)
  const weather              = driftDirection(config.wind.bearing)
  const facing: GroundNormal = { x: 0, y: 1, z: 0 }
  const half                 = size * 0.5
  const tallies              = new Map<string, {
    land:    number,
    scoured: number,
    drifted: number,
    cover:   number,
    even:    number,
    bared:   number,
    banked:  number,
    low:     number,
    high:    number,
  }>()

  for (let row = 0; row < samples; row += 1)
    for (let column = 0; column < samples; column += 1) {
      const x      = -half + (column + 0.5) * size / samples
      const z      = -half + (row + 0.5) * size / samples
      const height = field.heightAt(x, z)

      if (height <= waterLevel)
        continue

      const id = field.landmassAt(x, z)?.id

      if (!id)
        continue

      const normal   = field.normalAt(x, z, facing)
      const aspect   = faceAmount(normal, shade)
      const exposure = faceAmount(normal, weather)
      const line     = snowLineAt(base, config.season.snowSwing, aspect, config.season.snowDrift, exposure)
      const even     = snowLineAt(base, config.season.snowSwing, aspect, 0, 0)
      const under    = snowCover(height, x, z, line)
      const flat     = snowCover(height, x, z, even)
      const tally    = tallies.get(id) ?? {
        land:    0,
        scoured: 0,
        drifted: 0,
        cover:   0,
        even:    0,
        bared:   0,
        banked:  0,
        low:     Infinity,
        high:    -Infinity,
      }

      tally.land    += 1
      tally.scoured += exposure < -0.25 ? 1 : 0
      tally.drifted += exposure > 0.25 ? 1 : 0
      tally.cover   += under
      tally.even    += flat
      tally.bared   += Math.max(0, flat - under)
      tally.banked  += Math.max(0, under - flat)
      // The wind's own term rather than the whole line, so a swing the sun
      // earned is not reported as one the weather did.
      tally.low  = Math.min(tally.low, config.season.snowDrift * exposure)
      tally.high = Math.max(tally.high, config.season.snowDrift * exposure)
      tallies.set(id, tally)
    }

  const share = (count: number, land: number): number =>
    land ? Number((100 * count / land).toFixed(1)) : 0

  return landmasses.flatMap(landmass => {
    const tally = tallies.get(landmass.id)

    return tally
      ? [{
        id:       landmass.id,
        scoured:  share(tally.scoured, tally.land),
        drifted:  share(tally.drifted, tally.land),
        cover:    share(tally.cover, tally.land),
        even:     share(tally.even, tally.land),
        bared:    share(tally.bared, tally.land),
        banked:   share(tally.banked, tally.land),
        realised: Number((tally.high - tally.low).toFixed(2)),
      }]
      : []
  })
}
