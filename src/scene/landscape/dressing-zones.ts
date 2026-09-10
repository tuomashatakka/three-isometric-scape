import type { SeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import type { HeightField } from './height.ts'
import { BEACON_FOOTING } from './beacon.ts'
import { cragFoot } from './crag.ts'
import { duneClaim } from './dunes.ts'
import { iceClaim } from './icecap.ts'
import { distanceToTrack, pastureInfluence, plotInfluence, ridgeInfluence } from './layout.ts'
import { planTreeline, stuntedTo } from './treeline.ts'


/** The bare middle of a worn path, excluding its thinning verge. */
const TREAD = 0.55

/**
 * How much of a plant's odds a closed canopy over it takes.
 *
 * One number, used twice and in opposite directions: birch is shaded out of the
 * stands it seeded, and juniper never gets under them at all. Both are the same
 * fact about a wood — the ground inside it belongs to the spruce — so they read
 * the same knob rather than two that would drift apart.
 */
const SHADED_OUT = 0.35

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

  /**
   * How deep the blown sand is, as a fraction of the belt's own ridge.
   *
   * A depth rather than a predicate, because sand is not a boundary you are
   * inside or outside: it thins to nothing over twenty-odd metres and both
   * readers want to know how much of it there is. The marram thickens with it
   * and the ordinary sward gives out under it.
   */
  onDune(x: number, z: number): number

  /**
   * How much broken rock stands at a point, 0..1 — the talus at a crag's foot.
   *
   * Its own test rather than a slope rule, because the platform is *flat*: what
   * puts blocks on it is the face standing over it rather than the ground under
   * it, and a scatter keyed on steepness puts stones everywhere on the cliff
   * and none at the bottom of it, which is precisely backwards.
   */
  atCragFoot(x: number, z: number): number

  /** The stripped floor of a turf cutting: ground the farm has carried away. */
  onPeat(x: number, z: number): boolean

  /** Under the ice: ground that is not ground, and the only zone with no soil. */
  onIce(x: number, z: number): boolean

  /**
   * The shingle bar out to the nearest rock, and the couple of metres of skirt
   * either side of it.
   *
   * Nothing roots in it. That is a fact about the place rather than a taste
   * call — the springs close over the crest twice a month, and a heather bush
   * that spent a night a year in salt water would not be there the next.
   *
   * It is also what keeps the causeway from moving anything else in the scape.
   * Every scatter draws from one shared rng and only an *accepted* dart draws a
   * yaw, a scale and a tint, so a bar that took darts nothing had taken before
   * would shift every prop stamped after it — the same failure the roster's
   * `rng.fork(name)` rule exists to prevent, arriving through the ground instead
   * of through the roster.
   */
  onCauseway(x: number, z: number): boolean

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

  // The ice, and it is the strictest zone here: the cutting and the pool at
  // least have ground under them. Nothing grows on a glacier, nothing is stacked
  // on one and nothing walks over one, so this refuses the lot — without it the
  // scatter reads the ice surface as high, dry, gently sloping ground and plants
  // it with juniper.
  const onIce = (x: number, z: number): boolean => {
    const landmass = archipelago.field.landmassAt(x, z)

    if (!landmass)
      return false

    return iceClaim(
      landmass.config,
      x - landmass.origin.x,
      z - landmass.origin.z,
      archipelago.field.heightAt(x, z),
    ) > 0
  }

  // The sand. Loose sand is ground a plant either specialises in or fails on,
  // so a boundary would be the wrong answer twice over — the marram wants the
  // deep middle of the belt and the sward wants everything the belt has not
  // smothered.
  const onDune = (x: number, z: number): number => {
    const landmass = archipelago.field.landmassAt(x, z)
    const dunes    = landmass?.survey.dunes

    if (!dunes)
      return 0

    return duneClaim(dunes, x - landmass.origin.x, z - landmass.origin.z)
  }

  // The bottom of a cliff. A share rather than a boundary, for the reason the
  // sand is one: the scree is thickest against the face and thins across the
  // platform, so what a scatter wants is how much talus is here rather than
  // whether it is inside a line somebody drew.
  const atCragFoot = (x: number, z: number): number => {
    const landmass = archipelago.field.landmassAt(x, z)
    const crag     = landmass?.survey.crag

    if (!crag)
      return 0

    return cragFoot(crag, x - landmass.origin.x, z - landmass.origin.z)
  }

  const onCauseway = (x: number, z: number): boolean => {
    const landmass = archipelago.field.landmassAt(x, z)
    const causeway = landmass?.survey.causeway

    if (!causeway)
      return false

    return causeway.claimAt(x - landmass.origin.x, z - landmass.origin.z) > 0
  }

  // The tread is spoken-for ground, not merely a stripe of terrain paint.
  const clear = (x: number, z: number): boolean =>
    onYard(x, z) === 0 && !onTrack(x, z) && !onPath(x, z) &&
    onPlot(x, z) === 0 && onPasture(x, z) === 0 && !onBeacon(x, z) && !onTarn(x, z) &&
    !onPeat(x, z) && !onIce(x, z) && !onCauseway(x, z)

  return {
    onYard,
    onTrack,
    onPath,
    onPlot,
    onPasture,
    onBeacon,
    onTarn,
    atTarnMargin,
    onPeat,
    onIce,
    onCauseway,
    onDune,
    atCragFoot,
    clear,
  }
}

/**
 * Pure acceptance rules shared by every archipelago-wide scatter batch.
 *
 * The treeline is surveyed *here* rather than handed in, and off the composite
 * field rather than per landmass: the fetch that decides where a wood gives out
 * runs over the sea between the islands, so a shore in the lee of the next
 * island along is sheltered by ground that is not in its own patch. Everything
 * that reads it is in this file or is returned from it, which is the reason it
 * is owned here — `scape:map` runs `planTreeline` itself, against the same
 * field, and gets the same lines. See `treeline.ts`.
 */
export function createScatterRules (
  config:      ScapeConfig,
  archipelago: ArchipelagoSurvey,
  field:       HeightField,
  rng:         SeededRng,
  zones:       DressingZones,
) {
  const { onYard, onTrack, onPath, onPlot, onPasture, onBeacon, onTarn, onIce, clear } = zones
  const heightAt                                                                       = field.heightAt
  const water                                                                          = config.terrain.waterLevel
  const treeline                                                                       = planTreeline(archipelago.field, config, water)

  return {
    treeline,

    /**
     * What the ground under a spot does to the size of the tree on it, 0..1.
     *
     * The dressing's half of the treeline rule: krummholz, at the one scale this
     * scape can show it. A margin of full-height trees standing further apart
     * reads as a felled wood, so the same number that thins the scatter also
     * shortens what is left in it.
     */
    canopy: (x: number, z: number): number =>
      stuntedTo(treeline.vigourAt(x, z), config.treeline.stunt),

    /**
     * Ground the wood reaches, on top of whatever else a rule asks of it.
     *
     * For the two props that are not trees but are only there *because* trees
     * are — a seedling, and the stump of the one that was felled. Neither
     * belongs on a bare top, and both take the generic open-ground rule rather
     * than the conifer's, so the treeline is composed onto them rather than
     * folded into a rule that stones and bales also read.
     *
     * The roll comes first and is therefore always drawn. `rng` is shared, and
     * a short-circuit past a draw moves every prop stamped after this one.
     */
    inTheWood: (accept: (x: number, z: number) => boolean) =>
      (x: number, z: number): boolean =>
        rng.next() < treeline.vigourAt(x, z) && accept(x, z),

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

        // The roll is rolled either way, vigour or no vigour. `rng` is the
        // dressing's shared stream and a short-circuit here is a draw the
        // stream does not make — which moves every prop stamped after it, and
        // turns a treeline into a reshuffle of the whole archipelago. The same
        // trap `dressing.ts` documents at the causeway test.
        const roll   = rng.next()

        return roll < (0.46 + bias * ridgeInfluence(
          landmass.survey.layout,
          localX,
          localZ,
        )) * treeline.vigourAt(x, z)
      },

    // Stones stay out of the pasture: the ones that were in it are the wall.
    // The one rule that lists its zones by hand rather than taking `clear`, and
    // deliberately: a boulder is *allowed* on the ground a spruce is not — the
    // stripped floor of a peat cutting has stones in it, and the erratics were
    // dropped where they were dropped. What it may not stand on is ice, which is
    // not ground at all: an erratic on a glacier is a boulder floating twenty
    // metres over the mountain it fell off.
    stoneRule: (minLift: number) => (x: number, z: number): boolean =>
      onYard(x, z) === 0 && !onTrack(x, z) && !onPath(x, z) && onPasture(x, z) === 0 &&
      !onBeacon(x, z) && !onTarn(x, z) && !onIce(x, z) && heightAt(x, z) > water + minLift,

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

      const roll = rng.next()

      // The one rule the treeline reads *backwards*. Juniper is not a tree
      // failing to be tall — it is the plant that inherits the ground the trees
      // gave up, so the wood suppresses it and the bare tops and the salted
      // coast are where it wins. Without this the run's whole finding would have
      // been a subtraction: the summits lost their spruce and got nothing, which
      // is a clear-fell rather than a treeline.
      return roll < (0.55 + 0.35 * Math.min(1, (height - water - 1.6) / 4)) *
        (1 - SHADED_OUT * treeline.vigourAt(x, z))
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

      if (!clear(x, z) || height < water + 0.6 || height > water + 4.6)
        return false

      // Birch is the wood's pioneer: it takes the margin the spruce cannot hold
      // and gets shaded out of the closed stands behind it. So its odds rise
      // with vigour and then bend back down, which is a scatter that is thickest
      // *at* the treeline rather than under it.
      const roll   = rng.next()
      const vigour = treeline.vigourAt(x, z)

      return roll < vigour * (1 - SHADED_OUT * vigour)
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
