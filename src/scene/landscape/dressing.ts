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
import type { AtmosphereQuality } from '../quality.ts'
import type { HeightField } from './height.ts'
import { distanceToTrack, plotInfluence, ridgeInfluence, yawAlong } from './layout.ts'
import type { Plot, ScapeLayout, Vec2 } from './layout.ts'


export interface Dressing {
  object: Group
  dispose(): void
}

interface Spot extends Vec2 {
  angle: number
}

const TAU = Math.PI * 2

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
  const sampleSpot              = createSpotSampler(config, layout, rng, extent)

  const heightAt = field.heightAt
  const budget   = (count: number): number => Math.max(1, Math.round(count * quality.scatterScale))

  const solver = createPlacementField({
    rng:       rng.fork('solver'),
    extent,
    heightAt,
    minHeight: water + 0.3,
  })

  // ---- feature tests -------------------------------------------------------

  const { onYard, onTrack, onPlot, clear } = createZoneTests(layout)

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

  /** The buildings, arranged around the yard so they face each other. */
  function raiseSteading (): void {
    const facing = Math.atan2(-layout.yard.z, -layout.yard.x)

    const around = (offset: number, distance: number): Spot => ({
      x:     layout.yard.x + Math.cos(facing + offset) * distance,
      z:     layout.yard.z + Math.sin(facing + offset) * distance,
      angle: facing + offset + Math.PI,
    })

    const house    = around(0.35, layout.yard.radius * 0.5)
    const barn     = around(-1.55, layout.yard.radius * 0.72)
    const aitta    = around(2.5, layout.yard.radius * 0.62)
    const woodshed = around(-2.7, layout.yard.radius * 0.66)
    const sauna    = around(1.55, layout.yard.radius * 0.86)

    raiseBuilding('farmhouse', house.x, house.z, house.angle)
    raiseBuilding('barn', barn.x, barn.z, barn.angle + 0.4)
    raiseBuilding('aitta', aitta.x, aitta.z, aitta.angle)
    raiseBuilding('woodshed', woodshed.x, woodshed.z, woodshed.angle)
    raiseBuilding('sauna', sauna.x, sauna.z, sauna.angle)

    const well = around(0.9, layout.yard.radius * 0.24)
    placeHero('well', well.x, well.z, rng.range(0, TAU))
    placeHero('flagpole', layout.yard.x - Math.cos(facing) * 2.2, layout.yard.z - Math.sin(facing) * 2.2, 0)

    const cart = around(-0.4, layout.yard.radius * 0.34)
    placeHero('cart', cart.x, cart.z, rng.range(0, TAU))

    const logs = around(-2.4, layout.yard.radius * 0.92)
    placeHero('logPile', logs.x, logs.z, rng.range(0, TAU))

    for (const anchor of [ well, logs ])
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

    // The jetty reaches from the nearest shoreline out over the water.
    const shore = findShore(layout, field, config)
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
      raiseHarbour(shore.angle)
    }

    // A bridge only earns its place if the track actually crosses low ground.
    const crossing = findCrossing(layout, field, config)
    if (crossing)
      placeHeroAt('bridge', crossing.x, water + 0.35, crossing.z, crossing.angle)

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
    function raiseHarbour (shoreAngle: number): void {
      const bearing = shoreAngle + config.layout.harbourSpread * Math.PI / 180
      const bank    = findBank(layout, field, config, bearing)

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
    root.add(steading)
    owned.push(merged)
  }

  raiseSteading()
  raiseOutlying()
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
  ): Vec2 | null {
    const spacingClear = (x: number, z: number): boolean =>
      solver.claims.every(claim => Math.hypot(claim.x - x, claim.z - z) > claim.radius + radius)

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const { x, z } = sampleSpot()

      if (!accept(x, z) || !spacingClear(x, z))
        continue

      solver.reserve(x, z, radius)
      return { x, z }
    }
    return null
  }

  const conifer = (bias: number, minLift: number, maxSlope: number) =>
    (x: number, z: number): boolean => {
      if (!clear(x, z))
        return false
      if (heightAt(x, z) < water + minLift || field.slopeAt(x, z) > maxSlope)
        return false
      return rng.next() < 0.46 + bias * ridgeInfluence(layout, x, z)
    }

  const stoneRule = (minLift: number) => (x: number, z: number): boolean =>
    onYard(x, z) === 0 && !onTrack(x, z) && heightAt(x, z) > water + minLift

  const openGround = (minLift: number, maxSlope: number) => (x: number, z: number): boolean =>
    clear(x, z) && heightAt(x, z) > water + minLift && field.slopeAt(x, z) < maxSlope

  const beachRule = (maxSlope: number) => (x: number, z: number): boolean => {
    const height = heightAt(x, z)
    return height > water - 0.05 && height < water + config.terrain.shoreBand * 0.7 &&
      field.slopeAt(x, z) < maxSlope && !onTrack(x, z)
  }

  const birchRule = (x: number, z: number): boolean => {
    const height = heightAt(x, z)
    return clear(x, z) && height > water + 0.6 && height < water + 4.6
  }

  const plotEdge = (x: number, z: number): boolean =>
    onPlot(x, z) > 0.5 && heightAt(x, z) > water + 0.8

  const inYard = (x: number, z: number): boolean =>
    onYard(x, z) > 0.12 && !onTrack(x, z) && heightAt(x, z) > water + 0.8

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
    scatterStructural('sapling', config.dressing.sapling, 0.35, openGround(0.5, 0.95), 0.7, 1.5, 30)
    scatterStructural('stump', config.dressing.stump, 0.35, openGround(0.6, 0.85), 0.75, 1.4, 30)

    // ---- ground cover --------------------------------------------------------

    scatterCover('grass', config.dressing.grass, (x, z) => {
      const height = heightAt(x, z)
      return height > water + 0.2 && !onTrack(x, z) && (onPlot(x, z) === 0 || rng.next() > 0.75)
    }, 0.6, 1.5, 0)

    scatterCover('heather', config.dressing.heather, (x, z) => {
      const height = heightAt(x, z)
      return height > water + 2.6 && clear(x, z)
    }, 0.7, 1.4, 0)

    scatterCover('wildflower', config.dressing.wildflower, (x, z) => {
      const height = heightAt(x, z)
      return height > water + 0.5 && height < water + 4.5 && clear(x, z)
    }, 0.7, 1.5, 0)

    scatterCover('cobble', config.dressing.cobble, (x, z) => {
      const height = heightAt(x, z)
      return height < water + 0.7 || field.slopeAt(x, z) > 0.5
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
  ): void {
    const total = budget(count)
    root.add(stamp(name, total, () => {
      const spot = tryPlace(radius, accept, attempts)

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

/** Where the authored composition already claims the ground. */
function createZoneTests (layout: ScapeLayout) {
  const onYard = (x: number, z: number): number => {
    const distance = Math.hypot(x - layout.yard.x, z - layout.yard.z)
    return Math.max(0, 1 - distance / (layout.yard.radius * 1.1))
  }
  const onTrack = (x: number, z: number): boolean =>
    distanceToTrack(layout, x, z) < layout.track.width * 1.3
  const onPlot = (x: number, z: number): number =>
    layout.plots.reduce((claim, plot) => Math.max(claim, plotInfluence(plot, x, z)), 0)
  const clear = (x: number, z: number): boolean =>
    onYard(x, z) === 0 && !onTrack(x, z) && onPlot(x, z) === 0

  return { onYard, onTrack, onPlot, clear }
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
 * Walk out from the yard on one bearing until the ground goes under, then back
 * off to where it breaks the surface again — that point is the bank.
 *
 * `distance` is where the water was *found*, not where the bank is; the shore
 * search ranks bearings by it.
 */
function findBank (
  layout: ScapeLayout,
  field:  HeightField,
  config: ScapeConfig,
  angle:  number,
): Spot & { distance: number } | null {
  const water = config.terrain.waterLevel
  const limit = config.terrain.size * 0.46

  for (let distance = 4; distance < limit; distance += 1.2) {
    const x = layout.yard.x + Math.cos(angle) * distance
    const z = layout.yard.z + Math.sin(angle) * distance

    if (Math.hypot(x, z) > limit)
      return null
    if (field.heightAt(x, z) > water - 0.6)
      continue

    let bank = distance
    while (bank > 2 && field.heightAt(
      layout.yard.x + Math.cos(angle) * bank,
      layout.yard.z + Math.sin(angle) * bank,
    ) < water + 0.1)
      bank -= 0.4

    return {
      x: layout.yard.x + Math.cos(angle) * bank,
      z: layout.yard.z + Math.sin(angle) * bank,
      angle,
      distance,
    }
  }

  return null
}

/** The nearest shoreline to the yard, facing out over open water. */
function findShore (layout: ScapeLayout, field: HeightField, config: ScapeConfig): Spot | null {
  let best: Spot & { distance: number } | null = null

  for (let step = 0; step < 48; step += 1) {
    const found = findBank(layout, field, config, step / 48 * TAU)

    if (found && (!best || found.distance < best.distance))
      best = found
  }

  return best && { x: best.x, z: best.z, angle: best.angle }
}

/** Where the track dips below the waterline, if it does at all. */
function findCrossing (layout: ScapeLayout, field: HeightField, config: ScapeConfig): Spot | null {
  const points = layout.track.points
  let best: Spot & { height: number } | null = null

  for (let index = 1; index < points.length - 1; index += 1) {
    const point  = points[index]
    const height = field.heightAt(point.x, point.z)

    if (height > config.terrain.waterLevel + 0.45)
      continue
    if (best && height >= best.height)
      continue

    const previous = points[index - 1]
    best = {
      x:     point.x,
      z:     point.z,
      angle: Math.atan2(point.z - previous.z, point.x - previous.x) + Math.PI / 2,
      height,
    }
  }

  return best && { x: best.x, z: best.z, angle: best.angle }
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
