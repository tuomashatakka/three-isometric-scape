import {
  Color,
  Mesh,
  PlaneGeometry,
  RepeatWrapping,
  ShaderMaterial,
  Vector2,
} from 'three'
import type { OrthographicCamera } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import { bakeAlphaField } from 'threejs-scene/modules/assets'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { sampleHeight } from './noise.ts'
import type { AtmosphereQuality } from './quality.ts'
import type { SeasonState } from './season.ts'
import { showerAmount } from './weather.ts'
import type { WeatherState } from './weather.ts'
import type { WindState } from './wind.ts'
import { deckFocus, deckViewSize } from './sky-deck.ts'
import { LAYER } from './layers.ts'


export interface SquallOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Live weather. The shower is read off the same front the fall is, one lead ahead of it. */
  weather: WeatherState

  /** Live sky, so the water under the shower is lit by the clock everything else is. */
  daylight: DaylightState

  /** Live year. A winter squall is a snow shower, and it whitens rather than mattes. */
  season: SeasonState

  /** The scape's one wind: which side the shower comes in from, and how its texture travels. */
  wind: WindState
}

/**
 * Where the shower starts and finishes coming into view, as fractions of the
 * zoom range.
 *
 * Its own curve rather than the sky decks', and the difference is the reason
 * this is not one: a deck fades out on the way *in* because the camera ends up
 * underneath it, and a sheet lying on the water is something the camera is
 * always above. What close zoom actually costs is context — a metre of stippled
 * water with no edge in the frame is not a shower, it is a filter — so this
 * comes in far earlier than a deck and only the near end of the range loses it.
 */
const REVEAL_IN  = 0.06
const REVEAL_OUT = 0.24

/** How much of the shower the view is far enough back to read, 0..1. */
export function squallReveal (viewSize: number, limits: ScapeConfig['camera']): number {
  const span = limits.maxViewSize - limits.minViewSize

  return smoothstep(
    limits.minViewSize + span * REVEAL_IN,
    limits.minViewSize + span * REVEAL_OUT,
    viewSize,
  )
}

/**
 * How much water the shower is standing on, 0..1.
 *
 * The larger of two readings of one front: the rain that is falling here, and
 * the rain that will be falling here in `lead` of a cycle's time. That maximum
 * is the whole module. Taken as the lead alone the sea would go dry under the
 * heaviest fall of the front — the squall would arrive, cross, and vanish at the
 * exact moment the drops started — and taken as the local fall alone there would
 * be nothing to see coming, which is the thing worth drawing.
 *
 * Scaled by `weather.rain` for the reason `weather.ts` scales the fall by it:
 * that knob is the coast's master switch, and a scape it never rains on must not
 * have rain crossing its water.
 */
export function squallCover (phase: number, lead: number, rain: number): number {
  return Math.max(showerAmount(phase), showerAmount(phase + lead)) * rain
}

/**
 * Where the shower is standing, as a signed share of its sweep.
 *
 * Positive is upwind and not here yet, negative is downwind and gone past, and
 * the sign change is the front crossing the frame. It is the difference between
 * the same two readings {@link squallCover} takes the maximum of, which means
 * the shower's *place* and the shower's *weight* come out of one curve and can
 * never disagree — a band that faded in over the sea while sitting still would
 * be a shower that never arrived.
 *
 * No clock of its own, and that is the point: the front already has one, and a
 * second would drift out of step with it within a page load.
 */
export function squallOffset (phase: number, lead: number): number {
  return showerAmount(phase + lead) - showerAmount(phase)
}

/**
 * How wide the sheet is, in metres.
 *
 * Frame-sized. The sheet is a composition — it has to cover the picture at any
 * pan and still have its own soft edge outside the frame — so it is scaled by
 * the live view the way the rain column and the cloud tile are. What it must not
 * be scaled by is the world: a sheet sized against the archipelago would be a
 * postage stamp at one zoom and eleven islands wide at another.
 */
export function squallSheetSize (viewSize: number): number {
  return viewSize * SHEET_VIEW_MULTIPLIER
}

/** How many frames across the sheet reaches, so its own edge is never in the picture. */
const SHEET_VIEW_MULTIPLIER = 3.2

/**
 * Tile width as a fraction of the frame.
 *
 * The same decision the cloud deck takes, and for the same reason it takes it:
 * the sheet has to cover the picture at any pan, but the *density* of the
 * mottling is a screen composition rather than a fact about the sea. Tie the
 * repeat to the sheet and every zoom out multiplies the number of copies in
 * frame until the shower is a wallpaper of tiny repeats with a visible seam
 * between each one; tie it to the frame and the count is constant, which is what
 * lets a field that does not tile be used at all.
 *
 * It is the shower falling out of that same deck, so the two are sized against
 * the same thing on purpose — a shower whose patches were a different size from
 * the cloud above it would be a shower from somebody else's sky.
 */
const TILE_VIEW_FRACTION = 0.62

/** How wide one tile of the stipple is, in metres, at a given frame. */
export function squallTileSize (viewSize: number): number {
  return viewSize * TILE_VIEW_FRACTION
}

/**
 * The band's half-width, in the sheet's own local units.
 *
 * Both `span` and `reach` are authored against the *frame* — how much of the
 * picture the shower covers, and how many pictures upwind it starts — because
 * that is the question a reader dragging them is asking. The sheet is several
 * frames across, so they have to be divided back down into its coordinates
 * before the shader sees them. Skipping this conversion is a shower parked three
 * frames off the edge of the picture, which is exactly as visible as no shower
 * at all.
 */
export function squallBandWidth (span: number): number {
  return Math.max(span, 0.02) / SHEET_VIEW_MULTIPLIER
}

const TEXTURE_SIZE = 128

/** Where the shower's own field stops being shower, as a fraction of the sheet. */
const REACH_IN  = 0.18
const REACH_OUT = 0.46

/** Noise level the shower is cut at — below it the water is simply water. */
const CUT = 0.4

/** Opacity of one sheet under the heaviest of the front. */
const SHEET_ALPHA = 0.82

/** How much of the palette's rain the water takes under the shower. */
const RAIN_MIX = 0.6

/**
 * How much darker a shower leaves the water, and how much paler a snow one.
 *
 * Dark, and that is a finding rather than a preference. The first cut of this
 * mixed the shower *pale*, on the reasoning that rain on water is stipple and
 * stipple is bright — and it disappeared completely. The sea in this scape is
 * already a pale grey under fog and cloud shadow, so a pale veil over it is a
 * veil over nothing. What actually distinguishes water under a squall from
 * water beside one is that the cloud heavy enough to rain is also heavy enough
 * to darken what it stands over. Snow is the exception, and gets to stay pale.
 */
const SHADE_RAIN = 0.3
const SHADE_SNOW = 0.95

/** Units of noise the tile is cut out of. Larger is a coarser mottle per tile. */
const FIELD_UNITS = 70

/**
 * The fBm, blended with itself across the tile so the tile actually wraps.
 *
 * The one thing this field needs that no other baked field in the scape does.
 * The mist and the cloud deck repeat five times over a sheet the reader is
 * looking *through*, and a discontinuity in a soft white haze is not a line
 * anybody sees. This sheet lies flat on the water with a hard-edged cut in it,
 * so an unwrapped repeat draws a visible lattice of straight seams across the
 * sea — which is what the first cut of this module did.
 *
 * The blend is the standard one: four samples a tile apart, weighted by how far
 * across the tile the point is, so the value at the far edge is by construction
 * the value at the near one. `sampleHeight`'s radial lift is switched off for
 * it — the lift is a function of distance from the noise origin, so the four
 * samples would each get a different one and put the seam straight back.
 */
function tiledField (u: number, v: number, seed: number): number {
  const acrossU = u / FIELD_UNITS
  const acrossV = v / FIELD_UNITS
  const near    = sampleHeight(u, v, seed, 1, 1, 0)
  const wrapU   = sampleHeight(u - FIELD_UNITS, v, seed, 1, 1, 0)
  const wrapV   = sampleHeight(u, v - FIELD_UNITS, seed, 1, 1, 0)
  const wrapUV  = sampleHeight(u - FIELD_UNITS, v - FIELD_UNITS, seed, 1, 1, 0)

  return near * (1 - acrossU) * (1 - acrossV) +
    wrapU * acrossU * (1 - acrossV) +
    wrapV * (1 - acrossU) * acrossV +
    wrapUV * acrossU * acrossV
}

/**
 * The stipple, cut out of the same fBm everything else in the sky is baked from.
 *
 * Cut rather than left as haze, for the reason the cloud deck is cut: a shower
 * is heavier in some of its own width than in the rest, and a field left
 * continuous mottles by a few per cent where it should be mottling by half. The
 * fragment shader lifts the floor back off zero — see the mix there — so this
 * decides where the shower is *heaviest* rather than where it exists at all.
 */
function bakeShower (data: Uint8Array, seed: number): void {
  for (let y = 0; y < TEXTURE_SIZE; y += 1)
    for (let x = 0; x < TEXTURE_SIZE; x += 1) {
      const sample = tiledField(
        x / TEXTURE_SIZE * FIELD_UNITS,
        y / TEXTURE_SIZE * FIELD_UNITS,
        seed,
      ) * 0.5 + 0.5
      const offset = (y * TEXTURE_SIZE + x) * 4

      data[offset]     = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = Math.round(smoothstep(CUT, CUT + 0.18, sample) * 255)
    }
}

const SQUALL_VERTEX = /* glsl */`
  varying vec2 vLocal;
  varying vec2 vUv;

  void main () {
    vLocal = position.xy;
    vUv    = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const SQUALL_FRAGMENT = /* glsl */`
  uniform sampler2D uField;
  uniform vec2 uOffset;
  uniform float uRepeat;
  uniform vec2 uBand;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vLocal;
  varying vec2 vUv;

  void main () {
    // Mottling on a body, not a stencil. The field was a cut alone to begin
    // with, on the reasoning that a shower read from above has gaps in it — and
    // it took a third of the shower away with the gaps, because a mean field
    // value of 0.35 is a third of an opacity. The gaps in a squall are the space
    // between one squall and the next, and the band below is what draws those.
    float field = mix(0.5, 1.0, texture2D(uField, vUv * uRepeat + uOffset).a);

    // The band, across the sheet's own local y — which the update has turned to
    // point upwind. Its leading edge is softer than its trailing one: a shower
    // arrives as a front and leaves as a fray.
    float across  = vLocal.y / uBand.y;
    float leading = 1.0 - smoothstep(uBand.x, uBand.x + 0.55, across);
    float behind  = smoothstep(uBand.x - 1.15, uBand.x - 0.35, across);

    // The sheet's own rim, so a straight edge is never in the picture whatever
    // the pan. Radial rather than along one axis, for the same reason the mist
    // sheets fade radially: a square sheet panned diagonally shows a corner.
    float rim = 1.0 - smoothstep(${REACH_IN}, ${REACH_OUT}, length(vLocal));

    gl_FragColor = vec4(uColor, uOpacity * field * leading * behind * rim);

    if (gl_FragColor.a < 0.004)
      discard;
  }
`

/**
 * The squall you can see coming.
 *
 * Rain standing on water you are not under yet: a band of stippled, matted sea
 * that crosses the archipelago from upwind as the front comes in. It is the
 * fourth thing the weather drives, after the fall, the wet ground and the white
 * the year turns it, and the only one of the four that is somewhere *else* —
 * everything the front did before this happened where the reader already was,
 * which is why a scape with weather in it had no weather approaching in it.
 *
 * Three decisions carry it, and the first one is what the thing *is*.
 *
 * It lies **on the water** rather than standing on it. The obvious shape for a
 * squall is the one you see from a beach — a dark curtain hanging under the
 * cloud, out on the horizon — and it is the wrong shape for this camera. The
 * scape is read from above at a frame more than a kilometre across, against a
 * cloud deck thirty-odd metres up: a vertical curtain is nine pixels tall there,
 * and there is no horizon in the picture for it to stand on. What a shower over
 * water actually looks like from above is a moving patch of matte, stippled
 * surface, and that is a sheet.
 *
 * It is **placed and weighted by one curve**. See {@link squallCover} and
 * {@link squallOffset}: the same front read twice, once here and once a lead
 * ahead, with the maximum as how heavy the shower is and the difference as how
 * far upwind it still is. So it comes in, crosses, and leaves without a clock of
 * its own, and the arrival cannot drift out of step with the rain.
 *
 * It is **occluded by land for free**. The sheet lies at the waterline and the
 * terrain is opaque and writes depth, so every island stands out of the shower
 * exactly as far as it stands out of the sea. Nothing masks it, nothing samples
 * the bathymetry, and the coastline it draws is by construction the coastline
 * the ground already has.
 */
export function createSquallCurtains ({
  camera,
  config,
  quality,
  weather,
  daylight,
  season,
  wind,
}: SquallOptions): ScapeModule | null {
  if (quality.squallSheets < 1)
    return null

  const count    = quality.squallSheets
  const geometry = new PlaneGeometry(1, 1)
  const rainTone = new Color(config().palette.rain)
  const field    = bakeAlphaField(TEXTURE_SIZE, data => bakeShower(data, config().seed ^ 0x5d13))

  field.wrapS = RepeatWrapping
  field.wrapT = RepeatWrapping

  interface Sheet {
    mesh:   Mesh
    scale:  number
    weight: number
    lag:    number
  }

  // One texture behind every sheet, unlike the cloud deck's clone per layer: the
  // repeat and the scroll are uniforms here rather than the texture's own
  // transform, so there is nothing per sheet for a second copy to hold.
  const sheets = Array.from({ length: count }, (_unused, index): Sheet => {
    const material = new ShaderMaterial({
      name:           `squall-${index + 1}`,
      vertexShader:   SQUALL_VERTEX,
      fragmentShader: SQUALL_FRAGMENT,
      transparent:    true,
      depthWrite:     false,

      // Unfogged, like every other sheet hung in this scape: linear fog fades by
      // distance from the camera, and a sheet three frames wide would come out
      // of the fog in the middle and dissolve into it at the rim.
      fog:      false,
      uniforms: {
        uField:   { value: field },
        uOffset:  { value: new Vector2() },
        uRepeat:  { value: 1 },
        uBand:    { value: new Vector2(0, 1) },
        uColor:   { value: new Color() },
        uOpacity: { value: 0 },
      },
    })

    const mesh       = new Mesh(geometry, material)
    mesh.name        = `squall-${index + 1}`
    mesh.rotation.x  = -Math.PI / 2
    mesh.renderOrder = LAYER.squall + index
    mesh.visible     = false

    // The sheet is moved, turned and scaled every frame, so the volume three
    // would cull against is a unit square at the origin it is never in.
    mesh.frustumCulled = false

    return {
      mesh,

      // Stacked at slightly different sizes and slightly different places in the
      // band, for the reason the cloud decks are: one field scrolling over
      // itself is one printed sheet however many copies of it there are.
      scale:  1 + index * 0.31,
      weight: (1 - index / (count + 1)) * SHEET_ALPHA,
      lag:    index * 0.17,
    }
  })

  const tone = new Color()

  return defineModule<ScapeConfig>({
    name: 'squall',

    build (ctx) {
      for (const sheet of sheets)
        ctx.scene.add(sheet.mesh)
    },

    update () {
      const live     = config()
      const squall   = live.squall
      const viewSize = deckViewSize(camera, config)
      const cover    = squallCover(weather.phase, squall.lead, live.weather.rain)
      const opacity  = cover * squall.strength * squallReveal(viewSize, live.camera)

      for (const sheet of sheets)
        sheet.mesh.visible = opacity * sheet.weight > 0.004

      if (!sheets[0].mesh.visible)
        return

      const focus = deckFocus(camera)
      const size  = squallSheetSize(viewSize)

      // Lit by the hour so the shower is never a colour the sky has not been, and taken to the year's own white by whatever share of the
      // fall is frozen — the same three sources the column of drops mixes, so a
      // run that retunes one retunes both.
      tone.copy(daylight.horizon).lerp(rainTone, RAIN_MIX)
      tone.lerp(season.snowColor, weather.sleet * 0.7)
      tone.multiplyScalar(SHADE_RAIN + (SHADE_SNOW - SHADE_RAIN) * weather.sleet)

      // How far upwind the band still is, in bands. Positive is weather on its
      // way, negative is weather that has gone past — see `squallOffset`.
      const stand = squallOffset(weather.phase, squall.lead) * squall.reach

      for (const sheet of sheets) {
        const material = sheet.mesh.material as ShaderMaterial

        material.uniforms.uOpacity.value = opacity * sheet.weight;
        (material.uniforms.uColor.value as Color).copy(tone)

        sheet.mesh.position.set(focus[0], live.terrain.waterLevel, focus[2])
        sheet.mesh.scale.set(size * sheet.scale, size * sheet.scale, 1)

        // Turned so the sheet's own +y points upwind. The band then sweeps along
        // one local axis whichever way the wind is blowing, and the stipple's
        // stretch is drawn out along the same bearing rather than across it.
        sheet.mesh.rotation.z = Math.atan2(wind.dirX, wind.dirZ)

        material.uniforms.uRepeat.value = size * sheet.scale / squallTileSize(viewSize);
        (material.uniforms.uBand.value as Vector2).set(
          stand + sheet.lag,
          squallBandWidth(squall.span),
        )

        // The texture's own travel, so the surface under the shower is moving
        // even where the band is not. A share of the wind's travel rather than a
        // rate of its own: there is one wind in the scape, and this is the only
        // thing here a still has to be able to stop.
        const travel = wind.travel * squall.drift / squallTileSize(viewSize);
        (material.uniforms.uOffset.value as Vector2).set(0, -travel * (1 + sheet.lag))
      }
    },

    dispose () {
      for (const sheet of sheets) {
        const material = sheet.mesh.material as ShaderMaterial

        sheet.mesh.removeFromParent()
        material.dispose()
      }

      geometry.dispose()
      field.dispose()
    },
  })
}

// perf: one shared unit quad and one shared 128² alpha field behind every sheet,
// one draw and one program each, and nothing per frame but a transform and five
// uniforms. The sheet is sized against the frame rather than the map, so the
// count is a screen density the way the drop count is: the mobile tier's single
// sheet covers the same water the desktop tier's two do, with less depth in it.
