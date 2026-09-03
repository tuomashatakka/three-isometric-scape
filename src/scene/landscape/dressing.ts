import { Group, Mesh } from 'three'
import type { BufferGeometry, InstancedMesh } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { SeededRng } from 'threejs-scene'

import { createPlacementField, mergeGeometryList, scatterInstances } from 'threejs-scene/modules/assets'
import type { ScapeConfig } from '../config.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import type { PropName } from '../props/index.ts'
import type { ScapeMaterials } from '../props/material.ts'
import { Ploppable, baseFootprint } from '../props/ploppable.ts'
import type { Footprint } from '../props/ploppable.ts'
import { BEACON_SINK } from '../props/beacon.ts'
import { MILL_SINK } from '../props/mill.ts'
import type { AtmosphereQuality } from '../quality.ts'
import type { TiltWeight } from './align.ts'
import type { ArchipelagoSurvey, LandmassSurvey } from './archipelago.ts'
import { BEACON_FOOTING } from './beacon.ts'
import { BOATHOUSE_CLEARING, NET_RACK_CLEARING, boathouseSpot, netRackSpot } from './landing.ts'
import type { Spot } from './landing.ts'
import { createGroundContact, findCrossing, isFoliage, trackPointNear } from './dressing-helpers.ts'
import { raiseEnclosures } from './dressing-enclosures.ts'
import type { Walling } from './dressing-enclosures.ts'
import { createScatterRules, createZoneTests } from './dressing-zones.ts'
import { createGrazingTest, planGrazing } from './grazing.ts'
import { yawAlong } from './layout.ts'
import type { Plot, Vec2 } from './layout.ts'
import { createDiscSampler, createSkerrySampler, createSpotSampler, createTreadSampler } from './samplers.ts'


export interface Dressing {
  object: Group
  dispose(): void
}

interface ScatterSampling {
  sample?:     () => Vec2
  quota?:      readonly (() => Vec2)[]
  claimScale?: number
}

const TAU = Math.PI * 2

/**
 * How much of the ground's lean each family of prop takes.
 *
 * Five answers rather than one, because "does this thing stand plumb" is a
 * question about what the thing *is*. See `align.ts` for the rotation itself.
 */
const TILT = {

  /** Stone. It was left where it rolled and it is lying on the hill entirely. */
  loose: 1,

  /** Timber the sea or the wind put down, which is nearly the same thing. */
  fallen: 0.85,

  /**
   * Set down by somebody, on whatever ground they had.
   *
   * The dead spruce is in here rather than with the growing ones on purpose: a
   * trunk that is still alive corrects toward the light every year, and one that
   * is not has stopped.
   */
  placed: 0.55,

  /** Grows toward the light whatever it is rooted in, and mostly wins. */
  rooted: 0.28,

  /**
   * On four legs — the one thing in the scape that levels itself.
   *
   * Not zero, though. An animal on a hillside stands square to gravity and
   * *reads* as leaning slightly into the slope, because its legs are shorter
   * uphill than down; taking none of the ground's lean at all is what makes a
   * sheep on a bank look like a sheep hovering beside one.
   */
  footed: 0.2,
} as const

/**
 * How much ground a plinth is willing to bridge, in metres.
 *
 * A foundation exists to take up the difference between a level floor and
 * ground that is not; past about a metre it stops reading as a foundation and
 * starts reading as a building on stilts. That is a siting problem, and the
 * honest fix is to move the building rather than to grow more stone under it.
 */
const PLINTH_REACH = 1.1

/**
 * A near-white tint. `scatterInstances` multiplies it into the baked vertex
 * colours, so staying close to white varies the shade of a prop rather than
 * repainting it.
 */
function shade (rng: SeededRng, low: number, high: number): string {
  const value   = Math.round(rng.range(low, high) * 255)
  const clamped = Math.min(255, Math.max(0, value)).toString(16)
    .padStart(2, '0')
  return `#${clamped}${clamped}${clamped}`
}

function createDressingSampling (
  config:      ScapeConfig,
  archipelago: ArchipelagoSurvey,
  rng:         SeededRng,
) {
  const sampleSpot = createSpotSampler(archipelago, rng)
  const pastures   = archipelago.landmasses.flatMap(landmass => {
    const pasture = landmass.survey.layout.pasture

    return pasture
      ? [{
        x:      pasture.x + landmass.origin.x,
        z:      pasture.z + landmass.origin.z,
        radius: pasture.radius,
      }]
      : []
  })
  const yards = archipelago.landmasses.map(landmass => ({
    x:      landmass.survey.layout.yard.x + landmass.origin.x,
    z:      landmass.survey.layout.yard.z + landmass.origin.z,
    radius: landmass.survey.layout.yard.radius * 0.72,
  }))
  const harbours = archipelago.landmasses.flatMap(landmass => {
    const harbour = landmass.survey.harbour

    return harbour
      ? [{
        x:      harbour.x + landmass.origin.x,
        z:      harbour.z + landmass.origin.z,
        radius: 30,
      }]
      : []
  })
  // The flocks are surveyed, not sampled: `grazing.ts` walks out from each yard
  // and hands back the discs of hill a farm would turn its stock out onto. What
  // the dressing does with them is what it does with the pasture — one sampler
  // over all of them, and one per flock so every farm keeps its own sheep.
  const grazings      = planGrazing(archipelago, config)
  const samplePasture = createDiscSampler(rng, pastures)
  const sampleYard    = createDiscSampler(rng, yards)
  const sampleHarbour = createDiscSampler(rng, harbours)
  const sampleGrazing = createDiscSampler(rng, grazings)
  const pastureQuota  = pastures.map(feature => createDiscSampler(rng, [ feature ]))
  const grazingQuota  = grazings.map(feature => createDiscSampler(rng, [ feature ]))
  const yardQuota     = yards.map(feature => createDiscSampler(rng, [ feature ]))
  const harbourQuota  = harbours.map(feature => createDiscSampler(rng, [ feature ]))
  const homeArea      = config.terrain.size ** 2

  // Weighted by each island's own `detail`, which is what keeps a landmass of
  // ten times the area from multiplying every budget in the scape by ten. A
  // budget is a count, so leaving this alone would not have thinned the outer
  // islands — it would have thickened the whole archipelago, and put the
  // placement solver, which is O(claims) per attempt, through six times the work
  // for ground the camera rarely reaches.
  const areaScale     = archipelago.landmasses.reduce(
    (total, landmass) => total + landmass.config.terrain.size ** 2 * landmass.detail,
    0,
  ) / homeArea

  return {
    sampleSpot,
    samplePasture,
    sampleYard,
    sampleHarbour,
    sampleGrazing,
    pastureQuota,
    yardQuota,
    harbourQuota,
    grazingQuota,
    grazings,
    areaScale,
  }
}

/**
 * Everything that stands on the ground.
 *
 * Two placement strategies, chosen by what the prop is for:
 *
 * - **Structural** props (trees, boulders, bales) go through
 *   `createPlacementField`, which enforces mutual spacing. That matters — two
 *   spruces in the same square metre read as a mistake.
 * - **Ground cover** (grass, crops, cobbles) uses a plain jittered scatter with
 *   no mutual test at all. Overlap is invisible at this density and the solver's
 *   spacing check is O(claims) per attempt, so routing nine hundred grass tufts
 *   through it would cost more than the rest of the build put together.
 */
export function createDressing (
  config:       ScapeConfig,
  archipelago:  ArchipelagoSurvey,
  materials:    ScapeMaterials,
  quality:      AtmosphereQuality,
): Dressing {
  const root = new Group()
  root.name  = 'scape-dressing'

  const rng              = createSeededRng(config.seed).fork('dressing')
  const palette          = resolvePalette()
  const { field, paths } = archipelago
  const extent           = archipelago.size * 0.49
  const water            = config.terrain.waterLevel
  const owned            = {
    geometries: [] as BufferGeometry[],
    instances:  [] as InstancedMesh[],
  }
  const plopped: Ploppable[] = []
  const {
    sampleSpot,
    samplePasture,
    sampleYard,
    sampleHarbour,
    sampleGrazing,
    pastureQuota,
    yardQuota,
    harbourQuota,
    grazingQuota,
    grazings,
    areaScale,
  }              = createDressingSampling(config, archipelago, rng)
  // Where anything standing on the ground meets it, and which way that ground
  // faces. All three live next door in `dressing-helpers.ts`, because none of
  // them is about dressing — they are facts about the terrain as drawn.
  const { heightAt, surfaceAt, standing } = createGroundContact(
    config,
    archipelago,
    quality.terrainSegments,
  )

  // `spread` is which world the count is a count *of*. Almost everything is
  // dressing islands, so island area is the default. The guard is not: sixteen
  // chains are thrown whatever the archipelago's area, so a budget aimed at the
  // rocks that took `areaScale` would be multiplied by five islands it has
  // nothing to do with. Naming the scale is cheaper than discovering it as
  // five times the weed nobody asked for.
  const budget   = (count: number, spread = areaScale): number =>
    Math.max(
      archipelago.landmasses.length,
      Math.round(count * quality.scatterScale * spread),
    )

  const solver = createPlacementField({
    rng:       rng.fork('solver'),
    extent,
    heightAt,
    minHeight: water + 0.3,
  })

  // ---- feature tests -------------------------------------------------------

  const zones                                                       = createZoneTests(archipelago)
  const { onTrack, onPath, onPlot, onPasture, atTarnMargin, clear } = zones

  // ---- hero props ----------------------------------------------------------

  const heroes: BufferGeometry[] = []

  /** Where the harbours ended up, so their shallows can be dressed as their own. */
  const harbourAnchors: Vec2[] = []

  /**
   * `variant` is for the props there is more than one of. Every hero is built
   * from a fork named after the prop, which is what keeps one seed giving one
   * farmhouse — and which would otherwise give a churchyard fourteen copies of
   * the same stone, leaning the same way.
   */
  function placeHero (
    name:  PropName,
    x:     number,
    z:     number,
    angle: number,
    sink = 0.12,
    variant = '',
  ): void {
    const geometry = buildProp(name, rng.fork(`hero-${name}${variant}`), palette)
    geometry.rotateY(angle)
    geometry.translate(x, heightAt(x, z) - sink, z)
    heroes.push(geometry)
  }

  function placeHeroAt (name: PropName, x: number, y: number, z: number, angle: number): void {
    const geometry = buildProp(name, rng.fork(`hero-${name}`), palette)
    geometry.rotateY(angle)
    geometry.translate(x, y, z)
    heroes.push(geometry)
  }

  /** The drop across a building's footprint, which is the plinth it would need. */
  function plinthFor (footprint: Footprint, x: number, z: number, angle: number): number {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    let low  = Infinity
    let high = heightAt(x, z)

    for (let step = 0; step < 16; step += 1) {
      const around = step / 16 * TAU
      const lx     = footprint.x + Math.cos(around) * footprint.halfW
      const lz     = footprint.z + Math.sin(around) * footprint.halfD
      const level  = heightAt(x + lx * cos - lz * sin, z + lx * sin + lz * cos)

      low  = Math.min(low, level)
      high = Math.max(high, level)
    }

    return high - low
  }

  /**
   * Walk a building in from where it was wanted to where it can stand.
   *
   * The upland barn is the case this exists for. `findPasture` measures the
   * roughness of the meadow at 0.55 of its radius, and the barn was then set at
   * 0.68 — out past the ground that was actually tested, with a footprint that
   * reaches past the wall on top of that. On this island that left two thirds of
   * it over the shoulder where the pasture falls away, needing three and a half
   * metres of plinth: a stone tower with a hay barn on it.
   *
   * So the spot is *found* rather than asserted, the way every other placement
   * in this scape is. It gives up the offset before it gives up standing on the
   * ground, and if nothing on the line qualifies it takes the flattest of them
   * rather than refusing to build the barn.
   *
   * **Only for buildings nothing is routed to.** The five steading buildings
   * must not use this: their doorstep paths are traced in `survey.ts` from
   * `steadingPlaces`, before any of this runs, so a building that moved here
   * would leave its path leading to where it used to be. The upland barn is
   * safe because the meadow's path is worn to the *gateway* in the wall, which
   * is a fact about the pasture and not about the barn inside it.
   */
  function standable (footprint: Footprint, x: number, z: number, angle: number, toward: Vec2): Vec2 {
    let best     = { x, z }
    let bestDrop = Infinity

    for (let step = 0; step <= 10; step += 1) {
      const t    = step / 10
      const cx   = x + (toward.x - x) * t
      const cz   = z + (toward.z - z) * t
      const drop = plinthFor(footprint, cx, cz, angle)

      if (drop < bestDrop) {
        bestDrop = drop
        best     = { x: cx, z: cz }
      }

      // Far enough in. Keeping the barn as near the wall as it can honestly
      // stand is the whole point of walking rather than jumping to the middle.
      if (drop <= PLINTH_REACH)
        return { x: cx, z: cz }
    }

    return best
  }

  /**
   * A building, stood on ground-following footings.
   *
   * The five buildings are the only props that leave the merged steading draw,
   * and they earn it: a merged geometry is baked at build time and can only
   * ever sit at one height, while a {@link Ploppable} resolves its own floor
   * from the footprint and grows a foundation down onto whatever is under it.
   * Five extra draws against the same material is not a state change.
   */
  function raiseBuilding (
    name:   PropName,
    x:      number,
    z:      number,
    angle:  number,
    toward: Vec2 | null = null,
  ): void {
    const geometry = buildProp(name, rng.fork(`hero-${name}`), palette)

    // What the building stands on, not what it reaches over. Measured from the
    // geometry at its base rather than from the bounding box, because a roof
    // overhang put the plinth a quarter of a metre outside the aitta's walls
    // and levelled the floor against ground no wall of it touches.
    const footprint = baseFootprint(geometry)
    const site      = toward ? standable(footprint, x, z, angle, toward) : { x, z }

    x = site.x
    z = site.z

    const body         = new Mesh(geometry, materials.ground)
    body.name          = name
    body.castShadow    = true
    body.receiveShadow = true

    const prop = new Ploppable(name, heightAt)
    prop.addPart('body', body)
    prop.plop(x, z, {
      angle,
      footprint:  { ...footprint, halfW: footprint.halfW * 0.9, halfD: footprint.halfD * 0.9 },
      skirt:      materials.ground,
      skirtColor: palette.granite,
    })

    root.add(prop)
    plopped.push(prop)

    // The claim still answers to the whole prop, roof included — two barns that
    // do not overlap at the sill can still overlap at the eaves.
    geometry.computeBoundingBox()

    const bounds = geometry.boundingBox
    const reach  = bounds
      ? Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) * 0.5
      : 3

    solver.reserve(x, z, reach + 1.4)
  }

  /**
   * The buildings, arranged around the yard so they face each other.
   *
   * The arrangement itself lives in `steading.ts`, because the footpaths are
   * worn between these places and are painted into the ground before any of
   * this is raised on it. Two copies of the arrangement is how a path ends up
   * leading to where the barn used to be.
   */
  function raiseSteading (landmass: LandmassSurvey): void {
    const { farmhouse, barn, aitta, woodshed, sauna, well, cart, logPile, flagpole } =
      landmass.survey.places
    const { x: ox, z: oz } = landmass.origin

    raiseBuilding('farmhouse', farmhouse.x + ox, farmhouse.z + oz, farmhouse.angle)
    raiseBuilding('barn', barn.x + ox, barn.z + oz, barn.angle + 0.4)
    raiseBuilding('aitta', aitta.x + ox, aitta.z + oz, aitta.angle)
    raiseBuilding('woodshed', woodshed.x + ox, woodshed.z + oz, woodshed.angle)
    raiseBuilding('sauna', sauna.x + ox, sauna.z + oz, sauna.angle)

    placeHero('well', well.x + ox, well.z + oz, rng.range(0, TAU))
    placeHero('flagpole', flagpole.x + ox, flagpole.z + oz, 0)
    placeHero('cart', cart.x + ox, cart.z + oz, rng.range(0, TAU))
    placeHero('logPile', logPile.x + ox, logPile.z + oz, rng.range(0, TAU))

    for (const anchor of [ well, logPile ])
      solver.reserve(anchor.x + ox, anchor.z + oz, 4)

    // The hay rack belongs beside a field, not in the yard.
    const firstPlot: Plot | undefined = landmass.survey.layout.plots[0]
    if (firstPlot) {
      const rackX = firstPlot.x + ox + Math.cos(firstPlot.rotation) * (firstPlot.halfW + 1.6)
      const rackZ = firstPlot.z + oz + Math.sin(firstPlot.rotation) * (firstPlot.halfW + 1.6)
      placeHero('hayRack', rackX, rackZ, firstPlot.rotation + Math.PI / 2)
      solver.reserve(rackX, rackZ, 5)
    }
  }

  /** The things that answer to the terrain rather than to the yard. */
  function raiseOutlying (landmass: LandmassSurvey): void {
    const { survey, config: localConfig } = landmass
    const { layout }                      = survey
    const { x: ox, z: oz }                = landmass.origin

    // Track furniture: a gate where the track reaches the yard, a mailbox beside it.
    const gateSpot = trackPointNear(layout, layout.yard.radius * 1.05)
    if (gateSpot) {
      placeHero('gate', gateSpot.x + ox, gateSpot.z + oz, gateSpot.angle + Math.PI / 2)
      placeHero(
        'mailbox',
        gateSpot.x + ox + Math.cos(gateSpot.angle) * 2.1,
        gateSpot.z + oz + Math.sin(gateSpot.angle) * 2.1,
        gateSpot.angle,
      )
    }

    // The jetty and the route consume the same surveyed landing. A static
    // rowboat no longer lives here; the shared fleet owns every hull.
    const shore = survey.landing
    if (shore) {
      const shoreX = shore.x + ox
      const shoreZ = shore.z + oz

      placeHeroAt('jetty', shoreX, water + 0.05, shoreZ, yawAlong(shore.angle))
      solver.reserve(shoreX, shoreZ, 7)
    }

    if (survey.harbour)
      raiseHarbour(survey.harbour)

    // The smokehouse, up the bank from the boats. Plopped rather than merged
    // into the steading draw, for the reason the five farmstead buildings are:
    // a shore bank slopes, and a merged geometry is baked at build time and can
    // only ever sit at one height. Its own socle takes up what is left of the
    // fall the site search already refused to exceed.
    if (survey.smokehouse) {
      const { x, z, angle } = survey.smokehouse

      raiseBuilding('smokehouse', x + ox, z + oz, angle)
    }

    // The windmill, out on the shoulder the survey found for it. Merged rather
    // than plopped, unlike the five farmstead buildings: a mill stands on four
    // dry-laid piers and the search already refused ground the trestle could
    // not sit level on, so there is nothing here for a cut foundation to do.
    // The reserve is what it does need — the solver has no idea the mill exists,
    // and a spruce grown inside the sail sweep is a spruce being turned into
    // firewood four times a minute.
    if (layout.mill) {
      const millX = layout.mill.x + ox
      const millZ = layout.mill.z + oz

      placeHero('windmill', millX, millZ, yawAlong(layout.mill.bearing), MILL_SINK)
      solver.reserve(millX, millZ, config.mill.sailSpan * 0.5 + 1)
    }

    // The light, out on whichever rock the survey found furthest from the
    // island. Merged like the mill and for the same reason — a tower on a
    // levelled plinth of its own would sit on a shelf cut into a skerry that is
    // barely wider than the plinth. The reserve keeps the storm boulders clear
    // of the driftwood and the pines the scatter would otherwise seed on top of
    // them; nothing is routed to it, because a seamark is reached by boat.
    if (survey.beacon) {
      const beaconX = survey.beacon.x + ox
      const beaconZ = survey.beacon.z + oz

      placeHero('lighthouse', beaconX, beaconZ, yawAlong(survey.beacon.bearing), BEACON_SINK)
      solver.reserve(beaconX, beaconZ, BEACON_FOOTING + 1.2)
    }

    // A bridge only earns its place where the track has something to cross.
    const crossing = findCrossing(layout, survey.field, localConfig)
    if (crossing) {
      placeHeroAt(
        'bridge',
        crossing.x + ox,
        crossing.deck,
        crossing.z + oz,
        crossing.angle,
      )
      solver.reserve(crossing.x + ox, crossing.z + oz, 4)
    }

    /**
     * The boat harbour, in the next cove along from the landing.
     *
     * The boathouse is anchored to the *water* level rather than plopped onto
     * the terrain the way the five farmstead buildings are: its floor is a deck
     * on piles and its slipway runs out under the surface, so a foundation cut
     * into the bank would bury exactly the part that has to be open to the lake.
     */
    function raiseHarbour (bank: Spot): void {
      const bearing = bank.angle
      const bankX   = bank.x + ox
      const bankZ   = bank.z + oz
      const house   = boathouseSpot(bank)
      const rack    = netRackSpot(bank)

      harbourAnchors.push({ x: bankX, z: bankZ })
      placeHeroAt('boathouse', house.x + ox, water + 0.05, house.z + oz, yawAlong(bearing))
      solver.reserve(house.x + ox, house.z + oz, BOATHOUSE_CLEARING)

      // The rack dries nets on dry ground behind the shed, never in the shallows.
      if (heightAt(rack.x + ox, rack.z + oz) > water + 0.5) {
        placeHero('netRack', rack.x + ox, rack.z + oz, yawAlong(bearing))
        solver.reserve(rack.x + ox, rack.z + oz, NET_RACK_CLEARING)
      }
    }
  }

  /**
   * Collapse every hero prop into one geometry.
   *
   * They are static and always in frame, so per-object culling buys nothing —
   * and one merged draw beats fifteen.
   */
  function mergeSteading (): void {
    if (heroes.length === 0)
      return

    const merged = mergeGeometryList(heroes, false)
    for (const geometry of heroes)
      geometry.dispose()

    merged.computeBoundingSphere()

    const steading         = new Mesh(merged, materials.ground)
    steading.name          = 'farmstead'
    steading.castShadow    = true
    steading.receiveShadow = true

    // Every building in it is baked into the merged geometry at its own place,
    // so the mesh holding them all sits at the origin and never leaves.
    steading.updateMatrix()
    steading.matrixAutoUpdate = false
    root.add(steading)
    owned.geometries.push(merged)
  }

  // What the walls and fences reach back through. Assembled rather than closed
  // over, because the enclosures moved out to their own module the run the
  // churchyard arrived — see `dressing-enclosures.ts`.
  const walling: Walling = {
    heightAt,
    waterLevel: water,
    rng,
    palette,
    reserve:    (x, z, radius) => solver.reserve(x, z, radius),
    addHero:    geometry => heroes.push(geometry),
    placeHero,
    raiseBuilding,
  }

  for (const landmass of archipelago.landmasses) {
    raiseSteading(landmass)
    raiseOutlying(landmass)
    raiseEnclosures(landmass, walling)
  }
  mergeSteading()

  // ---- structural scatter --------------------------------------------------
  //
  // The solver owns the claims registry; the candidate loop lives here. That
  // split is deliberate: `place()` claims a spot the moment it satisfies the
  // *query*, so a caller that then rejects it on its own rules — a slope test,
  // a ridge-density roll — leaves a claim behind that blocks everyone else. A
  // few hundred of those and the field is saturated with nothing in it. So the
  // rules are tested first and only an accepted spot is `reserve()`d.

  function tryPlace (
    radius:     number,
    accept:     (x: number, z: number) => boolean,
    attempts = 26,
    sample = sampleSpot,
    claimScale = 1,
  ): Vec2 | null {
    const spacingClear = (x: number, z: number): boolean =>
      solver.claims.every(claim =>
        Math.hypot(claim.x - x, claim.z - z) > claim.radius * claimScale + radius)

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const { x, z } = sample()

      if (!accept(x, z) || !spacingClear(x, z))
        continue

      solver.reserve(x, z, radius)
      return { x, z }
    }
    return null
  }

  const {
    conifer, stoneRule, openGround, beachRule, birchRule, juniperRule, plotEdge, inPasture, inYard,
  } = createScatterRules(config, archipelago, field, rng, zones)

  // The same predicate the flocks were sited with — see `grazing.ts`. The
  // survey answers *where* the ground is; this answers whether one dart thrown
  // at it landed on grass rather than in the beck running through it.
  const onGrazing = createGrazingTest(archipelago, config, zones)

  /** Populate the ground, biggest footprints first. */
  function dressGround (): void {
    // Standing water off the harbour. Tied to the harbour rather than to the
    // waterline in general: a stake belongs to the people who drove it.
    const harbourShallows = (x: number, z: number): boolean => {
      if (!harbourAnchors.some(anchor => Math.hypot(x - anchor.x, z - anchor.z) <= 30))
        return false

      const height = heightAt(x, z)
      return height < water - 0.25 && height > water - 1.7
    }

    // Biggest footprints first — a field already full of saplings has no room
    // left for a boulder, and the reverse is never a problem.
    scatterStructural('erratic', config.dressing.erratic, 1.6, stoneRule(0.2), 0.7, 1.4, 40, {}, TILT.loose)
    scatterStructural('cairn', config.dressing.cairn, 1.3, stoneRule(0.6), 0.85, 1.2, 40, {}, TILT.placed)
    scatterStructural('pine', config.dressing.pine, 0.9, conifer(0.7, 2.4, 0.6), 0.7, 1.35, 40, {}, TILT.rooted)
    scatterStructural('spruce', config.dressing.spruce, 0.6, conifer(1, 1, 0.7), 0.62, 1.5, 40, {}, TILT.rooted)
    scatterStructural('birch', config.dressing.birch, 0.7, birchRule, 0.68, 1.3, 40, {}, TILT.rooted)
    scatterStructural('deadSpruce', config.dressing.deadSpruce, 0.6, conifer(0.5, 0.8, 0.9), 0.6, 1.2, 40, {}, TILT.placed)
    scatterStructural('juniper', config.dressing.juniper, 0.55, juniperRule, 0.7, 1.35, 34, {}, TILT.rooted)
    scatterStructural('hayBale', config.dressing.hayBale, 1, plotEdge, 0.85, 1.15, 90, {}, TILT.placed)
    scatterStructural(
      'barrel',
      config.dressing.barrel,
      0.5,
      inYard,
      0.85,
      1.1,
      90,
      { sample: sampleYard, quota: yardQuota, claimScale: 0.55 },
    )
    scatterStructural(
      'firewood',
      config.dressing.firewood,
      0.7,
      inYard,
      0.9,
      1.1,
      90,
      { sample: sampleYard, quota: yardQuota, claimScale: 0.55 },
    )
    scatterStructural('fieldStone', config.dressing.fieldStone, 0.45, stoneRule(-0.4), 0.7, 1.5, 30, {}, TILT.loose)
    scatterStructural('driftwood', config.dressing.driftwood, 0.7, beachRule(0.4), 0.75, 1.3, 30, {}, TILT.fallen)
    scatterStructural(
      'mooringPost',
      config.dressing.mooringPost,
      1.1,
      harbourShallows,
      0.8,
      1.2,
      34,
      { sample: sampleHarbour, quota: harbourQuota, claimScale: 0.5 },
    )
    // Sampled from the pasture's own disc: forty darts thrown at the island
    // land inside a twelve-metre circle about once, and none of those ones
    // survive the barn's claim on the middle of it.
    scatterStructural(
      'hayPole',
      config.dressing.hayPole,
      0.8,
      inPasture,
      0.85,
      1.15,
      40,
      { sample: samplePasture, quota: pastureQuota, claimScale: 0.35 },
    )
    scatterStructural('sapling', config.dressing.sapling, 0.35, openGround(0.5, 0.95), 0.7, 1.5, 30, {}, TILT.rooted)
    scatterStructural('stump', config.dressing.stump, 0.35, openGround(0.6, 0.85), 0.75, 1.4, 30, {}, TILT.rooted)

    // ---- ground cover --------------------------------------------------------

    scatterCover('grass', config.dressing.grass, (x, z) => {
      const height = heightAt(x, z)
      return height > water + 0.2 && !onTrack(x, z) && !onPath(x, z) &&
        (onPlot(x, z) === 0 || rng.next() > 0.75)
    }, 0.6, 1.5, 0, 16, true, sampleSpot, TILT.rooted)

    scatterCover('heather', config.dressing.heather, (x, z) => {
      const height = heightAt(x, z)
      return height > water + 2.6 && clear(x, z)
    }, 0.7, 1.4, 0, 16, true, sampleSpot, TILT.rooted)

    // The one cover the pasture keeps: a mown hay meadow is the flowers.
    scatterCover('wildflower', config.dressing.wildflower, (x, z) => {
      const height = heightAt(x, z)
      return height > water + 0.5 && (clear(x, z) && height < water + 4.5 || onPasture(x, z) > 0.25)
    }, 0.7, 1.5, 0, 16, true, sampleSpot, TILT.rooted)

    // The shore and the scree: wherever the turf never took, the stone under it
    // is what shows. Not foliage, whatever the default says — a cobble that
    // takes the wind sway is a cobble that rocks in the breeze.
    scatterCover('cobble', config.dressing.cobble, (x, z) => {
      const height = heightAt(x, z)
      return height < water + 0.7 || field.slopeAt(x, z) > 0.5
    }, 0.7, 1.4, 0, 16, false, sampleSpot, TILT.loose)

    // The paving. Sampled along the legs themselves rather than thrown at the
    // island, so the whole budget lands on the tread — which is the difference
    // between a path that has stones on it and a path that is made of them.
    const sampleTread = createTreadSampler(paths, rng.fork('tread'))

    if (sampleTread)
      scatterCover('cobble', config.dressing.pathStone, onPath, 0.42, 0.95, 0, 4, false, sampleTread, TILT.loose)

    // Two waterlines now, and the rule says so rather than pretending there is
    // one: the sea's own band, and the band round a pool four metres above it.
    // The same plant grows in both, which is the point — a reed bed is what
    // tells a reader that the disc up on the shoulder is water at all.
    scatterCover('reeds', config.dressing.reeds, (x, z) => {
      const height = heightAt(x, z)
      return height > water - 0.55 && height < water + 0.3 || atTarnMargin(x, z)
    }, 0.7, 1.5, 0, 30, true, sampleSpot, TILT.rooted)

    scatterCover('lilyPads', config.dressing.lilyPads, (x, z) => {
      const height = heightAt(x, z)
      return height < water - 0.3 && height > water - 1.8
    }, 0.8, 1.4, water + 0.02, 30)

    scatterCover('crop', config.dressing.crop, (x, z) =>
      onPlot(x, z) > 0.35 && heightAt(x, z) > water + 0.6, 0.85, 1.15, 0, 90, true, sampleSpot, TILT.rooted)

    // The tidal band on the rocks out in the open water. Its own sampler for the
    // reason the paving has one, and its own scale for the reason `budget` now
    // takes one. The two bands are height tests and nothing else — no rule
    // anywhere says "this is a skerry", because the sampler has already decided
    // that and the height decides the rest. Which is what lets the same two
    // bands dress an island shore the day somebody points them at one.
    const sampleSkerry = createSkerrySampler(archipelago.skerries, rng.fork('skerry'))

    // No rocks, no tidal band, and no second switch anywhere that says so.
    if (sampleSkerry) {
      const { weedDepth, weedRise, lichenBase, wrack, crust } = config.littoral

      scatterCover('bladderwrack', wrack, (x, z) => {
        const height = heightAt(x, z)
        return height > water - weedDepth && height < water + weedRise
      }, 0.7, 1.4, 0, 24, true, sampleSkerry, TILT.rooted, 1)

      // Stone rather than foliage, for the reason the cobbles are: lichen that
      // took the wind sway would be a crust breathing on the rock it grew to.
      scatterCover('rockLichen', crust, (x, z) =>
        heightAt(x, z) > water + lichenBase, 0.75, 1.45, 0, 24, false, sampleSkerry, TILT.loose, 1)
    }

    // ---- the flock -----------------------------------------------------------

    // Last, and that is not a taste decision. Placement draws from one shared
    // rng — the yaw, the scale, the tint and every dart the sampler throws —
    // so a scatter inserted in the middle of this function shifts the stream
    // every batch after it reads from, and a run that added forty sheep moved
    // every tree, stone and tuft in the archipelago by a metre. The flock goes
    // on the end, where it disturbs nothing, and the solver has by then
    // reserved every trunk and boulder the animals have to keep clear of.
    //
    // The flock, on the ground the survey found for it. Sampled from the flock
    // discs rather than from the island: rough grazing is a few hundred square
    // metres of a landmass that is tens of thousands, so darts thrown at the
    // island put a budget of seventy sheep on the hill as seven. A quota per
    // flock keeps every farm's stock at its own farm, and the lambs draw from
    // the same discs, so they come up among the ewes rather than in a field of
    // their own.
    //
    // The count is scaled by the *flocks* rather than by island area, for the
    // reason the guard's weed is scaled by the rocks: a budget aimed at ground
    // the survey found is a count of what stands on that ground. Taking
    // `areaScale` here multiplied ten ewes by a seven-island archipelago the
    // ground had nothing to do with, and asked seven metres of hillside to hold
    // seventy animals — which the spacing solver then spent four hundred
    // rejected darts declining to do.
    scatterStructural(
      'sheep',
      config.dressing.sheep,
      0.9,
      onGrazing,
      0.92,
      1.08,
      40,
      { sample: sampleGrazing, quota: grazingQuota, claimScale: 0.5 },
      TILT.footed,
      grazings.length,
    )
    scatterStructural(
      'lamb',
      config.dressing.lamb,
      0.6,
      onGrazing,
      0.88,
      1.12,
      40,
      { sample: sampleGrazing, quota: grazingQuota, claimScale: 0.5 },
      TILT.footed,
      grazings.length,
    )
  }

  dressGround()

  // ---- helpers -------------------------------------------------------------

  function stamp (
    name:  PropName,
    count: number,
    place: Parameters<typeof scatterInstances>[0]['place'],
    foliage = false,
  ): InstancedMesh {
    const geometry = buildProp(name, rng.fork(`scatter-${name}`), palette)
    const { mesh } = scatterInstances({
      geometry,
      material: foliage ? materials.foliage : materials.ground,
      count,
      place,
    })

    mesh.name          = name
    mesh.frustumCulled = false

    // The placements live in the instance matrices; the mesh carrying them is a
    // fixed point at the origin.
    mesh.updateMatrix()
    mesh.matrixAutoUpdate = false
    owned.geometries.push(geometry)
    owned.instances.push(mesh)
    return mesh
  }

  function scatterStructural (
    name:     PropName,
    count:    number,
    radius:   number,
    accept:   (x: number, z: number) => boolean,
    minScale: number,
    maxScale: number,
    attempts = 26,
    sampling: ScatterSampling = {},
    tilt: TiltWeight = 0,
    spread?: number,
  ): void {
    const total  = budget(count, spread)
    const sample = sampling.sample ?? sampleSpot
    let placement = 0

    root.add(stamp(name, total, () => {
      const quota  = sampling.quota
      const chosen = quota && quota.length > 0
        ? quota[placement % quota.length]
        : sample

      placement += 1

      const spot = tryPlace(
        radius,
        accept,
        attempts,
        chosen,
        sampling.claimScale,
      )

      if (!spot)
        return null

      const yaw = rng.range(0, TAU)

      // A quarter of the sink it used to take. The height is the drawn surface
      // now rather than the field it was sampled from, so what is left is
      // contact rather than compensation.
      return {
        at:     [ spot.x, surfaceAt(spot.x, spot.z) - 0.025, spot.z ],
        rotate: standing(spot.x, spot.z, yaw, tilt),
        scale:  rng.range(minScale, maxScale),
        tint:   shade(rng, 0.86, 1.1),
      }
    }, isFoliage(name)))
  }

  function scatterCover (
    name:     PropName,
    count:    number,
    accept:   (x: number, z: number) => boolean,
    minScale: number,
    maxScale: number,
    fixedY:   number,
    attempts = 16,
    foliage = true,
    sample = sampleSpot,
    tilt: TiltWeight = 0,
    spread?: number,
  ): void {
    const total = budget(count, spread)
    root.add(stamp(name, total, () => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const { x, z } = sample()

        if (!accept(x, z))
          continue

        const yaw = rng.range(0, TAU)

        // Anything with a fixed height is floating on the water rather than
        // lying on the ground, so it takes no tilt whatever it was asked for —
        // a lily pad on a slope is a lily pad on a hill.
        return {
          at:     [ x, fixedY || surfaceAt(x, z) - 0.02, z ],
          rotate: standing(x, z, yaw, fixedY ? 0 : tilt),
          scale:  rng.range(minScale, maxScale),
          tint:   shade(rng, 0.84, 1.12),
        }
      }
      return null
    }, foliage))
  }

  return {
    object: root,

    dispose () {
      for (const prop of plopped)
        prop.dispose()
      plopped.length = 0

      for (const mesh of owned.instances)
        mesh.dispose()
      owned.instances.length = 0

      root.removeFromParent()
      root.clear()
      for (const geometry of owned.geometries)
        geometry.dispose()
      owned.geometries.length = 0
    },
  }
}

// perf: one merged draw for the whole steading, one InstancedMesh per scattered
// prop type. Structural props pay the solver's spacing check; ground cover does
// not, which is the difference between a 40 ms build and a 4 s one.
