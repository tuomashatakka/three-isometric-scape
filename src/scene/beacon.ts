import { AdditiveBlending, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D, Sphere, Vector3 } from 'three'
import { createSeededRng, defineModule } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { buildBeaconOptic } from './props/beacon.ts'
import { resolvePalette } from './props/index.ts'
import type { AtmosphereQuality } from './quality.ts'


/**
 * The light in the lantern room, and the beams it sweeps over the water.
 *
 * Its own layer rather than part of the landscape, for the same reason the mist
 * and the clouds are: it is lit by the *day*, and the day is resolved by the
 * atmosphere. A module mounted before the atmosphere reads the hour it was on
 * the previous frame, which for a lamp that comes up at dusk is a light that
 * lags a frame behind its own sky.
 *
 * One `InstancedMesh` carries every lantern in the archipelago, which is one
 * draw for the whole system however many towers a later run puts up. The lamp is
 * additive and writes no depth, so it lays light over the water and the rock
 * without ever occluding them — and it is tested against depth, so a beam
 * sweeping behind the island is hidden by it.
 */
export interface LanternHub {

  /** The lamp itself, in world space — already lifted to `LANTERN_HEIGHT`. */
  x: number
  y: number
  z: number
}

export interface BeaconLightOptions {
  config:  LiveConfig
  quality: AtmosphereQuality
  hubs:    readonly LanternHub[]

  /** Live sky state. The lamp answers to how far the sun is down and nothing else. */
  daylight: DaylightState
}

/**
 * How brightly the lamp burns, 0..1 and up.
 *
 * `1 - day` rather than `dark`, and that is the whole decision: `dark` is the
 * threshold the stars come out at, and a lighthouse is lit long before that —
 * from the moment the sun is off the water. It also means a midsummer midnight
 * at this latitude, which has no day in it and no dark either, has the lamp
 * burning, which is exactly what a light that answers to the sun does.
 */
export function lampBrightness (config: ScapeConfig, day: number): number {
  const dusk = Math.min(1, Math.max(0, 1 - day))

  return Math.max(0, config.beacon.lamp) * dusk * dusk
}

/**
 * How far above white the lamp burns, so the bloom can find it.
 *
 * The material colour carries this rather than the baked one, because
 * `bakeFacetColors` clamps a vertex colour to 0..1 — which is right for an
 * albedo and wrong for a light. The optic's warm white is about 0.76 in linear
 * luminance and the lamp opens at a third of full brightness, so it reached the
 * frame at roughly a quarter of the bloom's 0.94 threshold and never crossed
 * it. The intent was always that the glow is the bloom's business; the bloom
 * was simply never handed anything bright enough to work with.
 *
 * A multiplier keeps the relative shape the geometry already bakes — the core
 * is brightest, each blade falls off along its length — so the core crosses
 * first and only the base of a beam follows it over.
 *
 * Gated on the tier that has a bloom to catch it. Without one this would be a
 * clipped white dot where a warm one used to be, which is the broken cheap
 * version rather than the graceful absence.
 */
export function lampGlow (config: ScapeConfig, quality: AtmosphereQuality): number {
  return quality.bloom ? Math.max(1, config.beacon.glow) : 1
}

/**
 * Where the optic has turned to after `delta` seconds, in radians.
 *
 * The rate is turns per *minute*, because that is the unit a light's character
 * is written in. Wrapped, so a scape left running for a day is at the same phase
 * as one just opened.
 */
export function advanceOptic (phase: number, turnsPerMinute: number, delta: number): number {
  const rate = Math.max(0, turnsPerMinute) / 60 * Math.PI * 2

  return (phase + rate * Math.max(0, delta)) % (Math.PI * 2)
}

/**
 * A sphere that holds every beam wherever it has swept to.
 *
 * Given rather than derived, for the reason `mill-sails.ts` gives at greater
 * length: three bounds an `InstancedMesh` from the geometry at the identity, and
 * these lanterns are a hundred metres from the middle of the world.
 */
export function lanternBounds (hubs: readonly LanternHub[], reach: number): Sphere {
  const centre = new Vector3()

  for (const hub of hubs)
    centre.add(new Vector3(hub.x, hub.y, hub.z))

  if (hubs.length)
    centre.divideScalar(hubs.length)

  let radius = 0

  for (const hub of hubs)
    radius = Math.max(radius, centre.distanceTo(new Vector3(hub.x, hub.y, hub.z)))

  return new Sphere(centre, radius + reach)
}

/**
 * @returns `null` when the archipelago has no lantern to light — an island with
 *   no rock far enough out gets no beam rather than a beam from nowhere.
 */
export function createBeaconLight (options: BeaconLightOptions): ScapeModule | null {
  const { config, quality, hubs, daylight } = options

  if (hubs.length === 0)
    return null

  const { beamReach, beamSpread } = config().beacon
  const geometry                  = buildBeaconOptic(createSeededRng(config().seed).fork('beacon-optic'), resolvePalette(), {
    // The tier's answer, and a graceful absence rather than a poor version: at
    // zero panels the lantern still glows, it simply throws nothing. That is a
    // real light — a fixed harbour lamp — and not a broken sweeping one.
    blades: quality.beaconBlades,
    reach:  beamReach,
    spread: beamSpread,
  })

  const material = new MeshBasicMaterial({
    vertexColors: true,
    transparent:  true,
    blending:     AdditiveBlending,
    depthWrite:   false,

    // Fog would mix a beam toward the fog colour and then *add* that, which on a
    // hazy night puts a grey cone in the sky. The lamp is a light source: haze
    // between it and the eye is the bloom's business, not the mesh's.
    fog:     false,
    opacity: 0,
  })

  function applyGlow (): void {
    material.color.setScalar(lampGlow(config(), quality))
  }

  applyGlow()

  const mesh = new InstancedMesh(geometry, material, hubs.length)

  mesh.name = 'beacon-light'
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false
  mesh.boundingSphere   = lanternBounds(hubs, beamReach)
  mesh.visible          = false

  const carrier = new Object3D()
  let phase     = 0

  /**
   * Each lantern is given a quarter turn of offset per index so two lights never
   * sweep in lockstep. Deterministic — it is the index, not a draw from the rng.
   */
  function writeMatrices (): void {
    for (const [ index, hub ] of hubs.entries()) {
      carrier.position.set(hub.x, hub.y, hub.z)
      carrier.rotation.set(0, phase + index * Math.PI / 2, 0)
      carrier.updateMatrix()
      mesh.setMatrixAt(index, carrier.matrix)
    }

    mesh.instanceMatrix.needsUpdate = true
  }

  writeMatrices()

  return defineModule<ScapeConfig>({
    name: 'scape-beacon',

    build (ctx) {
      ctx.scene.add(mesh)
    },

    update (_state, frame) {
      const lamp = lampBrightness(config(), daylight.day)

      material.opacity = lamp

      // Read every frame, because it is a knob in the panel and a slider that
      // only takes effect on a rebuild is a slider that lies.
      applyGlow()

      // A lamp that is out is not drawn at all, rather than drawn at zero
      // opacity: a transparent mesh still costs a sorted draw and the beams are
      // most of a hundred metres of fill. Midday is the common case.
      mesh.visible = lamp > 0.004

      if (!mesh.visible)
        return

      const turned = advanceOptic(phase, config().beacon.turn, frame.delta)

      if (turned === phase)
        return

      phase = turned
      writeMatrices()
    },

    dispose () {
      mesh.removeFromParent()
      mesh.dispose()
      geometry.dispose()
      material.dispose()
    },
  })
}

// perf: one instanced draw for every lighthouse in the archipelago, skipped
// outright while the sun is up, and one matrix write per lantern on a frame the
// optic actually turned on.
