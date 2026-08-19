import type { ScapeConfig } from '../config.ts'
import { resolveIsles } from './height.ts'
import type { HeightField, IsleSite } from './height.ts'
import type { Vec2 } from './path.ts'


/**
 * Which rock carries the light.
 *
 * The farm is sited by shelter, the mill by wind and the landing by depth. A
 * seamark answers to none of those: it is put on the *last* thing a boat passes
 * on its way in, which on this coast means the outermost rock in the ring that
 * is big enough to hold masonry and high enough to keep it dry. So the search
 * scores reach from the island's own centre and pays for nothing else — the
 * ground the tower needs is a threshold, not a preference.
 *
 * Pure, and in the landmass's local frame like every other survey: the caller
 * projects it into the world. See `survey.ts`.
 */
export interface BeaconSite extends Vec2 {

  /** Ground height under the plinth, in metres. */
  level: number

  /** Metres of rock between the plinth and the water. */
  freeboard: number

  /**
   * Bearing the door faces, in radians.
   *
   * Landward — back toward the island the light is warning boats off. Which is
   * also the only side of a skerry anybody lands a boat on. Feed it to `yawAlong`
   * for the yaw the tower is raised with.
   */
  bearing: number

  /** Metres from the island's centre. The reason this rock and not another. */
  reach: number

  /** Index of the islet in `terrain.isles`, so the map tools can name it. */
  isle: number
}

/**
 * How much rock the footing claims, in metres.
 *
 * The plinth is 2.44 across at its widest and the storm boulders are piled out
 * past that, so this is the boulders' reach rather than the tower's — a spruce
 * seeded inside it would be growing out of the pile. Held in step with the
 * geometry by the test in `props/beacon.test.ts`.
 */
export const BEACON_FOOTING = 3.6

/** How many bearings the footing is checked on before the tower is allowed up. */
const FOOTING_PROBES = 8

/** How many probes look for the islet's crown, and how far out they reach. */
const CROWN_PROBES = 6
const CROWN_REACH  = 0.3

/**
 * The highest dry point near the middle of an islet.
 *
 * The crown is searched for rather than assumed at the centre, because the
 * islet's plateau carries the same detail fBm as the mainland and its high point
 * is a metre or two off the disc's middle. A tower on the true crown is a tower
 * whose gallery clears the rock behind it.
 */
export function beaconCrown (field: HeightField, isle: IsleSite): Vec2 & { level: number } {
  const { x, z } = isle
  let best       = { x, z, level: field.heightAt(x, z) }

  for (let step = 0; step < CROWN_PROBES; step += 1) {
    const around = step / CROWN_PROBES * Math.PI * 2
    const px     = x + Math.cos(around) * isle.radius * CROWN_REACH
    const pz     = z + Math.sin(around) * isle.radius * CROWN_REACH
    const level  = field.heightAt(px, pz)

    if (level > best.level)
      best = { x: px, z: pz, level }
  }

  return best
}

/** Whether the whole footing stands out of the water, not just its middle. */
export function footingIsDry (field: HeightField, x: number, z: number, waterLevel: number): boolean {
  for (let step = 0; step < FOOTING_PROBES; step += 1) {
    const around = step / FOOTING_PROBES * Math.PI * 2

    if (field.heightAt(
      x + Math.cos(around) * BEACON_FOOTING,
      z + Math.sin(around) * BEACON_FOOTING,
    ) <= waterLevel)
      return false
  }

  return true
}

/**
 * Site the light, or decide the archipelago has nowhere to put one.
 *
 * @returns `null` when no islet is both broad enough and dry enough — an island
 *   with no offshore rocks gets no lighthouse rather than one standing in the
 *   sea. `terrain.isles` is empty on every landmass but the home one, so this is
 *   the ordinary answer rather than the exceptional one.
 */
export function findBeaconSite (config: ScapeConfig, field: HeightField): BeaconSite | null {
  const { waterLevel }         = config.terrain
  const { minRock, freeboard } = config.beacon
  let best: BeaconSite | null = null

  for (const [ index, isle ] of resolveIsles(config).entries()) {
    if (isle.radius < minRock)
      continue

    const reach = Math.hypot(isle.x, isle.z)

    // Scored before the ground is sampled, because the ground is the expensive
    // half: a rock further in than the one already found cannot win however dry
    // it is.
    if (best && reach <= best.reach)
      continue

    const crown = beaconCrown(field, isle)
    const clear = crown.level - waterLevel

    if (clear < freeboard || !footingIsDry(field, crown.x, crown.z, waterLevel))
      continue

    best = {
      x:         crown.x,
      z:         crown.z,
      level:     crown.level,
      freeboard: clear,
      bearing:   Math.atan2(-crown.z, -crown.x),
      reach,
      isle:      index,
    }
  }

  return best
}
