import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Vector2,
} from 'three'
import { defineModule } from 'threejs-scene'
import { CLOUD_CUT, CLOUD_EDGE, shadowThrow } from './cloud-shadow.ts'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import type { Vec2 } from './landscape/path.ts'
import type { AtmosphereQuality } from './quality.ts'
import type { TextureCatalogue } from './textures/catalogue.ts'
import type { WindState } from './wind.ts'
import { LAYER } from './layers.ts'


export interface ShaftsOptions {
  config:  LiveConfig
  quality: AtmosphereQuality

  /**
   * The shared texture catalogue, for the one map this module must not bake a
   * second copy of.
   *
   * The whole claim of the section is that the beam and the shadow are one hole
   * in one deck. Two bakes of the same generator would agree until somebody
   * changed one of them, and the shadow already reads `sky.cloudShadow` out of
   * here — so the beams read the same object, not the same recipe.
   */
  textures: TextureCatalogue

  /** Live sky. The hour decides whether there is a beam and which way it leans. */
  daylight: DaylightState

  /** The scape's one wind, which is what carries the deck the gaps are in. */
  wind: WindState
}

/**
 * Cloud-map uv travelled per unit of wind travel.
 *
 * The same number `cloud-shadow.ts` calls `DRIFT`, and it has to be: a beam
 * drifting at a different rate from the shadow it casts would separate from it
 * within a minute of a default wind. It is duplicated rather than exported
 * because the two modules are the two halves of one lookup and the constant is
 * documented where the lookup was first written down.
 */
const DRIFT = 0.05

/**
 * Where the beam gives out and where the sky is wide open, as distances under
 * {@link CLOUD_CUT} in units of {@link CLOUD_EDGE}.
 *
 * The one place this module deliberately does not copy the shadow's reading of
 * the field, and the reason is what each of them needs to know. A shadow only
 * has to know *whether* there is cloud: above the cut the ground goes dark,
 * below it the ground is lit, and one `smoothstep` across the edge is the whole
 * of it. A beam has to know *how much*, because what it draws is the light that
 * got through — and a field value just under the cut is a thin patch of cloud
 * that lets a little past, not an open sky.
 *
 * So the beam ramps across the entire clear side of the cut rather than across
 * the edge of it. `INSET` puts the top of the ramp a little under the cut, so
 * the lit air is strictly inside the lit ground and a beam never appears to
 * stand on the rim of its own shadow; `OPEN` is how far down the field a hole
 * has to go before it is letting everything through.
 *
 * The first cut of this ran the ramp across `CLOUD_EDGE` itself, which made
 * every texel under the cut a full beam — and since the deck's field is four
 * octaves spanning about two thirds of nought-to-one around a mean of a half,
 * that is most of the sky. What it drew was not beams but a warm film over the
 * whole frame: the section's own doc comment had already named that failure
 * before the first picture confirmed it.
 */
const BEAM_INSET = 0.25
const BEAM_OPEN  = 1.25

/** Where the beam gives out, as fractions of the sheet's half-width. */
const REACH_IN  = 0.20
const REACH_OUT = 0.46

/** The sheets must reach past the terrain from any pan before their fade does. */
const SHEET_WORLD_MULTIPLIER = 4.4

/**
 * Below this the stack is made invisible rather than drawn at nothing.
 *
 * A world-wide additive quad that contributes no light still costs every pixel
 * it covers, and there are up to eight of them.
 */
const VISIBLE_AT = 0.002

/** How far the shaft colour leans off the key light's own toward white. */
const WHITEN = 0.4

const WHITE = new Color('#ffffff')

function clamp01 (value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * How brightly the beams stand for one instant, 0..1.
 *
 * Three terms, multiplied, and none of them is a curve invented to shape the
 * look:
 *
 * - **the switch**, which is `strength` and nothing else.
 * - **light to send down**, which is `day`. There is no moon term beside it,
 *   unlike the shadow's: a shadow is the absence of whatever key is up, and the
 *   moon casts one, but a *beam* is scattered light and a full moon is five
 *   orders of magnitude short of raising one out of sea haze.
 * - **a broken sky**, and this is the only term with an argument to make. The
 *   shadow rides `cover` linearly, because more cloud is more shadow all the way
 *   to an overcast. Beams do not: an overcast has no holes for the light to come
 *   through and a clear sky has no cloud to cut the light into beams, so the
 *   effect is nothing at both ends and most at a half-and-half sky. That is
 *   `4·c·(1−c)` — the simplest curve that is zero at both ends and one in the
 *   middle — rather than a pair of authored thresholds.
 *
 * What is deliberately *not* in here is the sun's height. The length of a beam
 * is the throw, the throw is already the tangent of the sun's elevation, and a
 * low sun therefore lays the shafts flat across the frame without being told
 * to. A golden-hour weight beside that would be a second answer to a question
 * the geometry has already answered — and at latitude 68 the sun is never
 * overhead, so there is no hour where the beams stand up in a pillar.
 *
 * Pure, and takes its terms rather than a config, so `scape:map` can print the
 * beams at any hour without building a scene.
 */
export function shaftAmount (
  strength: number,
  cover:    number,
  day:      number,
): number {
  const broken = 4 * clamp01(cover) * (1 - clamp01(cover))

  return clamp01(Math.max(0, strength) * broken * clamp01(day))
}

/**
 * The world height the lit column reaches, in metres.
 *
 * Split out of {@link shaftSheetHeights} because `update` wants only this: the
 * two ends of the column are uniforms and the sheets between them are dealt by
 * the vertex shader, so a per-frame array of heights would be an allocation
 * made once a frame to read one element of.
 */
export function shaftColumnTop (waterLevel: number, deck: number, reach: number): number {
  return waterLevel + Math.max(0, deck) * clamp01(reach)
}

/**
 * Where the sheets lie, in metres of world height, lowest first.
 *
 * Dealt evenly through the column between the water and `reach` of the way up
 * to the deck. The bottom is the waterline rather than the ground for the
 * reason the bottom of a shaft is the sea in most frames of this scape: four
 * fifths of a wide view is water, the depth buffer removes whatever a hillside
 * stands in front of, and a stack that started at the highest peak would be a
 * column of light with its feet cut off over the only surface it is mostly seen
 * against.
 *
 * A single sheet is the top of the column, because the top is where a beam is
 * brightest and a one-sheet tier should get the bright end of the effect rather
 * than its remainder.
 */
export function shaftSheetHeights (
  waterLevel: number,
  deck:       number,
  reach:      number,
  count:      number,
): number[] {
  const ceiling = shaftColumnTop(waterLevel, deck, reach)

  if (count <= 1)
    return [ ceiling ]

  return Array.from(
    { length: count },
    (_unused, index) => waterLevel + (ceiling - waterLevel) * index / (count - 1),
  )
}

/**
 * One sheet's share of the column, by its place in the stack.
 *
 * Brightest at the top, which is the opposite of the night bank's stack and for
 * the opposite reason: a fog bank is a body that has to have a lid on it, and a
 * shaft is a beam that has to have a direction. The share is divided by the
 * count as well, so a phone with three sheets and a workstation with eight
 * light the air by about the same amount rather than one being nearly three
 * times the glare.
 */
export function shaftSheetWeight (index: number, count: number, taper: number): number {
  const place = count <= 1 ? 1 : index / (count - 1)
  const share = clamp01(taper) + (1 - clamp01(taper)) * place

  return Math.min(1, share * 2 / Math.max(1, count))
}

/**
 * How far down the column a sheet is, as a share of the deck's own height.
 *
 * This is the number that turns a stack of flat quads into slanting beams. The
 * light that reaches a point at height `y` came through the deck at a point
 * thrown `(deck − y)/deck` of the ground throw away from it, so a sheet halfway
 * up reads the cloud map half a throw back upsun of the sheet at the bottom —
 * and one hole therefore lights a different patch on every sheet in the stack,
 * every one of them offset along the same line.
 *
 * At `y` = 0 this is 1 and the lookup is exactly the one `CLOUD_SHADOW_GLSL`
 * makes for the ground, which is the height that shader assumes its ground is
 * at. That is not a coincidence to be preserved by hand: it is the property
 * `shafts.test.ts` states as a fact, and it is the whole of the claim that a
 * beam and the bright patch under it are one hole seen twice.
 */
export function shaftLift (height: number, deck: number): number {
  return clamp01((deck - height) / Math.max(deck, 1e-3))
}

export function shaftSheetSize (worldSize: number): number {
  return worldSize * SHEET_WORLD_MULTIPLIER
}

/**
 * The stack, as one geometry.
 *
 * Every sheet is four vertices and two triangles in one buffer, so the whole
 * column is **one draw call** however many sheets the tier asked for. There is
 * no subdivision in it and nothing is baked into a vertex colour, because
 * neither of the two things that vary across a sheet needs a vertex to carry
 * it: the rim fade is a function of the world position the fragment already
 * has, and the cloud lookup is a texture fetch.
 *
 * `aSlot` — the sheet's place in the stack, 0 at the bottom — is the only thing
 * in here. Neither the sheet's *height* nor its *share of the light* is baked,
 * and that is the config discipline rather than an optimisation: both are
 * resolved in the vertex shader from uniforms, so `shafts.reach` and
 * `shafts.taper` move the stack on the next frame instead of being knobs that
 * need a reload to be seen.
 */
export function shaftStackGeometry (size: number, count: number): BufferGeometry {
  const half      = size / 2
  const positions = new Float32Array(count * 4 * 3)
  const slots     = new Float32Array(count * 4)
  const indices   = new Uint16Array(count * 6)
  const corners   = [[ -half, -half ], [ half, -half ], [ half, half ], [ -half, half ]]

  for (let sheet = 0; sheet < count; sheet += 1) {
    const slot = count <= 1 ? 1 : sheet / (count - 1)
    const base = sheet * 4

    for (let corner = 0; corner < 4; corner += 1) {
      const vertex = base + corner

      positions[vertex * 3]     = corners[corner][0]
      positions[vertex * 3 + 1] = 0
      positions[vertex * 3 + 2] = corners[corner][1]
      slots[vertex]             = slot
    }

    // Wound so the face looks *up*, at the camera that is always over it. The
    // first cut of this had it the other way round, the sheets were culled as
    // backfaces, and the whole section drew a frame byte-for-byte identical to
    // the one with its strength at zero — which is what `shafts-none` is in the
    // pose set for.
    indices.set(
      [ base, base + 2, base + 1, base, base + 3, base + 2 ],
      sheet * 6,
    )
  }

  const geometry = new BufferGeometry()

  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('aSlot', new BufferAttribute(slots, 1))
  geometry.setIndex(new BufferAttribute(indices, 1))

  return geometry
}

/**
 * The height and the share both come from the uniforms rather than the buffer.
 *
 * `position.y` is zero in every vertex of the stack, and the only thing a
 * vertex carries is *which* sheet it belongs to. The two ends of the column and
 * the taper across it are uniforms, so moving either on the overlay moves the
 * stack on the next frame without touching a buffer, and the geometry is
 * uploaded once.
 *
 * The share is {@link shaftSheetWeight} written a second time, term for term,
 * the way `iceCover` and `WATER_ICE_GLSL` are — the cpu form is the one the
 * tests state the claim against, and there is a test that holds the pair to the
 * same numbers.
 */
const SHAFT_VERTEX = /* glsl */`
  uniform float uBase;
  uniform float uTop;
  uniform float uDeck;
  uniform float uTaper;
  uniform float uShare;

  attribute float aSlot;

  varying vec2 vGround;
  varying float vLift;
  varying float vWeight;

  void main () {
    float height = mix(uBase, uTop, aSlot);
    vec3 placed  = vec3(position.x, height, position.z);
    float taper  = clamp(uTaper, 0.0, 1.0);

    vGround = placed.xz;
    vLift   = clamp((uDeck - height) / max(uDeck, 1e-3), 0.0, 1.0);
    vWeight = min(1.0, (taper + (1.0 - taper) * aSlot) * uShare);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(placed, 1.0);
  }
`

/**
 * The same fetch the ground's shadow makes, thrown back up the beam.
 *
 * `uThrow` is the ground throw already in uv, so `vLift` of 1 reproduces
 * `scapeCloudShade`'s lookup texel for texel and every sheet above it reads
 * back upsun of that by its own share. The cut is inverted — the shadow wants
 * the cloud and this wants the hole — and inset by {@link BEAM_INSET}, so the
 * lit air is strictly inside the lit ground.
 */
const SHAFT_FRAGMENT = /* glsl */`
  uniform sampler2D uCloudMap;
  uniform vec2 uDrift;
  uniform vec2 uThrow;
  uniform float uScale;
  uniform float uStrength;
  uniform float uRadius;
  uniform vec3 uColor;

  varying vec2 vGround;
  varying float vLift;
  varying float vWeight;

  void main () {
    vec2 uv     = vGround * uScale + uDrift - uThrow * vLift;
    float field = texture2D(uCloudMap, uv).r;
    float beam  = 1.0 - smoothstep(
      ${(CLOUD_CUT - CLOUD_EDGE * BEAM_OPEN).toFixed(4)},
      ${(CLOUD_CUT - CLOUD_EDGE * BEAM_INSET).toFixed(4)},
      field
    );

    float rim = 1.0 - smoothstep(
      ${REACH_IN.toFixed(3)},
      ${REACH_OUT.toFixed(3)},
      length(vGround) / max(uRadius, 1.0)
    );

    gl_FragColor = vec4(uColor, beam * vWeight * rim * uStrength);
  }
`

/**
 * The beams.
 *
 * A stack of level sheets standing in the air between the water and the deck,
 * each one lighting the holes in the same cloud field the ground is shadowed by
 * and each reading that field from further back upsun than the one below it.
 * Nothing here knows where the coast is and nothing needs to: the depth buffer
 * removes whatever a hillside stands in front of, which is the whole of why a
 * shaft in this scape passes behind a peak rather than through it.
 */
export function createShaftsLayer ({
  config,
  quality,
  textures,
  daylight,
  wind,
}: ShaftsOptions): ScapeModule | null {
  const count = quality.shaftSheets

  if (count <= 0)
    return null

  const sheetSize     = shaftSheetSize(config().archipelago.worldSize)
  const geometry      = shaftStackGeometry(sheetSize, count)
  const throwAt: Vec2 = { x: 0, z: 0 }
  const uniforms      = {
    uBase:     { value: 0 },
    uTop:      { value: 1 },
    uDeck:     { value: config().atmosphere.cloudHeight },
    uTaper:    { value: config().shafts.taper },
    uShare:    { value: 2 / Math.max(1, count) },
    uCloudMap: { value: textures.get('sky.cloudShadow') },
    uDrift:    { value: new Vector2() },
    uThrow:    { value: new Vector2() },
    uScale:    { value: 1 / Math.max(1, config().atmosphere.cloudScale) },
    uStrength: { value: 0 },
    uRadius:   { value: sheetSize / 2 },
    uColor:    { value: new Color() },
  }

  // `name` is carried so a failed program link can be attributed: three prints
  // `Material Name:` and nothing else when a driver declines to link.
  const material = new ShaderMaterial({
    name:           'sun-shafts',
    vertexShader:   SHAFT_VERTEX,
    fragmentShader: SHAFT_FRAGMENT,
    transparent:    true,
    depthWrite:     false,
    blending:       AdditiveBlending,

    // Lit air has no back. The winding above is still upward, because a face
    // with a direction should have the honest one — but at the bottom of the
    // zoom the tilt goes near-horizontal, and an eye that ends up under the top
    // of the column should see the column rather than a hole in it.
    side: DoubleSide,

    // Unfogged, like every other sheet hung in this scape: linear fog fades by
    // distance from the camera, and a stack four frames wide would come out of
    // the fog in the middle and dissolve into it at the rim.
    fog: false,
    uniforms,
  })

  const mesh         = new Mesh(geometry, material)
  mesh.name          = 'sun-shafts'
  mesh.renderOrder   = LAYER.shafts
  mesh.frustumCulled = false
  mesh.visible       = false

  return defineModule<ScapeConfig>({
    name: 'shafts',

    build (ctx) {
      ctx.scene.add(mesh)
    },

    update () {
      const { atmosphere, shafts, terrain } = config()
      const amount                          = shaftAmount(shafts.strength, atmosphere.cloudCover, daylight.day)

      mesh.visible = amount > VISIBLE_AT

      if (!mesh.visible)
        return

      const tile = 1 / Math.max(1, atmosphere.cloudScale)

      shadowThrow(
        daylight.direction.x,
        daylight.direction.y,
        daylight.direction.z,
        atmosphere.cloudHeight,
        throwAt,
      )

      // The deck's own drift, off the scape's one wind, at the rate the shadow
      // drifts at — and the throw is *not* in here, unlike the shadow's single
      // offset, because the throw is what each sheet scales by its own lift.
      const drift = atmosphere.cloudDrag * wind.travel * DRIFT

      uniforms.uDrift.value.set(wind.dirX * drift, wind.dirZ * drift)
      uniforms.uThrow.value.set(throwAt.x * tile, throwAt.z * tile)
      uniforms.uScale.value = tile
      uniforms.uDeck.value  = atmosphere.cloudHeight
      uniforms.uBase.value  = terrain.waterLevel
      uniforms.uTop.value   = shaftColumnTop(
        terrain.waterLevel,
        atmosphere.cloudHeight,
        shafts.reach,
      )
      uniforms.uTaper.value    = shafts.taper
      uniforms.uStrength.value = amount

      // The key light's own colour, leaned toward white. A beam is the sun seen
      // through the air rather than the sun landing on something, so it carries
      // less of whatever the hour has done to the light than the ground under
      // it does — and a shaft left at the full dusk orange reads as a filter
      // over the frame rather than as light standing in it.
      uniforms.uColor.value.copy(daylight.sun).lerp(WHITE, WHITEN)
    },

    dispose () {
      mesh.removeFromParent()
      material.dispose()
      geometry.dispose()
    },
  })
}

// perf: one additive draw call for the whole stack — three sheets on a phone,
// eight on a workstation — over one shared 256² map the cloud shadow already
// uploaded, drawn only on a daylit frame under a broken sky. One texture fetch
// and one smoothstep a fragment, and nothing per frame but two `Vector2`s, a
// colour and five floats. Nothing is allocated in `update` and nothing but the
// stack's own geometry is freed in `dispose`.
