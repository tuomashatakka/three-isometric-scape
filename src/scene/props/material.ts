import { Color, RepeatWrapping, Vector2 } from 'three'
import type { IUniform, MeshStandardMaterial, Texture, WebGLProgramParametersWithUniforms } from 'three'
import { createSeamlessNoiseTexture, kitMaterial, markShared } from 'threejs-scene/modules/assets'
import { NOTHING_SKIPPED } from '../audit.ts'
import type { ScapeSkips } from '../audit.ts'
import type { ScapeConfig } from '../config.ts'
import type { SeasonState } from '../season.ts'

/** The two materials every solid thing in the scape draws with. */
export interface ScapeMaterials {

  /** Terrain, buildings, stone, anything that does not move. */
  ground: MeshStandardMaterial

  /** Instanced vegetation — same look, plus a vertex sway. */
  foliage: MeshStandardMaterial

  /** Advance cloud drift, wind phase and the year. Allocation-free. */
  update(elapsed: number, season: SeasonState): void
  dispose(): void
}

const CLOUD_SIZE  = 256
const DETAIL_SIZE = 256

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
 * The surface normal's `y`, and only where something reads it.
 *
 * Emitted with the ground pass rather than with the cloud shadow, because the
 * ground is the only reader and foliage never receives it — a varying that is
 * written and declared but never read still occupies a slot on drivers that pack
 * before they eliminate. Worth doing on principle; not, as it turned out, what
 * the handset was dying of.
 *
 * Two readers now: the grain weights itself by how horizontal the surface is,
 * and so does lying snow. Both are the same question — is this face pointing at
 * the sky — so both are answered by the same interpolated float.
 */
const UP_PARS_VERTEX = /* glsl */`
  varying float vScapeUp;
`

const UP_WORLD_VERTEX = /* glsl */`
  vec3 scapeNormal = objectNormal;
  #ifdef USE_INSTANCING
    scapeNormal = mat3(instanceMatrix) * scapeNormal;
  #endif
  vScapeUp = normalize(mat3(modelMatrix) * scapeNormal).y;
`

const UP_PARS_FRAGMENT = /* glsl */`
  varying float vScapeUp;
`

/**
 * Per-instance foliage sway. The phase is derived from the instance's own world
 * translation so a field of grass never pulses in unison, and the amplitude is
 * weighted by local height so trunks stay planted while tips travel.
 */
const WIND_PARS_VERTEX = /* glsl */`
  uniform float uWindTime;
  uniform float uWindSpeed;
  uniform float uWindStrength;
`

const WIND_VERTEX = /* glsl */`
  #include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 swayOrigin = instanceMatrix[3].xyz;
  #else
    vec3 swayOrigin = vec3(0.0);
  #endif
  float swayPhase  = uWindTime * uWindSpeed + swayOrigin.x * 0.35 + swayOrigin.z * 0.27;
  float swayAmount = pow(max(transformed.y, 0.0), 1.4) * uWindStrength * 0.03;
  transformed.x += sin(swayPhase) * swayAmount;
  transformed.z += cos(swayPhase * 0.77 + 1.3) * swayAmount * 0.62;
`

/**
 * Ground grain.
 *
 * Vertex colour alone gives the terrain its *palette* but not its *surface* —
 * at this camera distance a metre of ground is a few pixels wide, and without
 * something at that scale it reads as coloured paper. Two things fix it and
 * both are one texture: a fine albedo mottle, and a normal perturbation taken
 * as the finite difference of the same fetch, which is what makes the light
 * catch on soil rather than sliding over it.
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
  uniform float uDetailScale;
  uniform float uDetailStrength;
  uniform float uDetailMacro;
`

/**
 * The same grain, for a gpu that cannot afford to look for it six times.
 *
 * One dependent texture read instead of six. It keeps the albedo mottle and the
 * roughness break-up, which are what stop the ground reading as coloured paper,
 * and gives up the macro octave and the normal perturbation — the latter needs
 * three fetches to exist at all, since it is a finite difference.
 *
 * This is a steady-frame quality budget, not the context-loss fix. The connected
 * Pixel 10 a/b test traced that failure to the separate shadow-map depth pass.
 * See `quality.detailTaps`.
 */
const DETAIL_FRAGMENT_LITE = /* glsl */`
  #include <normal_fragment_begin>
  float scapeFlat = smoothstep(0.3, 0.9, vScapeUp);
  float scapeAmt  = uDetailStrength * scapeFlat;
  float grain     = texture2D(uDetailMap, vScapeGround * uDetailScale).r;

  diffuseColor.rgb *= 1.0 + scapeAmt * (grain - 0.5) * 1.6;

  // Dirt collects in the low ground and it never comes back out.
  diffuseColor.rgb *= 1.0 - scapeAmt * 0.22 * pow(1.0 - grain, 2.0);

  roughnessFactor = clamp(roughnessFactor + scapeAmt * (0.5 - grain) * 0.24, 0.05, 1.0);
`

const DETAIL_FRAGMENT = /* glsl */`
  #include <normal_fragment_begin>
  float scapeFlat = smoothstep(0.3, 0.9, vScapeUp);
  float scapeAmt  = uDetailStrength * scapeFlat;
  vec2 scapeUv    = vScapeGround * uDetailScale;
  vec2 macroUv    = scapeUv * 0.16;
  float grain     = texture2D(uDetailMap, scapeUv).r;
  float grainX    = texture2D(uDetailMap, scapeUv + vec2(0.015, 0.0)).r;
  float grainZ    = texture2D(uDetailMap, scapeUv + vec2(0.0, 0.015)).r;
  float macro     = texture2D(uDetailMap, macroUv).r;
  float macroX    = texture2D(uDetailMap, macroUv + vec2(0.02, 0.0)).r;
  float macroZ    = texture2D(uDetailMap, macroUv + vec2(0.0, 0.02)).r;

  diffuseColor.rgb *= 1.0 + scapeAmt * (grain - 0.5) * 1.6;
  diffuseColor.rgb *= 1.0 + scapeAmt * uDetailMacro * (macro - 0.5) * 1.15;

  // Dirt collects in the low ground and it never comes back out.
  diffuseColor.rgb *= 1.0 - scapeAmt * 0.22 * pow(1.0 - grain, 2.0);

  roughnessFactor = clamp(roughnessFactor + scapeAmt * (0.5 - grain) * 0.24, 0.05, 1.0);

  vec3 scapeBump = vec3(grainX - grain, 0.0, grainZ - grain) * 3.0 +
    vec3(macroX - macro, 0.0, macroZ - macro) * uDetailMacro * 2.2;
  normal = normalize(normal + mat3(viewMatrix) * scapeBump * scapeAmt);
`

const SEASON_PARS_FRAGMENT = /* glsl */`
  uniform vec3 uSeasonTint;
  uniform float uSeasonTintAmount;
  uniform vec3 uSeasonSnow;
  uniform float uSeasonSnowAmount;
  uniform float uSeasonSnowLine;
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
function seasonFragment (lie: string): string {
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
  float scapeLies  = smoothstep(
    uSeasonSnowLine,
    uSeasonSnowLine + 1.6,
    scapeAltitude + scapeDrift * 0.85
  );
  float scapeSnow = uSeasonSnowAmount * scapeLies * (${lie});

  diffuseColor.rgb = mix(diffuseColor.rgb, uSeasonSnow, scapeSnow);
  roughnessFactor  = mix(roughnessFactor, 0.78, scapeSnow);
`
}

/** Lying snow settles on what faces the sky, and slides off what does not. */
const GROUND_LIE = 'smoothstep(0.22, 0.72, vScapeUp)'

/** A tuft or a bough holds snow whichever way its facets happen to point. */
const FOLIAGE_LIE = '0.55'

function buildCloudMap (seed: number): Texture {
  const texture = createSeamlessNoiseTexture({ size: CLOUD_SIZE, seed, frequency: 3, octaves: 4 })
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

function buildDetailMap (seed: number): Texture {
  const texture = createSeamlessNoiseTexture({ size: DETAIL_SIZE, seed, frequency: 12, octaves: 5 })
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  return texture
}

export function createScapeMaterials (
  config: ScapeConfig,
  skip: ScapeSkips = NOTHING_SKIPPED,
  detailTaps = 6,
): ScapeMaterials {
  const detailFragment = detailTaps >= 6 ? DETAIL_FRAGMENT : DETAIL_FRAGMENT_LITE

  const cloudMap  = buildCloudMap(config.seed)
  const detailMap = buildDetailMap(config.seed ^ 0x77c1)

  const cloudOffset: IUniform<Vector2>   = { value: new Vector2() }
  const shared: Record<string, IUniform> = {
    uCloudMap:      { value: cloudMap },
    uCloudOffset:   cloudOffset,
    uCloudScale:    { value: 1 / Math.max(1, config.atmosphere.cloudScale) },
    uCloudStrength: { value: config.atmosphere.cloudShadow },
  }
  const wind: Record<string, IUniform> = {
    uWindTime:     { value: 0 },
    uWindSpeed:    { value: config.wind.speed },
    uWindStrength: { value: config.wind.strength },
  }
  const detail: Record<string, IUniform> = {
    uDetailMap:      { value: detailMap },
    uDetailScale:    { value: 1 / Math.max(0.5, config.terrain.detailScale) },
    uDetailStrength: { value: config.terrain.detailGrain },
    uDetailMacro:    { value: config.terrain.detailMacro },
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
    uSeasonSnowLine:   { value: config.terrain.waterLevel },
  }

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
    const normalFragment = [
      extra.detail ? detailFragment : '#include <normal_fragment_begin>',
      extra.lie ? seasonFragment(extra.lie) : '',
    ].join('\n')

    // `?skip=inject` leaves the mesh, the geometry and the vertex colours exactly
    // as they are and takes only the shader patch away — so what draws is the
    // stock `MeshStandardMaterial` the library's own starters run on the handset
    // without trouble. If the scape survives this and dies without it, the
    // injection is the answer; if it dies either way, the injection never was.
    if (!skip.has('inject'))
      material.onBeforeCompile = (program: WebGLProgramParametersWithUniforms) => {
        Object.assign(program.uniforms, shared, extra.wind, extra.detail, extra.lie ? season : null)

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
            extra.detail ? DETAIL_PARS_FRAGMENT : '',
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
    material.customProgramCacheKey = () => `${key}:${detailTaps}`

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
    update (elapsed, year) {
      const drift = config.atmosphere.cloudSpeed

      cloudOffset.value.set(elapsed * drift * 0.06, elapsed * drift * 0.021)
      wind.uWindTime.value         = elapsed
      wind.uWindSpeed.value        = config.wind.speed
      wind.uWindStrength.value     = config.wind.strength
      shared.uCloudStrength.value  = config.atmosphere.cloudShadow
      shared.uCloudScale.value     = 1 / Math.max(1, config.atmosphere.cloudScale)
      detail.uDetailStrength.value = config.terrain.detailGrain
      detail.uDetailScale.value    = 1 / Math.max(0.5, config.terrain.detailScale)
      detail.uDetailMacro.value    = config.terrain.detailMacro

      seasonTint.value.copy(year.tint)
      seasonSnow.value.copy(year.snowColor)
      season.uSeasonTintAmount.value = year.tintAmount
      season.uSeasonSnowAmount.value = year.snow
      season.uSeasonSnowLine.value   = year.snowLine
    },

    dispose () {
      cloudMap.dispose()
      detailMap.dispose()
      ground.dispose()
      foliage.dispose()
    },
  }
}

// perf: two materials for the entire scape — two shader compiles, and every
// mesh and InstancedMesh shares them, so the renderer never changes program.
