import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { buildFenceRun } from '../props/fence.ts'
import type { FencePoint } from '../props/fence.ts'
import type { NordicPalette, PropName } from '../props/index.ts'
import { buildStoneWallRun } from '../props/wall.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { CHAPEL_FOOTING, chapelStanding } from './chapel.ts'
import type { ChapelSite } from './chapel.ts'
import { plotOutline } from './dressing-helpers.ts'
import { yawAlong } from './layout.ts'
import type { Vec2 } from './layout.ts'
import type { Standing } from './steading.ts'


/**
 * The walled ground: the hay meadow, the churchyard, and the fenced plots.
 *
 * Split out of [`dressing.ts`](dressing.ts) when the churchyard arrived and put
 * that module past its line ceiling — but the seam is not an arbitrary one. All
 * three of these are the same act: a line traced round some ground, built as one
 * hero geometry so the whole boundary costs no draw call of its own, *reserved
 * against* so the scatter does not seed a spruce through it, and left open at one
 * bearing so there is a way in. What differs between them is what the ground is
 * for, and that is the only thing the three functions below actually say.
 *
 * Everything here reaches back into the dressing through {@link Walling} rather
 * than closing over it, so the placement rules stay in one module and the reasons
 * for the walls stay in this one.
 */

/** What raising an enclosure needs of the dressing that owns the scene. */
export interface Walling {

  /** The ground as drawn, at the tessellation the tier actually built. */
  heightAt(x: number, z: number): number
  waterLevel: number

  /** The dressing's own stream. Fork it per enclosure, never draw from it. */
  rng:     SeededRng
  palette: NordicPalette

  /** Claim ground against the scatter solver. */
  reserve(x: number, z: number, radius: number): void

  /** Hand a world-space geometry to the merged steading draw. */
  addHero(geometry: BufferGeometry): void

  /** Build a prop at a point on the ground and merge it into that same draw. */
  placeHero(
    name:     PropName,
    x:        number,
    z:        number,
    angle:    number,
    sink?:    number,
    variant?: string,
  ): void

  /** Stand a building on its own ground-following footings — one more draw. */
  raiseBuilding(name: PropName, x: number, z: number, angle: number, toward?: Vec2 | null): void
}

const TAU = Math.PI * 2

/**
 * How much of the churchyard either side of the gateway is left clear of graves,
 * in radians.
 *
 * The walk from the gate to the door, and the width of it is the whole reason
 * the markers are laid out on an arc rather than on a grid: a grid puts a stone
 * across the one line of ground everybody who comes here walks along.
 */
const APPROACH = 0.6

/** A ring of stations, opened by `gap` radians on the `gateway` bearing. */
function enclosure (centre: Vec2, radius: number, gateway: number, gap: number): FencePoint[] {
  const arc                = TAU - gap
  const stones             = Math.max(12, Math.round(radius * arc / 2))
  const line: FencePoint[] = []

  for (let step = 0; step <= stones; step += 1) {
    const angle = gateway + gap / 2 + arc * (step / stones)

    line.push({
      x: centre.x + Math.cos(angle) * radius,
      z: centre.z + Math.sin(angle) * radius,
    })
  }

  return line
}

/**
 * The upland pasture: a drystone wall around the hay meadow, a barn inside it
 * and a gate where the wall is left open toward the farm.
 *
 * The wall is a hero geometry like the fencing, so the whole enclosure costs no
 * draw call of its own — and it is *reserved against* rather than merely built,
 * because the solver has no idea it exists and would otherwise stand a spruce in
 * the middle of it.
 */
function raiseUpland (landmass: LandmassSurvey, walling: Walling): void {
  const localPasture = landmass.survey.layout.pasture

  if (!localPasture)
    return

  const pasture = {
    ...localPasture,
    x: localPasture.x + landmass.origin.x,
    z: localPasture.z + landmass.origin.z,
  }
  const gap  = landmass.config.layout.pastureGateway * Math.PI / 180
  const line = enclosure(pasture, pasture.radius, pasture.gateway, gap)
  const wall = buildStoneWallRun({
    points:    line,
    heightAt:  walling.heightAt,
    rng:       walling.rng.fork(`pasture-wall-${landmass.id}`),
    palette:   walling.palette,
    minHeight: walling.waterLevel + 0.6,
  })

  if (wall)
    walling.addHero(wall)

  // Just wide enough to keep a trunk out of the stones. The claims reach inward
  // as well as out, and an enclosure this size has very little middle left once
  // the barn has taken its own — reserve generously here and the meadow ends up
  // walled, barned and empty.
  for (const point of line)
    walling.reserve(point.x, point.z, 1.2)

  // The gate stands in the gap, across it — the same relationship the track's
  // gate has to the track, which is why it takes the same quarter turn.
  walling.placeHero(
    'gate',
    pasture.x + Math.cos(pasture.gateway) * pasture.radius,
    pasture.z + Math.sin(pasture.gateway) * pasture.radius,
    pasture.gateway + Math.PI / 2,
  )

  // The barn goes at the back of the enclosure with its doorway looking down at
  // the farm, so the gateway, the yard and the barn door all line up.
  //
  // Hard against the back wall, not halfway out: a building's claim on the
  // solver is a circle around its longest half, which on an enclosure this size
  // is most of the enclosure. Set back it leans that circle onto the wall's own
  // claims, and the meadow keeps a middle to stand hay in.
  //
  // Then walked in toward the middle until the ground under the whole of it is
  // within a plinth's reach of level. The meadow is only sited for the flatness
  // of its middle, so the back of it is not ground anything was promised it
  // could stand on.
  const barnAngle = pasture.gateway + Math.PI

  walling.raiseBuilding(
    'meadowBarn',
    pasture.x + Math.cos(barnAngle) * pasture.radius * 0.68,
    pasture.z + Math.sin(barnAngle) * pasture.radius * 0.68,
    yawAlong(pasture.gateway),
    pasture,
  )
}

/**
 * The markers, in two rows round the building.
 *
 * Every one of them raised on the *chapel's* yaw rather than on its own bearing
 * from the middle, because that is what a churchyard looks like: the stones face
 * one way together, and a ring of them turned to face outward reads as a stone
 * circle. The arc starts clear of the gateway, so the walk from the gate to the
 * door is not over the plots.
 */
function raiseGraves (
  landmass:  LandmassSurvey,
  walling:   Walling,
  site:      ChapelSite,
  standing:  Standing,
  wallReach: number,
): void {
  const graves = landmass.config.chapel.graves

  if (graves <= 0)
    return

  const plots  = walling.rng.fork(`graves-${landmass.id}`)
  const rows   = 2
  const along  = Math.ceil(graves / rows)
  const band   = (wallReach - CHAPEL_FOOTING) / (rows + 1)
  const opened = site.bearing + APPROACH

  for (let index = 0; index < graves; index += 1) {
    const row    = index % rows
    const step   = Math.floor(index / rows)
    const angle  = opened + (TAU - APPROACH * 2) * ((step + 0.5) / along)
    const radius = CHAPEL_FOOTING + band * (row + 1) + plots.range(-0.3, 0.3)
    const x      = standing.x + Math.cos(angle) * radius
    const z      = standing.z + Math.sin(angle) * radius

    // Ground the parish would actually dig. A marker on the seaward lip of a
    // knoll is a marker standing in the air the moment the knoll falls away.
    if (walling.heightAt(x, z) < walling.waterLevel + 0.8)
      continue

    walling.placeHero('graveMarker', x, z, standing.angle + plots.range(-0.08, 0.08), 0.06, `-${index}`)
  }
}

/**
 * The churchyard: the chapel on its knoll, the wall round the ground it keeps, a
 * gate where that wall is left open toward the farm, and the markers.
 *
 * The chapel is the only outlying building that is *plopped* rather than merged.
 * The mill stands on four piers it can pack level and the light on a pile of
 * storm boulders, so both are happy baked at one height — a chapel stands on a
 * continuous granite socle, and the first thing a reader would notice is
 * daylight under one gable. `Ploppable` grows the foundation onto whatever is
 * actually under the sill, which is what a socle is for, and one more draw
 * against the material the whole steading already uses is not a state change.
 */
function raiseChurchyard (landmass: LandmassSurvey, walling: Walling): void {
  const site = landmass.survey.layout.chapel

  if (!site)
    return

  const standing  = chapelStanding(site, landmass.origin)
  const wallReach = Math.max(landmass.config.chapel.yardRadius, CHAPEL_FOOTING + 1.6)

  walling.raiseBuilding('chapel', standing.x, standing.z, standing.angle)

  // The same gap the pasture wall leaves, because it is the same question: how
  // much wall an enclosure gives up in order to have a gate in it. One answer,
  // in the config, rather than a second number here to drift from it.
  const gap  = landmass.config.layout.pastureGateway * Math.PI / 180
  const line = enclosure(standing, wallReach, site.bearing, gap)
  const wall = buildStoneWallRun({
    points:    line,
    heightAt:  walling.heightAt,
    rng:       walling.rng.fork(`churchyard-wall-${landmass.id}`),
    palette:   walling.palette,
    minHeight: walling.waterLevel + 0.5,
  })

  if (wall)
    walling.addHero(wall)

  // The lychgate, in the gap, across it — the same relationship the pasture's
  // gate has to its own gateway, and the same quarter turn.
  walling.placeHero(
    'gate',
    standing.x + Math.cos(site.bearing) * wallReach,
    standing.z + Math.sin(site.bearing) * wallReach,
    site.bearing + Math.PI / 2,
  )

  // Nothing grows in a churchyard that the parish did not plant. One claim over
  // the whole enclosure rather than one per stone: the markers are set inside it,
  // and a spruce seeded between two of them is a spruce grown through somebody.
  walling.reserve(standing.x, standing.z, wallReach + 1)

  raiseGraves(landmass, walling, site, standing, wallReach)
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
function raiseFences (landmass: LandmassSurvey, walling: Walling): void {
  for (const [ index, plot ] of landmass.survey.layout.plots.entries()) {
    const run = buildFenceRun({
      points: plotOutline(plot).map(point => ({
        x: point.x + landmass.origin.x,
        z: point.z + landmass.origin.z,
      })),
      heightAt:  walling.heightAt,
      rng:       walling.rng.fork(`fence-${landmass.id}-${index}`),
      palette:   walling.palette,
      spacing:   landmass.config.layout.fenceSpacing,
      closed:    true,
      minHeight: walling.waterLevel + 0.4,
    })

    if (run)
      walling.addHero(run)
  }
}

/** Every walled and fenced thing on one landmass, in the order it is built. */
export function raiseEnclosures (landmass: LandmassSurvey, walling: Walling): void {
  raiseUpland(landmass, walling)
  raiseChurchyard(landmass, walling)
  raiseFences(landmass, walling)
}
