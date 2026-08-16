import type { SeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import type { HeightField } from './height.ts'
import { distanceToTrack, pastureInfluence, plotInfluence, ridgeInfluence } from './layout.ts'


/** The bare middle of a worn path, excluding its thinning verge. */
const TREAD = 0.55

export interface DressingZones {
  onYard(x: number, z: number): number
  onTrack(x: number, z: number): boolean
  onPath(x: number, z: number): boolean
  onPlot(x: number, z: number): number
  onPasture(x: number, z: number): number
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

  // The tread is spoken-for ground, not merely a stripe of terrain paint.
  const clear = (x: number, z: number): boolean =>
    onYard(x, z) === 0 && !onTrack(x, z) && !onPath(x, z) &&
    onPlot(x, z) === 0 && onPasture(x, z) === 0

  return { onYard, onTrack, onPath, onPlot, onPasture, clear }
}

/** Pure acceptance rules shared by every archipelago-wide scatter batch. */
export function createScatterRules (
  config:      ScapeConfig,
  archipelago: ArchipelagoSurvey,
  field:       HeightField,
  rng:         SeededRng,
  zones:       DressingZones,
) {
  const { onYard, onTrack, onPath, onPlot, onPasture, clear } = zones
  const heightAt                                              = field.heightAt
  const water                                                 = config.terrain.waterLevel

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
      heightAt(x, z) > water + minLift,

    openGround: (minLift: number, maxSlope: number) => (x: number, z: number): boolean =>
      clear(x, z) && heightAt(x, z) > water + minLift && field.slopeAt(x, z) < maxSlope,

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
