import { Group, Mesh } from 'three'
import type { BufferGeometry, InstancedMesh } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { SeededRng } from 'threejs-scene'

import { createPlacementField, mergeGeometryList, scatterInstances } from 'threejs-scene/modules/assets'
import type { ScapeConfig } from '../config.ts'
import { buildFenceRun } from '../props/fence.ts'
import type { FencePoint } from '../props/fence.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import type { PropName } from '../props/index.ts'
import type { ScapeMaterials } from '../props/material.ts'
import { Ploppable } from '../props/ploppable.ts'
import { buildStoneWallRun } from '../props/wall.ts'
import type { AtmosphereQuality } from '../quality.ts'
import type { Creek } from './creek.ts'
import type { Footpaths } from './footpath.ts'
import type { HeightField } from './height.ts'
import { findHarbourBank, findLanding } from './landing.ts'
import type { Spot } from './landing.ts'
import { distanceToTrack, pastureInfluence, plotInfluence, ridgeInfluence, yawAlong } from './layout.ts'
import type { Plot, ScapeLayout, Vec2 } from './layout.ts'
import { steadingPlaces } from './steading.ts'


export interface Dressing {
  object: Group
  dispose(): void
}

const TAU = Math.PI * 2

/**
 * How worn the ground has to be before it counts as a path.
 *
 * The middle of the tread, and not the verge: a footpath is bare down the middle
 * and thinning grass either side, so the exclusion has to stop well short of
 * where the wear does. Set at the verge instead, eight routes converging on one
 * well clear the grass off most of a farmyard — which is a bald patch, not a
 * network of paths.
 */
const TREAD = 0.55

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
  config:    ScapeConfig,
  layout:    ScapeLayout,
  field:     HeightField,
  paths:     Footpaths,
  materials: ScapeMaterials,
  quality:   AtmosphereQuality,
): Dressing {
  const root = new Group()
  root.name  = 'scape-dressing'

  const rng                     = createSeededRng(config.seed).fork('dressing')
  const palette                 = resolvePalette()
  const extent                  = config.terrain.size * 0.47
  const water                   = config.terrain.waterLevel
  const owned: BufferGeometry[] = []
  const plopped: Ploppable[]    = []
  const places                  = steadingPlaces(layout.yard)
  const sampleSpot              = createSpotSampler(config, layout, rng, extent)
  const samplePasture           = createDiscSampler(rng, layout.pasture)

  const heightAt = field.heightAt
  const budget   = (count: number): number => Math.max(1, Math.round(count * quality.scatterScale))

  const solver = createPlacementField({
    rng:       rng.fork('solver'),
    extent,
    heightAt,
    minHeight: water + 0.3,
  })

  // ---- feature tests -------------------------------------------------------

  const { onYard, onTrack, onPath, onPlot, onPasture, clear } = createZoneTests(layout, paths)

  // ---- hero props ----------------------------------------------------------

  const heroes: BufferGeometry[] = []

  /** Where the harbour ended up, so its shallows can be dressed as its own. */
  let harbourAnchor: Vec2 | null = null

  function placeHero (name: PropName, x: number, z: number, angle: number, sink = 0.12): void {
    const geometry = buildProp(name, rng.fork(`hero-${name}`), palette)
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

  /**
   * A building, stood on ground-following footings.
   *
   * The five buildings are the only props that leave the merged steading draw,
   * and they earn it: a merged geometry is baked at build time and can only
   * ever sit at one height, while a {@link Ploppable} resolves its own floor
   * from the footprint and grows a foundation down onto whatever is under it.
   * Five extra draws against the same material is not a state change.
   */
  function raiseBuilding (name: PropName, x: number, z: number, angle: number): void {
    const geometry = buildProp(name, rng.fork(`hero-${name}`), palette)
    geometry.computeBoundingBox()

    const bounds = geometry.boundingBox
    const halfW  = bounds ? (bounds.max.x - bounds.min.x) * 0.5 : 3
    const halfD  = bounds ? (bounds.max.z - bounds.min.z) * 0.5 : 3

    const body         = new Mesh(geometry, materials.ground)
    body.name          = name
    body.castShadow    = true
    body.receiveShadow = true

    const prop = new Ploppable(name, heightAt)
    prop.addPart('body', body)
    prop.plop(x, z, {
      angle,
      footprint:  [ halfW * 0.9, halfD * 0.9 ],
      skirt:      materials.ground,
      skirtColor: palette.granite,
    })

    root.add(prop)
    plopped.push(prop)
    solver.reserve(x, z, Math.max(halfW, halfD) + 1.4)
  }

  /**
   * The buildings, arranged around the yard so they face each other.
   *
   * The arrangement itself lives in `steading.ts`, because the footpaths are
   * worn between these places and are painted into the ground before any of
   * this is raised on it. Two copies of the arrangement is how a path ends up
   * leading to where the barn used to be.
   */
  function raiseSteading (): void {
    const { farmhouse, barn, aitta, woodshed, sauna, well, cart, logPile, flagpole } = places

    raiseBuilding('farmhouse', farmhouse.x, farmhouse.z, farmhouse.angle)
    raiseBuilding('barn', barn.x, barn.z, barn.angle + 0.4)
    raiseBuilding('aitta', aitta.x, aitta.z, aitta.angle)
    raiseBuilding('woodshed', woodshed.x, woodshed.z, woodshed.angle)
    raiseBuilding('sauna', sauna.x, sauna.z, sauna.angle)

    placeHero('well', well.x, well.z, rng.range(0, TAU))
    placeHero('flagpole', flagpole.x, flagpole.z, 0)
    placeHero('cart', cart.x, cart.z, rng.range(0, TAU))
    placeHero('logPile', logPile.x, logPile.z, rng.range(0, TAU))

    for (const anchor of [ well, logPile ])
      solver.reserve(anchor.x, anchor.z, 4)

    // The hay rack belongs beside a field, not in the yard.
    const firstPlot: Plot | undefined = layout.plots[0]
    if (firstPlot) {
      const rackX = firstPlot.x + Math.cos(firstPlot.rotation) * (firstPlot.halfW + 1.6)
      const rackZ = firstPlot.z + Math.sin(firstPlot.rotation) * (firstPlot.halfW + 1.6)
      placeHero('hayRack', rackX, rackZ, firstPlot.rotation + Math.PI / 2)
      solver.reserve(rackX, rackZ, 5)
    }
  }

  /** The things that answer to the terrain rather than to the yard. */
  function raiseOutlying (): void {
    // Track furniture: a gate where the track reaches the yard, a mailbox beside it.
    const gateSpot = trackPointNear(layout, layout.yard.radius * 1.05)
    if (gateSpot) {
      placeHero('gate', gateSpot.x, gateSpot.z, gateSpot.angle + Math.PI / 2)
      placeHero(
        'mailbox',
        gateSpot.x + Math.cos(gateSpot.angle) * 2.1,
        gateSpot.z + Math.sin(gateSpot.angle) * 2.1,
        gateSpot.angle,
      )
    }

    // The jetty reaches from the nearest shoreline out over the water — the same
    // landing the footpath down from the yard was worn to, because both ask
    // `landing.ts` rather than each other.
    const shore = findLanding(layout, field, config)
    if (shore) {
      placeHeroAt('jetty', shore.x, water + 0.05, shore.z, yawAlong(shore.angle))
      placeHeroAt(
        'rowboat',
        shore.x + Math.cos(shore.angle) * 4.2 + Math.cos(shore.angle + Math.PI / 2) * 1.7,
        water - 0.12,
        shore.z + Math.sin(shore.angle) * 4.2 + Math.sin(shore.angle + Math.PI / 2) * 1.7,
        yawAlong(shore.angle + rng.range(-0.3, 0.3)),
      )
      solver.reserve(shore.x, shore.z, 7)
      harbourAnchor = { x: shore.x, z: shore.z }
      raiseHarbour(shore)
    }

    // A bridge only earns its place where the track has something to cross.
    const crossing = findCrossing(layout, field, config)
    if (crossing) {
      placeHeroAt('bridge', crossing.x, crossing.deck, crossing.z, crossing.angle)
      solver.reserve(crossing.x, crossing.z, 4)
    }

    /**
     * The boat harbour, in the next cove along from the landing.
     *
     * The boathouse is anchored to the *water* level rather than plopped onto
     * the terrain the way the five farmstead buildings are: its floor is a deck
     * on piles and its slipway runs out under the surface, so a foundation cut
     * into the bank would bury exactly the part that has to be open to the lake.
     * It is pushed a little seaward of the bank for the same reason — the back
     * of the shed cuts into the slope, which is where a real one is dug in.
     */
    function raiseHarbour (landing: Spot): void {
      const bearing = landing.angle + config.layout.harbourSpread * Math.PI / 180
      const bank    = findHarbourBank(layout, field, config, landing)

      if (!bank)
        return

      const houseX = bank.x + Math.cos(bearing) * 1.8
      const houseZ = bank.z + Math.sin(bearing) * 1.8

      placeHeroAt('boathouse', houseX, water + 0.05, houseZ, yawAlong(bearing))
      solver.reserve(houseX, houseZ, 8)

      // The rack dries nets on dry ground behind the shed, never in the shallows.
      const rackX = bank.x - Math.cos(bearing) * 5
      const rackZ = bank.z - Math.sin(bearing) * 5

      if (heightAt(rackX, rackZ) > water + 0.5) {
        placeHero('netRack', rackX, rackZ, yawAlong(bearing))
        solver.reserve(rackX, rackZ, 4)
      }
    }
  }

  /**
   * The upland pasture: a drystone wall around the hay meadow, a barn inside it
   * and a gate where the wall is left open toward the farm.
   *
   * The wall is a hero geometry like the fencing, so the whole enclosure costs
   * no draw call of its own — and it is *reserved against* rather than merely
   * built, because the solver has no idea it exists and would otherwise stand a
   * spruce in the middle of it.
   */
  function raiseUpland (): void {
    const { pasture } = layout

    if (!pasture)
      return

    const gap                = config.layout.pastureGateway * Math.PI / 180
    const arc                = TAU - gap
    const stones             = Math.max(12, Math.round(pasture.radius * arc / 2))
    const line: FencePoint[] = []

    for (let step = 0; step <= stones; step += 1) {
      const angle = pasture.gateway + gap / 2 + arc * (step / stones)
      line.push({
        x: pasture.x + Math.cos(angle) * pasture.radius,
        z: pasture.z + Math.sin(angle) * pasture.radius,
      })
    }

    const wall = buildStoneWallRun({
      points:    line,
      heightAt,
      rng:       rng.fork('pasture-wall'),
      palette,
      minHeight: water + 0.6,
    })

    if (wall)
      heroes.push(wall)

    // Just wide enough to keep a trunk out of the stones. The claims reach
    // inward as well as out, and an enclosure this size has very little middle
    // left once the barn has taken its own — reserve generously here and the
    // meadow ends up walled, barned and empty.
    for (const point of line)
      solver.reserve(point.x, point.z, 1.2)

    // The gate stands in the gap, across it — the same relationship the track's
    // gate has to the track, which is why it takes the same quarter turn.
    placeHero(
      'gate',
      pasture.x + Math.cos(pasture.gateway) * pasture.radius,
      pasture.z + Math.sin(pasture.gateway) * pasture.radius,
      pasture.gateway + Math.PI / 2,
    )

    // The barn goes at the back of the enclosure with its doorway looking down
    // at the farm, so the gateway, the yard and the barn door all line up.
    //
    // Hard against the back wall, not halfway out: a building's claim on the
    // solver is a circle around its longest half, which on an enclosure this
    // size is most of the enclosure. Set back it leans that circle onto the
    // wall's own claims, and the meadow keeps a middle to stand hay in.
    const barnAngle = pasture.gateway + Math.PI

    raiseBuilding(
      'meadowBarn',
      pasture.x + Math.cos(barnAngle) * pasture.radius * 0.68,
      pasture.z + Math.sin(barnAngle) * pasture.radius * 0.68,
      yawAlong(pasture.gateway),
    )
  }

  /**
   * Fence the field plots.
   *
   * One continuous run per plot rather than a row of identical segment props:
   * `buildFenceRun` sets each post at its own ground height and spans the rails
   * between them, so the fence follows the terrain instead of floating over it.
   * The runs join the hero merge, so all the fencing in the scape costs nothing
   * beyond the steading's single draw.
   */
  function raiseFences (): void {
    for (const [ index, plot ] of layout.plots.entries()) {
      const run = buildFenceRun({
        points:    plotOutline(plot),
        heightAt,
        rng:       rng.fork(`fence-${index}`),
        palette,
        spacing:   config.layout.fenceSpacing,
        closed:    true,
        minHeight: water + 0.4,
      })

      if (run)
        heroes.push(run)
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
    owned.push(merged)
  }

  raiseSteading()
  raiseOutlying()
  raiseUpland()
  raiseFences()
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
    radius:   number,
    accept:   (x: number, z: number) => boolean,
    attempts = 26,
    sample = sampleSpot,
  ): Vec2 | null {
    const spacingClear = (x: number, z: number): boolean =>
      solver.claims.every(claim => Math.hypot(claim.x - x, claim.z - z) > claim.radius + radius)

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
    conifer, stoneRule, openGround, beachRule, birchRule, plotEdge, inPasture, inYard,
  } = createScatterRules(config, layout, field, rng, { onYard, onTrack, onPath, onPlot, onPasture, clear })

  /** Populate the ground, biggest footprints first. */
  function dressGround (): void {
    const forestBias = config.layout.forestBias

    /**
     * Standing water off the harbour.
     *
     * Tied to the harbour rather than to the waterline in general: a stake
     * belongs to the people who drove it, and a ring of them around every islet
     * in the archipelago would say the opposite.
     */
    const harbourShallows = (x: number, z: number): boolean => {
      if (!harbourAnchor || Math.hypot(x - harbourAnchor.x, z - harbourAnchor.z) > 30)
        return false

      const height = heightAt(x, z)
      return height < water - 0.25 && height > water - 1.7
    }

    // Biggest footprints first — a field already full of saplings has no room
    // left for a boulder, and the reverse is never a problem.
    scatterStructural('erratic', config.dressing.erratic, 1.6, stoneRule(0.2), 0.7, 1.4, 40)
    scatterStructural('cairn', config.dressing.cairn, 1.3, stoneRule(0.6), 0.85, 1.2, 40)
    scatterStructural('pine', config.dressing.pine, 0.9, conifer(forestBias * 0.7, 2.4, 0.6), 0.7, 1.35, 40)
    scatterStructural('spruce', config.dressing.spruce, 0.6, conifer(forestBias, 1, 0.7), 0.62, 1.5, 40)
    scatterStructural('birch', config.dressing.birch, 0.7, birchRule, 0.68, 1.3, 40)
    scatterStructural('deadSpruce', config.dressing.deadSpruce, 0.6, conifer(0.5, 0.8, 0.9), 0.6, 1.2, 40)
    scatterStructural('hayBale', config.dressing.hayBale, 1, plotEdge, 0.85, 1.15, 90)
    scatterStructural('barrel', config.dressing.barrel, 0.5, inYard, 0.85, 1.1, 90)
    scatterStructural('firewood', config.dressing.firewood, 0.7, inYard, 0.9, 1.1, 90)
    scatterStructural('fieldStone', config.dressing.fieldStone, 0.45, stoneRule(-0.4), 0.7, 1.5, 30)
    scatterStructural('driftwood', config.dressing.driftwood, 0.7, beachRule(0.4), 0.75, 1.3, 30)
    scatterStructural('mooringPost', config.dressing.mooringPost, 1.1, harbourShallows, 0.8, 1.2, 34)
    // Sampled from the pasture's own disc: forty darts thrown at the island
    // land inside a twelve-metre circle about once, and none of those ones
    // survive the barn's claim on the middle of it.
    scatterStructural('hayPole', config.dressing.hayPole, 0.8, inPasture, 0.85, 1.15, 40, samplePasture)
    scatterStructural('sapling', config.dressing.sapling, 0.35, openGround(0.5, 0.95), 0.7, 1.5, 30)
    scatterStructural('stump', config.dressing.stump, 0.35, openGround(0.6, 0.85), 0.75, 1.4, 30)

    // ---- ground cover --------------------------------------------------------

    scatterCover('grass', config.dressing.grass, (x, z) => {
      const height = heightAt(x, z)
      return height > water + 0.2 && !onTrack(x, z) && !onPath(x, z) &&
        (onPlot(x, z) === 0 || rng.next() > 0.75)
    }, 0.6, 1.5, 0)

    scatterCover('heather', config.dressing.heather, (x, z) => {
      const height = heightAt(x, z)
      return height > water + 2.6 && clear(x, z)
    }, 0.7, 1.4, 0)

    // The one cover the pasture keeps: a mown hay meadow is the flowers.
    scatterCover('wildflower', config.dressing.wildflower, (x, z) => {
      const height = heightAt(x, z)
      return height > water + 0.5 && (clear(x, z) && height < water + 4.5 || onPasture(x, z) > 0.25)
    }, 0.7, 1.5, 0)

    // The one cover a path gains rather than loses. Take the turf off a hillside
    // and what is under it is the same stone the cobbles already are, so the
    // tread is where they surface — which is also what keeps a worn path from
    // reading as a stripe of flat colour at close zoom.
    scatterCover('cobble', config.dressing.cobble, (x, z) => {
      const height = heightAt(x, z)
      return height < water + 0.7 || field.slopeAt(x, z) > 0.5 || onPath(x, z)
    }, 0.7, 1.4, 0)

    scatterCover('reeds', config.dressing.reeds, (x, z) => {
      const height = heightAt(x, z)
      return height > water - 0.55 && height < water + 0.3
    }, 0.7, 1.5, 0, 30)

    scatterCover('lilyPads', config.dressing.lilyPads, (x, z) => {
      const height = heightAt(x, z)
      return height < water - 0.3 && height > water - 1.8
    }, 0.8, 1.4, water + 0.02, 30)

    scatterCover('crop', config.dressing.crop, (x, z) =>
      onPlot(x, z) > 0.35 && heightAt(x, z) > water + 0.6, 0.85, 1.15, 0, 90)
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
    owned.push(geometry)
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
    sample = sampleSpot,
  ): void {
    const total = budget(count)
    root.add(stamp(name, total, () => {
      const spot = tryPlace(radius, accept, attempts, sample)

      if (!spot)
        return null

      return {
        at:     [ spot.x, heightAt(spot.x, spot.z) - 0.1, spot.z ],
        rotate: [ 0, rng.range(0, TAU), 0 ],
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
  ): void {
    const total = budget(count)
    root.add(stamp(name, total, () => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const { x, z } = sampleSpot()

        if (!accept(x, z))
          continue

        return {
          at:     [ x, fixedY || heightAt(x, z) - 0.06, z ],
          rotate: [ 0, rng.range(0, TAU), 0 ],
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

      root.removeFromParent()
      root.clear()
      for (const geometry of owned)
        geometry.dispose()
      owned.length = 0
    },
  }
}

const FOLIAGE: ReadonlySet<string> = new Set([
  'spruce', 'pine', 'birch', 'sapling', 'grass', 'heather', 'wildflower', 'reeds', 'crop', 'lilyPads',
])

function isFoliage (name: PropName): boolean {
  return FOLIAGE.has(name)
}

/**
 * A candidate-point generator, biased onto land.
 *
 * Candidates are drawn from the main island *or* from one of the islets rather
 * than uniformly over the whole field: the field is mostly open sea, and a
 * uniform disc throws most of every attempt budget into the water — the island
 * thins out to prove it. Writes into a caller-owned scratch, because this runs
 * tens of thousands of times at build.
 */
function createSpotSampler (
  config: ScapeConfig,
  layout: ScapeLayout,
  rng:    SeededRng,
  extent: number,
): () => Vec2 {
  const half  = config.terrain.size * 0.5
  const spot  = { x: 0, z: 0 }
  const isles = config.terrain.isles.map(isle => ({
    x:      isle.x * half,
    z:      isle.z * half,
    radius: isle.radius * half,
  }))
  const mainReach = Math.min(layout.landRadius * 1.22, extent)

  return () => {
    const isle     = isles.length > 0 && rng.next() < 0.17 ? rng.pick(isles) : null
    const angle    = rng.next() * TAU
    const distance = Math.sqrt(rng.next()) * (isle ? isle.radius * 1.08 : mainReach)

    spot.x = (isle?.x ?? 0) + Math.cos(angle) * distance
    spot.z = (isle?.z ?? 0) + Math.sin(angle) * distance
    return spot
  }
}

/**
 * What each kind of scattered prop will accept as ground.
 *
 * Module-level and taking the zone tests as an argument, because a rule is a
 * pure question about a coordinate — it reads the terrain and the composition
 * and touches neither the solver nor the scene. Keeping them out here is also
 * what stops `createDressing` from becoming a single function with the whole
 * ecology inlined into it.
 *
 * `conifer` is the exception that has to share the caller's `rng`: it rolls for
 * density per candidate, so drawing from a second stream would reshuffle every
 * placement made after it.
 */
function createScatterRules (
  config: ScapeConfig,
  layout: ScapeLayout,
  field:  HeightField,
  rng:    SeededRng,
  zones:  ReturnType<typeof createZoneTests>,
) {
  const { onYard, onTrack, onPath, onPlot, onPasture, clear } = zones

  const heightAt = field.heightAt
  const water    = config.terrain.waterLevel

  return {
    conifer: (bias: number, minLift: number, maxSlope: number) =>
      (x: number, z: number): boolean => {
        if (!clear(x, z))
          return false
        if (heightAt(x, z) < water + minLift || field.slopeAt(x, z) > maxSlope)
          return false
        return rng.next() < 0.46 + bias * ridgeInfluence(layout, x, z)
      },

    // Stones stay out of the pasture: the ones that were in it are the wall.
    stoneRule: (minLift: number) => (x: number, z: number): boolean =>
      onYard(x, z) === 0 && !onTrack(x, z) && !onPath(x, z) && onPasture(x, z) === 0 &&
      heightAt(x, z) > water + minLift,

    openGround: (minLift: number, maxSlope: number) => (x: number, z: number): boolean =>
      clear(x, z) && heightAt(x, z) > water + minLift && field.slopeAt(x, z) < maxSlope,

    beachRule: (maxSlope: number) => (x: number, z: number): boolean => {
      const height = heightAt(x, z)
      return height > water - 0.05 && height < water + config.terrain.shoreBand * 0.7 &&
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

/**
 * Candidates drawn from one small feature rather than from the whole island.
 *
 * The island-wide sampler is right for anything that belongs to the terrain and
 * hopeless for anything that belongs to a *place*: the pasture is a quarter of
 * a percent of its disc, and forty darts thrown at the island land in a twelve
 * metre circle about once. Anything scattered into a named feature gets its own
 * disc instead. Returns the origin when there is no feature — the accept rule
 * that goes with such a scatter rejects everything anyway, so nothing is placed.
 */
function createDiscSampler (rng: SeededRng, feature: Vec2 & { radius: number } | null): () => Vec2 {
  const spot = { x: 0, z: 0 }

  return () => {
    if (feature) {
      const angle    = rng.next() * TAU
      const distance = Math.sqrt(rng.next()) * feature.radius

      spot.x = feature.x + Math.cos(angle) * distance
      spot.z = feature.z + Math.sin(angle) * distance
    }

    return spot
  }
}

/** Where the authored composition already claims the ground. */
function createZoneTests (layout: ScapeLayout, paths: Footpaths) {
  const onYard = (x: number, z: number): number => {
    const distance = Math.hypot(x - layout.yard.x, z - layout.yard.z)
    return Math.max(0, 1 - distance / (layout.yard.radius * 1.1))
  }
  const onTrack = (x: number, z: number): boolean =>
    distanceToTrack(layout, x, z) < layout.track.width * 1.3
  const onPath = (x: number, z: number): boolean =>
    paths.wearAt(x, z) > TREAD
  const onPlot = (x: number, z: number): number =>
    layout.plots.reduce((claim, plot) => Math.max(claim, plotInfluence(plot, x, z)), 0)
  const onPasture = (x: number, z: number): number =>
    pastureInfluence(layout, x, z)

  // A path joins the list of things the ground is already spoken for by, which
  // is what makes it a path rather than a stripe of paint: the tread is the one
  // place a spruce, a boulder or a tuft of grass does not get to stand.
  const clear = (x: number, z: number): boolean =>
    onYard(x, z) === 0 && !onTrack(x, z) && !onPath(x, z) &&
    onPlot(x, z) === 0 && onPasture(x, z) === 0

  return { onYard, onTrack, onPath, onPlot, onPasture, clear }
}

/** The point on the track a given distance out from the yard, and its heading. */
function trackPointNear (layout: ScapeLayout, distance: number): Spot | null {
  const points = layout.track.points

  for (let index = points.length - 1; index > 0; index -= 1) {
    const point = points[index]
    const gap   = Math.hypot(point.x - layout.yard.x, point.z - layout.yard.z)

    if (gap >= distance) {
      const previous = points[index - 1]
      return {
        x:     point.x,
        z:     point.z,
        angle: Math.atan2(point.z - previous.z, point.x - previous.x),
      }
    }
  }

  return null
}

/**
 * The `y` rotation that carries a bridge along the track at a given point.
 *
 * `yawAlong`, not the bearing itself — the bridge is long in `+z`, so it has to
 * be turned the same way the jetty is or it lies across the road it carries.
 */
function trackYawAt (points: readonly Vec2[], index: number): number {
  const previous = points[Math.max(0, index - 1)]
  const point    = points[index]

  return yawAlong(Math.atan2(point.z - previous.z, point.x - previous.x))
}

/**
 * The height of the ground either side of a claimed stretch of track.
 *
 * A bridge rests on its banks, and the banks are the nearest track points the
 * channel does not claim. Sitting it on the *carved* ground under it instead
 * drops the deck into the beck it is meant to be spanning.
 */
function bankLevelAt (
  points: readonly Vec2[],
  field:  HeightField,
  creek:  Creek,
  index:  number,
): number | null {
  let total = 0
  let banks = 0

  for (const direction of [ -1, 1 ])
    for (let step = 1; step < points.length; step += 1) {
      const at = index + direction * step

      if (at < 0 || at >= points.length)
        break
      if (creek.claimAt(points[at].x, points[at].z) > 0)
        continue

      total += field.heightAt(points[at].x, points[at].z)
      banks += 1
      break
    }

  return banks > 0 ? total / banks : null
}

/** Where the track runs deepest through the beck's channel, if it does at all. */
function findBeckCrossing (
  layout: ScapeLayout,
  field:  HeightField,
  creek:  Creek,
): Spot & { deck: number } | null {
  const points = layout.track.points

  let best: { index: number, claim: number } | null = null

  for (let index = 1; index < points.length - 1; index += 1) {
    const claim = creek.claimAt(points[index].x, points[index].z)

    if (claim > 0.35 && (!best || claim > best.claim))
      best = { index, claim }
  }

  if (!best)
    return null

  const point = points[best.index]
  const bank  = bankLevelAt(points, field, creek, best.index)

  return {
    x:     point.x,
    z:     point.z,
    angle: trackYawAt(points, best.index),
    deck:  (bank ?? layout.waterLevel + 0.9) - 0.15,
  }
}

/** Where the track dips below the waterline, if it does at all. */
function findDipCrossing (
  layout: ScapeLayout,
  field:  HeightField,
  config: ScapeConfig,
): Spot & { deck: number } | null {
  const points = layout.track.points
  const water  = config.terrain.waterLevel

  let best: { index: number, height: number } | null = null

  for (let index = 1; index < points.length - 1; index += 1) {
    const height = field.heightAt(points[index].x, points[index].z)

    if (height > water + 0.45)
      continue
    if (best && height >= best.height)
      continue

    best = { index, height }
  }

  if (!best)
    return null

  const point = points[best.index]
  return { x: point.x, z: point.z, angle: trackYawAt(points, best.index), deck: water + 0.35 }
}

/**
 * Where the track has to get across something.
 *
 * The beck first, because a bridge over running water is the one a reader can
 * read. Failing that — a seed whose beck never meets the road — the old rule
 * stands and the bridge goes over the lowest dip the track takes below the
 * waterline, which is the only other place in the scape that needs one.
 */
function findCrossing (
  layout: ScapeLayout,
  field:  HeightField,
  config: ScapeConfig,
): Spot & { deck: number } | null {
  return layout.creek && findBeckCrossing(layout, field, layout.creek) ||
    findDipCrossing(layout, field, config)
}

/** The four corners of a plot, in world space and in winding order. */
function plotOutline (plot: Plot): FencePoint[] {
  const cos = Math.cos(plot.rotation)
  const sin = Math.sin(plot.rotation)

  return ([[ -1, -1 ], [ 1, -1 ], [ 1, 1 ], [ -1, 1 ]] as const).map(([ sx, sz ]) => {
    const localX = sx * plot.halfW
    const localZ = sz * plot.halfD

    return {
      x: plot.x + localX * cos - localZ * sin,
      z: plot.z + localX * sin + localZ * cos,
    }
  })
}

// perf: one merged draw for the whole steading, one InstancedMesh per scattered
// prop type. Structural props pay the solver's spacing check; ground cover does
// not, which is the difference between a 40 ms build and a 4 s one.
