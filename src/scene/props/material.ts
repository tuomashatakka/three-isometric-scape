import { Color, Vector2 } from 'three'
import type { IUniform, MeshStandardMaterial, WebGLProgramParametersWithUniforms } from 'three'
import { kitMaterial, markShared } from 'threejs-scene/modules/assets'
import { NOTHING_SKIPPED } from '../audit.ts'
import type { ScapeSkips } from '../audit.ts'
import type { LiveConfig } from '../config.ts'
import { shadeDirection } from '../landscape/aspect.ts'
import type { Vec2 } from '../landscape/path.ts'
import type { SeasonState } from '../season.ts'
import { createTextureCatalogue } from '../textures/catalogue.ts'
import type { TextureCatalogue } from '../textures/catalogue.ts'
import { GROUND_NORMAL_GAIN } from '../textures/normals.ts'
import type { WeatherState } from '../weather.ts'
import type { WindState } from '../wind.ts'

/** The two materials every solid thing in the scape draws with. */
export interface ScapeMaterials {

  /** Terrain, buildings, stone, anything that does not move. */
  ground: MeshStandardMaterial

  /** Instanced vegetation — same look, plus a vertex sway. */
  foliage: MeshStandardMaterial

  /** Advance cloud drift, the wind, the year and the weather. Allocation-free. */
  update(wind: WindState, season: SeasonState, weather: WeatherState): void
  dispose(): void
}

/**
 * World-space cloud shadow, injected into a stock `MeshStandardMaterial`.
 *
 * Darkening the albedo before lighting is not physically a shadow, but at this
 * scale it reads as one for the cost of a single texture fetch — and unlike a
 * real shadow caster it costs nothing per light and never aliases.
 *
 * Two floats, not three, because the fragment side never reads `y` — and that
 * is the whole reason, which is worth saying plainly because this comment used
 * to claim a bigger one.
 *
 * It asserted that the scape was overrunning a PowerVR D-Series handset's
 * `MAX_VARYING_COMPONENTS` of 60 — 15 vec4, the floor GLES 3.0 permits — and
 * that trimming these varyings was what would fix the context loss. Measured
 * rather than assumed, the ground program spends **15 components of the 60**:
 * `vViewPosition` (3), `vColor` (4), `vFogDepth` (1), one directional shadow
 * coordinate (4), and these three. `flatShading` means `vNormal` is never even
 * declared. The scape sits four times under the ceiling and always did, and the
 * library's own tilt-shift starter — heavier in every dimension, no injection
 * at all — runs on the same handset. The diet was harmless and the diagnosis
 * was wrong.
 *
 * What survives is the mechanism, which is real: a program that fails to link
 * gets bound by three regardless, every draw against it raises
 * INVALID_OPERATION, and ANGLE takes the context away seconds later, looking
 * for all the world like heat. `scene/audit.ts` now reads LINK_STATUS before
 * anything draws, so the next round argues from the driver's answer instead of
 * from an arithmetic guess.
 */
const CLOUD_PARS_VERTEX = /* glsl */`
  varying vec2 vScapeGround;
`

const CLOUD_WORLD_VERTEX = /* glsl */`
  #include <project_vertex>
  vec4 scapeLocal = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    scapeLocal = instanceMatrix * scapeLocal;
  #endif
  vScapeGround = (modelMatrix * scapeLocal).xz;
`

const CLOUD_PARS_FRAGMENT = /* glsl */`
  uniform sampler2D uCloudMap;
  uniform vec2 uCloudOffset;
  uniform float uCloudScale;
  uniform float uCloudStrength;
  varying vec2 vScapeGround;
`

const CLOUD_FRAGMENT = /* glsl */`
  #include <color_fragment>
  float scapeCloud = texture2D(uCloudMap, vScapeGround * uCloudScale + uCloudOffset).r;
  diffuseColor.rgb *= mix(1.0, 0.52 + 0.48 * scapeCloud, uCloudStrength);
`

/**
 * Which way the surface is turned, and only where something reads it.
 *
 * Emitted with the ground pass rather than with the cloud shadow, because the
 * ground is the only reader and foliage never receives it — a varying that is
 * written and declared but never read still occupies a slot on drivers that pack
 * before they eliminate. Worth doing on principle; not, as it turned out, what
 * the handset was dying of.
 *
 * `x` is how far the face points at the sky. Three readers: the grain weights
 * itself by how horizontal the surface is, and so do lying snow and standing
 * rain. All three are the same question, so all three are answered by the same
 * interpolated float.
 *
 * `y` is how far it is turned *away from the sun*, -1..1, and it is the second
 * component of one `vec2` rather than a second varying on purpose — a driver
 * that packs before it eliminates gives a `float` a whole slot, so a companion
 * float would have cost four times what riding along here does. A bearing times
 * a shaped steepness rather than a raw dot against the horizontal normal: level
 * ground still has no aspect, but this island runs at a fifth of a grade nearly
 * everywhere and a raw dot gives all of it a fifth of the aspect it has. The cpu
 * half of the same rule — the moss the ground colour is built with — is
 * `shadeAmount` in `landscape/aspect.ts`, and the two constants below are that
 * module's `LEAN_FLOOR` and `LEAN_FULL`. They have to agree.
 */
const UP_PARS_VERTEX = /* glsl */`
  varying vec2 vScapeFace;
  uniform vec2 uShadeDir;
`

const UP_WORLD_VERTEX = /* glsl */`
  vec3 scapeNormal = objectNormal;
  #ifdef USE_INSTANCING
    scapeNormal = mat3(instanceMatrix) * scapeNormal;
  #endif
  vec3 scapeWorldNormal = normalize(mat3(modelMatrix) * scapeNormal);
  float scapeLean = max(length(scapeWorldNormal.xz), 1e-4);
  vScapeFace = vec2(
    scapeWorldNormal.y,
    dot(scapeWorldNormal.xz / scapeLean, uShadeDir) * smoothstep(0.02, 0.18, scapeLean)
  );
`

const UP_PARS_FRAGMENT = /* glsl */`
  varying vec2 vScapeFace;
`

/**
 * Per-instance foliage sway, on the scape's one wind.
 *
 * The amplitude is weighted by local height so trunks stay planted while tips
 * travel, and the phase is the instance's own world translation *projected onto
 * the wind bearing* — which is the whole difference between this and what it
 * replaced. A phase built from `x * 0.35 + z * 0.27` decorrelates a field of
 * grass, and that is all it does: the pulse crosses the meadow along a fixed
 * diagonal nobody chose, and it crosses it whichever way the wind is blowing.
 * Projected instead, the crest travels *downwind*, so a gust arriving off the
 * sea reads as one wave running up the hillside.
 *
 * The sway itself is a lean plus a flutter rather than a symmetric wobble. Grass
 * in a wind does not oscillate about vertical — it is pushed over and shivers
 * there, which is what the `0.6 +` is.
 */
const WIND_PARS_VERTEX = /* glsl */`
  uniform float uWindPhase;
  uniform float uWindStrength;
  uniform vec2 uWindDir;
`

const WIND_VERTEX = /* glsl */`
  #include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 swayOrigin = instanceMatrix[3].xyz;
  #else
    vec3 swayOrigin = vec3(0.0);
  #endif
  float swayPhase  = uWindPhase * 1.7 + dot(swayOrigin.xz, uWindDir) * 0.22;
  float swayAmount = pow(max(transformed.y, 0.0), 1.4) * uWindStrength * 0.03;
  vec2 swayLean    = uWindDir * (0.6 + 0.4 * sin(swayPhase)) +
    vec2(-uWindDir.y, uWindDir.x) * sin(swayPhase * 0.77 + 1.3) * 0.38;
  transformed.x += swayLean.x * swayAmount;
  transformed.z += swayLean.y * swayAmount;
`

/**
 * Ground grain.
 *
 * Vertex colour alone gives the terrain its *palette* but not its *surface* —
 * at this camera distance a metre of ground is a few pixels wide, and without
 * something at that scale it reads as coloured paper. Two things fix it: a fine
 * albedo mottle, and a real normal map baked off the same field, which is what
 * makes the light catch on soil rather than sliding over it.
 *
 * World-space projection, weighted by how horizontal the surface is — so the
 * shared material can carry it without smearing streaks down every barn wall.
 *
 * Two octaves, not one. A single scale gives ground a *texture* but not a
 * *history*: real soil has metre-wide patches of wear and damp under the
 * centimetre-wide grit, and without the broad octave the fine one tiles into a
 * visible weave the moment you zoom out past its repeat. The broad fetch is the
 * same texture at a fraction of the frequency, so it costs a sampler read and no
 * memory at all.
 *
 * The third thing here is roughness. Uniform roughness is the giveaway that a
 * surface is a render — nothing outdoors reflects evenly — so the fine grain
 * also polishes and dulls the specular by a few percent, which is what makes wet
 * silt read as different material from dry heath under the same vertex colour.
 */
const DETAIL_PARS_FRAGMENT = /* glsl */`
  uniform sampler2D uDetailMap;
  uniform sampler2D uBarkMap;
  uniform float uDetailScale;
  uniform float uDetailStrength;
  uniform float uPropGrain;
`

/**
 * What only the six-tap path reads, declared only where it is read.
 *
 * A sampler that is declared and never sampled still occupies a binding in some
 * drivers' accounting, and the tier that would pay for it is the one with the
 * least to spend — the phone path samples neither of these and used to declare
 * both. Keeping the declarations with the fetches also makes the claim testable:
 * `material.test.ts` asserts the lite program contains no mention of the normal
 * map at all, which is a fact about the shader rather than a promise about it.
 */
const DETAIL_FULL_PARS_FRAGMENT = /* glsl */`
  uniform sampler2D uGroundNormalMap;
  uniform sampler2D uWearMap;
  uniform float uDetailMacro;
`

/**
 * Relief, in uv rather than in metres.
 *
 * How deep the grit stands is *how much grit there is*, so the march reads
 * `terrain.detailGrain` and there is no second knob saying the same thing in
 * different units. A fiftieth of a tile is about three centimetres at the
 * authored 7.5 m grain scale, which is soil; past a tenth the ground starts to
 * read as gravel, and past that as rubble.
 *
 * Expressed as a fraction of the *tile* rather than of the world, which is what
 * makes it independent of `detailScale` — a coarser grain is bigger grit, not
 * deeper grit, and the shift on screen grows with the tile on its own.
 */
const RELIEF_DEPTH = 0.02

/**
 * Parallax occlusion, on the ground only.
 *
 * Extrusion without a vertex. The ray from the fragment to the eye is walked
 * down through the height the normal map is already carrying in its alpha, and
 * wherever it first goes under the surface is the texel that should have been
 * there — so a rut has a near wall that hides its floor, grit occludes the
 * grit behind it, and the whole read shifts as the camera moves rather than
 * sliding about like a decal.
 *
 * `vViewPosition` points from the fragment to the camera in *view* space, and
 * `mat3(viewMatrix)` is a rotation, so its transpose is its inverse — which in
 * GLSL is a right-multiply. No new varying, the same trick the snow line uses.
 *
 * The horizontal denominator is clamped: at grazing incidence the offset goes
 * to infinity and the march walks off across the island. 0.25 is about
 * fourteen degrees, which is under the camera's own shallowest tilt.
 */
function reliefFragment (steps: number): string {
  return /* glsl */`
    vec3 scapeToEye = normalize(normalize(vViewPosition) * mat3(viewMatrix));
    vec2 scapeWalk  = -scapeToEye.xz / max(0.25, scapeToEye.y) *
      (${RELIEF_DEPTH} * uDetailStrength) / float(${steps});
    float scapeLayer = 1.0;
    float scapeFound = texture2D(uGroundNormalMap, scapeUv).a;

    for (int scapeStep = 0; scapeStep < ${steps}; scapeStep++) {
      if (scapeFound >= scapeLayer)
        break;

      scapeUv    += scapeWalk;
      scapeLayer -= 1.0 / float(${steps});
      scapeFound  = texture2D(uGroundNormalMap, scapeUv).a;
    }
  `
}

/**
 * The half of the scape the ground grain never reached.
 *
 * Every term above weighs itself by `scapeFlat` — how horizontal the face is —
 * because a world-space projection smears streaks down anything vertical. That
 * is correct, and it left every wall, gable, hull, jetty timber and granite face
 * in the scape with no surface at all: flat-shaded colour, and nothing at the
 * scale of a plank or a grain of stone. The two materials carry the whole place,
 * so "props have no texture" was really "the injection has a `1 - flat` case
 * nobody had written".
 *
 * This is that case. The projection is turned on its side to match: the
 * horizontal coordinate wraps several times around a stem or along a wall while
 * the vertical one crawls, which is what makes the read run *along* a board
 * rather than across it. One fetch, weighted to nothing on ground the terms
 * above already own, so the two never argue over the same fragment.
 *
 * World height comes from `vViewPosition` the same way the snow line's does —
 * the view matrix is rigid, so a point's height is the camera's less that
 * position projected onto the matrix's second column. No extra varying.
 */
const PROP_GRAIN_FRAGMENT = /* glsl */`
  float scapeSteep = (1.0 - scapeFlat) * uPropGrain;

  if (scapeSteep > 0.001) {
    float scapeUpright = cameraPosition.y - dot(vViewPosition, viewMatrix[1].xyz);
    vec2 scapeBarkUv   = vec2(
      (vScapeGround.x + vScapeGround.y) * uDetailScale * 0.7,
      scapeUpright * uDetailScale * 0.16
    );
    // Stretched hard, and then stretched again. Four octaves of value noise pile
    // up around their own mean, so the raw fetch varies by a few per cent and a
    // wall treated with it is a wall you cannot tell from a flat one — measured,
    // not guessed: the first version of this moved 0.00% of the frame. The map
    // is two octaves for the same reason, and the remap is what turns the rest
    // of the range into boards.
    float scapeBark = clamp((texture2D(uBarkMap, scapeBarkUv).r - 0.5) * 2.4 + 0.5, 0.0, 1.0);

    diffuseColor.rgb *= 1.0 + scapeSteep * (scapeBark - 0.5) * 1.5;

    // Weathering runs downward. The underside of a course of boards and the foot
    // of a wall stay damp longest, so the darker half of the grain also dulls.
    diffuseColor.rgb *= 1.0 - scapeSteep * 0.22 * pow(1.0 - scapeBark, 3.0);
    roughnessFactor   = clamp(roughnessFactor + scapeSteep * (0.5 - scapeBark) * 0.4, 0.05, 1.0);
  }
`

/**
 * The same grain, for a gpu that cannot afford to look for it three times.
 *
 * One dependent texture read instead of three. It keeps the albedo mottle and
 * the roughness break-up, which are what stop the ground reading as coloured
 * paper, and gives up the macro octave and the normal map with it.
 *
 * This is a steady-frame quality budget, not the context-loss fix. The connected
 * Pixel 10 a/b test traced that failure to the separate shadow-map depth pass.
 * See `quality.detailTaps`.
 */
const DETAIL_FRAGMENT_LITE = /* glsl */`
  #include <normal_fragment_begin>
  float scapeFlat = smoothstep(0.3, 0.9, vScapeFace.x);
  float scapeAmt  = uDetailStrength * scapeFlat;
  float grain     = texture2D(uDetailMap, vScapeGround * uDetailScale).r;

  diffuseColor.rgb *= 1.0 + scapeAmt * (grain - 0.5) * 1.6;

  // Dirt collects in the low ground and it never comes back out.
  diffuseColor.rgb *= 1.0 - scapeAmt * 0.22 * pow(1.0 - grain, 2.0);

  roughnessFactor = clamp(roughnessFactor + scapeAmt * (0.5 - grain) * 0.24, 0.05, 1.0);
${PROP_GRAIN_FRAGMENT}
`

function detailFragment (steps: number): string {
  return /* glsl */`
  #include <normal_fragment_begin>
  float scapeFlat = smoothstep(0.3, 0.9, vScapeFace.x);
  float scapeAmt  = uDetailStrength * scapeFlat;
  vec2 scapeUv    = vScapeGround * uDetailScale;
${steps > 0 ? `  if (scapeAmt > 0.001) {${reliefFragment(steps)}  }\n` : ''}

  // The broad octave is its own map, not this one read slowly. A single field
  // sampled at two frequencies is self-similar by construction, so the patches
  // landed exactly where the grit was already darkest and the two reinforced
  // into a lumpy weave rather than reading as two different histories.
  vec2 wearUv = scapeUv * 0.14;
  float grain = texture2D(uDetailMap, scapeUv).r;
  float wear  = texture2D(uWearMap, wearUv).r;

  diffuseColor.rgb *= 1.0 + scapeAmt * (grain - 0.5) * 1.6;
  diffuseColor.rgb *= 1.0 + scapeAmt * uDetailMacro * (wear - 0.5) * 1.15;

  // Dirt collects in the low ground and it never comes back out.
  diffuseColor.rgb *= 1.0 - scapeAmt * 0.22 * pow(1.0 - grain, 2.0);

  roughnessFactor = clamp(roughnessFactor + scapeAmt * (0.5 - grain) * 0.24, 0.05, 1.0);

  // A damp patch is smoother than the grit in it, and that is most of what tells
  // wet ground from dry at this distance — the albedo barely moves.
  roughnessFactor = clamp(roughnessFactor - scapeAmt * uDetailMacro * (wear - 0.5) * 0.3, 0.05, 1.0);

  // One fetch, where there used to be four differenced by hand. The map's own
  // tangent is the grain's gradient resolved at full texel resolution and with
  // the sign a height field actually has — see textures/normals.ts for what was
  // wrong with the difference it replaces.
  //
  // The projection is planar and world-space, so the tangent frame is simply
  // world x and world z with the surface's own up between them: the map's x and
  // y land straight in the ground plane and nothing has to be built.
  //
  // The macro octave keeps its albedo and its roughness and deliberately loses
  // its normal. A metre-wide patch of wear is damp ground, not raised ground —
  // there is nothing there to catch the light on, and two more fetches to prove
  // it was two fetches spent agreeing with a flat surface.
  vec2 scapeTangent = texture2D(uGroundNormalMap, scapeUv).xy * 2.0 - 1.0;
  vec3 scapeBump    = vec3(scapeTangent.x, 0.0, scapeTangent.y) * ${GROUND_NORMAL_GAIN.toFixed(2)};

  normal = normalize(normal + mat3(viewMatrix) * scapeBump * scapeAmt);
${PROP_GRAIN_FRAGMENT}
`
}

const SEASON_PARS_FRAGMENT = /* glsl */`
  uniform vec3 uSeasonTint;
  uniform float uSeasonTintAmount;
  uniform vec3 uSeasonSnow;
  uniform float uSeasonSnowAmount;
  uniform float uSeasonSnowLine;
  uniform float uSeasonAspect;
`

/**
 * The year, applied to a surface.
 *
 * Two materials carry the entire scape, which is what makes a seasonal tint
 * awkward: a flat mix would take the falu red off the barn and the grey off the
 * granite along with the green off the meadow. So the tint weighs itself by how
 * far the albedo leans green — the one thing grass, leaves, moss and heather
 * have in common and paint, stone, sand and water have not — and by how light
 * that green is, which is what separates a birch canopy that goes gold from a
 * spruce that stays black-green all winter. Both terms are arithmetic on a
 * colour the fragment already holds; neither costs a fetch or an attribute.
 *
 * Snow needs world height, to keep it off the beach and off the seabed under the
 * shallows. It gets it without a varying. `vViewPosition` is minus the
 * view-space position, the view matrix is rigid, and the world height of a point
 * is therefore the camera's height less that position projected onto the view
 * matrix's second column — one dot product against one more interpolated float
 * on a program that already argues about its budget with a handset offering
 * sixty components in total.
 *
 * `lie` is how much of a surface snow can settle on. The ground weighs it by the
 * face angle; foliage has no normal varying and takes a constant, because a
 * grass tuft under snow reads as a white lump from every angle this camera has.
 */
function seasonFragment (lie: string, aspect: string): string {
  return /* glsl */`
  float scapeGreen = clamp(
    (diffuseColor.g * 2.0 - diffuseColor.r - diffuseColor.b) / (diffuseColor.g + 0.05),
    0.0,
    1.0
  ) * smoothstep(0.045, 0.16, diffuseColor.g);

  diffuseColor.rgb = mix(diffuseColor.rgb, uSeasonTint, uSeasonTintAmount * scapeGreen);

  float scapeAltitude = cameraPosition.y - dot(vViewPosition, viewMatrix[1].xyz);

  // Snow arrives as a wandering line rather than as a thinning sheet — a fixed
  // contour round an island reads as a stripe someone painted on it.
  float scapeDrift = sin(vScapeGround.x * 0.37) * cos(vScapeGround.y * 0.29);

  // And it comes down the shaded side further than the sunward one. The line
  // itself moves rather than the cover thinning: a thaw does not fade a snow
  // field out, it eats it from the bottom, and it eats the face that has been
  // in the sun first. Subtracted because a positive aspect is a face turned
  // away from the sun, so the shaded side gets the *lower* line.
  float scapeLine = uSeasonSnowLine - uSeasonAspect * (${aspect});
  float scapeLies = smoothstep(
    scapeLine,
    scapeLine + 1.6,
    scapeAltitude + scapeDrift * 0.85
  );
  float scapeSnow = uSeasonSnowAmount * scapeLies * (${lie});

  diffuseColor.rgb = mix(diffuseColor.rgb, uSeasonSnow, scapeSnow);
  roughnessFactor  = mix(roughnessFactor, 0.78, scapeSnow);
`
}

const WET_PARS_FRAGMENT = /* glsl */`
  uniform float uWetAmount;
`

/**
 * Rain, after it has landed.
 *
 * Two things happen to a surface that has been rained on and they pull in
 * opposite directions: the albedo goes *down*, because a water film traps light
 * that dry grains would have scattered back out, and the specular goes *up*,
 * because that same film is smoother than anything under it. Doing only the
 * first gives a scape somebody turned the lights down on; doing only the second
 * gives a scape made of plastic. Together they are the whole read, and they cost
 * two arithmetic operations on values the fragment is already holding.
 *
 * Weighted by the same `lie` the snow uses, and for the same reason — rain
 * lands on what faces the sky. It is applied before the snow rather than after,
 * so a week that is doing both ends up with white over wet rather than wet over
 * white, which is the order the world does them in.
 */
function wetFragment (lie: string): string {
  return /* glsl */`
  float scapeWet = uWetAmount * (${lie});

  diffuseColor.rgb *= 1.0 - 0.48 * scapeWet;
  roughnessFactor   = mix(roughnessFactor, 0.12, scapeWet);
`
}

/** Lying snow settles on what faces the sky, and slides off what does not. */
const GROUND_LIE = 'smoothstep(0.22, 0.72, vScapeFace.x)'

/** A tuft or a bough holds snow whichever way its facets happen to point. */
const FOLIAGE_LIE = '0.55'

/** The ground knows which way it is turned, so its snow line swings with it. */
const GROUND_ASPECT = 'vScapeFace.y'

/**
 * Foliage does not.
 *
 * Not an omission: a grass tuft is a billboarded scatter whose facets point
 * every way at once, so it has no aspect to read — and it does not declare the
 * varying that would carry one either. A hillside of grass still changes with
 * the aspect, because the ground it stands in does and the tufts are the
 * shorter thing.
 */
const FOLIAGE_ASPECT = '0.0'

/**
 * Cloud-map UV travelled per unit of wind travel.
 *
 * Measured rather than chosen: the deck used to scroll at `elapsed *
 * cloudSpeed * 0.06`, and the default wind travels at `speed * strength` =
 * 1.215 per second, so 0.05 lands the shadow at the rate it has always had.
 */
const CLOUD_DRIFT = 0.05

export function createScapeMaterials (
  config: LiveConfig,
  skip: ScapeSkips = NOTHING_SKIPPED,
  detailTaps = 6,
  textures: TextureCatalogue = createTextureCatalogue(config().seed),
  reliefSteps = 0,
): ScapeMaterials {
  // The lite path has one fetch to spend and no relief to march through, so a
  // tier below the full tap budget is a tier with flat soil whatever its relief
  // count says.
  const relief   = detailTaps >= 6 ? Math.max(0, Math.round(reliefSteps)) : 0
  const injected = detailTaps >= 6 ? detailFragment(relief) : DETAIL_FRAGMENT_LITE

  // Asked for by name rather than built here. Every map in the scape is in
  // `textures/catalogue.ts`, which is also what makes the lake's ripple and this
  // ground's grain provably two different noises rather than two names for one.
  const cloudMap  = textures.get('sky.cloudShadow')
  const detailMap = textures.get('ground.grain')
  const wearMap   = textures.get('ground.wear')

  // Only where something samples it. The lite path has one fetch to spend and
  // spends it on albedo, so a tier that will never read this must not pay to
  // bake and upload a 512² map — the grain stands in as a bound sampler the
  // program does not reach.
  const normalMap = detailTaps >= 6 ? textures.get('ground.normal') : detailMap
  const barkMap   = textures.get('prop.bark')

  const cloudOffset: IUniform<Vector2>   = { value: new Vector2() }

  // The compass, and the one uniform the vertex stage reads. Shared rather than
  // filed with the year, because it is the same bearing for anything that emits
  // the face varying whether or not that material has a season.
  const shadeDir: IUniform<Vector2>      = { value: new Vector2() }
  const shadeScratch: Vec2               = { x: 0, z: 0 }
  const shared: Record<string, IUniform> = {
    uCloudMap:      { value: cloudMap },
    uCloudOffset:   cloudOffset,
    uCloudScale:    { value: 1 / Math.max(1, config().atmosphere.cloudScale) },
    uCloudStrength: { value: config().atmosphere.cloudShadow },
    uShadeDir:      shadeDir,
  }
  const windDir: IUniform<Vector2>     = { value: new Vector2(1, 0) }
  const wind: Record<string, IUniform> = {
    uWindPhase:    { value: 0 },
    uWindStrength: { value: config().wind.strength },
    uWindDir:      windDir,
  }
  const detail: Record<string, IUniform> = {
    uDetailMap:       { value: detailMap },
    uGroundNormalMap: { value: normalMap },
    uWearMap:         { value: wearMap },
    uBarkMap:         { value: barkMap },
    uDetailScale:     { value: 1 / Math.max(0.5, config().terrain.detailScale) },
    uDetailStrength:  { value: config().terrain.detailGrain },
    uDetailMacro:     { value: config().terrain.detailMacro },
    uPropGrain:       { value: config().terrain.propGrain },
  }

  // Both materials share these instances, so the year is written once a frame
  // and both programs read the same numbers — there is no seam where the grass
  // could be in a different week from the ground it stands in.
  const seasonTint: IUniform<Color>      = { value: new Color() }
  const seasonSnow: IUniform<Color>      = { value: new Color() }
  const season: Record<string, IUniform> = {
    uSeasonTint:       seasonTint,
    uSeasonTintAmount: { value: 0 },
    uSeasonSnow:       seasonSnow,
    uSeasonSnowAmount: { value: 0 },
    uSeasonSnowLine:   { value: config().terrain.waterLevel },
    uSeasonAspect:     { value: config().season.snowSwing },
  }

  // Its own record rather than a field of `season`, because it is its own clock.
  // Both materials share the instance for the same reason they share the year's:
  // the grass and the ground it stands in cannot be in two different showers.
  const weather: Record<string, IUniform> = { uWetAmount: { value: 0 }}

  interface Injection {
    wind?:   Record<string, IUniform>
    detail?: Record<string, IUniform>

    /** How lying snow weights itself on this material. Absent means no season. */
    lie?: string
  }

  function attachScape (material: MeshStandardMaterial, key: string, extra: Injection = {}): void {
    // The normal varying is written for whoever reads it, and both readers are
    // on the ground: the grain needs it, and so does snow. Foliage has neither,
    // and still declares nothing.
    const up             = Boolean(extra.detail) || extra.lie === GROUND_LIE

    // Tied to the varying rather than chosen alongside it: the aspect lives in
    // `vScapeFace.y`, so a material that does not emit the varying cannot read
    // one, and there is no third state where the two disagree.
    const aspect         = up ? GROUND_ASPECT : FOLIAGE_ASPECT
    const normalFragment = [
      extra.detail ? injected : '#include <normal_fragment_begin>',
      extra.lie ? wetFragment(extra.lie) : '',
      extra.lie ? seasonFragment(extra.lie, aspect) : '',
    ].join('\n')

    // Resolved out here rather than inside the closure. Which uniforms the
    // fragment declares is decided once, when the material is built, and a
    // decision taken per compile is a branch in a function three already
    // considers long enough.
    const detailPars = extra.detail
      ? DETAIL_PARS_FRAGMENT + (detailTaps >= 6 ? DETAIL_FULL_PARS_FRAGMENT : '')
      : ''

    // `?skip=inject` leaves the mesh, the geometry and the vertex colours exactly
    // as they are and takes only the shader patch away — so what draws is the
    // stock `MeshStandardMaterial` the library's own starters run on the handset
    // without trouble. If the scape survives this and dies without it, the
    // injection is the answer; if it dies either way, the injection never was.
    if (!skip.has('inject'))
      material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
        Object.assign(
          program.uniforms,
          shared,
          extra.wind,
          extra.detail,
          extra.lie ? season : null,
          extra.lie ? weather : null,
        )

        // The normal varying rides with the ground pass rather than with the
        // cloud shadow, so foliage — which has nothing to read it — never
        // declares a varying it cannot use. Tidy rather than load-bearing: see
        // the note above CLOUD_PARS_VERTEX for what this was once thought to fix.
        program.vertexShader = program.vertexShader
          .replace('#include <common>', [
            '#include <common>',
            CLOUD_PARS_VERTEX,
            extra.wind ? WIND_PARS_VERTEX : '',
            up ? UP_PARS_VERTEX : '',
          ].join('\n'))
          .replace('#include <project_vertex>', CLOUD_WORLD_VERTEX + (up ? UP_WORLD_VERTEX : ''))

        if (extra.wind)
          program.vertexShader = program.vertexShader.replace('#include <begin_vertex>', WIND_VERTEX)

        program.fragmentShader = program.fragmentShader
          .replace('#include <common>', [
            '#include <common>',
            CLOUD_PARS_FRAGMENT,
            up ? UP_PARS_FRAGMENT : '',
            detailPars,
            extra.lie ? WET_PARS_FRAGMENT : '',
            extra.lie ? SEASON_PARS_FRAGMENT : '',
          ].join('\n'))
          .replace('#include <color_fragment>', CLOUD_FRAGMENT)

        if (extra.detail || extra.lie)
          program.fragmentShader = program.fragmentShader
            .replace('#include <normal_fragment_begin>', normalFragment)
      }
    // The taps belong in the key: two materials that differ only by an injected
    // shader are identical as far as three's own cache is concerned, and it
    // would hand the second one the first one's program.
    material.customProgramCacheKey = () => `${key}:${detailTaps}:${relief}`

    // The same key doubles as the material's name, because a name is the only
    // thing three prints when a program fails to link — `Material Name:` on an
    // unnamed material is blank, and a driver that refuses to link without
    // filling in the info log leaves a blank line as the entire diagnosis. An
    // android handset produced six of those in one run.
    material.name = key
  }

  const ground  = kitMaterial({ roughness: 0.96, metalness: 0, flatShading: true })
  const foliage = kitMaterial({ roughness: 0.92, metalness: 0, flatShading: true })

  // `?skip=detail` keeps the cloud shadow — one texture fetch — and drops the
  // ground grain, which is six. The two halves of the injection cost very
  // different amounts, so which of them a device cannot take is worth knowing
  // separately: the cloud shadow is the more visible of the two by far.
  attachScape(ground, 'scape-ground', skip.has('detail') ? { lie: GROUND_LIE } : { detail, lie: GROUND_LIE })
  attachScape(foliage, 'scape-foliage', { wind, lie: FOLIAGE_LIE })

  markShared(ground)
  markShared(foliage)

  return {
    ground,
    foliage,

    // Uniforms are refreshed from the config every frame rather than captured
    // at build. The scape's tuning surface is the config object, and a knob
    // that only takes effect on reload is not a knob.
    update (breeze, year, sky) {
      // One travel, one bearing. The deck overhead scrolls off the same two
      // numbers in `clouds.ts`, which is what finally puts a cloud and the
      // shadow it casts on the same heading.
      const drift = config().atmosphere.cloudDrag * breeze.travel * CLOUD_DRIFT

      cloudOffset.value.set(breeze.dirX * drift, breeze.dirZ * drift)
      windDir.value.set(breeze.dirX, breeze.dirZ)
      wind.uWindPhase.value        = breeze.travel
      wind.uWindStrength.value     = breeze.strength
      shared.uCloudStrength.value  = config().atmosphere.cloudShadow
      shared.uCloudScale.value     = 1 / Math.max(1, config().atmosphere.cloudScale)
      detail.uDetailStrength.value = config().terrain.detailGrain
      detail.uDetailScale.value    = 1 / Math.max(0.5, config().terrain.detailScale)
      detail.uDetailMacro.value    = config().terrain.detailMacro
      detail.uPropGrain.value      = config().terrain.propGrain

      seasonTint.value.copy(year.tint)
      seasonSnow.value.copy(year.snowColor)
      season.uSeasonTintAmount.value = year.tintAmount
      season.uSeasonSnowAmount.value = year.snow
      season.uSeasonSnowLine.value   = year.snowLine
      season.uSeasonAspect.value     = config().season.snowSwing
      weather.uWetAmount.value       = sky.wet

      // Read here rather than resolved once at build, for the reason every
      // other line in this function is: `daylight.azimuth` is a slider, and a
      // scape whose sun can be swung round without the moss and the snow
      // following it has two compasses.
      shadeDirection(config().daylight.azimuth, shadeScratch)
      shadeDir.value.set(shadeScratch.x, shadeScratch.z)
    },

    dispose () {
      // The catalogue's textures belong to the catalogue. Whoever built it frees
      // it — freeing a shared map from one of its consumers is how the *other*
      // consumer ends up sampling a disposed texture after a rebuild.
      ground.dispose()
      foliage.dispose()
    },
  }
}

// perf: two materials for the entire scape — two shader compiles, and every
// mesh and InstancedMesh shares them, so the renderer never changes program.
