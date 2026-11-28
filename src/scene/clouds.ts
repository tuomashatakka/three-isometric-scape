import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three'
import type { IUniform, OrthographicCamera, Texture } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import { CLOUD_CUT, CLOUD_SHADOW_GLSL } from './cloud-shadow.ts'
import type { CloudShadow } from './cloud-shadow.ts'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { deckReveal, deckViewSize } from './sky-deck.ts'
import { LAYER } from './layers.ts'


export interface CloudOptions {
  camera: OrthographicCamera
  config: LiveConfig

  /** Live sky state, so the deck is lit by the same clock as everything else. */
  daylight: DaylightState

  /**
   * The placed cloud field: the map, drift, bank and downsun throw every shadow
   * on the ground and on the water is read through. The deck draws the same
   * field at the cloud's own place, so there is one cloud and not two.
   */
  shadow: CloudShadow

  /**
   * A tiling height map with its own slope in green and blue (the sea's
   * `water.wave`): the billows a cumulus top is heaped of, read at two
   * scales. Shared, not owned — the catalogue frees it.
   */
  billows: Texture
}

/** The most of the frame a cloud's core hides, at full cover. Its thin edge lets the sea through. */
export const DECK_ALPHA = 0.9

/**
 * The tone of a cloud's sunlit side and its lee, as gains on the sky's own
 * horizon colour: a top in the sun is whiter than the horizon behind it, the
 * side turned away from it a good deal greyer.
 */
export const LIT_GAIN   = 1.22
export const SHADE_GAIN = 0.52

/**
 * How tall a whole unit of the raw field stands, in metres: the relief the
 * tops are shaded by. A fair-weather cumulus is a few hundred metres deep; the
 * deck is drawn as a sheet, so the height is only ever a slope for the light.
 */
export const TOP_RELIEF = 160

/** The step the top's slope is read over, in metres: a cell of a cumulus field. */
export const TOP_STEP = 40

/** Where a cloud's edge is cut, on the cut field: thinner than this is clear sky. */
const EDGE_CUT = 0.04

/**
 * The billows a top is heaped of, as the metres one tile of the billow map
 * spans: a cumulus cell, and the turrets on it.
 *
 * The deck read the shadow's field and nothing else, and in the frames that
 * show it — the archipelago, where the camera has climbed past it — that field
 * is the weather bank alone (`scapeCloudKeep` is zero there: the cloud map
 * repeats too often to show). So every cloud the default frame drew was the
 * bank cut with a wide soft edge: felt, with no edge a photograph of a cumulus
 * from above ever shows. A real top is heaped: cells a few hundred metres
 * across, turrets on them, and an edge that is crisp because the droplets end
 * where the rising air does.
 */
export const BILLOW_TILES = [ 340, 117 ] as const

/** The share of each billow scale in the heap. */
const BILLOW_MIX = [ 0.64, 0.36 ] as const

/**
 * How far the billows move the field the cut is taken on: the edge's
 * cauliflower. More in the wide frame, where the field under it is the smooth
 * bank alone; less where the cloud map's own detail is resolved.
 */
export const BILLOW_WIDE = 0.34
export const BILLOW_NEAR = 0.16

/**
 * The field's width over which a cloud's edge goes from clear sky to body: a
 * twelfth of the shadow's own soft edge, so the deck has an edge and its shadow
 * on the ground keeps the penumbra a shadow cast from 34 m has.
 */
export const DECK_EDGE = 0.12

/** The share of the core's opacity a cloud's thin fringe keeps. */
export const DECK_FRINGE = 0.45

/** How much one unit of billow slope tilts the top's facet: the turrets' relief. */
const BILLOW_RELIEF = [ 4.5, 3.0 ] as const

/** How far past the world the deck runs, as a multiple of the world's width. */
const DECK_REACH = 4.4

const WHITE = new Color('#ffffff')

/**
 * How much of a cloud the eye sees through, given its cut field (0..1), the
 * sky's cover and how far back the camera stands: the deck's alpha, the same
 * arithmetic as the glsl. A cloud is dense: the core is opaque well before
 * the field is, and only the last fringe is thin.
 */
export function deckAlpha (field: number, cover: number, reveal: number): number {
  return smoothstep(EDGE_CUT, 0.6, field) * Math.min(1, cover * 1.2) * reveal * DECK_ALPHA
}

/**
 * The deck's body, 0..1, for the raw field, the heap of billows on it
 * (`billow`, centred on zero) and how much of the cloud map the frame resolves
 * (`keep`): the glsl's twin. The cut is the shadow's, the edge a twelfth as
 * wide.
 */
export function deckBody (raw: number, billow: number, keep: number): number {
  const heap = raw + (BILLOW_WIDE + (BILLOW_NEAR - BILLOW_WIDE) * keep) * billow

  return smoothstep(CLOUD_CUT, CLOUD_CUT + DECK_EDGE, heap)
}

/**
 * The share of the key a top's facet catches, 0..1: a wrapped lambert,
 * because a cloud scatters light round its own curve and a lee is never black.
 */
export const TOP_WRAP = 0.45

export function topLight (facing: number): number {
  return Math.min(1, Math.max(0, (facing + TOP_WRAP) / (1 + TOP_WRAP)))
}

/**
 * How far the deck's *depth* stands above its height, in metres: enough that
 * no hill reaches it. The deck sat at `atmosphere.cloudHeight` (34 m, the
 * height its shadow is thrown from) and the far shore's hinterland climbs past
 * twice that, so the land cut the sheet along its own 34 m contour — a white
 * rim traced round every far coast in the archipelago frames, the cloud gone
 * over every hill behind it. An orthographic frame cannot see how far along
 * its axis a sheet lies, so the deck slides toward the camera by the lift over
 * the axis' sine: every pixel stays where it was and nothing stands in front
 * of it. A perspective camera would see the slide, and keeps the sheet where
 * it is.
 */
export function deckLift (cloudHeight: number, hills: number): number {
  return Math.max(0, hills - cloudHeight) + DECK_CLEARANCE
}

/** Metres the lifted deck stands clear of the highest hill. */
const DECK_CLEARANCE = 8

const DECK_VERTEX = /* glsl */`
  uniform float uDeckLift;
  varying vec3 vDeckWorld;
  void main () {
    vec4 world  = modelMatrix * vec4(position, 1.0);
    vDeckWorld  = world.xyz;
    if (projectionMatrix[2][3] == 0.0) {
      vec3 forward = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
      world.xyz   -= forward * (uDeckLift / max(-forward.y, 0.05));
    }
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const tiles = BILLOW_TILES.map(t => (1 / t).toFixed(6))

const DECK_FRAGMENT = /* glsl */`
${CLOUD_SHADOW_GLSL}
  uniform sampler2D uBillowMap;
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform vec3 uSunDir;
  uniform float uDeckAlpha;
  varying vec3 vDeckWorld;

  void main () {
    // The cloud at its own place: the shadow's lookup is the cloud upsun of the
    // ground, so the throw is added back to find the cloud over this point.
    vec2 at   = vDeckWorld.xz + uCloudThrow;
    float raw = scapeCloudRaw(at);

    // The heap: two scales of billow riding the cloud's own drift (the offset
    // is the drift less the throw, in tiles of the cloud map; \`at\` already
    // carries the throw back). Mipmapped, so a turret the frame cannot resolve
    // averages to nothing rather than to grit.
    vec2 drift   = at + uCloudOffset / uCloudScale;
    vec4 cell    = texture2D(uBillowMap, drift * ${tiles[0]});
    vec4 turret  = texture2D(uBillowMap, drift * ${tiles[1]} + vec2(0.37, 0.71));
    float billow = 2.0 * (${BILLOW_MIX[0].toFixed(2)} * cell.r + ${BILLOW_MIX[1].toFixed(2)} * turret.r - 0.5);
    float heap   = raw + mix(${BILLOW_WIDE.toFixed(2)}, ${BILLOW_NEAR.toFixed(2)}, scapeCloudKeep()) * billow;
    float body   = smoothstep(${CLOUD_CUT.toFixed(2)}, ${(CLOUD_CUT + DECK_EDGE).toFixed(2)}, heap);
    if (body < ${EDGE_CUT.toFixed(2)}) discard;

    // The top's height is the raw field, which keeps rising inside the cut;
    // its slope, two reads a step apart, is the broad facet the sun lights, and
    // the billows' own slope (the map carries it in green and blue) heaps the
    // turrets on it. No screen derivatives: taken over a pixel quad, on a field
    // this minified they stipple the deck into grit.
    float hx    = scapeCloudRaw(at + vec2(${TOP_STEP.toFixed(1)}, 0.0)) - raw;
    float hz    = scapeCloudRaw(at + vec2(0.0, ${TOP_STEP.toFixed(1)})) - raw;
    vec2 slope  = vec2(hx, hz) * ${(TOP_RELIEF / TOP_STEP).toFixed(2)}
                + (cell.gb - 0.5) * ${BILLOW_RELIEF[0].toFixed(2)}
                + (turret.gb - 0.5) * ${BILLOW_RELIEF[1].toFixed(2)};
    vec3 n      = normalize(vec3(-slope.x, 1.0, -slope.y));

    // Lit on the facets turned to the sun, wrapped round the curve because a
    // cloud scatters light round itself and a lee is never black.
    float facing = dot(n, normalize(uSunDir));
    float wrap   = clamp((facing + ${TOP_WRAP.toFixed(2)}) / ${(1 + TOP_WRAP).toFixed(2)}, 0.0, 1.0);

    // A thick core is brighter from above than a thin edge — more of the light
    // that went in comes back out of the top — and the edge shows the grey of
    // the cloud's own underside through it. The hollows between turrets hold
    // shade: light that went into them came out of a neighbour's side.
    float depth  = smoothstep(${CLOUD_CUT.toFixed(2)}, ${(CLOUD_CUT + 0.3).toFixed(2)}, heap);
    float hollow = smoothstep(-0.7, 0.5, billow);
    float lit    = wrap * mix(0.6, 1.0, depth) * mix(0.55, 1.0, hollow);
    vec3 colour  = mix(uShade, uLit, lit);

    // Thin at the fringe, opaque in the core: a cumulus a few hundred metres
    // deep hides the sea under it; only its last wisps let it through.
    gl_FragColor = vec4(colour, body * mix(${DECK_FRINGE.toFixed(2)}, 1.0, depth) * uDeckAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/**
 * The deck: the cloud each shadow is cast by, seen from above.
 *
 * It was two or three sheets of a private 128² alpha bake, scrolled on their
 * own drifts, with nothing to do with the shadow on the ground or the sky in
 * the sea. From the archipelago frame that was white wisps laid over every
 * island and the open water, and no cloud stood over its own shadow. Now it is
 * one sheet reading the shadow's own field (`scapeCloudField`), its downsun
 * throw undone, so a cloud, the shadow it casts and its image in the sea are
 * one field in three places. The raw field under the cut is the height of a
 * top, and its slope — two more reads a step apart — is a facet the sun lights
 * round a wrapped curve, so a cumulus has a bright flank and a grey lee in the
 * relief of its own cells. A core is dense (`DECK_ALPHA`), only the fringe is
 * thin, and the sky between clouds is clear.
 *
 * It fades in as the camera climbs past it (`deckReveal`), as before: zoomed
 * in, the camera stands under it and an overhead sheet could only cover the
 * picture.
 */
export function createCloudLayer ({ camera, config, daylight, shadow, billows }: CloudOptions): ScapeModule {
  const size     = config().archipelago.worldSize * DECK_REACH
  const geometry = new PlaneGeometry(size, size)
  const tint     = new Color()

  const lit: IUniform<Color>      = { value: new Color() }
  const shade: IUniform<Color>    = { value: new Color() }
  const sunDir: IUniform<Vector3> = { value: new Vector3(0, 1, 0) }
  const opacity: IUniform<number> = { value: 0 }
  const lift: IUniform<number>    = { value: deckLift(config().atmosphere.cloudHeight, config().farShore.rise) }

  const material = new ShaderMaterial({
    name:           'cloud-deck',
    vertexShader:   DECK_VERTEX,
    fragmentShader: DECK_FRAGMENT,
    uniforms:       { ...shadow.uniforms, uBillowMap: { value: billows }, uLit: lit, uShade: shade, uSunDir: sunDir, uDeckAlpha: opacity, uDeckLift: lift },
    transparent:    true,
    depthWrite:     false,
    side:           DoubleSide,

    // Unfogged on purpose: the deck is the furthest thing in the frame by the
    // camera's distance, and fog would dissolve every cloud as it came in view.
    fog: false,
  })

  const mesh         = new Mesh(geometry, material)
  mesh.name          = 'cloud-deck'
  mesh.rotation.x    = -Math.PI / 2
  mesh.position.y    = config().terrain.waterLevel + config().atmosphere.cloudHeight
  mesh.renderOrder   = LAYER.clouds
  mesh.frustumCulled = false
  mesh.visible       = false

  return defineModule<ScapeConfig>({
    name: 'sky-clouds',

    build (ctx) {
      ctx.scene.add(mesh)
    },

    update (_state) {
      const reveal = deckReveal(deckViewSize(camera, config), config().camera)
      const cover  = config().atmosphere.cloudCover
      const alpha  = deckAlpha(1, cover, reveal)

      mesh.visible = alpha > 0.01
      if (!mesh.visible)
        return

      // Lit by the same sky the fog and the sun are: cloud is the one surface
      // with nothing on it but the sky, so if it does not follow the clock it
      // stays daylight-white through the night.
      tint.copy(daylight.horizon).lerp(WHITE, 0.42 * daylight.day + 0.1)
      lit.value.copy(tint).multiplyScalar(LIT_GAIN)
      shade.value.copy(tint).multiplyScalar(SHADE_GAIN)

      sunDir.value.copy(daylight.direction)
      opacity.value = alpha
    },

    dispose () {
      mesh.removeFromParent()
      material.dispose()
      geometry.dispose()
    },
  })
}

// perf: one unlit transparent quad, drawn only once the camera has climbed past
// it, reading the shadow's own map and uniforms (three raw field reads a
// fragment — here and a step east and north — each the shadow's untiled
// lookup and the bank) and two billow fetches off the sea's shared wave map.
// No bake, no texture of its own; per frame two colours, a direction and an alpha.
