import { DynamicDrawUsage, InstancedMesh, Object3D, Sphere, Vector3 } from 'three'
import type { Material } from 'three'
import { createSeededRng } from 'threejs-scene'
import type { LiveConfig } from '../config.ts'
import { FLOAT_WATERLINE } from '../props/creel.ts'
import { buildProp, resolvePalette } from '../props/index.ts'
import type { TideState } from '../tide.ts'
import type { WindState } from '../wind.ts'
import { creelDepth, creelPots } from './creel.ts'
import type { CreelFleet, CreelPot } from './creel.ts'


/**
 * The floats on the creel ground, as one draw.
 *
 * The half of the fishery that has a mesh in it. `landscape/creel.ts` decides
 * which water carries gear and where every pot of it is shot; this puts one
 * `InstancedMesh` over the whole archipelago and answers, every frame, the two
 * things that change: where the sea is, and what the wind is doing to a line of
 * marks floating on it.
 *
 * It integrates nothing about the tide and resamples nothing. The sea's level
 * comes from the published `TideState` — the same record the surface moves its
 * own plane with, the fleet floats on, the weed leans against and the colony is
 * worked by — and the wind from the published `WindState`. A mark cannot be
 * riding a tide the water beside it is not at, and a float is exactly where
 * breaking it would show: a buoy standing in a hole in the sea. That is the
 * rule about moving state having one authority.
 *
 * The one thing it does keep is the swell, and it keeps it as an integral so
 * `creel.bob` can be turned to zero and back without the whole fleet jumping to
 * where it would have been had it never stopped — the same reason the canopy
 * keeps surges and the colony keeps rolls.
 */
export interface CreelMarks {
  mesh: InstancedMesh

  /** Advance the swell and re-float every mark against this frame's tide and wind. */
  update(delta: number, wind: WindState): void
  dispose(): void
}

export interface CreelMarksOptions {
  config: LiveConfig
  fleets: readonly CreelFleet[]

  /** The shared ground material. A float is vertex-coloured like everything else. */
  material: Material

  /** The scape's one tide. Read, never resolved a second time. */
  tide: TideState
}

const TAU = Math.PI * 2

/**
 * Metres of water a float has the scope to lie right over in.
 *
 * A mark is moored to a pot by a rope a little longer than the water is deep,
 * so how far the wind can push it sideways is set by how much of that rope
 * there is. Six metres is the deep end of the authored ground, which makes this
 * the depth at which the heel reaches the full `creel.heel` — and the shallow
 * end about half of it, which is the whole reason the term exists rather than
 * every mark in the archipelago leaning by the same angle.
 */
const FULL_SCOPE = 6

/**
 * The bound the fleet is culled against.
 *
 * Real, and honest about being nearly useless for the reason the kelp forest's
 * is: the strings are shot off six harbours spread over fifteen hundred metres
 * of sea, so the sphere that holds them is most of the world. It is computed
 * anyway, because the alternative — leaving the automatic bound to be recomputed
 * off instance matrices that change every frame — is worse than a sphere that
 * always passes.
 */
function fleetBounds (pots: readonly CreelPot[]): Sphere {
  if (!pots.length)
    return new Sphere(new Vector3(), 0)

  let minX = Infinity,
    maxX   = -Infinity,
    minZ   = Infinity,
    maxZ   = -Infinity

  for (const pot of pots) {
    minX = Math.min(minX, pot.x)
    maxX = Math.max(maxX, pot.x)
    minZ = Math.min(minZ, pot.z)
    maxZ = Math.max(maxZ, pot.z)
  }

  const x = (minX + maxX) * 0.5
  const z = (minZ + maxZ) * 0.5

  let radius = 0

  for (const pot of pots)
    radius = Math.max(radius, Math.hypot(pot.x - x, pot.z - z))

  // Generous in y: a mark rides a couple of metres of tide and the staff on it
  // is most of two more.
  return new Sphere(new Vector3(x, 0, z), radius + 4)
}

/**
 * Every float in the archipelago, in one instanced draw.
 *
 * @returns `null` on a tier with no gear to give, and on a coast whose shelf
 *   offered no ground to shoot a string on — a graceful absence rather than a
 *   poor version.
 */
export function createCreelMarks ({
  config,
  fleets,
  material,
  tide,
}: CreelMarksOptions): CreelMarks | null {
  const pots = creelPots(fleets)

  if (!pots.length)
    return null

  const geometry = buildProp(
    'creelBuoy',
    createSeededRng(config().seed).fork('creel-marks'),
    resolvePalette(),
  )
  const mesh = new InstancedMesh(geometry, material, pots.length)

  mesh.name = 'creel-marks'

  // It casts, unlike the weed under it: a float is above the water rather than
  // in it, and a line of marks throwing a line of shadows across a low sun is
  // most of what says the gear is *on* the sea rather than painted on it. Three
  // hundred-odd instances of a four-part prop is a cheap thing to put through
  // the depth pass. It does not receive, because the only thing that could
  // shade it is the island behind it, and a mark fifty metres offshore is in
  // the open.
  mesh.castShadow    = true
  mesh.receiveShadow = false
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false
  mesh.boundingSphere   = fleetBounds(pots)

  const carrier = new Object3D()

  // Hoisted: the heel axis is the same for every mark in the archipelago on any
  // one frame, and three hundred `Vector3`s a frame is three hundred a frame
  // the collector has to take back.
  const axis = new Vector3()

  // Bobs, not seconds — so a fleet given a slower swell slows where it lies
  // instead of jumping a fraction of a cycle.
  let bobbed = 0

  function place (wind: WindState): void {
    const live           = config()
    const water          = live.terrain.waterLevel
    const { heel, lift } = live.creel
    const sea            = water + tide.level
    const lean           = Math.max(0, heel) * Math.max(0, wind.strength)
    const swell          = Math.max(0, lift)

    axis.set(-wind.dirZ, 0, wind.dirX)

    for (const [ index, pot ] of pots.entries()) {
      const depth = creelDepth(pot, water, tide.level)

      // A mark rides the surface, and when the sea goes it sits on the ground
      // instead. The maximum is the whole of that: no state, no branch anybody
      // has to keep in step with the tide, and a creel ground that dries out at
      // low springs does it because the arithmetic says so.
      const rest = Math.max(
        pot.bed,
        sea - FLOAT_WATERLINE + swell * Math.sin((bobbed + pot.phase) * TAU),
      )

      // Scope: a float in deep water has rope enough to lie right over, one in
      // two metres has not. Clamped at the deep end so the ground below the
      // authored window — if anybody widens it — cannot lean a mark past the
      // angle a float on a taut rope can reach.
      const scope = Math.min(1, Math.max(0, depth) / FULL_SCOPE)
      const over  = lean * scope

      // Laid over *along the wind*, which is the direction it is blowing to —
      // the same reading the drift takes and the opposite of the treeline's.
      // The rotation is about the horizontal axis square to that bearing, so
      // the staff falls downwind rather than across it.
      carrier.position.set(pot.x, rest, pot.z)
      carrier.rotation.set(0, 0, 0)
      carrier.rotateOnAxis(axis, over)
      carrier.scale.setScalar(1)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  // The wind the fleet is first seated in: none. A mark placed before the first
  // `update` is a mark placed before anything has published a wind, and the
  // honest answer is a dead calm — every float standing straight up, which is
  // also what `STILL` leaves them at.
  place({ phase: 0, bearing: 0, dirX: 1, dirZ: 0, base: 0, gust: 0, strength: 0, travel: 0 })

  return {
    mesh,

    update (delta, wind) {
      bobbed = (bobbed + delta * Math.max(0, config().creel.bob) / 60) % 1
      place(wind)
    },

    dispose () {
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
    },
  }
}
