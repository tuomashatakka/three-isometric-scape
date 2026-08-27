import {
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
  Vector3,
  Vector4,
} from 'three'
import type { IUniform, Texture, WebGLProgramParametersWithUniforms } from 'three'
import type { LiveConfig } from '../config.ts'
import { createDaylight } from '../daylight.ts'
import type { AtmosphereQuality } from '../quality.ts'
import type { SeasonState } from '../season.ts'
import type { TextureCatalogue } from '../textures/catalogue.ts'
import type { WeatherState } from '../weather.ts'
import type { WindState } from '../wind.ts'
import type { BoatWakeEmitter } from './boats.ts'
import type { HeightField } from './height.ts'
import { LAYER } from '../layers.ts'
import { MAX_DEPTH, bakeShoreMask } from './shore-mask.ts'


/**
 * The lake.
 *
 * One plane, gently swelling. Everything that makes it read as water happens
 * in the shader: depth tint and a foam band from a baked shore mask, a rolling
 * swell in the vertex stage, and a field of sun glints struck from two
 * decorrelated noise fetches — that speckle is what the surface reads as from
 * any orbit angle, where a specular lobe alone only reads from one.
 *
 * The year reaches it through one uniform. Winter shuts the shallows first and
 * works outward, and everywhere the ice takes hold the surface gives up its
 * swell, its ripple, its foam and its glitter — all of which is the same
 * bathymetry the depth tint was already reading, so the freeze costs no fetch
 * the lake was not making anyway.
 *
 * The wind reaches it the same way. The swell runs with the wind, so a coast is
 * in the surf when the sea is travelling *into* it — and which way a coast faces
 * is baked into the mask's spare channels rather than differenced per fragment.
 * See `shore-mask.ts` and `WATER_SURF_GLSL`.
 */
export interface Water {
  mesh: Mesh

  /**
   * Advance swell, ripple, boat wakes and foam phase, and take the wind, the
   * year's freeze and the weather's chop. Allocation-free.
   */
  update(
    elapsed: number,
    wind: WindState,
    season: SeasonState,
    weather: WeatherState,
    wakes?: readonly BoatWakeEmitter[],
  ): void
  dispose(): void
}

const MAX_BOAT_WAKES = 3

/**
 * How far a wave train advances through its own crest spacing, per metre of
 * wind travel.
 *
 * A rate, and therefore one that has to be able to stop: it is carried by
 * `wind.travel`, which is the scape's one integrated distance and dies with
 * either `wind.speed` or `wind.strength`. A surf line running on `elapsed`
 * would be somewhere else in every frame of a capture, whatever the still put
 * the rest of the scape into.
 */
const SURGE_RATE = 0.22

/** Metres between the crests marching in on a coast. */
const SURGE_SPACING = 46

/**
 * Ripple-map UV travelled per unit of wind travel.
 *
 * Measured, not chosen. The offset used to advance at `elapsed * 0.014` and the
 * default wind travels at `speed * strength` = 1.215 per second, so 0.0115
 * leaves the sea's texture moving at the rate it always did.
 */
const RIPPLE_DRIFT = 0.0115

/**
 * The swell, shared verbatim by both stages.
 *
 * The vertex shader displaces by it and the fragment shader differences it for
 * a slope — sampling the *same* function is the only way the shading agrees
 * with the silhouette. Three octaves of plain sine, because a Gerstner sum
 * buys nothing at an amplitude the eye reads as "slight".
 */
const WAVE_GLSL = /* glsl */`
  uniform float uWaveTime;
  uniform float uWaveHeight;

  float scapeWave (vec2 p) {
    return sin(p.x * 0.09 + uWaveTime * 0.55) * 0.55 +
      sin(p.y * 0.13 - uWaveTime * 0.41) * 0.3 +
      sin((p.x + p.y) * 0.062 + uWaveTime * 0.29) * 0.4;
  }
`

/**
 * The freeze, shared verbatim by both stages, for the same reason the swell is.
 *
 * The vertex stage needs it to stop displacing water that has stopped moving
 * and the fragment stage needs it to paint what is lying there instead; two
 * approximations of the same ice front would show up as a swell running under a
 * shelf that is not rising with it.
 *
 * The one texture fetch in here is the bathymetry mask, which the vertex stage
 * did not previously read. That is a vertex texture fetch on at most 16k
 * vertices — the whole lake is one plane of 24 to 128 segments a side — against
 * a mask with no mipmaps and linear filtering, so there is no derivative to go
 * looking for and nothing to stall on.
 */
const ICE_GLSL = /* glsl */`
  uniform sampler2D uShoreMap;
  uniform float uShoreScale;
  uniform float uFreeze;
  uniform float uIceReach;
  uniform float uIceBreak;
  uniform float uFloeScale;

  /**
   * The whole mask, in one read: depth in r, the seaward bearing in gb.
   *
   * Both stages go through here rather than sampling the channels they happen
   * to want, because a driver will only collapse two reads of one sampler at
   * one uv if they are literally the same fetch. See shore-mask.ts.
   */
  vec4 scapeShore (vec2 ground) {
    return texture2D(uShoreMap, ground * uShoreScale + 0.5);
  }

  float scapeDepth (vec2 ground) {
    return scapeShore(ground).r;
  }

  // The floe field. Three sines rather than a noise fetch, because the vertex
  // stage would otherwise exceed the cheap tier's texture budget. uFloeScale
  // grows the authored 196-metre pattern with the inhabited world; without it
  // the old lobes repeat 2.65 times more often across the archipelago and read
  // as wallpaper instead of fractured coastal ice.
  float scapeFloe (vec2 p) {
    vec2 q = p * uFloeScale;
    return 0.5 + 0.34 * sin(q.x * 0.0545 + q.y * 0.029) +
      0.26 * sin(q.y * 0.0788 - q.x * 0.035) +
      0.16 * sin((q.x - q.y) * 0.1394);
  }

  /**
   * How much ice is lying on the water at a point, 0..1.
   *
   * Depth is the whole physics of it: a bank a foot deep gives its heat up in a
   * week and a sound five metres deep takes the season, so the freeze starts at
   * the shoreline and walks outward as the year deepens rather than arriving
   * everywhere at once. The 1.7 is what lets a fully committed winter push past
   * the upper threshold in the shallows while the middle is still open.
   */
  float scapeIce (vec2 ground, float depth) {
    float shelter = 1.0 - uIceReach * smoothstep(0.0, 0.55, depth);
    float local   = uFreeze * shelter * 1.7 + (scapeFloe(ground) - 0.5) * uIceBreak;

    return smoothstep(0.45, 0.85, local);
  }
`

const WATER_PARS_VERTEX = /* glsl */`
  varying vec2 vWaterGround;
${WAVE_GLSL}
${ICE_GLSL}
`

const WATER_SWELL_VERTEX = /* glsl */`
  #include <begin_vertex>
  float swellIce = scapeIce(transformed.xz, scapeDepth(transformed.xz));
  transformed.y += scapeWave(transformed.xz) * uWaveHeight * (1.0 - swellIce);
`

const WATER_WORLD_VERTEX = /* glsl */`
  #include <project_vertex>
  vWaterGround = (modelMatrix * vec4(transformed, 1.0)).xz;
`

/** Three allocation-free wake emitters, packed as source xz + forward × strength. */
const BOAT_WAKE_GLSL = /* glsl */`
  uniform vec4 uBoatWakes[3];
  uniform float uBoatWakePhases[3];
  uniform float uBoatWakeStrength;

  float scapeBoatWake (vec2 ground) {
    if (uBoatWakeStrength <= 0.001)
      return 0.0;

    float field = 0.0;

    for (int index = 0; index < 3; index++) {
      vec2 impulse     = uBoatWakes[index].zw;
      float wakeAmount = clamp(length(impulse), 0.0, 1.0);

      // Keep the expensive oscillation inside an active emitter's visible
      // footprint. Most water fragments are nowhere near any stern, and every
      // emitter is inactive for the whole synchronized dock window.
      if (wakeAmount > 0.001) {
        vec2 forward = impulse / wakeAmount;
        vec2 offset  = ground - uBoatWakes[index].xy;
        float behind = -dot(offset, forward);

        if (behind > 0.1 && behind < 32.0) {
          float side  = abs(dot(offset, vec2(-forward.y, forward.x)));
          float reach = smoothstep(0.1, 1.8, behind) *
            (1.0 - smoothstep(18.0, 32.0, behind));
          float arms = 1.0 - smoothstep(
            0.16,
            1.15,
            abs(side - (0.55 + behind * 0.34))
          );
          float stern = (1.0 - smoothstep(0.4, 3.2, side)) *
            (1.0 - smoothstep(7.0, 18.0, behind)) * 0.45;
          float shape = arms + stern;

          if (shape > 0.001) {
            float ripple = 0.5 + 0.5 * sin(
              (behind + side) * 2.3 - uBoatWakePhases[index] * 0.38 - uWaveTime * 1.2
            );

            field += wakeAmount * reach * shape * mix(0.45, 1.0, ripple);
          }
        }
      }
    }

    return clamp(field * uBoatWakeStrength, 0.0, 1.0);
  }
`

/**
 * The surf.
 *
 * A coast is either in the sea's way or behind it, and until this the scape
 * drew both the same: a thin foam trim at the waterline, the same width and the
 * same white the whole way round every island, on the sheltered side of a
 * headland as much as on the side taking the weather. Which is the one thing a
 * coastline never looks like.
 *
 * Three parts, and none of them costs a fetch:
 *
 * **exposure** is the mask's baked seaward bearing against the direction the
 * swell is travelling. The swell runs with the wind — there is one wind in this
 * scape and this is a consumer of it, not a second one — so a shore facing into
 * the wind is white and its lee is calm, and veering the wind moves the surf
 * round the island rather than fading it.
 *
 * **the band** is depth, out to `uSurfDepth`. Breakers are what a swell does
 * when it feels the bottom, so the width of the white water is the width of the
 * shelf, which is why a shallow bay wears a broad wash and a rock that falls
 * away sheer wears a narrow collar. That falls out of the bathymetry for free;
 * nothing here had to be authored per island.
 *
 * **the surge** is a wave train marching in along the swell's own heading, so
 * the white water arrives in sets rather than hanging at one contour. Its phase
 * is `wind.travel`, the scape's shared integrated distance — a rate that can
 * reach zero, which is what makes the surf photographable.
 */
const WATER_SURF_GLSL = /* glsl */`
  uniform vec2 uSwell;
  uniform float uSurf;
  uniform float uSurfDepth;
  uniform float uSurfExposure;
  uniform float uSurgePhase;

  /**
   * How hard it is breaking here, 0..1.
   *
   * The caller passes in the mask fetch it has already made rather than this
   * taking one of its own: the surf is meant to be free, and a second texture2D
   * at the same uv is how free becomes a tap the cheap tier cannot afford.
   */
  float scapeSurf (vec2 ground, vec4 shore, float depth) {
    if (uSurf <= 0.001)
      return 0.0;

    vec2 seaward = shore.gb * 2.0 - 1.0;

    // Bilinear filtering shortens the decoded vector between texels and open
    // sea leaves it at zero length, so this is a bearing *and* a weight: the
    // surf fades out where the mask has no shore to point away from.
    float facing = clamp(-dot(seaward, uSwell), 0.0, 1.0);

    // Hard against the bank and thinning out to the reach, rather than a ramp
    // across the whole shelf: broken water piles up where the wave finally
    // trips, and a linear falloff spreads the same white so evenly that the
    // band reads as a tinted contour instead of as surf.
    float shelf = smoothstep(uSurfDepth, 0.0, depth);
    float surge = 0.5 + 0.5 * sin(dot(ground, uSwell) * ${(Math.PI * 2 / SURGE_SPACING).toFixed(5)} + uSurgePhase);

    // The lip. Nothing is painted on the last few centimetres of water, where
    // the plane is already fading out against the sand — surf drawn there is a
    // white fringe on dry ground.
    return smoothstep(0.0, 0.02, depth) * shelf * sqrt(shelf) *
      mix(1.0, facing, uSurfExposure) * mix(0.34, 1.0, surge) * uSurf;
  }
`

/**
 * Foam is opaque, and the water it stands on is not.
 *
 * The shore end of the plane deliberately fades out — the alpha ramp above is
 * what stops the lake being painted over dry ground — so a surf band mixed into
 * the albedo alone arrives at the bank as a wash at half strength, against wet
 * sand, under the fog. Which is exactly where breaking water is *most* opaque:
 * it is air in water, and you cannot see the bottom through it. So the break
 * lifts the alpha back, and only the break does.
 */
const WATER_SURF_ALPHA = /* glsl */`
  diffuseColor.a = max(diffuseColor.a, breakers * 0.94);
`

const WATER_PARS_FRAGMENT = /* glsl */`
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyTop;
  uniform float uReflectionStrength;
  uniform sampler2D uRippleMap;
  uniform sampler2D uWaveMap;
  uniform vec2 uRippleOffset;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uIce;
  uniform float uRippleScale;
  uniform float uRippleStrength;
  uniform float uSparkleScale;
  uniform float uSparkle;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uDay;
  varying vec2 vWaterGround;
${WAVE_GLSL}
${ICE_GLSL}
${WATER_SURF_GLSL}
${BOAT_WAKE_GLSL}
`

/**
 * The ice, laid over the finished water rather than mixed into its albedo.
 *
 * What is under a shelf stops mattering the moment the shelf is thick, and a
 * depth tint showing through frozen water is the one thing that reads as blue
 * plastic sheeting rather than as a winter.
 *
 * The rim is where the cover is passing through a half — the front between the
 * sheet and the open water. That is the only part of a frozen bay that is
 * actually white, because that is where the floes grind against each other and
 * pile; the rest of it is the sea seen through a lid.
 */
const WATER_ICE_FRAGMENT = /* glsl */`
  float iceRim = 4.0 * iceCover * (1.0 - iceCover);
  vec3 iceTone = mix(uIce, uFoam, iceRim * 0.65) * (0.9 + 0.2 * sheen);
  diffuseColor.rgb = mix(diffuseColor.rgb, iceTone, iceCover);
`

/**
 * Ice is matte, and deliberately rougher than the water it replaces.
 *
 * The tempting move is the opposite one — new ice is glassy, so drop the
 * roughness and let it glare. But the camera's elevation sweeps across the
 * sun's as it zooms, and a near-mirror plane at that crossing reflects the sun
 * into every fragment at once; that is the whole reason `water.roughness` sits
 * where it does. A frozen bay is the same flat plane with the swell taken out
 * of it, which makes it a *better* candidate for that white-out, not a worse
 * one. Snow-blown ice reads correctly matte and cannot blow out.
 */
const WATER_ROUGHNESS_FRAGMENT = /* glsl */`
  #include <roughnessmap_fragment>

  // Broken water is air in water, and air in water is matte. Without this the
  // surf takes the same specular lobe the open sea does and the white band
  // gleams — which reads as wet paint laid on the shore rather than as foam.
  roughnessFactor = mix(roughnessFactor, 0.94, breakers);
  roughnessFactor = mix(roughnessFactor, 0.88, iceCover);
`

const WATER_COLOR_FRAGMENT = /* glsl */`
  #include <map_fragment>
  vec4 shore       = scapeShore(vWaterGround);
  float waterDepth = shore.r;
  float iceCover   = scapeIce(vWaterGround, waterDepth);
  float openWater  = smoothstep(0.04, 0.3, waterDepth);
  float boatWake   = scapeBoatWake(vWaterGround) * openWater * (1.0 - iceCover);

  // Foam is a band hugging the bank, not a wash over everything shallow: it
  // fades in off the shore and back out into open water. Ice takes it away —
  // surf is what a swell does at a bank, and the bank is where the ice is.
  float shoreline = smoothstep(0.0, 0.035, waterDepth) * smoothstep(0.14, 0.05, waterDepth);
  vec2 foamUv = vWaterGround * uRippleScale * 0.55 + uRippleOffset * 1.6;
  float foam = shoreline * (0.35 + 0.5 * texture2D(uRippleMap, foamUv).r) * (1.0 - iceCover);

  // The breakers stand off the trim rather than replacing it: the trim is the
  // wash at the waterline, which every coast has, and this is the white water
  // over the shelf, which only the coast the sea is running at gets.
  float breakers = scapeSurf(vWaterGround, shore, waterDepth) * (1.0 - iceCover);

  diffuseColor.rgb = mix(uShallow, uDeep, smoothstep(0.0, 0.5, waterDepth));
  diffuseColor.rgb = mix(
    diffuseColor.rgb,
    uFoam,
    clamp(max(foam, breakers) + boatWake * 0.72, 0.0, 0.86)
  );

  // Texture the albedo, not just the normal. A normal-only ripple is invisible
  // wherever the specular lobe does not reach, so the sea reads as flat paint
  // from half the angles the camera can orbit to.
  float sheen = texture2D(uRippleMap, vWaterGround * uRippleScale + uRippleOffset).r;
  diffuseColor.rgb *= 0.93 + 0.15 * sheen;

  // Sun glitter. Two noise fields at incommensurate scales, multiplied and then
  // raised to a high power: the product is near zero almost everywhere and
  // spikes only where both crests coincide, which is how glints are actually
  // distributed on water — isolated, and never a pattern you can read. The
  // exponent is the whole control. Threshold it gently instead and the mean of
  // the product clears the cut, every fragment lights up, and the lake becomes
  // a sheet of white paper.
  vec2 sparkUv = vWaterGround * uSparkleScale;
  float glintA = texture2D(uRippleMap, sparkUv + uRippleOffset * 2.1).r;
  float glintB = texture2D(uRippleMap, sparkUv * 1.37 - uRippleOffset * 1.63).r;
  float glint  = pow(clamp(glintA * glintB * 1.42, 0.0, 1.0), 5.0);
  diffuseColor.rgb += uFoam * glint * uSparkle * openWater * (1.0 - iceCover);

${WATER_ICE_FRAGMENT}

  // The plane spans the whole map, so it has to vanish wherever there is no
  // water under it — otherwise dry land gets painted lake.
  diffuseColor.a *= smoothstep(0.0, 0.03, waterDepth) * clamp(0.5 + waterDepth * 1.7, 0.0, 1.0);

${WATER_SURF_ALPHA}
`

/**
 * The lake, for a gpu that cannot afford seven looks at it.
 *
 * Two dependent texture reads instead of seven: the depth mask, which decides
 * the colour and where the plane is water at all, and the albedo sheen. The
 * foam band and the sun glitter go, and so do the ripple normals — but the
 * swell is procedural (`scapeWave`), so the surface still moves and still
 * catches the sun along the wave fronts. See `quality.detailTaps`.
 */
const WATER_COLOR_FRAGMENT_LITE = /* glsl */`
  #include <map_fragment>
  vec4 shore       = scapeShore(vWaterGround);
  float waterDepth = shore.r;
  float iceCover   = scapeIce(vWaterGround, waterDepth);
  float openWater  = smoothstep(0.04, 0.3, waterDepth);
  float boatWake   = scapeBoatWake(vWaterGround) * openWater * (1.0 - iceCover);

  // The one thing the cheap lake gains rather than loses. The trim it cannot
  // afford was a second dependent read; the surf is arithmetic on the fetch it
  // is already making, so the phone gets the coastline the desktop gets — and
  // gets it *instead* of the fetch, not as well as one.
  float breakers = scapeSurf(vWaterGround, shore, waterDepth) * (1.0 - iceCover);

  diffuseColor.rgb = mix(uShallow, uDeep, smoothstep(0.0, 0.5, waterDepth));

  float sheen = texture2D(uRippleMap, vWaterGround * uRippleScale + uRippleOffset).r;
  diffuseColor.rgb *= 0.93 + 0.15 * sheen;
  diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, clamp(breakers + boatWake * 0.62, 0.0, 0.86));

${WATER_ICE_FRAGMENT}

  diffuseColor.a *= smoothstep(0.0, 0.03, waterDepth) * clamp(0.5 + waterDepth * 1.7, 0.0, 1.0);

${WATER_SURF_ALPHA}
`

const WATER_NORMAL_FRAGMENT_LITE = /* glsl */`
  #include <normal_fragment_begin>
  float swell  = scapeWave(vWaterGround);
  float swellX = scapeWave(vWaterGround + vec2(1.6, 0.0));
  float swellZ = scapeWave(vWaterGround + vec2(0.0, 1.6));

  normal = normalize(normal + vec3(
    -(swellX - swell) * uWaveHeight * 2.4,
    0.0,
    -(swellZ - swell) * uWaveHeight * 2.4
  ) * (1.0 - iceCover));
`

/**
 * Fresnel, and the sky the water borrows off it.
 *
 * The one term that decides whether a surface reads as water or as coloured
 * paint, and it is nearly free. Water reflects almost nothing when you look
 * straight down it — about two per cent — and almost everything at a grazing
 * angle, and an isometric camera spends its whole life at grazing angles, so
 * this is doing real work across most of the frame rather than at the edges.
 * Schlick's approximation is the standard cheap form of it and it is exact
 * enough that nobody has ever been able to tell.
 *
 * Injected before `opaque_fragment` rather than into the albedo, because a
 * reflection is light arriving at the eye and not a property of the surface:
 * folded into `diffuseColor` it would be shaded by the sun a second time and go
 * dark on the side of a wave facing away. `outgoingLight` already exists by
 * this point in three's chain, and so do the locals the water body declared —
 * chunks are inlined into one `main`, so `waterDepth` is still in scope here.
 *
 * The sky it reflects is the sky the atmosphere is actually drawing, handed
 * down as two colours per frame rather than sampled a second time, so the sea
 * can never mirror a sky the reader is not looking at.
 */
/**
 * How hard the sun's own reflection is laid over the sea.
 *
 * Above one deliberately: every factor in the glitter term is a fraction, and
 * six of them multiplied together land well under what the eye reads as a sun
 * on water, even once the lobe is wide enough to exist at all.
 */
const SUN_GLITTER = 2.6


const WATER_REFLECTION_FRAGMENT = /* glsl */`
  {
    vec3 viewDir    = normalize(vViewPosition);
    float facing    = clamp(dot(normalize(normal), viewDir), 0.0, 1.0);
    float fresnel   = 0.02 + 0.98 * pow(1.0 - facing, 5.0);

    // Toward the horizon at grazing angles and toward the zenith looking down,
    // which is what the reflected ray would have found anyway. Cheaper than
    // reflecting the vector and sampling, and at this camera's range of angles
    // the two are within a shade of each other.
    vec3 sky = mix(uSkyHorizon, uSkyTop, facing);

    // Only over water deep enough to have a surface, and never over ice, which
    // is rough and scatters rather than mirrors.
    float mirror = fresnel * uReflectionStrength *
      smoothstep(0.0, 0.35, waterDepth);

    outgoingLight = mix(outgoingLight, sky, clamp(mirror, 0.0, 0.82));

    // Sun glitter path. A low sun over water lays a bright, wind-stretched
    // highlight from the horizon toward the viewer — the single most
    // recognisable thing about water at golden hour. The perturbed ripple
    // normal from WATER_NORMAL_FRAGMENT is already in scope, and so are
    // waterDepth, iceCover and openWater from the colour fragments.
    //
    // The lobe is Blinn-Phong: reflect the view about the ripple normal and
    // test against the sun. The exponent tracks sun elevation inversely — low
    // sun widens the lobe into a long streak, high sun tightens it to a disc.
    // The two-noise-field glint from the albedo is recomputed at the same UV
    // scale so the sun catches the same facets the ambient sparkle already
    // lights, and the product of lobe × noise is near zero almost everywhere:
    // only a scatter of isolated facets fires, which is how a glitter path
    // actually reads from any orbit angle.
    float sunElev = uSunDir.y;
    if (sunElev > 0.01 && uDay > 0.01) {
      // The sun has to be brought into the space the normal is already in.
      // normal and vViewPosition in a standard-material fragment are VIEW
      // space; uSunDir is copied straight off the daylight sample and is
      // WORLD space. Building a half-vector out of one of each compares two
      // directions that do not live in the same room, so the lobe was tested
      // against a bearing that meant nothing and never fired — which is why the
      // fresnel half of this chunk worked and the sun half did not: that half
      // is view-space throughout and never had to cross.
      //
      // A direction transforms by the rotation alone, so the upper 3x3 of
      // viewMatrix is the whole conversion. Elevation stays read off the
      // world vector, because "how high is the sun" is a fact about the sky
      // rather than about where the reader happens to be standing.
      vec3 sunView = normalize(mat3(viewMatrix) * uSunDir);
      vec3 halfVec = normalize(viewDir + sunView);
      float NdotH  = max(dot(normal, halfVec), 0.0);

      // Tight highlight. Low sun → lower exponent → wider lobe → longer
      // glitter path. High sun → higher exponent → small bright disc. The
      // 128/512 range keeps the path visible from golden hour through noon.
      // A rippled sea is not polished metal. 128 to 512 is a mirror exponent —
      // it holds the whole lobe within a couple of degrees of the exact mirror
      // direction, which a surface this broken almost never presents. The ripple
      // normal already supplies the variation, so the lobe wants to be wide
      // enough that a patch of sea can actually hold it.
      float exponent = mix(24.0, 120.0, smoothstep(0.0, 0.5, sunElev));
      float spec = pow(NdotH, exponent);

      // Stretch the lobe along the sun's horizontal azimuth when the sun is
      // low. The glitter path is narrow cross-path but long along-path,
      // because the angle of incidence varies slowly along the sun's bearing
      // and rapidly across it. Projecting the half-vector onto the water
      // surface and measuring its alignment with the sun's horizontal
      // direction gives this stretch for free.
      vec2 sunHoriz = sunView.xz;
      float sunLen  = length(sunHoriz);
      if (sunLen > 0.001) {
        vec2 sunAz  = sunHoriz / sunLen;
        float align = abs(dot(normalize(halfVec.xz + 0.0001), sunAz));
        // At the horizon the stretch is full; overhead it vanishes and the
        // lobe is round — which is exactly the difference between a path and
        // a spot.
        spec *= mix(1.0, mix(0.35, 1.0, align), smoothstep(0.35, 0.0, sunElev));
      }

      // Same two-noise-field glint the albedo uses: the product is near zero
      // almost everywhere and spikes where both crests coincide, which is how
      // glints are actually distributed on water — isolated, and never a
      // pattern you can read. The UV scale matches the albedo sparkle so the
      // sun catches the same facets.
      vec2 sparkUv = vWaterGround * uSparkleScale;
      float gA = texture2D(uRippleMap, sparkUv + uRippleOffset * 2.1).r;
      float gB = texture2D(uRippleMap, sparkUv * 1.37 - uRippleOffset * 1.63).r;
      float facet = pow(clamp(gA * gB * 1.42, 0.0, 1.0), 5.0);

      // Elevation envelope: the path is brightest near the horizon where the
      // geometry stretches the reflection across a long band of water, and
      // fades to a small bright disc when the sun is overhead. The 0.1 floor
      // keeps a visible spot at zenith. uDay kills the whole term at night.
      // The facet field BREAKS THE HIGHLIGHT UP — it does not gate it. Multiplying
      // directly is what made this invisible: the glitter field is near zero
      // almost everywhere by construction (that is what makes the ambient glint
      // read as isolated sparks rather than a sheet), and a 512-exponent lobe is
      // near zero everywhere but the exact mirror. Two sparse masks multiplied
      // together essentially never coincide, so the product was zero across the
      // whole sea. Mixed instead, it does the job it was wanted for: the path stays
      // continuous and the facets modulate it into scales rather than a smear.
      float broken = mix(0.35, 1.0, facet);

      // A low sun lays a long path and an overhead sun a small bright spot, so
      // this favours the low end — but it never reaches zero, because a midday
      // sun on water still has a highlight, and killing it outright was the
      // second reason nothing showed.
      float elevScale = mix(0.45, 1.0, smoothstep(0.45, 0.02, sunElev));

      // Additive: the sun's own specular reflection is light arriving at the
      // eye, separate from the ambient sky the fresnel already mixed in.
      // Fresnel makes it stronger at grazing angles, which is correct — the
      // glitter path is brightest where the sea is most mirror-like. openWater
      // keeps it off dry land; ice scatters rather than mirrors.
      outgoingLight += uSunColor * spec * broken * fresnel * elevScale * ${SUN_GLITTER.toFixed(2)} *
        uDay * openWater * (1.0 - iceCover);
    }
  }
`


const WATER_NORMAL_FRAGMENT = /* glsl */`
  #include <normal_fragment_begin>

  // The ripple normal reads from the *smooth* field, never from the white-noise
  // one the albedo uses. White noise minified past one texel per pixel lands a
  // different random normal in every pixel; wherever the sun's mirror direction
  // drifts into that spray, a full-strength highlight fires in a scatter of
  // isolated pixels and the lake turns into tinfoil. Which angles trigger it is
  // pure luck — so it stays invisible until something moves the camera's
  // elevation, and then the whole sea blows out at once.
  vec2 rippleUv = vWaterGround * uRippleScale;
  float ripplA = texture2D(uWaveMap, rippleUv + uRippleOffset).r;
  float ripplB = texture2D(uWaveMap, rippleUv * 1.73 - uRippleOffset * 1.31).r;

  float swell  = scapeWave(vWaterGround);
  float swellX = scapeWave(vWaterGround + vec2(1.6, 0.0));
  float swellZ = scapeWave(vWaterGround + vec2(0.0, 1.6));

  // Everything the surface does to its own normal goes away under ice, in one
  // multiply: a shelf is flat, and a ripple normal on it is the giveaway that
  // the freeze is paint rather than a state the water is in.
  normal = normalize(normal + vec3(
    (ripplA - 0.5) * uRippleStrength - (swellX - swell) * uWaveHeight * 2.4,
    0.0,
    (ripplB - 0.5) * uRippleStrength - (swellZ - swell) * uWaveHeight * 2.4
  ) * (1.0 - iceCover));
`

export function createWater (
  config:   LiveConfig,
  field:    HeightField,
  quality:  AtmosphereQuality,
  textures: TextureCatalogue,
): Water {
  // Seven dependent texture reads is what the full lake costs, and a tile-based
  // gpu pays for those in stalls rather than in bandwidth. Below the full tap
  // budget the surface draws from two.
  const lite = quality.detailTaps < 6

  // Two spans, deliberately. The bathymetry mask covers the inhabited world,
  // but the surface runs far past it so the archipelago sits in open water that
  // reaches the fog instead of ending on a visible edge. The mask clamps at its
  // border, where the composite field is already deep seabed.
  //
  // How *far* past it is a tier decision. The plane only has to outrun the fog,
  // and the fog closes within `groundRadius * 2` of the camera — so the cheap
  // tiers can carry a third of the surface for the same horizon, which is a
  // third of the vertices in the one mesh that is guaranteed to fill the frame.
  const maskSpan = config().archipelago.worldSize * 1.02
  const surface  = Math.max(
    config().archipelago.worldSize * 4,
    config().terrain.size * quality.waterSpan,
  )
  const segments = quality.waterSegments
  const geometry = new PlaneGeometry(surface, surface, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const shoreMap: Texture = bakeShoreMask(config(), field, maskSpan, quality.shoreMask)

  // Both from the shared catalogue, mipmapping and wrap modes included. The
  // speckled one only ever tints; the fractal one drives the shading, because
  // neighbouring texels have to agree which way the surface is leaning.
  const rippleMap = textures.get('water.ripple')
  const waveMap   = textures.get('water.wave')

  const rippleOffset: IUniform<Vector2> = { value: new Vector2() }
  const waveTime: IUniform<number>      = { value: 0 }
  const iceColor: IUniform<Color>       = { value: new Color(config().palette.ice) }
  const swell: IUniform<Vector2>        = { value: new Vector2(1, 0) }

  /**
   * Trail ring buffers, one per emitter. Each is three flat arrays of 6 vec4s
   * (position, direction, distance) plus a scalar point count. The shader
   * iterates only the valid points, so a partially filled trail is cheap.
   */
  const TRAIL_PTS = 6
  const trailPos  = Array.from(
    { length: MAX_BOAT_WAKES },
    () => Array.from({ length: TRAIL_PTS }, () => new Vector4()),
  )
  const trailDir = Array.from(
    { length: MAX_BOAT_WAKES },
    () => Array.from({ length: TRAIL_PTS }, () => new Vector4()),
  )
  const trailDist   = Array.from(
    { length: MAX_BOAT_WAKES },
    () => new Float32Array(TRAIL_PTS),
  )
  const trailCounts = new Float32Array(MAX_BOAT_WAKES)

  const daylight                             = createDaylight(config)
  const sunDir: IUniform<Vector3>            = { value: new Vector3() }
  const sunColor: IUniform<Color>            = { value: new Color() }
  const dayAmount: IUniform<number>          = { value: 1 }
  const skyHorizon: IUniform<Color>          = { value: new Color() }
  const skyTop: IUniform<Color>              = { value: new Color() }
  const reflectionStrength: IUniform<number> = { value: 1 }

  const uniforms: Record<string, IUniform> = {
    uShoreMap:           { value: shoreMap },
    uRippleMap:          { value: rippleMap },
    uWaveMap:            { value: waveMap },
    uRippleOffset:       rippleOffset,
    uDeep:               { value: new Color(config().palette.deepWater) },
    uShallow:            { value: new Color(config().palette.shallowWater) },
    uFoam:               { value: new Color(config().palette.foam) },
    uIce:                iceColor,
    uShoreScale:         { value: 1 / maskSpan },
    uFreeze:             { value: 0 },
    uIceReach:           { value: config().water.iceReach },
    uIceBreak:           { value: config().water.iceBreak },
    uFloeScale:          { value: config().terrain.size / config().archipelago.worldSize },
    uRippleScale:        { value: 1 / 34 },
    uRippleStrength:     { value: config().water.rippleStrength },
    uBoatWakeStrength:   { value: config().water.wakeStrength },
    uTrailPos0:          { value: trailPos[0] },
    uTrailPos1:          { value: trailPos[1] },
    uTrailPos2:          { value: trailPos[2] },
    uTrailDir0:          { value: trailDir[0] },
    uTrailDir1:          { value: trailDir[1] },
    uTrailDir2:          { value: trailDir[2] },
    uTrailDist0:         { value: trailDist[0] },
    uTrailDist1:         { value: trailDist[1] },
    uTrailDist2:         { value: trailDist[2] },
    uTrailCount0:        { value: 0 },
    uTrailCount1:        { value: 0 },
    uTrailCount2:        { value: 0 },
    uSunDir:             sunDir,
    uSunColor:           sunColor,
    uDay:                dayAmount,
    uSkyHorizon:         skyHorizon,
    uSkyTop:             skyTop,
    uReflectionStrength: reflectionStrength,
    uSparkleScale:       { value: 1 / 14 },
    uSparkle:            { value: config().water.sparkle },
    uWaveTime:           waveTime,
    uWaveHeight:         { value: config().water.waveHeight },
    uSwell:              swell,
    uSurf:               { value: config().water.surf },

    // Metres in, fractions of `MAX_DEPTH` out — the mask's depth channel is a
    // fraction of that, so this is where the one conversion happens rather than
    // in the shader, where the constant would have to be written down twice.
    uSurfDepth:    { value: config().water.surfDepth / MAX_DEPTH },
    uSurfExposure: { value: config().water.surfExposure },
    uSurgePhase:   { value: 0 },
  }

  // Opaque at the material level, and let the shader's alpha ramp do the
  // fading. At 0.92 the deep water leaks 8% of whatever is behind it, which
  // over open sea means the terrain plane's own square edge shows through as a
  // faint rectangle around the island.
  // Rough, and barely lit by the environment. Those two settle the same
  // argument from opposite ends.
  //
  // Tilt is bound to zoom now, so the camera's elevation sweeps a range that
  // crosses the sun's. A near-mirror surface at that crossing reflects the sun
  // into *every* fragment of a flat plane at once — the lake stops being water
  // and becomes one white highlight the size of the sea. Roughness spreads that
  // lobe out until no angle can concentrate it.
  //
  // Rough dielectrics then pick up the whole sky instead, which is overcast and
  // pale, and the depth tint drowns under it. Cutting `envMapIntensity` is what
  // gives the water back its own colour; the glitter above supplies the sharp
  // highlights the roughness gave away.
  const material = new MeshStandardMaterial({
    name:            'water-surface',
    color:           0xffffff,
    transparent:     true,
    opacity:         1,
    roughness:       config().water.roughness,
    metalness:       0.02,
    envMapIntensity: 0.3,
    depthWrite:      false,
  })

  material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
    Object.assign(program.uniforms, uniforms)

    program.vertexShader = program.vertexShader
      .replace('#include <common>', `#include <common>\n${WATER_PARS_VERTEX}`)
      .replace('#include <begin_vertex>', WATER_SWELL_VERTEX)
      .replace('#include <project_vertex>', WATER_WORLD_VERTEX)

    program.fragmentShader = program.fragmentShader
      .replace('#include <common>', `#include <common>\n${WATER_PARS_FRAGMENT}`)
      .replace('#include <map_fragment>', lite ? WATER_COLOR_FRAGMENT_LITE : WATER_COLOR_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', WATER_ROUGHNESS_FRAGMENT)
      .replace('#include <normal_fragment_begin>', lite ? WATER_NORMAL_FRAGMENT_LITE : WATER_NORMAL_FRAGMENT)
      .replace('#include <opaque_fragment>', `${WATER_REFLECTION_FRAGMENT}\n#include <opaque_fragment>`)
  }
  material.customProgramCacheKey = () => `scape-water:${lite ? 'lite' : 'full'}`

  const mesh      = new Mesh(geometry, material)
  mesh.name       = 'water'
  mesh.position.y = config().terrain.waterLevel

  // The floor of the transparent stack. Left at three's default of 0 this was
  // *tied* with the beacon's beams and the sea smoke, and a tie falls through
  // to a depth compare that a camera rotation can flip.
  mesh.renderOrder   = LAYER.water
  mesh.receiveShadow = true

  // The swell is entirely in the shader — the plane itself sits at the
  // waterline and stays there, so its matrix is composed once and left alone.
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false

  function syncBoatWakes (wakes: readonly BoatWakeEmitter[] = []): void {
    for (let index = 0; index < MAX_BOAT_WAKES; index += 1) {
      const source   = wakes[index]
      const strength = source?.strength ?? 0

      if (source?.trail && strength > 0.001) {
        const trail        = source.trail
        const count        = trail.count
        trailCounts[index] = count

        // Copy the ring buffer into the flat arrays. The ring's head points
        // at the most recent sample, so we walk from head+1 through the
        // valid points oldest-first, which matches the shader's forward
        // iteration from stern to bow.
        for (let i = 0; i < TRAIL_PTS; i++) {
          const si = (trail.head + 1 + i) % TRAIL_PTS
          const sp = trail.points[si]
          trailPos[index][i].set(sp.x, sp.z, 0, 0)
          trailDir[index][i].set(sp.dirX, sp.dirZ, 0, 0)
          trailDist[index][i] = sp.trailDist
        }
      }
      else
        trailCounts[index] = 0
    }
  }

  return {
    mesh,

    // Read back from the config every frame rather than captured at build, so
    // the tuning overlay can drive the lake without rebuilding the scene.
    update (elapsed, wind, season, weather, wakes) {
      // Rain, without a uniform or a fetch of its own. A shower does two things
      // to a lake and the shader already has a knob for each: it puts the surface
      // into a chop that kills the glitter — a sun lobe needs a facet to hold
      // still long enough to catch it — and it roughens the ripple that carries
      // the shading. So the fall simply drives the two numbers the overlay
      // drives, which also means the water's answer to the rain costs nothing
      // per fragment and nothing per tier.
      const fall = weather.fall

      syncBoatWakes(wakes)

      // The ripple scrolls on the wind rather than on a pair of rates nobody
      // could point at: a sea whose texture travels one way while the grass on
      // the shore leans another is the same disagreement the mist and the cloud
      // had. `RIPPLE_DRIFT` is what the old fixed rate works out to at the
      // default wind, so a still day still shows the sea it always showed.
      rippleOffset.value.set(
        wind.dirX * wind.travel * RIPPLE_DRIFT,
        wind.dirZ * wind.travel * RIPPLE_DRIFT,
      )
      waveTime.value                   = elapsed
      uniforms.uBoatWakeStrength.value = config().water.wakeStrength
      uniforms.uSparkle.value          = config().water.sparkle * (1 - 0.85 * fall)
      uniforms.uWaveHeight.value       = config().water.waveHeight
      uniforms.uRippleStrength.value   = config().water.rippleStrength * (1 + 0.7 * fall)
      uniforms.uFreeze.value           = season.freeze
      uniforms.uIceReach.value         = config().water.iceReach
      uniforms.uIceBreak.value         = config().water.iceBreak

      // The swell runs where the wind is pushing it, and the wave train marches
      // in on the same integrated travel every scrolling surface in the scape
      // shares. The gust only *lifts* it: a swell outlives the wind that raised
      // it, so a dead calm still breaks at three quarters of the authored
      // strength — which is also what keeps a still, where the wind is zeroed by
      // definition, a photograph of a coast with a sea running on it.
      swell.value.set(wind.dirX, wind.dirZ)
      uniforms.uSurgePhase.value   = wind.travel * SURGE_RATE
      uniforms.uSurf.value         = config().water.surf * (0.75 + 0.25 * Math.min(1.6, wind.strength))
      uniforms.uSurfDepth.value    = config().water.surfDepth / MAX_DEPTH
      uniforms.uSurfExposure.value = config().water.surfExposure

      iceColor.value.copy(season.iceColor)

      // Sample the daylight for the reflection. The atmosphere module also
      // samples it, but its horizon has been adjusted by sun scatter — the
      // water gets the base colours, which is correct because the water is
      // the thing being scattered *at* and does not need to re-scatter
      // its own reflection.
      const now = daylight.sample(config().daylight.time, config().season.time)
      sunDir.value.copy(now.direction)
      sunColor.value.copy(now.sun)
      dayAmount.value = now.day
      skyHorizon.value.copy(now.horizon)
      skyTop.value.copy(now.skyTop)
      reflectionStrength.value = config().water.roughness < 0.4 ? 0.6 : 1

      if (material.roughness !== config().water.roughness)
        material.roughness = config().water.roughness
    },

    dispose () {
      geometry.dispose()
      material.dispose()
      // Only the mask, which this module baked. The ripple and wave maps are
      // the catalogue's and are freed with it — a shared texture disposed by one
      // consumer is how the other ends up sampling a dead handle.
      shoreMap.dispose()
    },
  }
}

// perf: one transparent draw. The shore mask is baked once at build from the
// same height field the terrain uses, so bathymetry costs one texture fetch and
// the swell costs three sines per vertex plus three more per lit fragment. The
// freeze adds one vertex texture fetch of that same mask and three sines to
// each stage — no draw, no material, no pass, and no fragment tap, which is why
// every tier including `minimal` gets the winter.
//
// The surf is the same trade taken further: the shore's own bearing rides in
// the mask's spare channels, so a breaker band costs one dot product, one sine
// and two smoothsteps on a fetch the lake was making anyway. No draw, no
// texture memory, no tap — which is why the phone gets it too.
