import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
} from 'three'
import type { OrthographicCamera } from 'three'
import { createSeededRng, defineModule } from 'threejs-scene'
import type { LiveConfig, ScapeConfig, ScapeModule } from './config.ts'
import type { Colony } from './landscape/colony.ts'
import type { DaylightState } from './daylight.ts'
import type { AtmosphereQuality } from './quality.ts'
import type { WeatherState } from './weather.ts'
import { LAYER } from './layers.ts'


export interface BirdOptions {
  camera:  OrthographicCamera
  config:  LiveConfig
  quality: AtmosphereQuality

  /** Where the flocks hang. Empty is a coast with nothing for a gull to be over. */
  colonies: readonly Colony[]

  /** Live day. What decides whether the birds are up at all — see `uOpacity`. */
  daylight: DaylightState

  /** Live weather. A gull sits a squall out; it does not fly through one. */
  weather: WeatherState
}

const TAU = Math.PI * 2

/**
 * Where a bird's ring sits between the colony's middle and its rim.
 *
 * Never zero: a flock with a bird on the axis has one bird that never goes
 * anywhere, and the eye finds it immediately.
 */
const RING_INNER = 0.42

/** Share of the ceiling the lowest bird flies at. */
const FLOOR_SHARE = 0.45

/** How much larger or smaller than the nominal wingspan a bird may be. */
const SIZE_SPREAD = 0.36

/**
 * Distinct angular rates, and the reason they are counted rather than spread.
 *
 * The sweep is one accumulating scalar and every bird reads it at its own rate,
 * so the accumulator has to be wrapped somewhere or spend an afternoon growing
 * into a float that can no longer resolve a degree. Wrapping is only invisible
 * if every bird arrives back at the bearing it started on, which needs
 * `wrap * rate` to be a whole number of turns for *every* rate in the buffer.
 * Quantised to `n` steps of `1/n`, a wrap at `n` turns satisfies all of them at
 * once — the same trick, and the same arithmetic, that `rain.ts` wraps its fall
 * with. Five rates is more variety than a wheeling flock can be read to have.
 */
const RATE_STEPS = 5

/**
 * The smallest a gull is allowed to be on screen, as a share of the frame.
 *
 * The one place this module is sized against the *view* rather than against the
 * world, and it is worth being explicit about why. A capture is five hundred
 * pixels tall and the default pose is five hundred metres of sea, so a metre is
 * a pixel: a bird at its honest 1.6 m wingspan is a pixel and a half, which is
 * not a bird, it is grain — and the grade and the grain pass on top of it make
 * sure of that. Below this share the wingspan is held at a mark instead, the way
 * a chart holds a symbol at a legible size however far out the map is drawn.
 *
 * Above it — anywhere closer than about 90 metres of view — the floor stops
 * binding and the bird is exactly as wide as the config says it is, which is
 * where a still of one can be measured against the boat under it.
 */
const SCREEN_FLOOR = 0.018

/** Metres a bird rises and falls over one turn of its ring. */
const BOB = 0.9

/** How far a bird banks into its turn, in radians. */
const BANK = 0.34

/** Wing chord at the shoulder and at the tip, as fractions of the wingspan. */
const ROOT_CHORD = 0.22
const TIP_CHORD  = 0.05

/** How far the tip trails the shoulder, as a fraction of the wingspan. */
const SWEEP_BACK = 0.3

/** How far a tip travels through a wingbeat, as a fraction of the wingspan. */
const BEAT = 0.36

/** Fixed lift of the tips at rest — a gliding gull holds a shallow V. */
const DIHEDRAL = 0.05

/** How much of the flock a full squall keeps on the water. */
const SQUALL = 0.7

/** How much of the daylight has to be left before the birds are up. */
const DUSK_IN  = 0.1
const DUSK_OUT = 0.42

/**
 * One gull: two wings, and no body.
 *
 * The wings meet at the axis with a chord of `ROOT_CHORD` either side, which is
 * a shoulder wide enough to read as a body from above — and above is the only
 * angle this camera has. A separate body would be two more triangles per bird to
 * fill pixels that are already filled.
 *
 * `position` carries the wing's own coordinates rather than a place: `x` is the
 * signed span from shoulder to tip, `y` is the chord from trailing to leading
 * edge. Everything that turns those into a point in the world happens in the
 * vertex stage, because every part of it moves.
 */
const BIRD_VERTEX = /* glsl */`
  attribute vec4 aOrbit;
  attribute vec4 aBird;

  uniform float uSweep;
  uniform float uBeat;
  uniform float uWingspan;
  uniform float uCeiling;
  uniform float uWaterLevel;

  varying float vSpan;
  varying float vChord;

  void main () {
    float span  = position.x;
    float reach = abs(span);
    float chord = position.y;

    float angle  = aOrbit.w + uSweep * aBird.x;
    vec2 centre  = aOrbit.xy;
    vec2 radial  = vec2(cos(angle), sin(angle));
    vec2 tangent = vec2(-radial.y, radial.x);

    // The wing plane, banked into the turn. The outboard wing lifts, which is
    // the whole reason a wheeling flock reads as wheeling rather than as a ring
    // of cardboard: from directly above, a level bird and a banked one differ
    // only in how much of the wing you can see.
    float lean = ${BANK.toFixed(3)} * sign(aBird.x);
    vec3 up      = vec3(radial.x * sin(lean), cos(lean), radial.y * sin(lean));
    vec3 across  = vec3(radial.x * cos(lean), -sin(lean), radial.y * cos(lean));
    vec3 forward = vec3(tangent.x, 0.0, tangent.y);

    // Narrow and swept toward the tip, and beating about the shoulder. The beat
    // is scaled by the reach so the shoulder stays where the body is.
    float halfChord = mix(${ROOT_CHORD.toFixed(3)}, ${TIP_CHORD.toFixed(3)}, reach);
    float lift      = (${DIHEDRAL.toFixed(3)} + ${BEAT.toFixed(3)} * sin(uBeat + aBird.z)) * reach;
    vec3 local      = vec3(span * 0.5, lift, chord * halfChord - ${SWEEP_BACK.toFixed(3)} * reach);

    float wing   = uWingspan * aBird.w;
    float height = uWaterLevel + uCeiling * aBird.y +
      ${BOB.toFixed(3)} * sin(angle * 2.0 + aOrbit.w);

    vec3 world = vec3(centre.x + radial.x * aOrbit.z, height, centre.y + radial.y * aOrbit.z) +
      (across * local.x + up * local.y + forward * local.z) * wing;

    vSpan  = reach;
    vChord = chord;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`

/**
 * A gull's three tones, from one colour.
 *
 * One entry in the palette rather than three, for the reason the star field
 * carries one: a gull is a white bird with a grey back and black tips, and the
 * grey and the black are that same white seen at a fraction of it. Three
 * separate colours would be three things to keep in one family by hand, and the
 * first retune of the palette is when they stop being in one.
 */
const BIRD_FRAGMENT = /* glsl */`
  uniform vec3 uPlumage;
  uniform vec3 uLight;
  uniform float uOpacity;

  varying float vSpan;
  varying float vChord;

  void main () {
    vec3 tone = mix(uPlumage, uPlumage * 0.55, smoothstep(0.18, 0.62, vSpan));
    tone      = mix(tone, uPlumage * 0.16, smoothstep(0.8, 1.0, vSpan));

    // Soft along the chord only. A bird is four pixels across from the far end
    // of the zoom range, and a hard edge at that size is a flickering speck;
    // fading the trailing and leading edges is what lets it settle into one.
    float edge = 1.0 - 0.45 * vChord * vChord;

    gl_FragColor = vec4(tone * uLight, uOpacity * edge);

    if (gl_FragColor.a < 0.004)
      discard;
  }
`

/** The four buffers one wing writes into. */
interface FlockBuffers {
  position: Float32Array
  orbit:    Float32Array
  bird:     Float32Array
  index:    Uint32Array
}

/**
 * One wing, as four corners and two triangles.
 *
 * The corners run from the shoulder out to the tip on `side`, and the whole
 * bird's orbit and habits are repeated at every one of them — the shader reads
 * them per vertex, so they have to be there per vertex.
 */
function writeWing (
  slot:  number,
  side:  number,
  ring:  readonly number[],
  flier: readonly number[],
  into:  FlockBuffers,
): void {
  const corners = [ 0, -1, 0, 1, side, 1, side, -1 ]
  const base    = slot * 4

  for (let corner = 0; corner < 4; corner += 1) {
    const vertex = base + corner

    into.position[vertex * 3]     = corners[corner * 2]
    into.position[vertex * 3 + 1] = corners[corner * 2 + 1]
    into.position[vertex * 3 + 2] = 0

    for (let part = 0; part < 4; part += 1) {
      into.orbit[vertex * 4 + part] = ring[part]
      into.bird[vertex * 4 + part]  = flier[part]
    }
  }

  const triangles = [ base, base + 1, base + 2, base, base + 2, base + 3 ]

  for (let corner = 0; corner < 6; corner += 1)
    into.index[slot * 6 + corner] = triangles[corner]
}

/**
 * Every bird in the archipelago, as one static buffer.
 *
 * Eight vertices and four triangles each: two wing quads sharing a shoulder.
 * Nothing is instanced, for the reason the rain is not — an `InstancedMesh` of a
 * four-triangle geometry spends a 4×4 matrix per bird to say what eight floats
 * already say, and the vertex stage has to build the frame from the bearing
 * regardless.
 *
 * The flock is dealt across the colonies rather than scattered over them, so a
 * count is a count: twelve birds and three colonies are four birds each, and a
 * colony the survey could not site takes no birds with it.
 */
export function birdGeometry (
  colonies: readonly Colony[],
  count:    number,
  seed:     number,
): BufferGeometry {
  const rng      = createSeededRng(seed)
  const geometry = new BufferGeometry()
  const total    = colonies.length > 0 ? count : 0
  const position = new Float32Array(total * 8 * 3)
  const orbit    = new Float32Array(total * 8 * 4)
  const bird     = new Float32Array(total * 8 * 4)
  const index    = new Uint32Array(total * 12)

  // Which way each colony turns. A flock all going one way reads as a flock;
  // mixed bearings read as a swarm of flies, whatever the bird is shaped like.
  const turn = colonies.map(() => rng.next() < 0.5 ? -1 : 1)

  for (let which = 0; which < total; which += 1) {
    const colony = colonies[which % colonies.length]
    const ring   = [
      colony.x,
      colony.z,
      colony.radius * (RING_INNER + (1 - RING_INNER) * rng.next()),
      rng.next() * TAU,
    ]
    const flier = [
      turn[which % colonies.length] * (Math.floor(rng.next() * RATE_STEPS) + 3) / RATE_STEPS,
      FLOOR_SHARE + (1 - FLOOR_SHARE) * rng.next(),
      rng.next() * TAU,
      1 - SIZE_SPREAD * 0.5 + SIZE_SPREAD * rng.next(),
    ]

    for (let wing = 0; wing < 2; wing += 1)
      writeWing(which * 2 + wing, wing === 0 ? -1 : 1, ring, flier, {
        position,
        orbit,
        bird,
        index,
      })
  }

  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('aOrbit', new BufferAttribute(orbit, 4))
  geometry.setAttribute('aBird', new BufferAttribute(bird, 4))
  geometry.setIndex(new BufferAttribute(index, 1))

  return geometry
}

/**
 * How much of the flock is in the air, 0..1.
 *
 * Pure, and exported because it is the claim the module makes: the birds are up
 * in daylight and down at night, and a squall keeps most of what is left on the
 * water. Neither threshold is a knob — a gull's working day is a fact about the
 * light rather than a thing to tune, and `birds.flight` is the one strength that
 * scales all of it, including to nothing.
 */
export function birdsAloft (flight: number, day: number, fall: number): number {
  const dusk = Math.min(1, Math.max(0, (day - DUSK_IN) / (DUSK_OUT - DUSK_IN)))

  return flight * dusk * dusk * (3 - 2 * dusk) * (1 - SQUALL * Math.min(1, Math.max(0, fall)))
}

/**
 * The gulls.
 *
 * One draw call for every flock in the archipelago, from one static buffer with
 * two scalars advancing it: how far round the ring the sweep has come, and where
 * in the wingbeat the wings are. Nothing is respawned and nothing is uploaded
 * per frame.
 *
 * Where the flocks *are* is the survey's answer, not this module's — see
 * `landscape/colony.ts`. What arrives here is a list of centres and radii over
 * open water, and everything metre-sized about the birds themselves — how wide
 * a wing is, how high they cruise — stays in metres whatever the world or the
 * frame does, because a gull is a gull at any zoom.
 */
export function createBirdFlocks ({
  camera,
  config,
  quality,
  colonies,
  daylight,
  weather,
}: BirdOptions): ScapeModule | null {
  if (quality.birdCount < 1 || colonies.length === 0)
    return null

  const geometry = birdGeometry(colonies, quality.birdCount, config().seed ^ 0x6c11)
  const plumage  = new Color(config().palette.gull)
  const material = new ShaderMaterial({
    name:           'birds',
    vertexShader:   BIRD_VERTEX,
    fragmentShader: BIRD_FRAGMENT,
    transparent:    true,
    depthWrite:     false,
    side:           DoubleSide,

    // Two-sided and one draw, for the reason the rain is: three otherwise splits
    // a transparent double-sided material into a back pass and a front pass, and
    // for a flat wing the two cover exactly the same pixels.
    forceSinglePass: true,
    fog:             false,
    uniforms:        {
      uSweep:      { value: 0 },
      uBeat:       { value: 0 },
      uWingspan:   { value: config().birds.wingspan },
      uCeiling:    { value: config().birds.ceiling },
      uWaterLevel: { value: config().terrain.waterLevel },
      uPlumage:    { value: plumage },
      uLight:      { value: new Color() },
      uOpacity:    { value: 0 },
    },
  })

  const mesh       = new Mesh(geometry, material)
  mesh.name        = 'birds'
  mesh.renderOrder = LAYER.birds
  mesh.visible     = false

  // Every vertex is placed by the shader from a bearing that changes, so the
  // bounding volume three would cull against describes a box no bird is in.
  mesh.frustumCulled = false

  const light = material.uniforms.uLight.value as Color

  // Radians swept and radians beaten, rather than seconds elapsed. Keeping the
  // integrals is what lets either rate be turned down to zero and back up
  // without the whole flock jumping to where it would have been had it never
  // stopped — the same reason the fall keeps metres rather than the clock.
  let swept  = 0
  let beaten = 0

  return defineModule<ScapeConfig>({
    name: 'birds',

    build (ctx) {
      ctx.scene.add(mesh)
    },

    update (_state, frame) {
      const birds   = config().birds
      const opacity = birdsAloft(birds.flight, daylight.day, weather.fall)

      material.uniforms.uOpacity.value = opacity
      mesh.visible                     = opacity > 0.004

      if (!mesh.visible)
        return

      swept  = (swept + frame.delta * birds.speed) % (TAU * RATE_STEPS)
      beaten = (beaten + frame.delta * birds.flap * TAU) % TAU

      const viewSize = camera.userData.viewSize as number ?? config().camera.viewSize

      material.uniforms.uSweep.value      = swept
      material.uniforms.uBeat.value       = beaten
      material.uniforms.uWingspan.value   = Math.max(birds.wingspan, viewSize * SCREEN_FLOOR)
      material.uniforms.uCeiling.value    = birds.ceiling
      material.uniforms.uWaterLevel.value = config().terrain.waterLevel

      plumage.set(config().palette.gull)

      // Unlit geometry, so the light has to be handed to it. The key's own
      // colour pulled halfway to the sky's, which is what a pale bird under an
      // overcast actually is — and dimmed with the day so the last birds in are
      // silhouettes rather than white paper against a blue hour.
      light.copy(daylight.sun).lerp(daylight.hemiSky, 0.5)
        .multiplyScalar(0.3 + 0.7 * daylight.day)
    },

    dispose () {
      mesh.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  })
}

// perf: one draw call for every flock in the archipelago, one program, one
// static buffer, and no allocation per frame. A bird is eight vertices and four
// triangles, so the desktop tier's 140 gulls are 1120 vertices — less geometry
// than a single spruce, and the whole system is absent rather than cheap on the
// tier that cannot afford a transparent pass it does not need.
