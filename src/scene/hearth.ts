import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  Vector2,
} from 'three'
import { createSeededRng, defineModule } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { DaylightState } from './daylight.ts'
import type { AtmosphereQuality } from './quality.ts'
import type { SeasonState } from './season.ts'
import type { WindState } from './wind.ts'
import { LAYER } from './layers.ts'


/**
 * One flue, at its mouth, in world metres.
 *
 * Published by the landscape rather than found here, the way the lantern hubs
 * are: where a chimney *is* is a fact about the survey and the prop's own frame
 * — see `FARMHOUSE_CHIMNEY` in `props/buildings.ts` — and what comes out of it
 * is this module's business.
 */
export interface HearthStack {
  x: number
  y: number
  z: number
}

export interface HearthOptions {
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Every stack in the archipelago. Empty is a scape with nothing to smoke. */
  stacks: readonly HearthStack[]

  /** Live sky. Unlit geometry, so the light has to be handed to it. */
  daylight: DaylightState

  /**
   * Live year. What decides how hard the fires are banked — see
   * {@link hearthDensity}. One year in the scape, so this is the same instant
   * the grass is withered by rather than a second sample of it.
   */
  season: SeasonState

  /**
   * The scape's one wind. The column is laid over by it and wanders on it, and
   * both stop when it does.
   */
  wind: WindState
}

const TAU = Math.PI * 2

/**
 * Radius of a puff where it leaves the flue, in metres.
 *
 * **Metres, and they stay metres.** A chimney is the same chimney over a wider
 * archipelago and at any zoom, so this is neither world-sized nor frame-sized —
 * the audit the scale rule asks for. A little under a metre is the brick stack
 * plus the first breath of air that has got into the smoke; the shader opens it
 * out from there.
 *
 * It was half a metre when this landed, and half a metre is what the flue
 * actually measures — which turned out to be the wrong thing to measure. At the
 * yard pose the whole column came to a wisp thin enough that `scape:diff` scored
 * it as no change at all, and a plume the instruments cannot see is a plume
 * nobody looking at the scape finds either.
 */
const MOUTH_RADIUS = 0.85

/** How much wider a puff is at the top of its climb than at the mouth. */
const SPREAD = 5

/** Metres a plume wanders either side of the wind, at the top of its climb. */
const WANDER = 1.6

/**
 * Metres a puff stands off the axis of its own column, at the top of the climb.
 *
 * Shape rather than motion, and that distinction is the reason it is a separate
 * constant from {@link WANDER}: this is fixed per puff and carried by nothing,
 * so it survives a capture with every speed in the scape at zero. Without it a
 * windless still is a perfect cone of evenly growing discs — which is what a
 * plume looks like only in a diagram.
 */
const RAGGED = 0.6

/** How far a puff's own size may fall either side of the nominal one. */
const SIZE_SPREAD = 0.4

/**
 * How dense the smoke stands, 0..1.
 *
 * Pure, and exported because it is the claim the module makes: a hearth is lit
 * all year — there is a sauna to heat and a meal to cook in July — and banked
 * harder as the year closes down. `season.growth` is the year's own measure of
 * how much of the growing season is up, so the cold is what is left of it, and
 * there is no second winter curve to keep in step with the first.
 *
 * Clamped at 1 rather than left to run over: `hearth.smoke` is what a plume's
 * opacity is scaled by, and an opacity past 1 is a plume that stops answering
 * its own knob.
 */
export function hearthDensity (config: ScapeConfig, growth: number): number {
  const smoke = Math.max(0, config.hearth.smoke)
  const cold  = Math.min(1, Math.max(0, 1 - growth))

  return Math.min(1, smoke * (1 + Math.max(0, config.hearth.winter) * cold))
}

/**
 * How far downwind the top of a plume has been laid over, in metres.
 *
 * Pure, and the whole of the wind coupling. The response is dimensionless and
 * the rise is metres, so the answer is metres — which is what keeps a plume the
 * same shape on a wider world. It reaches zero on a still day without
 * `hearth.drag` being touched, because the strength it multiplies is the scape's
 * one wind rather than a breeze of this module's own.
 */
export function plumeLean (config: ScapeConfig, strength: number): number {
  return config.hearth.rise * Math.max(0, config.hearth.drag) * Math.max(0, strength)
}

/**
 * A column of smoke, as a stack of screen-facing puffs.
 *
 * `position` carries the quad's own corner rather than a place: every part of
 * where a puff actually is — how far it has climbed, how far the wind has taken
 * it, how wide it has opened out — happens in the vertex stage, because every
 * part of it moves.
 *
 * The billboard is built in *view* space rather than around the vertical axis,
 * and that is deliberate. The camera's yaw is a live control, and a plume
 * billboarded about `y` shears visibly as the scape is turned; offsetting the
 * quad in view space faces it squarely at any heading and at any tilt, which is
 * the one thing a puff of smoke has to do to read as round.
 */
const HEARTH_VERTEX = /* glsl */`
  attribute vec3 aStack;
  attribute vec4 aPuff;

  uniform float uCycle;
  uniform float uRise;
  uniform float uLean;
  uniform vec2  uHeading;
  uniform float uSway;

  varying vec2  vOffset;
  varying float vAge;

  void main () {
    // Evenly spaced along one shared climb, so a count is continuity rather
    // than reach: the puffs are a queue up the column, not a crowd around it.
    float age  = fract(aPuff.x + uCycle);
    float lift = age * uRise;

    // Quadratic in the age, because a puff keeps whatever the wind has already
    // given it and is given more every second it stays up. Linear drift reads
    // as a rigid tilted stick.
    vec2 blown = uHeading * uLean * age * age;

    // Its own wander across the wind, so ten stacks in one breeze are not ten
    // copies of one plume. Carried by the wind's own travel, which means it
    // stops dead when the wind does.
    vec2 across  = vec2(-uHeading.y, uHeading.x);
    float wander = sin(uSway * 0.4 + aPuff.y + age * 2.7) * aPuff.z *
      ${WANDER.toFixed(3)} * age;

    // Fixed per puff and carried by nothing, so a still with every speed at zero
    // is a plume rather than a cone.
    vec2 ragged = vec2(cos(aPuff.y), sin(aPuff.y)) * aPuff.z * ${RAGGED.toFixed(3)} * age;

    vec3 centre = aStack + vec3(
      blown.x + across.x * wander + ragged.x,
      lift,
      blown.y + across.y * wander + ragged.y
    );

    // Opens out as it rises. The mouth radius is the bore of the flue and the
    // spread is what the air does to it on the way up.
    float radius = ${MOUTH_RADIUS.toFixed(3)} * aPuff.w * (1.0 + ${SPREAD.toFixed(3)} * age);

    vec4 view = modelViewMatrix * vec4(centre, 1.0);
    view.xy  += position.xy * radius;

    vOffset = position.xy;
    vAge    = age;

    gl_Position = projectionMatrix * view;
  }
`

/**
 * One colour, thinned two ways.
 *
 * A round falloff across the puff and a life along the column: dense where it
 * leaves the brick, gone by the top of the climb. One palette entry rather than
 * two, for the reason the gulls carry one — the pale end of a plume is the same
 * smoke seen through less of it, and two colours would be two things to keep in
 * one family by hand.
 */
const HEARTH_FRAGMENT = /* glsl */`
  uniform vec3  uColor;
  uniform float uOpacity;

  varying vec2  vOffset;
  varying float vAge;

  void main () {
    float puff = 1.0 - smoothstep(0.15, 1.0, length(vOffset));

    // Out of the flue quickly and away slowly, which is the asymmetry that reads
    // as rising rather than as pulsing. The column holds most of its density
    // through the first half of the climb: fading from a third of the way up
    // left the top two thirds too thin for the diff to see at all.
    float life = smoothstep(0.0, 0.08, vAge) * (1.0 - smoothstep(0.45, 1.0, vAge));

    float alpha = uOpacity * puff * life;

    if (alpha < 0.004)
      discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`

/**
 * Every plume in the archipelago, as one static buffer.
 *
 * Four vertices and two triangles a puff, and nothing is instanced — for the
 * reason the gulls are not: an `InstancedMesh` of a two-triangle geometry spends
 * a 4×4 matrix per puff to say what seven floats already say, and the vertex
 * stage has to place the corner from the age regardless.
 *
 * Deterministic: every draw comes from one forked rng, so adding a stack changes
 * that stack's plume and no other.
 */
export function hearthGeometry (
  stacks: readonly HearthStack[],
  puffs:  number,
  seed:   number,
): BufferGeometry {
  const rng      = createSeededRng(seed)
  const geometry = new BufferGeometry()
  const count    = Math.max(0, Math.floor(puffs))
  const total    = stacks.length * count
  const position = new Float32Array(total * 4 * 3)
  const stack    = new Float32Array(total * 4 * 3)
  const puff     = new Float32Array(total * 4 * 4)
  const index    = new Uint32Array(total * 6)
  const corners  = [ -1, -1, 1, -1, 1, 1, -1, 1 ]

  let slot = 0

  for (const mouth of stacks)
    for (let which = 0; which < count; which += 1) {
      // The slot along the climb is the index and not a draw, so the queue is
      // evenly spaced however many puffs the tier affords. Only the character of
      // a puff — when it wanders, which way, how big — is random.
      const habits = [ which / count, rng.next() * TAU, rng.range(-1, 1), 1 - SIZE_SPREAD * 0.5 + SIZE_SPREAD * rng.next() ]
      const base   = slot * 4

      for (let corner = 0; corner < 4; corner += 1) {
        const vertex = base + corner

        position[vertex * 3]     = corners[corner * 2]
        position[vertex * 3 + 1] = corners[corner * 2 + 1]
        position[vertex * 3 + 2] = 0

        stack[vertex * 3]     = mouth.x
        stack[vertex * 3 + 1] = mouth.y
        stack[vertex * 3 + 2] = mouth.z

        for (let part = 0; part < 4; part += 1)
          puff[vertex * 4 + part] = habits[part]
      }

      const triangles = [ base, base + 1, base + 2, base, base + 2, base + 3 ]

      for (let corner = 0; corner < 6; corner += 1)
        index[slot * 6 + corner] = triangles[corner]

      slot += 1
    }

  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('aStack', new BufferAttribute(stack, 3))
  geometry.setAttribute('aPuff', new BufferAttribute(puff, 4))
  geometry.setIndex(new BufferAttribute(index, 1))

  return geometry
}

/**
 * The smoke over the farmsteads.
 *
 * One draw call for every chimney and flue in the archipelago, from one static
 * buffer with two scalars advancing it: how far round its climb the column has
 * come, and how far the wind has travelled while it did. Nothing is respawned
 * and nothing is uploaded per frame.
 *
 * @returns `null` on a tier with no puffs to give, and on an archipelago with no
 *   hearth in it — a graceful absence rather than a poor version.
 */
export function createHearthSmoke ({
  config,
  quality,
  stacks,
  daylight,
  season,
  wind,
}: HearthOptions): ScapeModule | null {
  if (quality.hearthPuffs < 1 || stacks.length === 0)
    return null

  const geometry = hearthGeometry(stacks, quality.hearthPuffs, config().seed ^ 0x3f0d)
  const material = new ShaderMaterial({
    name:           'hearth',
    vertexShader:   HEARTH_VERTEX,
    fragmentShader: HEARTH_FRAGMENT,
    transparent:    true,
    depthWrite:     false,
    side:           DoubleSide,

    // One pass rather than the back-then-front pair three splits a transparent
    // double-sided material into. A puff is flat: the two cover the same pixels.
    forceSinglePass: true,

    // Unlit and unfogged, the way the gulls are — a plume takes its colour from
    // `uColor`, which is the palette entry already carried to the hour's light.
    fog:      false,
    uniforms: {
      uCycle:   { value: 0 },
      uRise:    { value: config().hearth.rise },
      uLean:    { value: 0 },
      uHeading: { value: new Vector2(1, 0) },
      uSway:    { value: 0 },
      uColor:   { value: new Color() },
      uOpacity: { value: 0 },
    },
  })

  const mesh       = new Mesh(geometry, material)
  mesh.name        = 'hearth-smoke'
  mesh.renderOrder = LAYER.hearth
  mesh.visible     = false

  // Every vertex is placed by the shader from an age that changes, so the
  // bounding volume three would cull against describes a box no puff is in.
  mesh.frustumCulled = false

  const tint    = material.uniforms.uColor.value as Color
  const heading = material.uniforms.uHeading.value as Vector2
  const smoke   = new Color()

  // Climbs, not seconds. Keeping the integral is what lets the rate be turned
  // down to zero and back up without the whole column jumping to where it would
  // have been had it never stopped — the same reason the flock keeps radians.
  let climbed = 0

  return defineModule<ScapeConfig>({
    name: 'hearth-smoke',

    build (ctx) {
      ctx.scene.add(mesh)
    },

    update (_state, frame) {
      const live    = config()
      const density = hearthDensity(live, season.growth)

      material.uniforms.uOpacity.value = density
      mesh.visible                     = density > 0.004

      if (!mesh.visible)
        return

      const rise = Math.max(0.01, live.hearth.rise)

      // In climbs rather than metres, so a plume given a longer rise stretches
      // where it stands instead of jumping a fraction of a column.
      climbed = (climbed + frame.delta * Math.max(0, live.hearth.speed) / rise) % 1

      material.uniforms.uCycle.value = climbed
      material.uniforms.uRise.value  = rise
      material.uniforms.uLean.value  = plumeLean(live, wind.strength)
      material.uniforms.uSway.value  = wind.travel

      heading.set(wind.dirX, wind.dirZ)
      smoke.set(live.palette.smoke)

      // Ambient rather than keyed: a plume is lit from all round by the sky it
      // is standing in, with a little of the sun in it, and dimmed with the day
      // so night smoke is a shape against the stars rather than white paper.
      tint.copy(daylight.hemiSky).lerp(daylight.sun, 0.35)
        .multiply(smoke)
        .multiplyScalar(0.35 + 0.65 * daylight.day)
    },

    dispose () {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  })
}

// perf: one draw call for every hearth in the archipelago, one program, one
// static buffer, and no allocation per frame. A puff is four vertices and two
// triangles, so the desktop tier's ten stacks at eleven puffs are 440 vertices —
// less geometry than a single spruce — and the system is absent rather than
// cheap on the tier that cannot afford a transparent pass it does not need.
