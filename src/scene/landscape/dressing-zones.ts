import type { SeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import type { HeightField } from './height.ts'
import { BEACON_FOOTING } from './beacon.ts'
import { distanceToTrack, pastureInfluence, plotInfluence, ridgeInfluence } from './layout.ts'


/** The bare middle of a worn path, excluding its thinning verge. */
const TREAD = 0.55

/**
 * How deep and how high a pool's reed band reaches, in metres of water.
 *
 * The same shape of rule as the sea's own reed band, at a tarn's scale: reeds
 * stand in the shallows and a little way up the wet bank, and nowhere else.
 * Shallower than the sea's band because the pool is — half a metre of water is
 * the middle of this one, not its margin.
 */
const MARGIN_DEPTH = 0.4
const MARGIN_RISE  = 0.15

export interface DressingZones {
  onYard(x: number, z: number): number
  onTrack(x: number, z: number): boolean
  onPath(x: number, z: number): boolean
  onPlot(x: number, z: number): number
  onPasture(x: number, z: number): number

  /** Inside the light's footing — its plinth, and the storm boulders round it. */
  onBeacon(x: number, z: number): boolean

  /** Inside a tarn's own ground: the water, and the wet ring it stands in. */
  onTarn(x: number, z: number): boolean

  /**
   * The band round a pool where the ground is at the waterline give or take a
   * boot — the only ground in the scape that is neither dry nor the sea.
   */
  atTarnMargin(x: number, z: number): boolean

  /** The stripped floor of a turf cutting: ground the farm has carried away. */
  onPeat(x: number, z: number): boolean

  clear(x: number, z: number): boolean
}

/** Where the authored composition already claims the ground. */
export function createZoneTests (archipelago: ArchipelagoSurvey): DressingZones {
  const onYard = (x: number, z: number): number => {
    const landmass = archipelago.field.landmassAt(x, z)
    if (!landmass)
      return 0

    const { yard } = landmass.survey.layout
    const distance = Math.hypot(
      x - landmass.origin.x - yard.x,
      z - landmass.origin.z - yard.z,
    )
    return Math.max(0, 1 - distance / (yard.radius * 1.1))
  }

  const onTrack = (x: number, z: number): boolean => {
    const landmass = archipelago.field.landmassAt(x, z)
    if (!landmass)
      return false

    return distanceToTrack(
      landmass.survey.layout,
      x - landmass.origin.x,
      z - landmass.origin.z,
    ) < landmass.survey.layout.track.width * 1.3
  }

  const onPath = (x: number, z: number): boolean =>
    archipelago.paths.wearAt(x, z) > TREAD

  const onPlot = (x: number, z: number): number => {
    const landmass = archipelago.field.landmassAt(x, z)
    if (!landmass)
      return 0

    const localX = x - landmass.origin.x
    const localZ = z - landmass.origin.z
    return landmass.survey.layout.plots.reduce(
      (claim, plot) => Math.max(claim, plotInfluence(plot, localX, localZ)),
      0,
    )
  }

  const onPasture = (x: number, z: number): number => {
    const landmass = archipelago.field.landmassAt(x, z)
    if (!landmass)
      return 0

    return pastureInfluence(
      landmass.survey.layout,
      x - landmass.origin.x,
      z - landmass.origin.z,
    )
  }

  // The light's own ground. The placement solver already keeps trees and stones
  // off it, but ground cover never asks the solver anything — so without this the
  // grass and the heather grow up through the plinth's own masonry.
  const onBeacon = (x: number, z: number): boolean => {
    const landmass = archipelago.field.landmassAt(x, z)
    const beacon   = landmass?.survey.beacon

    if (!beacon)
      return false

    return Math.hypot(
      x - landmass.origin.x - beacon.x,
      z - landmass.origin.z - beacon.z,
    ) < BEACON_FOOTING
  }

  // The pool and the ring of wet ground it sits in. Nothing that scatters asks
  // the placement solver anything, so without this the grass, the heather and
  // the flock's own grazing test all walk straight out onto the water.
  const onTarn = (x: number, z: number): boolean => {
    const landmass = archipelago.field.landmassAt(x, z)
    const tarn     = landmass?.survey.tarn

    if (!tarn)
      return false

    return tarn.claimAt(x - landmass.origin.x, z - landmass.origin.z) > 0
  }

  const atTarnMargin = (x: number, z: number): boolean => {
    const landmass = archipelago.field.landmassAt(x, z)
    const tarn     = landmass?.survey.tarn

    if (!tarn || tarn.claimAt(x - landmass.origin.x, z - landmass.origin.z) <= 0)
      return false

    const over = archipelago.field.heightAt(x, z) - tarn.level

    return over > -MARGIN_DEPTH && over < MARGIN_RISE
  }

  // The cutting is the one zone here that is defined by what has been *removed*
  // rather than by what stands on it, and it still has to be a zone: nothing
  // that scatters asks the placement solver anything, so without this the
  // heather grows on a floor whose heather is stacked in ricks at the end of it.
  const onPeat = (x: number, z: number): boolean => {
    const landmass = archipelago.field.landmassAt(x, z)
    const peat     = landmass?.survey.peat

    if (!peat)
      return false

    return peat.claimAt(x - landmass.origin.x, z - landmass.origin.z) > 0
  }

  // The tread is spoken-for ground, not merely a stripe of terrain paint.
  const clear = (x: number, z: number): boolean =>
    onYard(x, z) === 0 && !onTrack(x, z) && !onPath(x, z) &&
    onPlot(x, z) === 0 && onPasture(x, z) === 0 && !onBeacon(x, z) && !onTarn(x, z) &&
    !onPeat(x, z)

  return {
    onYard, onTrack, onPath, onPlot, onPasture, onBeacon, onTarn, atTarnMargin, onPeat, clear,
  }
}

/** Pure acceptance rules shared by every archipelago-wide scatter batch. */
export function createScatterRules (
  config:      ScapeConfig,
  archipelago: ArchipelagoSurvey,
  field:       HeightField,
  rng:         SeededRng,
  zones:       DressingZones,
) {
  const { onYard, onTrack, onPath, onPlot, onPasture, onBeacon, onTarn, clear } = zones
  const heightAt                                                                = field.heightAt
  const water                                                                   = config.terrain.waterLevel

  return {
    conifer: (biasScale: number, minLift: number, maxSlope: number) =>
      (x: number, z: number): boolean => {
        const landmass = archipelago.field.landmassAt(x, z)

        if (!landmass || !clear(x, z))
          return false
        if (heightAt(x, z) < water + minLift || field.slopeAt(x, z) > maxSlope)
          return false

        const localX = x - landmass.origin.x
        const localZ = z - landmass.origin.z
        const bias   = landmass.config.layout.forestBias * biasScale

        return rng.next() < 0.46 + bias * ridgeInfluence(
          landmass.survey.layout,
          localX,
          localZ,
        )
      },

    // Stones stay out of the pasture: the ones that were in it are the wall.
    stoneRule: (minLift: number) => (x: number, z: number): boolean =>
      onYard(x, z) === 0 && !onTrack(x, z) && !onPath(x, z) && onPasture(x, z) === 0 &&
      !onBeacon(x, z) && !onTarn(x, z) && heightAt(x, z) > water + minLift,

    openGround: (minLift: number, maxSlope: number) => (x: number, z: number): boolean =>
      clear(x, z) && heightAt(x, z) > water + minLift && field.slopeAt(x, z) < maxSlope,

    // Juniper takes the dry upland heath the trees leave open: higher than the
    // shore scrub, off the composition, and onto rockier, steeper ground than a
    // spruce will root on — which is what keeps it out on the moor rather than in
    // among the forest. The roll thins it toward the open ground the heather
    // already claims, so the two read as one plant community.
    juniperRule: (x: number, z: number): boolean => {
      const height = heightAt(x, z)

      if (!clear(x, z) || height < water + 1.6 || field.slopeAt(x, z) > 0.95)
        return false

      return rng.next() < 0.55 + 0.35 * Math.min(1, (height - water - 1.6) / 4)
    },

    beachRule: (maxSlope: number) => (x: number, z: number): boolean => {
      const height   = heightAt(x, z)
      const landmass = archipelago.field.landmassAt(x, z)
      const shore    = landmass?.config.terrain.shoreBand ?? config.terrain.shoreBand

      return height > water - 0.05 && height < water + shore * 0.7 &&
        field.slopeAt(x, z) < maxSlope && !onTrack(x, z) && !onPath(x, z)
    },

    birchRule (x: number, z: number): boolean {
      const height = heightAt(x, z)
      return clear(x, z) && height > water + 0.6 && height < water + 4.6
    },

    plotEdge: (x: number, z: number): boolean =>
      onPlot(x, z) > 0.5 && !onPath(x, z) && heightAt(x, z) > water + 0.8,

    /** Inside the wall, and off anything too steep to have been mown. */
    inPasture: (x: number, z: number): boolean =>
      onPasture(x, z) > 0.3 && field.slopeAt(x, z) < 0.5,

    inYard: (x: number, z: number): boolean =>
      onYard(x, z) > 0.12 && !onTrack(x, z) && !onPath(x, z) && heightAt(x, z) > water + 0.8,
  }
}
