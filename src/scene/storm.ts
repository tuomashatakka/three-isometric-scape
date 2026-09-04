import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three'
import type { OrthographicCamera } from 'three'
import { createSeededRng, defineModule, hash2, smoothstep } from 'threejs-scene'
import type { SeededRng } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import type { ArchipelagoSurvey } from './landscape/archipelago.ts'
import { LAYER } from './layers.ts'
import type { AtmosphereQuality } from './quality.ts'
import { deckViewSize } from './sky-deck.ts'
import { showerAmount } from './weather.ts'
import type { WeatherState } from './weather.ts'


export interface StormOptions {
  camera:      OrthographicCamera
  config:      LiveConfig
  quality:     AtmosphereQuality
  archipelago: ArchipelagoSurvey

  /** The same front the fall and the far squall read. The storm is that front, not a sixth clock. */
  weather: WeatherState

  /** Live sky, so a flash is never a colour this sky has not been. */
  daylight: DaylightState
}

/** Where one strike can land, in world metres. */
export interface StormSite {
  id: string
  x:  number
  z:  number

  /** What the fork stands on — the ground under the site, or the sea if it is lower. */
  base: number
}

/** One strike the front carries, resolved from the seed alone. */
export interface StormStrike {
  slot: number

  /** Where in the front's cycle it fires, 0..1. */
  phase: number

  /** How hard, 0..1, before the fall over it and the coast's rain scale it. */
  power: number

  /** Which of {@link stormSites} it lands on. */
  site: number

  /** Which pre-built fork it is drawn with. */
  shape: number

  /** The slot's own roll against `storm.rate`, 0..1. Kept so the rate stays a live knob. */
  roll: number
}

/**
 * How many places in the front's cycle can carry a strike.
 *
 * A fixed comb rather than a count, because `storm.rate` has to stay readable
 * per frame: the phases, powers and sites are facts about the seed, and the rate
 * is a threshold the slots are compared against. A rate that decided how many
 * strikes to *plan* would be a slider that needed a rebuild to be seen, which is
 * the one thing the config rules say a slider must never be.
 */
export const STORM_SLOTS = 24

/**
 * How much fall a slot needs over it before it can carry a strike.
 *
 * Lightning belongs to the heart of a front rather than to its skirts, and this
 * is what says so. It is read against {@link showerAmount} at the slot's own
 * phase — the same curve the fall, the wet ground and the far squall are read
 * off — so a run that retunes the bands moves the lightning with them and cannot
 * leave a strike firing out of a clear sky.
 */
const STRIKE_FLOOR = 0.35

/** 0..1, whatever the sign of the input. */
function wrap01 (value: number): number {
  return value - Math.floor(value)
}

/** Where one strike stands, before the ground under it has been surveyed. */
export interface StormPoint {
  id: string
  x:  number
  z:  number
}

/**
 * Every place in the archipelago a strike is allowed to land.
 *
 * The outer islands, and deliberately never the home one. That is the headline
 * rather than a safety rail: a storm you are standing in is a white frame and a
 * clap, and this camera is looking *down* at a scape whose whole subject is the
 * farm in the middle of it. Lightning out on the sound and the fell is weather
 * happening somewhere else in the same picture — the same thing the far squall
 * is for, one band further along the front.
 *
 * Taken off the *specs* rather than off a survey, so that a script can ask where
 * the storm stands without building an archipelago to find out — the capture
 * harness aims a pose at a strike, and a survey to place a camera would cost
 * more than the photograph. What the survey adds is the ground under the site,
 * and only the fork needs that; see {@link stormSites}.
 *
 * The jitter is a fact about the island rather than about the frame, so it is
 * taken as a share of the world: a wider archipelago spreads its strikes wider
 * without a second number having to be found and changed.
 */
export function stormPoints (config: ScapeConfig): StormPoint[] {
  const spread = config.archipelago.worldSize * SITE_SPREAD

  return config.archipelago.landmasses
    .filter(spec => spec.id !== HOME_ID)
    .map((spec, index) => ({
      id: spec.id,
      x:  spec.origin[0] + (hash2(index + 1, 17) - 0.5) * 2 * spread,
      z:  spec.origin[1] + (hash2(index + 1, 31) - 0.5) * 2 * spread,
    }))
}

/** The same sites, with the ground the fork stands on resolved from the survey. */
export function stormSites (config: ScapeConfig, archipelago: ArchipelagoSurvey): StormSite[] {
  return stormPoints(config).map(point => ({
    ...point,
    base: Math.max(archipelago.field.heightAt(point.x, point.z), archipelago.waterLevel),
  }))
}

/** The one island a strike never lands on. */
const HOME_ID = 'home'

/** How far off its island a strike may stand, as a share of the world. */
const SITE_SPREAD = 0.035

/**
 * The comb of strikes one front carries, resolved from the seed.
 *
 * Pure, and a function of the seed and the site count alone — no live knob is
 * read here. What the rate does is decide which of these fire (see
 * {@link stormLive}), and what the front's own phase does is decide which of
 * those is lit right now. So the schedule can be planned once at build and still
 * answer to a slider, and the overlay's front scrubber walks through exactly the
 * strikes the running clock does.
 */
export function stormSchedule (seed: number, sites: number): StormStrike[] {
  const strikes: StormStrike[] = []

  for (let slot = 0; slot < STORM_SLOTS; slot += 1) {
    // Inside its own slot rather than anywhere in the cycle, so two strikes can
    // never land on the same instant and the comb cannot clump into one flash.
    const phase = (slot + 0.15 + hash2(seed & 0xffff, slot) * 0.7) / STORM_SLOTS

    if (showerAmount(phase) < STRIKE_FLOOR)
      continue

    strikes.push({
      slot,
      phase,
      power: 0.45 + hash2(slot, seed & 0xffff) * 0.55,
      site:  sites > 0 ? Math.floor(hash2(slot + 7, seed & 0xffff) * sites) % sites : 0,
      shape: Math.floor(hash2(slot + 13, seed & 0xffff) * FORK_SHAPES) % FORK_SHAPES,
      roll:  hash2(slot + 19, seed & 0xffff),
    })
  }

  return strikes
}

/** Whether a planned strike fires at all, at a given rate. */
export function stormLive (strike: StormStrike, rate: number): boolean {
  return strike.roll < rate
}

/**
 * How far through its flash a strike is at a phase of the front, or -1.
 *
 * Measured in the front's own cycle rather than in seconds, and that is the
 * decision that keeps the storm photographable. A strike with a clock of its own
 * would be somewhere different in every capture — and could only be stopped by a
 * rate that, once zeroed, would mean no strike ever fired and the whole system
 * became invisible to a still. Read off `weather.time`, it is frozen by
 * `weather.speed=0` along with everything else the front drives, and a pose that
 * names a phase gets the same bolt in the same place every time.
 */
export function stormAge (phase: number, strike: StormStrike, flash: number): number {
  if (flash <= 0)
    return -1

  const since = wrap01(phase - strike.phase)
  const age   = since / flash

  return age < 1 ? age : -1
}

/**
 * The shape of one flash over its own life, 0..1.
 *
 * Two strokes rather than one decay, because one decay is a lamp being switched
 * off and lightning is not that: the channel lights, dims, and re-lights along
 * the same path a third of the way through. The tail is cut hard at the end of
 * the window — an exponential that is still at three per cent when the strike
 * stops existing is a flash that vanishes mid-glow, which reads as a dropped
 * frame rather than as a strike ending.
 */
export function flashEnvelope (age: number): number {
  if (age < 0 || age >= 1)
    return 0

  const stroke = Math.exp(-age * 5.2)
  const second = 0.55 * Math.exp(-Math.abs(age - 0.34) * 26)

  return Math.min(1, stroke + second) * (1 - smoothstep(0.82, 1, age))
}

/**
 * How much of the flash the frame is far enough back to read, 0..1.
 *
 * The far squall's curve, for the far squall's reason: what the glow stands for
 * is a whole cloud lighting up over an island several hundred metres away, and a
 * frame ninety metres across holds neither the cloud nor the island — only a
 * wash. So the flash comes in as the camera pulls out, and the fork comes in as
 * it pushes back down (see {@link stormForkReveal}). Between them the storm is
 * two different pictures of one strike rather than one picture that is wrong at
 * both ends of the zoom.
 */
export function stormReveal (viewSize: number, limits: ScapeConfig['camera']): number {
  const span = limits.maxViewSize - limits.minViewSize

  return smoothstep(
    limits.minViewSize + span * FLASH_IN,
    limits.minViewSize + span * FLASH_OUT,
    viewSize,
  )
}

/** How much of the fork the frame is close enough in to read, 0..1. */
export function stormForkReveal (viewSize: number, limits: ScapeConfig['camera']): number {
  const span = limits.maxViewSize - limits.minViewSize

  return 1 - smoothstep(
    limits.minViewSize + span * FORK_OUT,
    limits.minViewSize + span * FORK_GONE,
    viewSize,
  )
}

/** Where the flash starts and finishes coming into view, as fractions of the zoom range. */
const FLASH_IN  = 0.02
const FLASH_OUT = 0.10

/** Where the fork starts thinning and where it is gone, on the same range. */
const FORK_OUT  = 0.03
const FORK_GONE = 0.14

/**
 * The strike a pose should be aimed at: the strongest one the front carries.
 *
 * Exported for the capture harness and the map, and it is the reason the storm
 * is checkable at all. Every other system in this scape is somewhere every
 * frame; a strike is somewhere for two thirds of a second in seven minutes, so a
 * tour that did not know when to look would photograph an empty sky and report
 * `same` — the failure the brief names by name. This is what a `storm` pose sets
 * `weather.time` to.
 */
export function stormPeak (config: ScapeConfig): {
  strike: StormStrike
  site:   StormPoint
} | null {
  const sites  = stormPoints(config)
  const firing = stormSchedule(config.seed, sites.length)
    .filter(strike => stormLive(strike, config.storm.rate))

  if (!firing.length || !sites.length)
    return null

  const strike = firing.reduce((best, next) =>
    next.power * showerAmount(next.phase) > best.power * showerAmount(best.phase) ? next : best)

  return { strike, site: sites[strike.site] }
}

/** How many forks are pre-built for the strikes to be drawn with. */
const FORK_SHAPES = 6

/** How far off vertical one fork may wander, as a share of its own height. */
const FORK_WANDER = 0.22

/** How wide the channel is at the deck and at the ground, in metres. */
const FORK_TOP  = 0.55
const FORK_FOOT = 0.22

/** How much of the drop to its own start a branch is allowed to fall. */
const BRANCH_CLEAR = 0.8

/** Steps down the main channel, and down a branch off it. */
const FORK_STEPS   = 10
const BRANCH_STEPS = 4

interface Ribbon {
  position: number[]
  fade:     number[]
  index:    number[]
}

/**
 * One jagged run of channel, as three columns of vertices.
 *
 * Three rather than two because the softness has to come from somewhere: a
 * two-vertex ribbon is a hard-edged strip whatever the shader does to it, and a
 * bolt with a hard edge is a drawn line. The middle column carries the light and
 * the outer two carry nothing, so the fragment shader interpolates a channel
 * with a glow either side of it out of one attribute and no texture at all.
 */
function appendRun (
  into:   Ribbon,
  rng:    SeededRng,
  from:   [number, number],
  height: number,
  steps:  number,
  width:  number,
): void {
  const base = into.position.length / 3
  const lean = rng.range(-FORK_WANDER, FORK_WANDER) * height

  for (let step = 0; step <= steps; step += 1) {
    const along = step / steps
    const y     = from[1] - along * height
    const x     = from[0] + along * lean + rng.range(-1, 1) * width * 3 * (1 - along * 0.4)
    const half  = width * (1 - along * (1 - FORK_FOOT / FORK_TOP))

    into.position.push(x - half, y, 0, x, y, 0, x + half, y, 0)
    into.fade.push(0, 1, 0)
  }

  for (let step = 0; step < steps; step += 1) {
    const row  = base + step * 3
    const next = row + 3

    into.index.push(
      row, next, row + 1, row + 1, next, next + 1,
      row + 1, next + 1, row + 2, row + 2, next + 1, next + 2,
    )
  }
}

/**
 * One bolt, standing on `y = 0` and reaching `height` metres up to the deck.
 *
 * Built in the prop builders' contract — a seeded rng in, a geometry out, base
 * at zero, no scene and no context — for the reason they are: it is the only
 * thing that makes a shape testable without a gpu, and a bolt is exactly the
 * kind of geometry that quietly stops reaching its own cloud.
 */
export function forkGeometry (rng: SeededRng, height: number): BufferGeometry {
  const ribbon: Ribbon = { position: [], fade: [], index: []}

  appendRun(ribbon, rng, [ 0, height ], height, FORK_STEPS, FORK_TOP)

  // One branch, leaving the channel in its upper half and dying before the
  // ground. A bolt that forked at the bottom would be two bolts that happened to
  // start together, which is not what the eye reads as a fork.
  //
  // The drop is held clear of the ground rather than left to the roll, and that
  // is the trap this shape has: a branch leaving low and falling far ends up
  // *under* the island it struck, where it is a bright wedge coming out of the
  // hillside — and only at the one zoom the fork is visible at, which is the one
  // no wide frame would have caught.
  const at   = rng.range(0.35, 0.6)
  const top  = height * (1 - at)
  const drop = Math.min(height * rng.range(0.3, 0.5), top * BRANCH_CLEAR)

  appendRun(
    ribbon,
    rng,
    [ rng.range(-0.06, 0.06) * height, top ],
    drop,
    BRANCH_STEPS,
    FORK_TOP * 0.55,
  )

  const geometry = new BufferGeometry()

  geometry.setAttribute('position', new BufferAttribute(new Float32Array(ribbon.position), 3))
  geometry.setAttribute('aFade', new BufferAttribute(new Float32Array(ribbon.fade), 1))
  geometry.setIndex(ribbon.index)
  geometry.computeBoundingSphere()

  return geometry
}

const FLASH_VERTEX = /* glsl */`
  varying vec2 vLocal;

  void main () {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FLASH_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vLocal;

  void main () {
    // Radial, with a core inside a wide skirt. A plain falloff is a disc with a
    // visible edge and a squared one is a spotlight on the island — the flash is
    // neither, because what is actually lit is a few hundred metres of cloud
    // with the strike somewhere inside it.
    float fall = 1.0 - smoothstep(0.0, 0.5, length(vLocal));

    gl_FragColor = vec4(uColor, uOpacity * fall * mix(fall, 1.0, 0.45));

    if (gl_FragColor.a < 0.004)
      discard;
  }
`

const FORK_VERTEX = /* glsl */`
  attribute float aFade;
  varying float vFade;

  void main () {
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FORK_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;

  void main () {
    gl_FragColor = vec4(uColor, uOpacity * vFade * vFade);

    if (gl_FragColor.a < 0.004)
      discard;
  }
`

/** What a flash is made of, before the sky says what colour the sky is. */
const BOLT_TONE = 0xdfe8ff

/** How much of that white survives the mix with the hour. */
const BOLT_MIX = 0.85

/**
 * How far under the deck the flash sits, as a share of the ceiling.
 *
 * Inside the cloud rather than under it. The glow is the cloud lighting up from
 * within, so it is drawn just below the deck's own sheet and painted before it —
 * see `LAYER.storm` — which leaves the deck's mottling over the top of the flash
 * instead of the flash sitting on the deck like a lamp on a table.
 */
const FLASH_SINK = 0.86

/**
 * Lightning on the far islands.
 *
 * The fifth thing the front drives, after the fall, the wet ground, the white
 * the year turns it and the shower crossing the water — and the second of the
 * five that happens somewhere else. A strike lights a patch of the deck over one
 * of the outer islands, twice in two thirds of a second, and is gone.
 *
 * Three decisions carry it.
 *
 * It is **the front's own clock and no other**. See {@link stormAge}: a strike
 * fires at a phase of `weather.time`, and its whole life is measured in that
 * cycle. So it cannot drift out of step with the rain it belongs to, the
 * overlay's front scrubber walks through the storm, and `weather.speed=0` — the
 * line the capture harness already had — freezes a bolt mid-flash where a rate
 * of its own would have had to zero it out of existence.
 *
 * It is **two pictures of one strike**. The flash is a patch of lit cloud two
 * hundred metres across, which is a fifth of the default frame and a wash at ten
 * metres; the fork is thirty-odd metres of channel, which is a third of a close
 * frame and two pixels of the default one. Each is faded on the zoom that cannot
 * read it — {@link stormReveal} and {@link stormForkReveal} — so the storm is
 * legible at both ends of a range that spans two orders of magnitude.
 *
 * It is **out on the sound and the fell**. The home island never carries a
 * strike, because the picture this scape is composed as is a farm being looked
 * at from above and weather happening to somebody else on the horizon.
 */
export function createStormFlashes ({
  camera,
  config,
  quality,
  archipelago,
  weather,
  daylight,
}: StormOptions): ScapeModule | null {
  if (quality.stormFlashes < 1)
    return null

  const live     = config()
  const sites    = stormSites(live, archipelago)
  const schedule = stormSchedule(live.seed, sites.length)

  if (!sites.length || !schedule.length)
    return null

  const height = live.atmosphere.cloudHeight
  const rng    = createSeededRng(live.seed ^ 0x7e11)
  const forks  = Array.from(
    { length: FORK_SHAPES },
    (_unused, index) => forkGeometry(rng.fork(`fork-${index}`), height),
  )
  const disc = new PlaneGeometry(1, 1)
  const bolt = new Color(BOLT_TONE)
  const tone = new Color()

  interface Flash {
    glow: Mesh
    fork: Mesh
  }

  const flashes = Array.from({ length: quality.stormFlashes }, (_unused, index): Flash => {
    const glowMaterial = new ShaderMaterial({
      name:           `storm-flash-${index + 1}`,
      vertexShader:   FLASH_VERTEX,
      fragmentShader: FLASH_FRAGMENT,
      transparent:    true,
      depthWrite:     false,
      blending:       AdditiveBlending,

      // Unfogged, like every other sheet hung in this scape: the flash is
      // hundreds of metres wide and linear fog would fade one side of it.
      fog:      false,
      uniforms: {
        uColor:   { value: new Color() },
        uOpacity: { value: 0 },
      },
    })

    const forkMaterial = new ShaderMaterial({
      name:           `storm-fork-${index + 1}`,
      vertexShader:   FORK_VERTEX,
      fragmentShader: FORK_FRAGMENT,
      transparent:    true,
      depthWrite:     false,
      blending:       AdditiveBlending,
      fog:            false,
      uniforms:       {
        uColor:   { value: new Color() },
        uOpacity: { value: 0 },
      },
    })

    const glow = new Mesh(disc, glowMaterial)
    const fork = new Mesh(forks[0], forkMaterial)

    glow.name          = `storm-flash-${index + 1}`
    glow.rotation.x    = -Math.PI / 2
    glow.renderOrder   = LAYER.storm
    glow.visible       = false
    glow.frustumCulled = false
    fork.name          = `storm-fork-${index + 1}`
    fork.renderOrder   = LAYER.storm + 1
    fork.visible       = false
    fork.frustumCulled = false

    return { glow, fork }
  })

  /** The strikes that are lit right now, newest first, capped at the tier's count. */
  function lit (phase: number, rate: number, flash: number): { strike: StormStrike, age: number }[] {
    const found: { strike: StormStrike, age: number }[] = []

    for (const strike of schedule) {
      if (!stormLive(strike, rate))
        continue

      const age = stormAge(phase, strike, flash)

      if (age >= 0)
        found.push({ strike, age })

      if (found.length === flashes.length)
        break
    }

    return found
  }

  return defineModule<ScapeConfig>({
    name: 'storm',

    build (ctx) {
      for (const flash of flashes) {
        ctx.scene.add(flash.glow)
        ctx.scene.add(flash.fork)
      }
    },

    update () {
      const now      = config()
      const storm    = now.storm
      const viewSize = deckViewSize(camera, config)
      const strikes  = lit(weather.phase, storm.rate, storm.flash)
      const glowSeen = storm.strength * stormReveal(viewSize, now.camera) * now.weather.rain
      const forkSeen = storm.fork * stormForkReveal(viewSize, now.camera) * now.weather.rain
      const spread   = archipelago.size * storm.reach

      // Lit by the hour, like the shower on the water: the channel is white and
      // the sky it is seen against is not, and a flash that stayed pure white at
      // dusk would be the one thing in the scape the light does not reach.
      tone.copy(daylight.horizon).lerp(bolt, BOLT_MIX)

      for (const [ index, flash ] of flashes.entries()) {
        const found = strikes[index]

        if (!found) {
          flash.glow.visible = false
          flash.fork.visible = false
          continue
        }

        const site   = sites[found.strike.site]
        const weight = flashEnvelope(found.age) * found.strike.power *
          showerAmount(found.strike.phase)

        const glowMaterial = flash.glow.material as ShaderMaterial
        const forkMaterial = flash.fork.material as ShaderMaterial

        flash.glow.position.set(site.x, height * FLASH_SINK, site.z)
        flash.glow.scale.set(spread * 2, spread * 2, 1)
        glowMaterial.uniforms.uOpacity.value = weight * glowSeen;
        (glowMaterial.uniforms.uColor.value as Color).copy(tone)

        flash.fork.geometry = forks[found.strike.shape]
        flash.fork.position.set(site.x, site.base, site.z)

        // Turned to face the camera rather than billboarded per vertex: the
        // fork is a flat ribbon and this camera never rolls, so copying the
        // camera's own orientation stands it upright and square to the eye in
        // one assignment.
        flash.fork.quaternion.copy(camera.quaternion)
        forkMaterial.uniforms.uOpacity.value = weight * forkSeen;
        (forkMaterial.uniforms.uColor.value as Color).copy(tone)

        flash.glow.visible = glowMaterial.uniforms.uOpacity.value > 0.004
        flash.fork.visible = forkMaterial.uniforms.uOpacity.value > 0.004
      }
    },

    dispose () {
      for (const flash of flashes) {
        flash.glow.removeFromParent()
        flash.fork.removeFromParent();
        (flash.glow.material as ShaderMaterial).dispose();
        (flash.fork.material as ShaderMaterial).dispose()
      }

      for (const fork of forks)
        fork.dispose()

      disc.dispose()
    },
  })
}

// perf: two draws per lit strike and never more than the tier's count — one
// shared unit quad for every flash and six pre-built forks of about a hundred
// triangles each, chosen by index rather than rebuilt. Nothing is allocated per
// frame but the short list of lit strikes, and outside a squall the whole system
// is invisible geometry with `visible = false` and no draw at all.
