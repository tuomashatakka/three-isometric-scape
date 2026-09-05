import type { ScapeConfig } from '../src/scene/config.ts'
import { causewayCover } from '../src/scene/landscape/causeway.ts'
import type { Causeway } from '../src/scene/landscape/causeway.ts'
import type { CroftSite } from '../src/scene/landscape/croft.ts'
import type { HeightField } from '../src/scene/landscape/height.ts'
import { peatFaceStanding } from '../src/scene/landscape/peat.ts'
import type { PeatBank } from '../src/scene/landscape/peat.ts'
import type { SmokehouseSite } from '../src/scene/landscape/smokehouse.ts'
import { tarnWetted } from '../src/scene/landscape/tarn.ts'
import type { Tarn } from '../src/scene/landscape/tarn.ts'
import { tideAmplitudeAt } from '../src/scene/tide.ts'
import type { CompositionStats } from './scape-map.ts'


/**
 * The sited features of one island, as the stats lines report them.
 *
 * Split off `scape-map.ts` when that file went past the 666-line ceiling a third
 * time, and the seam is the one those functions had already drawn between
 * themselves: every one of them is a *projection plus a measurement* — a local
 * point carried into world metres, and the one number that says whether the
 * thing the search found is really there. None of them touch the grid, the
 * layers or the argument parsing that is the rest of that file.
 *
 * They are separate functions rather than branches inside `compositionStats`
 * because the lint config's complexity ceiling refuses the alternative, and
 * rightly: a survey-to-stats mapping that keeps growing null guards is a mapping
 * that wants splitting, not a limit that wants raising.
 */

/** Round for the report, not for the maths. */
const round = (value: number, places = 1): number => Number(value.toFixed(places))

/** Carrying a local coordinate into world metres. See `compositionStats`. */
type Project = (value: number) => number


/** The harbour's hut, and how far up the bank it stands. */
export function smokehouseOf (
  site:   SmokehouseSite | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['smokehouse'] {
  return site && {
    x:        round(worldX(site.x)),
    z:        round(worldZ(site.z)),
    fromBank: round(site.fromBank, 1),
  }
}

/** The hut on the outer rock, and the freeboard the search dealt it. */
export function croftOf (
  site:   CroftSite | null,
  worldX: Project,
  worldZ: Project,
): CompositionStats['croft'] {
  return site && {
    x:           round(worldX(site.x)),
    z:           round(worldZ(site.z)),
    freeboard:   round(site.freeboard, 2),
    isle:        site.isle,
    fromHarbour: round(site.fromHarbour),
  }
}

/**
 * The pool, and how much water is actually in it.
 *
 * `wetted` is the measurement. The sheet is drawn to the full radius and
 * occluded by the bank, so a basin that stopped holding water draws exactly as
 * it did before and shows up nowhere but here.
 */
export function tarnOf (
  tarn:   Tarn | null,
  field:  HeightField,
  worldX: Project,
  worldZ: Project,
): CompositionStats['tarn'] {
  return tarn && {
    x:      round(worldX(tarn.x)),
    z:      round(worldZ(tarn.z)),
    level:  round(tarn.level, 2),
    wetted: round(tarnWetted(tarn, field.heightAt), 1),
    spread: round(tarn.spread, 2),
  }
}

/** The cutting, and how much of its face is standing. */
export function peatOf (
  peat:   PeatBank | null,
  field:  HeightField,
  worldX: Project,
  worldZ: Project,
): CompositionStats['peat'] {
  return peat && {
    x:        round(worldX(peat.x)),
    z:        round(worldZ(peat.z)),
    level:    round(peat.level, 2),
    spread:   round(peat.spread, 2),
    standing: round(peatFaceStanding(peat, field.heightAt), 2),
  }
}

/**
 * The crossing, and how much of the tide stands over it.
 *
 * The measurement here is a pair rather than a single number, because a causeway
 * is defined by the *band* its crest sits in: covered at the quarters of the
 * month it is a ford, covered at neither end of it a mole. Both are read from
 * the closed form in `landscape/causeway.ts` rather than by marching a clock, so
 * this line and `causeway.test.ts` cannot disagree about what covered means.
 */
export function causewayOf (
  causeway: Causeway | null,
  config:   ScapeConfig,
  worldX:   Project,
  worldZ:   Project,
): CompositionStats['causeway'] {
  if (!causeway)
    return null

  const freeboard = causeway.crest - config.terrain.waterLevel

  return {
    x:        round(worldX((causeway.shore.x + causeway.head.x) * 0.5)),
    z:        round(worldZ((causeway.shore.z + causeway.head.z) * 0.5)),
    isle:     causeway.isle,
    crossing: round(causeway.crossing, 1),
    crest:    round(freeboard, 2),
    springs:  round(causewayCover(freeboard, tideAmplitudeAt(1, config.tide)), 2),
    neaps:    round(causewayCover(freeboard, tideAmplitudeAt(0, config.tide)), 2),
  }
}
