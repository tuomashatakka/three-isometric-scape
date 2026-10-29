import type { ScapeConfig } from '../src/scene/config.ts'
import type { ArchipelagoSurvey } from '../src/scene/landscape/archipelago.ts'
import { SHELTER_RESOLUTION, shelterAt, surveyShelter } from '../src/scene/landscape/shelter.ts'
import { bakeDepthGrid } from '../src/scene/landscape/shore-mask.ts'
import type { MapStats } from './scape-map.ts'
import { hypot } from '../src/scene/hypot.ts'


/** The rounding every instrument in this directory prints through. */
const round = (value: number, places = 1): number => Number(value.toFixed(places))

/**
 * The lee the archipelago throws, and the three numbers that say whether it is
 * a place or a tint.
 *
 * `mean` is how sheltered the water is on average over every bearing — a
 * whole-sea number, and the one that moves when `shelter.reach` is retuned.
 * `lee` is the share of the water at or over half sheltered **at the authored
 * wind**, which is the one to watch: past about a third the archipelago has
 * stopped having an open sound in it, and under a few per cent nothing on the
 * water will read as sheltered at any zoom. `swing` is the span between the
 * most and least sheltered bearing, averaged over the water — how *directional*
 * the field is, and therefore how much of this moves when the wind veers. A
 * swing near zero with a healthy mean is an archipelago that is uniformly
 * enclosed, which is a pond.
 *
 * `calm` is the other sea: the mean of the swell's own channel, which carries
 * no bearing. It is the number `water.swellLee` multiplies, so the height the
 * swell actually loses on average is `calm * (1 - swellLee)`.
 *
 * Run at {@link SHELTER_RESOLUTION} rather than at any tier's map size, so what
 * this prints is what the mobile, desktop and ultra programs all draw.
 */
export function shelterStats (survey: ArchipelagoSurvey, config: ScapeConfig): MapStats['shelter'] {
  const span    = config.archipelago.worldSize * 1.02
  const depth   = bakeDepthGrid(config, survey.field, span, SHELTER_RESOLUTION)
  const field   = surveyShelter(depth, SHELTER_RESOLUTION, span, config.shelter)
  const bearing = config.wind.bearing * Math.PI / 180

  // Into the weather, which is the direction a ray was marched to find the land
  // doing the sheltering — the opposite of the way the wind blows toward.
  const upwindX = -Math.cos(bearing)
  const upwindZ = -Math.sin(bearing)

  let water = 0
  let mean  = 0
  let calm  = 0
  let swing = 0
  let lee   = 0

  for (let index = 0; index < depth.length; index += 1) {
    if (!(depth[index] > 0))
      continue

    const at = index * 4

    water += 1
    mean += field.data[at]
    calm += field.data[at + 3]

    // The first harmonic's own amplitude, doubled: the span between the
    // bearing it peaks on and the one opposite it.
    swing += 2 * hypot(field.data[at + 1], field.data[at + 2])
    lee += shelterAt(field, index, upwindX, upwindZ) >= 0.5 ? 1 : 0
  }

  return {
    reach:      config.shelter.reach,
    swellReach: config.shelter.swellReach,
    mean:       round(water ? mean / water : 0, 3),
    lee:        round(water ? lee / water * 100 : 0, 1),
    swing:      round(water ? swing / water : 0, 3),
    calm:       round(water ? calm / water : 0, 3),
    keeps:      round(config.water.swellLee, 2),
  }
}
