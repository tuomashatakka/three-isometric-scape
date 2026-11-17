import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial, Vector2 } from 'three'
import type { IUniform, OrthographicCamera } from 'three'
import { defineModule, smoothstep } from 'threejs-scene'
import { CLOUD_SHADOW_GLSL } from './cloud-shadow.ts'
import type { CloudShadow } from './cloud-shadow.ts'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import { deckReveal, deckViewSize } from './sky-deck.ts'
import { LAYER } from './layers.ts'
import { hypot } from './hypot.ts'


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

/** The most of the frame a cloud's core hides, at full cover. Its edge is thinner. */
export const DECK_ALPHA = 0.5

/** How far toward the sun the deck looks for its own lit rim, in metres. */
export const RIM_REACH = 26

/**
 * The tone of a cloud's sunlit side and its lee, as gains on the sky's own
 * horizon colour: a top in the sun is whiter than the horizon behind it, the
 * side turned away from it a good deal greyer.
 */
export const LIT_GAIN   = 1.12
export const SHADE_GAIN = 0.62

/** How far past the world the deck runs, as a multiple of the world's width. */
const DECK_REACH = 4.4

const WHITE = new Color('#ffffff')

/**
 * How much of a cloud the eye sees through, given its cut field (0..1), the
 * sky's cover and how far back the camera stands: the deck's alpha, the same
 * arithmetic as the glsl.
 */
export function deckAlpha (field: number, cover: number, reveal: number): number {
  return smoothstep(0.15, 0.9, field) * Math.min(1, cover * 1.2) * reveal * DECK_ALPHA
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
  uniform vec2 uSunFlat;
  uniform float uDeckAlpha;
  varying vec3 vDeckWorld;

  void main () {
    // The cloud at its own place: the shadow's lookup is the cloud upsun of the
    // ground, so the throw is added back to find the cloud over this point.
    vec2 at    = vDeckWorld.xz + uCloudThrow;
    float body = scapeCloudField(at);
    if (body < 0.15) discard;

    // A cloud seen from above is lit on the side the sun is on and grey on the
    // other: compare the field a little way toward the sun with the field here.
    // Thinning toward the sun is the lit edge; thickening is the lee of a tower.
    float toward = scapeCloudField(at + uSunFlat * ${RIM_REACH.toFixed(1)});
    float lit    = clamp(0.62 + 1.6 * (body - toward), 0.0, 1.0);
    vec3 colour  = mix(uShade, uLit, lit);

    gl_FragColor = vec4(colour, smoothstep(0.15, 0.9, body) * uDeckAlpha);
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
 * one field in three places. It is lit from the sun's side by one more read of
 * the field, so a cloud has a bright flank and a grey lee rather than being a
 * flat white smudge, and it is cut where the field is, so the sky between
 * clouds is clear.
 *
 * It fades in as the camera climbs past it (`deckReveal`), as before: zoomed
 * in, the camera stands under it and an overhead sheet could only cover the
 * picture.
 */
export function createCloudLayer ({ camera, config, daylight, shadow }: CloudOptions): ScapeModule {
  const size     = config().archipelago.worldSize * DECK_REACH
  const geometry = new PlaneGeometry(size, size)
  const tint     = new Color()

  const lit: IUniform<Color>       = { value: new Color() }
  const shade: IUniform<Color>     = { value: new Color() }
  const sunFlat: IUniform<Vector2> = { value: new Vector2(1, 0) }
  const opacity: IUniform<number>  = { value: 0 }

  const material = new ShaderMaterial({
    name:           'cloud-deck',
    vertexShader:   DECK_VERTEX,
    fragmentShader: DECK_FRAGMENT,
    uniforms:       { ...shadow.uniforms, uLit: lit, uShade: shade, uSunFlat: sunFlat, uDeckAlpha: opacity },
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

      const flat = hypot(daylight.direction.x, daylight.direction.z)
      if (flat > 1e-3)
        sunFlat.value.set(daylight.direction.x / flat, daylight.direction.z / flat)

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
// it, reading the shadow's own map and uniforms (two field reads a fragment,
// each the shadow's untiled lookup and the bank). No bake, no texture of its
// own; per frame two colours, a direction and an alpha.
