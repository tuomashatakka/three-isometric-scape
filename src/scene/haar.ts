import {
  BufferAttribute,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'
import type { Texture } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import { bakeAlphaField } from 'threejs-scene/modules/assets'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { sampleHeight } from './noise.ts'
import type { AtmosphereQuality } from './quality.ts'
import type { WeatherState } from './weather.ts'
import type { WindState } from './wind.ts'
import { LAYER } from './layers.ts'


export interface HaarOptions {
  config:  LiveConfig
  quality: AtmosphereQuality

  /**
   * Live sky state. The hour is what makes the bank, and it is the whole of the
   * seasonal response as well: how much sun is on the ground at latitude 68 is
   * as much a fact about the week as about the hour, so a midsummer white night
   * thins the bank by itself without a curve of the year being written for it.
   */
  daylight: DaylightState

  /** Live front. The bank is deepened by whatever the last shower left behind. */
  weather: WeatherState

  /** The scape's one wind, for what carries the bank and for what takes it away. */
  wind: WindState
}

interface HaarSheet {
  mesh: Mesh

  /** Its place in the stack, lowest first. The index into the band's heights. */
  place: number

  /** Radians this sheet's heading is turned off the wind. */
  spread: number
  speed:  number
  phaseX: number
  phaseY: number

  /** Wind travel this sheet has already scrolled to, so a live response cannot jump. */
  travelled: number

  /** This sheet's share of the bank's strength. Heaviest at the bottom. */
  weight: number
}

const TEXTURE_SIZE = 128
const DRIFT_SPEED  = 1.1

/** Radians between one sheet's heading and the next. */
const SHEET_SPREAD = 0.09

/**
 * The bottom sheet's share of the bank's strength, before the count divides it.
 *
 * Well over the mist's 0.34 and the deck's, and it has to be: those two are
 * *haze*, and the whole of what this one is trying to be is a body of fog thick
 * enough that a coast goes into it. The stack composites, so the number a reader
 * sees is not this — four sheets at this share under a dark calm night come out
 * at about six tenths where the field is solid and a quarter where it is torn,
 * which is a bank with lanes in it rather than a wash.
 */
const SHEET_ALPHA = 0.95

/** How much of that share the top sheet keeps. See {@link haarSheetWeight}. */
const SHEET_THIN = 0.45

/** Metres of clearance held between the lowest sheet and the sea surface. */
const SEA_CLEARANCE = 0.25

/**
 * World units per tile of the field.
 *
 * Wider than the mist's 79, and for the reason the thing itself is wider: ground
 * mist is wisps and a bank is a *body*, so the pattern that cuts holes in it has
 * to be the size of a bank or the fog reads as a lace curtain lying on the sea.
 * A real-world length, and it stays one — a wider archipelago gets more tiles,
 * not bigger ones.
 */
const TILE_UNITS = 210

/** The sheets must reach past the terrain from any pan before their fade does. */
const SHEET_WORLD_MULTIPLIER = 4.4

/** Where the field stops being fog and starts being quad, as fractions of the sheet. */
const REACH_IN  = 0.22
const REACH_OUT = 0.48

const WHITE = new Color('#ffffff')

function clamp01 (value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * The bank's strength for one instant, 0..1.
 *
 * Four gates, multiplied, and every one of them is a condition a real radiation
 * fog needs rather than a knob invented to shape a curve:
 *
 * - **a night**, and `1 - day` is the whole of it. The ground has to lose its
 *   heat to a sky and it cannot do that with the sun on it, so what makes the
 *   fog is simply how much sun is off the ground and for how sharp a curve —
 *   which is `burn`. There is deliberately no *week* in here and none is needed:
 *   `day` at latitude 68 is already a fact about the year as much as the hour,
 *   because a midsummer midnight up there has more than half a noon's sun in it
 *   and a midwinter afternoon has none. A seasonal curve beside that would be a
 *   second answer to a question the sun's own arc has already answered.
 * - **a calm**, because a wind mixes the cooled air back into the warm air over
 *   it before it can reach its dew point. Measured against the gusted strength;
 *   see `scour`.
 * - **water in the ground**, which is what there is to condense. `damp` says how
 *   much of the bank that shower is worth.
 * - **the switch**, which is `strength` and nothing else.
 *
 * Pure, and takes its terms rather than a config, so `scape:map` can print the
 * bank at three winds and two hours without building a scene.
 */
export function haarAmount (
  haar: ScapeConfig['haar'],
  day: number,
  wind: number,
  wet: number,
): number {
  const { strength, burn, scour, damp } = haar

  const night = (1 - clamp01(day)) ** Math.max(0, burn)

  // A threshold of zero is not a threshold, and smoothstep cannot be asked what
  // it means: the honest reading is that any air at all takes the bank.
  const calm = scour <= 0
    ? wind > 0 ? 0 : 1
    : 1 - smoothstep(0, scour, Math.max(0, wind))

  const ground = 1 - clamp01(damp) + clamp01(damp) * clamp01(wet)

  return clamp01(strength * night * calm * ground)
}

/**
 * Where the sheets lie, in metres of world height, lowest first.
 *
 * Dealt evenly through the band under `top` and clamped off the sea surface, so
 * a band set deeper than the water is deep stacks up rather than sinking into
 * the lake's own plane and fighting it for pixels. A single sheet is the top
 * itself, because the top is the thing the band is measured down from.
 */
export function haarSheetHeights (
  waterLevel: number,
  top: number,
  depth: number,
  count: number,
): number[] {
  const ceiling = Math.max(waterLevel + SEA_CLEARANCE, waterLevel + top)
  const floor   = Math.max(waterLevel + SEA_CLEARANCE, ceiling - Math.max(0, depth))

  if (count <= 1)
    return [ ceiling ]

  return Array.from(
    { length: count },
    (_unused, index) => floor + (ceiling - floor) * index / (count - 1),
  )
}

/**
 * One sheet's share of the bank, by its place in the stack.
 *
 * Heaviest at the bottom, and that is the whole of what makes a stack of flat
 * quads read as something with a top on it: an even stack is a slab, and a slab
 * seen from this camera's elevation has a hard lid. The share is divided by the
 * count as well, so a tier with five sheets and a tier with two draw a bank of
 * about the same density rather than one being two and a half times the fog.
 */
export function haarSheetWeight (index: number, count: number): number {
  const place = count <= 1 ? 0 : index / (count - 1)

  return Math.min(1, SHEET_ALPHA * (1 - SHEET_THIN * place) * 2 / Math.max(1, count))
}

export function haarSheetSize (worldSize: number): number {
  return worldSize * SHEET_WORLD_MULTIPLIER
}

/**
 * The alpha field, cut soft rather than thresholded.
 *
 * Between the mist's field and the deck's. The cloud deck is thresholded because
 * a sky read from underneath must have holes in it; the mist is a power curve
 * because haze you are standing in has a little of itself everywhere. A bank has
 * both — it is mostly solid and it has lanes torn through it — so the fBm is
 * biased well up and then curved, which fills most of the tile and still leaves
 * the low ground of the field open.
 */
function bakeHaar (data: Uint8Array, seed: number): void {
  for (let y = 0; y < TEXTURE_SIZE; y += 1)
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const sample = sampleHeight(
        x / TEXTURE_SIZE * 64,
        y / TEXTURE_SIZE * 64,
        seed,
        1,
      )
      const alpha  = clamp01(sample * 0.9 + 0.62) ** 1.15
      const offset = (y * TEXTURE_SIZE + x) * 4

      data[offset]     = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = Math.round(alpha * 255)
    }
}

/**
 * A level sheet with nothing but its own rim faded.
 *
 * The one place this family differs from the other two in its geometry, and the
 * difference is the argument: the mist bakes a radial mask *toward* the islands
 * and the sea smoke bakes one *away* from them, because each is a claim about
 * where its fog belongs on the map. A bank's claim is about height, the terrain
 * already writes depth, and so the only thing in these vertex colours is the
 * fade that keeps the quad's straight edge out of the widest frame.
 *
 * Coarse on purpose. There is nothing in the mask that varies faster than the
 * quad's own radius, so a 24×24 grid resolves it exactly and a mist-sized one
 * would be a hundred thousand vertices carrying the same smooth ramp.
 */
function sheetGeometry (size: number): PlaneGeometry {
  const geometry = new PlaneGeometry(size, size, 24, 24)
  const position = geometry.getAttribute('position')
  const colors   = new Float32Array(position.count * 4)

  for (let index = 0; index < position.count; index += 1) {
    const radius = Math.hypot(position.getX(index), position.getY(index)) / size
    const offset = index * 4

    colors[offset]     = 1
    colors[offset + 1] = 1
    colors[offset + 2] = 1
    colors[offset + 3] = 1 - smoothstep(REACH_IN, REACH_OUT, radius)
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 4))
  return geometry
}

/**
 * The night fog.
 *
 * Same technique as the ground mist and the cloud deck — world-pinned sheets of
 * a baked alpha field scrolling on the wind — and a different claim from either.
 * These sheets are *level*: they lie in a band a few metres over mean water,
 * they are the same fog over the sound as over the yard, and what decides
 * whether a place is in the bank is simply whether its ground is under the top
 * of it. Nothing here knows where the coastline is, and nothing needs to.
 */
export function createHaarLayer ({
  config,
  quality,
  daylight,
  weather,
  wind,
}: HaarOptions): ScapeModule | null {
  const count = quality.haarSheets

  if (count <= 0)
    return null

  const sheetSize = haarSheetSize(config().archipelago.worldSize)
  const geometry  = sheetGeometry(sheetSize)
  const texture   = bakeAlphaField(TEXTURE_SIZE, f => bakeHaar(f, config().seed ^ 0x6b1d))
  const tint      = new Color()

  function tile (index: number): Texture {
    const map = texture.clone()
    map.repeat.setScalar(sheetSize / TILE_UNITS * (1 + index * 0.17))
    map.offset.set(index * 0.41, index * 0.23)
    map.needsUpdate = true
    return map
  }

  const sheets = Array.from({ length: count }, (_unused, index): HaarSheet => {
    // `name` is carried so a failed program link can be attributed: three prints
    // `Material Name:` and nothing else when a driver declines to link.
    const material = new MeshBasicMaterial({
      name:         `haar-sheet-${index + 1}`,
      map:          tile(index),
      transparent:  true,
      depthWrite:   false,
      vertexColors: true,
      opacity:      0,
      fog:          true,
    })

    const mesh         = new Mesh(geometry, material)
    mesh.name          = `haar-${index + 1}`
    mesh.rotation.x    = -Math.PI / 2
    mesh.renderOrder   = LAYER.haar + index
    mesh.frustumCulled = false
    mesh.visible       = false

    return {
      mesh,
      place:     index,
      spread:    (index - (count - 1) / 2) * SHEET_SPREAD,
      speed:     1 + index * 0.21,
      phaseX:    0,
      phaseY:    0,
      travelled: 0,
      weight:    haarSheetWeight(index, count),
    }
  })

  return defineModule<ScapeConfig>({
    name: 'haar',

    build (ctx) {
      for (const sheet of sheets)
        ctx.scene.add(sheet.mesh)
    },

    update () {
      const { haar, terrain } = config()
      const amount            = haarAmount(haar, daylight.day, wind.strength, weather.wet)
      const visible           = amount > 0.01
      const heights           = haarSheetHeights(terrain.waterLevel, haar.top, haar.depth, sheets.length)

      // The colour of whatever sky is over it, leaned a little toward white.
      // Fog is the one surface in the frame with nothing but ambient on it, and
      // this one spends its whole life at night — left on a fixed white it would
      // be a sheet of daylight lying on a dark coast. The moon's term is
      // separate from the day's because a bank under a full moon is the
      // brightest thing in the scape and a bank under a new one is barely there.
      tint.copy(daylight.horizon).lerp(
        WHITE,
        clamp01(0.14 + 0.5 * daylight.day + 0.7 * daylight.moon),
      )

      for (const sheet of sheets) {
        const material = sheet.mesh.material as MeshBasicMaterial
        const map      = material.map

        material.opacity  = amount * sheet.weight
        material.color.copy(tint)
        sheet.mesh.position.y = heights[sheet.place]

        // A sheet at zero is made invisible rather than transparent: a
        // world-wide transparent quad that contributes nothing still costs every
        // pixel it covers, and there are up to five of them.
        sheet.mesh.visible = visible

        if (!map || !visible)
          continue

        // Differenced against the wind's own travel rather than integrated from
        // a delta, for the reason the mist and the deck give: moving the
        // response on the overlay should change where the sheet goes next, not
        // where it already is.
        const step = (wind.travel - sheet.travelled) *
          DRIFT_SPEED *
          sheet.speed *
          haar.drag /
          sheetSize *
          map.repeat.x

        const heading = wind.bearing + sheet.spread

        sheet.travelled = wind.travel
        sheet.phaseX   += Math.cos(heading) * step
        sheet.phaseY   += Math.sin(heading) * step
        map.offset.set(sheet.phaseX, sheet.phaseY)
      }
    },

    dispose () {
      for (const sheet of sheets) {
        const material = sheet.mesh.material as MeshBasicMaterial
        sheet.mesh.removeFromParent()
        material.map?.dispose()
        material.dispose()
      }
      geometry.dispose()
      texture.dispose()
    },
  })
}

// perf: two to five unlit transparent quads over one shared 128² alpha field and
// one shared 24×24 geometry, drawn only on a night the gates are open on —
// which on the default clock is under half the cycle and none of midsummer.
// Nothing per-frame but a texture offset, an opacity, a colour and a height.
