import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three'
import type { IUniform, OrthographicCamera } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import { CLOUD_SHADOW_GLSL } from './cloud-shadow.ts'
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
}

/** The most of the frame a cloud's core hides, at full cover. Its thin edge lets the sea through. */
export const DECK_ALPHA = 0.74

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
 * The share of the key a top's facet catches, 0..1: a wrapped lambert,
 * because a cloud scatters light round its own curve and a lee is never black.
 */
export const TOP_WRAP = 0.45

export function topLight (facing: number): number {
  return Math.min(1, Math.max(0, (facing + TOP_WRAP) / (1 + TOP_WRAP)))
}

const DECK_VERTEX = /* glsl */`
  varying vec3 vDeckWorld;
  void main () {
    vec4 world  = modelMatrix * vec4(position, 1.0);
    vDeckWorld  = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const DECK_FRAGMENT = /* glsl */`
${CLOUD_SHADOW_GLSL}
  uniform vec3 uLit;
  uniform vec3 uShade;
  uniform vec3 uSunDir;
  uniform float uDeckAlpha;
  varying vec3 vDeckWorld;

  void main () {
    // The cloud at its own place: the shadow's lookup is the cloud upsun of the
    // ground, so the throw is added back to find the cloud over this point.
    vec2 at    = vDeckWorld.xz + uCloudThrow;
    float raw  = scapeCloudRaw(at);
    float body = scapeCloudCut(raw);
    if (body < ${EDGE_CUT.toFixed(2)}) discard;

    // The top's height is the raw field, which keeps rising inside the cut
    // where the cut field is a plateau; its slope, two reads a step apart, is
    // the facet the sun lights. Two reads rather than the screen's
    // derivatives: those are taken over a pixel quad, and on a field this
    // minified they stipple the deck into grit.
    float hx    = scapeCloudRaw(at + vec2(${TOP_STEP.toFixed(1)}, 0.0)) - raw;
    float hz    = scapeCloudRaw(at + vec2(0.0, ${TOP_STEP.toFixed(1)})) - raw;
    vec2 slope  = vec2(hx, hz) * ${(TOP_RELIEF / TOP_STEP).toFixed(2)};
    vec3 n      = normalize(vec3(-slope.x, 1.0, -slope.y));

    // Lit on the facets turned to the sun, wrapped round the curve because a
    // cloud scatters light round itself and a lee is never black.
    float facing = dot(n, normalize(uSunDir));
    float wrap   = clamp((facing + ${TOP_WRAP.toFixed(2)}) / ${(1 + TOP_WRAP).toFixed(2)}, 0.0, 1.0);

    // A thick core is brighter from above than a thin edge — more of the light
    // that went in comes back out of the top — and the edge shows the grey of
    // the cloud's own underside through it.
    float depth  = smoothstep(0.0, 0.8, body);
    float lit    = wrap * mix(0.72, 1.0, depth);
    vec3 colour  = mix(uShade, uLit, lit);

    gl_FragColor = vec4(colour, smoothstep(${EDGE_CUT.toFixed(2)}, 0.6, body) * uDeckAlpha);
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
export function createCloudLayer ({ camera, config, daylight, shadow }: CloudOptions): ScapeModule {
  const size     = config().archipelago.worldSize * DECK_REACH
  const geometry = new PlaneGeometry(size, size)
  const tint     = new Color()

  const lit: IUniform<Color>      = { value: new Color() }
  const shade: IUniform<Color>    = { value: new Color() }
  const sunDir: IUniform<Vector3> = { value: new Vector3(0, 1, 0) }
  const opacity: IUniform<number> = { value: 0 }

  const material = new ShaderMaterial({
    name:           'cloud-deck',
    vertexShader:   DECK_VERTEX,
    fragmentShader: DECK_FRAGMENT,
    uniforms:       { ...shadow.uniforms, uLit: lit, uShade: shade, uSunDir: sunDir, uDeckAlpha: opacity },
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
// lookup and the bank; one more than the flat deck's two). No bake, no texture of its
// own; per frame two colours, a direction and an alpha.
