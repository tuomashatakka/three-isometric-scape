import type { AppModule } from 'threejs-scene'
import { SCAPE_ARCH } from './config-arch.ts'
import type { ArchConfig } from './config-arch.ts'
import { SCAPE_CARTER } from './config-carter.ts'
import type { CarterConfig } from './config-carter.ts'
import { SCAPE_CRAG } from './config-crag.ts'
import type { CragConfig } from './config-crag.ts'
import { SCAPE_CROSSING } from './config-crossing.ts'
import type { CrossingConfig } from './config-crossing.ts'
import { SCAPE_DUNES } from './config-dunes.ts'
import type { DuneBeltConfig } from './config-dunes.ts'
import { SCAPE_DYKE } from './config-dyke.ts'
import type { DykeConfig } from './config-dyke.ts'
import { SCAPE_FORCE } from './config-force.ts'
import type { ForceConfig } from './config-force.ts'
import { SCAPE_FRONT } from './config-front.ts'
import type { FrontConfig } from './config-front.ts'
import { SCAPE_GUARD } from './config-guard.ts'
import type { GuardConfig } from './config-guard.ts'
import { SCAPE_CREEL } from './config-creel.ts'
import type { CreelConfig } from './config-creel.ts'
import { SCAPE_KELP } from './config-kelp.ts'
import type { KelpConfig } from './config-kelp.ts'
import { SCAPE_LANDMASSES } from './config-landmasses.ts'
import { SCAPE_PALETTE } from './config-palette.ts'
import type { ScapePalette } from './config-palette.ts'
import { SCAPE_SALTINGS } from './config-saltings.ts'
import type { SaltingsConfig } from './config-saltings.ts'
import { SCAPE_LEDGES } from './config-ledges.ts'
import type { LedgeConfig } from './config-ledges.ts'
import { SCAPE_MOLE } from './config-mole.ts'
import type { MoleConfig } from './config-mole.ts'
import { SCAPE_PACK_ICE } from './config-packice.ts'
import type { PackIceConfig } from './config-packice.ts'
import { SCAPE_HOWE } from './config-howe.ts'
import type { HoweConfig } from './config-howe.ts'
import { SCAPE_HJELL } from './config-hjell.ts'
import type { HjellConfig } from './config-hjell.ts'
import { SCAPE_WASH } from './config-wash.ts'
import { SCAPE_LOD } from './config-lod.ts'
import type { LodConfig } from './config-lod.ts'
import type { WashConfig } from './config-wash.ts'
import { SCAPE_KILN } from './config-kiln.ts'
import type { KilnConfig } from './config-kiln.ts'
import { SCAPE_SEASON } from './config-season.ts'
import type { SeasonConfig } from './config-season.ts'
import { SCAPE_SNOW_FENCE } from './config-snowfence.ts'
import type { SnowFenceConfig } from './config-snowfence.ts'
import { SCAPE_SHIELING } from './config-shieling.ts'
import type { ShielingConfig } from './config-shieling.ts'
import { SCAPE_HAAR } from './config-haar.ts'
import type { HaarConfig } from './config-haar.ts'
import { SCAPE_HALO } from './config-halo.ts'
import type { HaloConfig } from './config-halo.ts'
import { SCAPE_SHAFTS } from './config-shafts.ts'
import type { ShaftsConfig } from './config-shafts.ts'
import { SCAPE_SHELTER } from './config-shelter.ts'
import type { ShelterConfig } from './config-shelter.ts'
import { SCAPE_SWASH } from './config-swash.ts'
import type { SwashConfig } from './config-swash.ts'
import { SCAPE_CROPPING } from './config-cropping.ts'
import type { CroppingConfig } from './config-cropping.ts'
import { SCAPE_RIGS } from './config-rigs.ts'
import type { RigsConfig } from './config-rigs.ts'
import { SCAPE_ROOST } from './config-roost.ts'
import type { RoostConfig } from './config-roost.ts'
import { SCAPE_FAR_SHORE } from './config-farshore.ts'
import type { FarShoreConfig } from './config-farshore.ts'
import type { ShoreLightsConfig } from './config-shorelights.ts'
import { SCAPE_SHOAL } from './config-shoal.ts'
import { SCAPE_SHORE_LIGHTS } from './config-shorelights.ts'
import type { ShoalConfig } from './config-shoal.ts'
import { SCAPE_STACK } from './config-stack.ts'
import type { StackConfig } from './config-stack.ts'
import { SCAPE_WATERMILL } from './config-watermill.ts'
import type { WatermillConfig } from './config-watermill.ts'
import { SCAPE_TREELINE } from './config-treeline.ts'
import type { TreelineConfig } from './config-treeline.ts'
import { SCAPE_WEIR } from './config-weir.ts'
import type { WeirConfig } from './config-weir.ts'
import { SCAPE_WRECK } from './config-wreck.ts'
import type { WreckConfig } from './config-wreck.ts'
import { SCAPE_SITES } from './config-sites.ts'
import type { SitesConfig } from './config-sites.ts'
import { SCAPE_LIGHTS } from './config-lights.ts'
import type { LightsConfig } from './config-lights.ts'
import { SCAPE_SEA } from './config-sea.ts'
import type { SeaConfig } from './config-sea.ts'
import type { QualityEffects } from './quality.ts'


export type GradeName = 'natural' | 'cinematic' | 'warm' | 'cool' | 'noir' | 'dream' | 'nordic'

/**
 * A satellite islet, in fractions of the terrain half-extent.
 *
 * Applied *after* the island falloff, so the rim drowning that keeps the
 * terrain plane's square edge under water never touches them — they are their
 * own little islands standing in open sea.
 */
export interface Isle {
  x: number
  z: number

  /**
   * Outer radius, where the skirt meets the seabed. Dry land reaches roughly
   * `0.72 * radius`; see the plateau profile in `landscape/height.ts`.
   */
  radius: number

  /** Crown height above the waterline, in metres. */
  height: number
}

/** Per-type instance budgets, before the quality tier scales them. */
export type LandmassProfile = 'home' | 'ridge' | 'meadow' | 'sound' | 'fell' | 'shield'

/**
 * One inhabited island, surveyed in its own local coordinate frame.
 *
 * The origin is the only world-space value. Everything else is fed through the
 * existing single-island survey unchanged, which keeps the yard, coast, creek,
 * landing and path solvers agreeing about the same ground.
 */
export interface LandmassSpec {
  id:         string
  profile:    LandmassProfile
  origin:     readonly [number, number]
  seedOffset: number

  /** Whether this landmass inherits the home island's surrounding skerries. */
  satellites: 'home' | 'none'

  /**
   * Whether the ferry circuit calls here. Omitted is `'ferry'`.
   *
   * A fact about the *route* rather than about the island: every holding has a
   * jetty, because every holding is on a coast and reaches its own water, and
   * `'none'` does not take that away — it takes away the leg of the circuit
   * that would come to it. The boats keep a fixed order and a fixed spacing
   * around one loop (see `landscape/waterway.ts`), so a port is not a place a
   * ferry may call: it is a place the whole fleet's schedule is built around.
   *
   * The shield is the first island to say `'none'`, and it says it for the
   * reason it is out there at all — it is a long day north of the nearest
   * holding, past the last of the skerries, and what is on it is ice. The boat
   * drawn up on its shore is its own.
   */
  port?: 'ferry' | 'none'

  /**
   * Only what this island's ground does *differently*.
   *
   * The top-level `terrain` and `layout` sections are the defaults, and an
   * island that omits a field simply has the home island's answer for it. That
   * is not tidiness: the home landmass used to restate all eleven of those
   * numbers verbatim, which meant every one of them existed twice and had to be
   * kept in agreement by hand — and the two were read by different code, so a
   * pair that drifted apart would have shown up as a farm sited on one island
   * and drawn on a differently shaped one.
   */
  terrain?: Partial<LandmassTerrain>
  layout?:  Partial<LandmassLayout>

  /**
   * How closely this island is drawn and dressed, relative to the home island.
   *
   * One number for both, because they are one question: an island the camera
   * rarely reaches does not need the home island's metres-per-quad *or* its
   * stems-per-hectare, and two knobs for that would be two knobs to keep in
   * agreement. Terrain segments and every scatter budget scale by it together.
   *
   * 1 is the home island's own density. Below about 0.3 the coastline starts to
   * facet visibly at the near zoom; above 1 an outer island costs more than the
   * farm does, for ground nobody stands on.
   *
   * It is not a *look* knob dressed as a budget — an island at 0.45 reads as
   * wilder rather than as emptier, because the farm's own props are counted per
   * holding and only the wild scatter is a density.
   */
  detail?: number
}

/** The part of `terrain` an island is allowed its own answer to. */
export type LandmassTerrain = Pick<
  ScapeConfig['terrain'],
  'size' | 'height' | 'shoreBand' | 'islandInner' | 'islandOuter' | 'ruggedness' | 'reliefSmoothing' |
  'fjord' | 'icecap'
>

/** The part of `layout` an island is allowed its own answer to. */
export type LandmassLayout = Pick<
  ScapeConfig['layout'],
  'yardRadius' | 'trackWidth' | 'plotCount' | 'forestBias' | 'harbourSpread' | 'pastureRadius'
>

/**
 * One island's ground, resolved out of the defaults and its own overrides.
 *
 * The single place that knows a spec is partial. Everything that asks an island
 * how big it is goes through here — the separation check, the mist's land mask,
 * the terrain patch and the local survey — so there is one answer rather than
 * one per caller.
 */
export function landmassTerrain (config: ScapeConfig, spec: LandmassSpec): ScapeConfig['terrain'] {
  return {
    ...config.terrain,
    ...spec.terrain,

    // The skerries belong to the home island's own composition. An outer
    // landmass that inherited them would be surrounded by a ring of rocks
    // measured against a coastline it does not have.
    isles: spec.satellites === 'home' ? config.terrain.isles : [],
  }
}

/** One island's composition, resolved the same way. See {@link landmassTerrain}. */
export function landmassLayout (config: ScapeConfig, spec: LandmassSpec): ScapeConfig['layout'] {
  return { ...config.layout, ...spec.layout }
}

/** How closely an island is drawn and dressed. See {@link LandmassSpec.detail}. */
export function landmassDetail (spec: LandmassSpec): number {
  return Math.max(0.05, spec.detail ?? 1)
}

export interface DressingBudget {
  spruce:     number
  pine:       number
  birch:      number
  deadSpruce: number
  sapling:    number
  stump:      number

  /** Juniper bushes on the open heath, spaced like the other structural shrubs. */
  juniper: number
  grass:   number

  /**
   * Marram on the dune belt — count before the tier scales it.
   *
   * Thrown at the whole archipelago like the other ground cover and kept by the
   * belt's own claim, so an island with no sand on it costs nothing but the
   * darts that missed.
   */
  marram: number

  /**
   * Cordgrass on the saltings — count before the tier scales it.
   *
   * Thrown at the whole archipelago like the marram and kept by the flat's own
   * turf share, so an island with no marsh on it costs nothing but the darts
   * that missed — and, like the talus, *not* scaled by island area: a saltings
   * is a place rather than an area of ground, and the three flats in this
   * archipelago come to about a thousand square metres of turf between them.
   */
  cordgrass:  number
  heather:    number
  wildflower: number
  reeds:      number
  lilyPads:   number
  crop:       number
  erratic:    number

  /**
   * Blocks at the foot of a crag — count before the tier scales it.
   *
   * Thrown at the whole archipelago like the marram and kept by the crag's own
   * talus share, so an island with no cliff on it costs nothing but the darts
   * that missed — and *not* scaled by island area, for the guard's reason: a
   * crag is a place rather than an area of ground, and the five headlands in
   * this archipelago come to under a thousand square metres between them.
   * Separate from `erratic` because the two are different stones:
   * an erratic is a boulder the ice left standing on a hillside, and this is
   * rock that came off a face last winter and has not been anywhere since.
   */
  talus:      number
  fieldStone: number
  cobble:     number

  /**
   * Cobbles set into the tread itself — what makes the network a paved one
   * rather than a strip of bare earth.
   *
   * Sampled along the traced legs rather than thrown at the island and tested,
   * so every one of these lands on a path and the count is the count. Turn the
   * footpath wear to zero and there are no legs to sample: the stones go with
   * the paths they were laid on, without a second switch.
   */
  pathStone: number
  cairn:     number
  hayBale:   number
  firewood:  number
  barrel:    number
  driftwood: number

  /** Stakes in the shallows — count before the tier scales it. */
  mooringPost: number

  /** Drying poles standing in the upland pasture. */
  hayPole: number

  /** Ricks of cut turf drying on one peat bank — count per working, not per island. */
  peatStack: number

  /**
   * Ewes on one flock's ground — head per flock, before the tier scales it.
   *
   * Per flock rather than per archipelago, which is the exception in this
   * table and deliberate: the flocks are surveyed features, so raising this
   * puts more sheep in the fields that exist rather than one sheep alone on a
   * headland. Fewer flocks is fewer sheep, and that is the honest answer.
   */
  sheep: number

  /** Lambs among them, on the same ground and two thirds the size. */
  lamb: number
}

export interface ScapeConfig extends CarterConfig, CreelConfig, CroppingConfig, CrossingConfig, DykeConfig, FarShoreConfig, ForceConfig, FrontConfig,
  GuardConfig, HaarConfig, HaloConfig, HjellConfig, HoweConfig, LodConfig, KelpConfig, KilnConfig, LedgeConfig, MoleConfig, PackIceConfig, RigsConfig, RoostConfig, ShaftsConfig, ShielingConfig,
  SeasonConfig, ShelterConfig, ShoalConfig, ShoreLightsConfig, SnowFenceConfig, SwashConfig, SeaConfig, LightsConfig, SitesConfig, TreelineConfig, WashConfig, WatermillConfig, WreckConfig {
  seed:    number
  terrain: {
    size:       number
    height:     number
    waterLevel: number

    /** Vertical band around the waterline that gets shelved into a beach. */
    shoreBand: number

    /** Fraction of the half-extent where the island starts falling away. */
    islandInner: number

    /** Fraction of the half-extent where the island has fully sunk. */
    islandOuter: number

    /** How far below the waterline the seabed sits, in metres. */
    seabedDrop: number

    /**
     * Offshore islets. Nobody farms them, and one of them carries the light —
     * whichever the search in `landscape/beacon.ts` finds furthest out.
     */
    isles: readonly Isle[]

    /** World units per tile of the ground grain. */
    detailScale: number

    /** Ground grain contrast, 0..1. */
    detailGrain: number

    /** Weight of the broad second octave of grain, relative to the fine one. */
    detailMacro: number

    /**
     * Fraction of the island kept gentle, 0..1.
     *
     * A low-frequency noise field decides per region whether the ground is
     * gentle or rugged. At 0.55, roughly55% of the island is compressed toward
     * flat while the remaining 45% retains full relief — giving rolling,
     * walkable ground with concentrated steep places rather than a uniform
     * slope everywhere. Raising this makes more of the island gentle; lowering
     * it spreads the steep ground across a wider area.
     */
    ruggedness: number

    /**
     * How much gentle ground is compressed toward flat, 0..1.
     *
     * A power curve applied to the normalised elevation in regions the
     * ruggedness mask marks as gentle. At 0.7 the mid-slopes are pulled down
     * so the ground between peaks reads as markedly gentler than the peaks
     * themselves; at 0 the shaping is off and every slope carries the same
     * relief it started with. The steep regions are never touched — this only
     * softens the ground that the ruggedness mask has already chosen.
     */
    reliefSmoothing: number

    /**
     * The drowned valley cut into this island.
     *
     * Per-island rather than per-archipelago, and the one section of `terrain`
     * that is a whole landform rather than a number about the ground: an inlet
     * belongs to the coast it is cut into, and the four islands without one say
     * so by inheriting `depth: 0`. See `landscape/fjord.ts` for the shape and
     * why the carve happens in the raw ground rather than in the composite
     * field the bar and the rocks are folded into.
     *
     * Build-time, all six, and absent from the tuning overlay for the reason
     * `creek` and `strand` are: the trench is cut into the terrain mesh, baked
     * into the bathymetry mask and surveyed *around* by the yard, the plots and
     * the paths, so nothing here can move without the scape being generated
     * again.
     *
     * **Every length here is metres and stays metres.** A drowned valley is the
     * size the ice that cut it made it, so none of this is a fraction of
     * `archipelago.worldSize` or of the live `viewSize`. The one number that is
     * a fraction — where the mouth is anchored — is read off `islandOuter`
     * rather than written here, so an island that grows takes its inlet's mouth
     * out to its new coast without this section being touched.
     */
    fjord: {

      /**
       * Metres below mean water at the deepest of the basin.
       *
       * The switch, and the only one: 0 is an island the ice never reached, and
       * there is no boolean beside it. Deeper than `seabedDrop` on purpose —
       * an overdeepened basin is the whole signature of a fjord, and one no
       * deeper than the sea outside it is a bay.
       */
      depth: number

      /**
       * How much of that depth the sill at the mouth stands up into, 0..1.
       *
       * The moraine the glacier left where it stopped. 1 is a trench of one
       * depth, which is a canal; at a third of the depth the bar stands shallow
       * enough to read as a shelf at the entrance rather than as more blue. It
       * is not what makes the inlet visible — the coastline it cuts is — because
       * the depth channel of the shore mask saturates well above any of these
       * three depths. See `landscape/fjord.ts`.
       */
      sill: number

      /** Mouth to head, in metres. */
      length: number

      /**
       * Half-width of the trench at the mouth, in metres.
       *
       * The floor is the middle of it and the walls are the rest — see
       * `FLOOR_SHARE` in `landscape/fjord.ts`. It narrows toward the head.
       */
      width: number

      /**
       * The direction the mouth faces from the island's middle, in degrees.
       *
       * Measured from `+x` toward `+z`, which is the convention `yawAlong` and
       * `layout.harbourSpread` are written against.
       */
      bearing: number

      /**
       * Lateral wander of the centreline, as a multiple of the width.
       *
       * 0 is a straight trench, which reads as authored however well the walls
       * are cut. A glacier follows the rock it found.
       */
      bend: number
    }

    /**
     * The ice standing on this island.
     *
     * The fjord's opposite number, and the second section of `terrain` that is a
     * whole landform: an inlet is what the ice *cut*, and this is what is left
     * of the ice. Per-island for the fjord's reason — a cap belongs to the
     * summit it sits on, and the islands without one say so by inheriting
     * `crown: 0`.
     *
     * Build-time, all of it, and out of the tuning overlay for the reason
     * `creek` and `fjord` are: the dome is folded into the raw ground, so the
     * farm is sited *around* it, the terrain mesh is built over it and the
     * bathymetry mask is baked off it. Nothing here can move without the scape
     * being generated again.
     *
     * See `landscape/icecap.ts` for the profile, and for why the shape is a
     * parabola rather than a contour.
     */
    icecap: {

      /**
       * The dome's centre, as fractions of the terrain half-extent.
       *
       * The convention `terrain.isles` uses, and for its reason: an island that
       * is authored at one size and drawn at another keeps its composition
       * where it was put. Which summit the ice is on is a fact about the
       * island's shape rather than about how many metres across it happens to
       * be this week.
       */
      x: number
      z: number

      /**
       * How far the surface reaches before it comes back down to the waterline,
       * as a fraction of the half-extent.
       *
       * **Island-sized, and it has to be.** A cap is bounded by the island
       * under it, so the same fraction gives a 455 m island a 70 m dome and a
       * 144 m one a 22 m dome, which is the right relationship between an ice
       * cap and the ground it stands on. In metres it would be the same dome on
       * both, and would drown the smaller island in it.
       *
       * It is a reach rather than a margin: where the ice actually *ends* is
       * wherever the falling parabola meets the rising rock, which is inside
       * this on a hillside and outside it over a bay.
       */
      reach: number

      /**
       * Metres the apex stands above the waterline.
       *
       * **Metres, and they stay metres**, and the switch as well as the height —
       * at 0 there is no ice on the island and no boolean beside it. It is the
       * surface that is authored rather than the thickness, because a cap's
       * profile is a property of the ice and not of the rock: raise this and
       * the dome swallows another ring of nunataks, exactly as a thickening ice
       * sheet does.
       */
      crown: number

      /**
       * Metres of water the front may stand in before the ice floats.
       *
       * Where the dome runs out over a coast rather than into a hillside there
       * is nothing holding it up, and ice with water under it goes to sea. So
       * the cap is cut off where the bed falls below this, and the cut *is* the
       * front: a wall of ice standing in the shallows with the surf breaking on
       * it, because the shore mask bakes off the same field.
       *
       * 0 stops the ice exactly at the waterline. A metre or two is a tidewater
       * front. Much more is an ice shelf, which is a different thing and is not
       * modelled — the dome would simply pave the bay.
       */
      grounding: number

      /**
       * How dark the crevasse fields go, 0..1.
       *
       * 0 is a smooth white dome, which is what an ice cap looks like from far
       * enough away and never looks like from this camera. Where the fractures
       * are is not authored: they open where the ice is steep, which on a dome
       * is its flanks — see `crevasseAt`.
       */
      crevasse: number

      /**
       * Metres between one crevasse and the next.
       *
       * **Metres, and they stay metres.** A crevasse field has a real-world
       * spacing — tens of metres on a dome this size — and it keeps that
       * spacing on a bigger island rather than being stretched to fit one.
       */
      crevasseScale: number
    }

    /**
     * Grain on everything the ground grain cannot reach, 0..1.
     *
     * The soil treatment weighs itself by how horizontal a face is, so walls,
     * gables, hulls, jetty timbers and granite faces get none of it — this is
     * the same idea with the projection turned on its side, so the read runs
     * along a board rather than across it. 0 leaves every upright surface flat
     * shaded, which is what the scape looked like before it existed.
     */
    propGrain: number

    /**
     * How green the ground goes on the faces turned away from the sun, 0..1.
     *
     * The switch for the aspect, and half of it: 0 is an island whose two sides
     * are the same substance, which is what a relief map is. What decides
     * *which* way is shaded is `daylight.azimuth` — the bearing the sun
     * transits on — so the mossy side of every hill follows the compass rather
     * than a hard-coded north. See `landscape/aspect.ts`.
     */
    aspectMoss: number

    /**
     * How far the faces turned into the sun are dried out, 0..1.
     *
     * The other half, and not a share of {@link ScapeConfig.terrain.aspectMoss}:
     * a shaded slope gains something the sunward one merely lacks, and a coast
     * where the damp side is worth painting and the dry side is not is a real
     * one. Leans toward `palette.dryGrass`, which is the colour the altitude
     * bands already use for grass the summer has had.
     */
    aspectBleach: number

    /**
     * Metres above the waterline where the aspect stops mattering.
     *
     * **Metres, and they stay metres.** Soil thins with height at a rate set by
     * the weather, not by how wide the archipelago is — so a wider world must
     * not scale this. Below the band there is nothing to green either: the
     * shore is scoured twice a day, and moss painted onto a beach is the same
     * mistake as a snow line painted onto one.
     */
    aspectLine: number

    /**
     * The blown sand on the weather shore.
     *
     * Under `terrain` rather than beside it, and that placement is the whole
     * reason it can differ from island to island: a landmass spec overrides
     * `terrain`, so the fell can carry a taller belt than the home island the
     * same way the shield carries an ice cap nobody else does. See
     * `config-dunes.ts` for the section itself, and `landscape/dunes.ts` for
     * the solve.
     */
    dunes: DuneBeltConfig

    /**
     * The rock face on the steep shore.
     *
     * Beside `dunes` and under `terrain` for the same reason it is: a landmass
     * spec overrides `terrain`, so the fell can stand a taller headland than
     * the home island the same way the shield carries an ice cap nobody else
     * does. See `config-crag.ts` for the section itself, and
     * `landscape/crag.ts` for the siting and the solve.
     */
    crag: CragConfig

    /**
     * The tidal flat at the beck's mouth.
     *
     * Beside `dunes` and `crag` and under `terrain` for the same reason both of
     * them are: a landmass spec overrides `terrain`, so one island can carry a
     * wider marsh than another the same way the shield carries an ice cap
     * nobody else does. See `config-saltings.ts` for the section itself, and
     * `landscape/saltings.ts` for the siting and the fill.
     */
    saltings: SaltingsConfig

    /**
     * The pillar the sea left standing off the headland.
     *
     * Beside `crag` and under `terrain` for the same reason the headland
     * itself is: a landmass spec overrides `terrain`, so the fell can stand a
     * taller stack off its own taller cliff without a word being written about
     * it here. See `config-stack.ts` for the section itself, and
     * `landscape/stack.ts` for the solve.
     */
    stack: StackConfig

    /**
     * The hole the sea cut through the headland and has not yet dropped.
     *
     * Beside `crag` and `stack` and under `terrain` for the reason both of them
     * are: a landmass spec overrides `terrain`, so one island can carry an arch
     * where another carries none. The one landform in this scape that is drawn
     * rather than raised — see `config-arch.ts` for the section and
     * `landscape/arch.ts` for the solve.
     */
    arch: ArchConfig
  }

  /**
   * The inhabited archipelago.
   *
   * terrain.size remains the home island's local size so every existing pure
   * layout test keeps its metre scale. worldSize is the separate span used by
   * the shared terrain, water, atmosphere and camera.
   */
  archipelago: {
    worldSize:  number
    landmasses: readonly LandmassSpec[]
  }

  /**
   * The scheduled ferry fleet.
   *
   * Runtime motion stays live and may reach zero; clearance and navigation
   * values shape the surveyed route and deliberately stay out of the overlay.
   */
  boats: {

    /** Metres travelled per second. 0 freezes the fleet. */
    speed: number

    /** Seconds all boats remain tied up after every boat has reached its next island. */
    dwellSeconds: number

    /** Maximum hull turn rate in radians per second. */
    turnRate: number

    /** Metres sampled either side of a hull to resolve its smooth route tangent. */
    turnLookAhead: number

    /** Minimum ground depth below the surface along a route, in metres. */
    clearance: number

    /** Minimum centre-to-centre distance between boats, in metres. */
    separation: number

    /** A* navigation grid spacing, in metres. */
    routeCell: number

    /** Distance beyond a jetty bank where a route may receive a boat. */
    dockReach: number
  }

  /** Knobs for the authored composition — the farmstead, its track and its fields. */
  layout: {
    yardRadius: number
    trackWidth: number
    plotCount:  number

    /** Metres between fence posts around a field plot. */
    fenceSpacing: number

    /** How strongly conifers cluster onto the ridges, 0..1. */
    forestBias: number

    /**
     * Degrees around the yard between the jetty's shoreline and the boathouse's.
     *
     * The harbour wants two coves, not one crowded bank — this is how far along
     * the shore the boathouse sits from the landing. Signed, so it can be put on
     * either side of the jetty.
     */
    harbourSpread: number

    /**
     * Radius of the walled upland pasture, in metres.
     *
     * Sized against the island rather than against the farm: the search that
     * sites it has to fit this whole disc onto high ground that the yard, the
     * plots and the track have all left alone, so raising it past roughly a
     * third of `landRadius` is how the pasture stops existing at all.
     */
    pastureRadius: number

    /** Width of the gap left in the pasture wall for its gate, in degrees. */
    pastureGateway: number
  }

  /**
   * The pier — the deck the harbour carries out to water a keel can float in.
   *
   * Every number here is **metres** and stays metres. A hull draws what a hull
   * draws, a plank spans what a plank spans, and how far somebody will walk over
   * open water to reach their boat is a fact about people rather than about how
   * wide the archipelago is — so a world that grows must not grow any of them.
   *
   * All four are read once, at build time, and none of them belong in the
   * overlay for the reason `smokehouse` and `croft` do not: a pier is surveyed
   * and then built, and a slider that needs a rebuild to be seen lies about what
   * a slider does. See `landscape/pier.ts`.
   */
  /**
   * The fish weir — the wall the tide fills and empties.
   *
   * The pier's complement, and kept whole in `config-weir.ts` for the reason the
   * crag, the dyke and the stack are. See `landscape/weir.ts` for the solve.
   */
  weir: WeirConfig

  // The wood's own numbers — the two lines it gives out between, and the fetch
  // that decides which one a hillside gets — are in `config-treeline.ts`, the
  // second section to move out of this file whole. What stands *inside* those
  // lines is still a budget here: `dressing.spruce` is a count, and the treeline
  // is what a count is spent on.
  dressing: DressingBudget

  /**
   * The rough grazing, and the flocks turned out on it.
   *
   * A build-time knob and deliberately not in the overlay: moving a flock moves
   * the instance matrices its sheep were baked into, and a slider that needs a
   * rebuild to be seen lies about what a slider does. How many animals stand on
   * the ground these numbers find is `dressing.sheep` and `dressing.lamb`.
   *
   * `spread = 0` is a scape with no livestock in it — an absence, not a
   * boolean, in the same way every other effect here is switched off by the
   * number that describes it going to zero.
   */
  grazing: {

    /** Metres from a flock's centre to the edge of the ground it feeds over. */
    spread: number

    /** Flocks one farm turns out, at most. */
    flocks: number

    /** Metres of hillside the search walks out from the yard before giving up. */
    reach: number

    /** Metres of ground above the waterline before stock will stand on it. */
    minLift: number

    /** Steepest ground a sheep will feed on, as the height field's own slope. */
    maxSlope: number
  }

  /**
   * The gulls, and the water they wheel over.
   *
   * Split the way `mill` and `beacon` are, and along the same seam: `spread` is
   * what the colony search is allowed to fit over open water, read once when the
   * archipelago is surveyed, so it stays out of the overlay. Everything else is
   * a uniform read every frame.
   *
   * Every length here is **metres** and stays metres. A gull is the same bird
   * over a bigger archipelago and at any zoom, so none of this is scaled by
   * `archipelago.worldSize` or by the live view — which is exactly the audit the
   * scale rule asks for, written down at the knob rather than discovered later.
   */
  birds: {

    /**
     * How much of the colony is up, 0..1. 0 is a coast whose gulls never fly.
     *
     * It is also the switch, and the only one: how many are up on any given hour
     * is the daylight's business and how many a squall keeps down is the
     * weather's. See `birdsAloft` in `birds.ts`.
     */
    flight: number

    /** Radians a bird sweeps around its colony every second. 0 hangs the flock where it is. */
    speed: number

    /** Wingbeats a second. 0 sets the wings where they are and holds them. */
    flap: number

    /** Metres from tip to tip. */
    wingspan: number

    /** Metres above the waterline the highest ring cruises at. */
    ceiling: number

    /**
     * Metres from a colony's centre to its outermost ring.
     *
     * What the siting search *asks* for rather than what it gets: a ring is
     * shrunk until no bearing around it crosses dry land, and a harbour with no
     * room for even a reduced ring carries no flock at all. Build-time, because
     * the colonies are surveyed once — see `landscape/colony.ts`.
     */
    spread: number
  }

  /**
   * The wind, and the only one in the scape.
   *
   * Every system that answers to it keeps a dimensionless *response* rather than
   * a rate of its own — `atmosphere.cloudDrag`, `atmosphere.mistDrag`,
   * `mill.spin`, the gulls' wingbeat — so one gust is one wave crossing the
   * grass, the mist, the sea and the sky together. See `scene/wind.ts`.
   */
  wind: {

    /** How hard it is blowing at rest, before the gust lifts it. 0 is a still day. */
    strength: number

    /**
     * How fast the wind travels, per unit of strength.
     *
     * The rate for everything, including the gust front — a wind that blows
     * harder brings its squalls through faster, and a separate fronts-per-minute
     * knob was a second rate saying the same thing twice. 0 freezes every
     * surface the scape scrolls *and* the front with it, which is the whole of
     * what a still needs.
     */
    speed: number

    /** Compass bearing the wind blows toward, in degrees. */
    bearing: number

    /**
     * How much the front varies, 0..1.
     *
     * The switch for the gusting, and the only one: 0 is a steady wind that
     * neither strengthens nor veers, however fast `gustSpeed` is running.
     */
    gust: number

    /** Phase of the gust front, 0..1. Carried by `wind.speed`. */
    time: number
  }

  camera: {
    viewSize:    number
    minViewSize: number
    maxViewSize: number
    rotation:    number

    /**
     * Where the camera opens on, in world metres.
     *
     * The middle of the world, and the middle of the world is open sea — which
     * is the right place to arrive but the wrong place to have to stay. Nothing
     * on the ground can be captured from a pose that cannot be aimed, so a
     * still of a rut, a doorstep or a fence line needs this and a small view
     * size. Read once, when the controls are built; dragging moves the live
     * focus and does not write back here.
     */
    focusX: number
    focusZ: number

    /** Elevation in degrees at full zoom-in — low reads flat and cinematic. */
    tiltNear: number

    /** Elevation in degrees at full zoom-out — steep reads like a map. */
    tiltFar: number
  }
  atmosphere: {
    fogDensity: number
    fogBreath:  number

    /**
     * Metres over which the haze thins by e, build-time.
     *
     * The scale height of the aerial perspective (`aerial.ts`): the sea and the
     * feet of the far range sit in the whole of it, a summit a hundred metres up
     * looks through a tenth. Compiled into the fog chunk, so a change needs a
     * rebuild — which is why it is not on the overlay.
     */
    hazeHeight: number
    mistAmount: number

    /**
     * How hard the ground mist answers the wind, 0..1.
     *
     * A response, not a speed. The rate is `wind.speed` and the direction is
     * `wind.bearing`; this only decides how much of that the sheets take, which
     * is what keeps a bank of fog moving slower than the cloud above it without
     * either of them having a wind of its own.
     */
    mistDrag:     number
    skyTop:       number
    sunColor:     number
    sunStrength:  number
    hemiSky:      number
    hemiGround:   number
    hemiStrength: number

    /**
     * Drifting cloud-shadow darkness, 0..1.
     *
     * The authored end of it, and one of three terms — see `cloud-shadow.ts`.
     * What actually reaches the shader is this times {@link cloudCover}, which
     * says whether there is any cloud up there, times the light there is to
     * block. So a clear sky lays no shadow and a moonless midnight lays no
     * shadow, and neither needed a flag: this stays the switch, at zero.
     *
     * It is nearly twice what it used to be, and the scape is no darker for
     * it. The old number was the whole answer; this one is halved again by the
     * default cover of 0.5, and 0.84 × 0.5 is the 0.42 the ground has always
     * had at noon.
     */
    cloudShadow: number

    /**
     * World units per cloud-map tile.
     *
     * The size of the shadows, not of the deck overhead — the deck sizes its
     * own tile against the widest authored frame, because cloud density read
     * from underneath is a screen composition. See `cloudTileSize` in
     * `clouds.ts`, and the follow-up in the changelog: the two are still two
     * bakes of two different noises.
     */
    cloudScale: number

    /**
     * How strongly the weather is banked, 0..1.
     *
     * The knob that stopped the sky repeating. Both cloud tiles are about a
     * hundred metres across — frame-sized, correctly, because that is the scale
     * a sky is composed at — and the world is 1520 m, so before this the wide
     * poses drew one tile sixteen times over on a perfect lattice. This is the
     * second, **world-sized** read that was missing: a field at
     * `WEATHER_BANK_WORLD_FRACTION` times the width of the world, biasing the
     * cloud up over the banks and down over the lanes between them.
     *
     * 0 is the sky the scape had before it — a knob whose zero is the old
     * behaviour, not a taper — and it is therefore the switch, with no flag
     * beside it. Both the deck overhead and the shadow on the ground read the
     * same field at the same scale, so a lane in the sky is a lane on the water.
     * See `weather-bank.ts`, which owns the scale, the drift and the arithmetic.
     */
    weatherBank: number

    /**
     * How hard the cloud answers the wind, 0..1.
     *
     * Shared by the deck overhead and the shadow it casts on the ground, which
     * is the point: before the wind was shared these two scrolled at one speed
     * along two different headings, and a cloud crossed the sky one way while
     * its own shadow crossed the island another.
     */
    cloudDrag: number

    /**
     * Sky-deck opacity when fully zoomed out, 0 disables the deck.
     *
     * And with it the shadow, which is the coupling this section was missing:
     * it is the only number in the scape that says how much cloud there is, so
     * {@link cloudShadow} is weighed by it. The deck's *own* fade with the zoom
     * is not shared — the camera climbing past the deck is a fact about the
     * frame, and a cloud goes on shading the ground you are standing in whether
     * or not the frame is wide enough to show it.
     */
    cloudCover: number

    /** Height of the sky deck above the waterline, in metres. */
    cloudHeight: number

    /**
     * Auroral brightness, 0 takes the veils off the sky.
     *
     * It is also the switch, and the only one — how much of it is on any given
     * night is the two clocks' business. See `aurora.ts`.
     */
    aurora: number

    /**
     * Height of the auroral deck above the waterline, in metres.
     *
     * Held above {@link cloudHeight} by the module whatever it is set to, so the
     * weather passes beneath the light rather than through it. Past about 70 the
     * deck climbs over the camera itself, which at full zoom-out is only eighty
     * metres up, and the sky goes dark again.
     */
    auroraHeight: number

    /** How fast the veils travel. Their own drift — an aurora does not blow on the wind. */
    auroraSpeed: number

    /**
     * Brightness of the star field. 0 is a sky that never comes out.
     *
     * It is also the switch, and the only one: how much of the field is up on
     * any given night is the daylight clock's business, and how far round it has
     * turned is that clock's phase read as an hour angle. See `nightsky.ts`.
     */
    starlight: number

    /**
     * Brightness of the moon. 0 takes the disc out of the sky.
     *
     * Above 1 on purpose by default: the disc has to clear the bloom's threshold
     * to bloom rather than merely be pale, the same trade `beacon.glow` is
     * written down for. The phase scales it, so a new moon is dark without this
     * being touched, and there is no separate switch for the month.
     */
    moonlight: number
  }

  /**
   * The clock.
   *
   * Colours are not keyframed here — the atmosphere palette above stays the noon
   * anchor and dusk and night are derived from it. See `daylight.ts`.
   */
  daylight: {

    /** Phase of the cycle, 0..1. 0 is midnight, 0.5 is noon. */
    time: number

    /** Full cycles per minute. 0 freezes the sky wherever `time` left it. */
    speed: number

    /** Compass bearing the noon sun is placed at, in degrees. */
    azimuth: number

    /**
     * How far north the coast is, in degrees.
     *
     * Not a look knob dressed as a place: the whole arc is solved from it, so
     * this is what decides how high the noon sun gets, how long the day is and
     * how far round the sky the light sweeps — each of them a different answer
     * every week of the year. Past the arctic circle at 66.56 the extremes stop
     * being figures of speech and the scape gains a polar night and a midnight
     * sun; below it the year still swings, it just never runs out of range.
     */
    latitude: number

    /**
     * How far the axis leans, in degrees.
     *
     * The seasonal coupling itself, and the switch for it: 0 is a world whose
     * axis stands straight, whose every day is an equinox, and whose sun runs
     * the same arc in December it ran in June. There is no separate flag,
     * because this is the flag.
     */
    axialTilt: number

    /** Golden-hour tint, pulled toward as the sun nears the horizon. */
    dusk: number

    /** Night tint, pulled toward once the sun is under it. */
    night: number

    /** Ambient floor at night, so midnight reads as lit rather than as black. */
    nightLift: number

    /**
     * How much light the moon gives back to the ground, as a share of the noon
     * sun.
     *
     * The switch for moonlight, and the only one: 0 is a night lit by nothing
     * but {@link nightLift} and the stars, which is the night this scape had
     * when the key light was the set sun held just over the horizon. Anything
     * above it hands the key light to the moon once the sun is properly down —
     * its own bearing, its own elevation, its own pale colour — so the shadows
     * swing round to the body that is actually up and the sound gets a moon
     * track instead of a sun's ghost.
     *
     * Deliberately not `nightsky.moonlight`, which is how brightly the *disc*
     * burns in the sky. A disc is a thing you look at and this is a thing you
     * see by: one is killed by the cloud the other shines through, and a scape
     * that tuned them together could never have a bright moon over a dark
     * ground. What they do share is the arc and the phase, so neither can be
     * lighting the coast from somewhere the other is not.
     *
     * What is *on* on any given night is not here. The share of the key light
     * the moon has taken is solved from how high it stands and how much of it
     * is lit — see `daylight.moonAmount` — so a new moon and a moon under the
     * sea are both dark without a second knob saying so.
     */
    moonStrength: number
  }

  look: {
    grade:     GradeName
    intensity: number
    grain:     number

    /**
     * What the glass does to a bright point: the bloom round it and, on the
     * ultra tier, the anamorphic streak through it. 0 is perfectly clean glass.
     */
    glare: number

    /** The glass: defocus off the focal plane, colour fringes and vignetting, 0 is a pinhole. */
    lens: number

    /** Volumetric sun-shaft strength, 0 disables the pass. */
    godRays: number

    /** Ambient-occlusion strength on the ultra tier, 0 disables. */
    ao: number
  }
  palette: ScapePalette

  /**
   * What the machine is asked for, rather than what the scape is made of.
   *
   * Everything else here describes the place. These three describe the budget it
   * is drawn on, and they are the only values in the config that are seeded from
   * the resolved quality tier rather than authored — which is also why they are
   * the only section the settings store deliberately does not persist. A pixel
   * ratio kept from one session and replayed into the next is how a device that
   * has already lost a context gets handed back the budget that took it.
   */
  runtime: {

    /** Ceiling on `devicePixelRatio`, applied live. */
    pixelRatio: number

    /** Frames drawn per second. 0 draws on every animation frame the display offers. */
    frameCap: number

    /**
     * Frames between shadow-map rebuilds. 1 rebuilds every frame.
     *
     * Three rebuilds the whole depth pass — terrain, the merged steading and
     * every scattered instance — on every single frame by default, at up to
     * 4096². Nothing in this scape moves fast enough to need that: the sun
     * crosses the sky over minutes and the foliage sway is a slow shader
     * animation, so refreshing the map every other frame is invisible and costs
     * half the pass.
     */
    shadowCadence: number

    /**
     * Which effects the scape is allowed to build.
     *
     * `tier` is the device's own budget: the cheap tiers leave whole systems out
     * rather than drawing bad versions of them. `all` overrules that and builds
     * every effect the scape has on whatever tier is running, at that tier's
     * scale — a phone gets the aurora and the optical chain, with one veil
     * rather than three.
     *
     * Not a thing to reach for lightly, and deliberately not the default: the
     * mobile tier drops the post chain because a PowerVR handset loses its
     * WebGL context to it, and this is the switch that puts it back. Changing it
     * rebuilds the scape, because most of what it turns on is decided when the
     * renderer and its programs are made rather than per frame.
     */
    effects: QualityEffects
  }
}

/**
 * The config as of the tick being drawn.
 *
 * Call it on every read, and never hold what it hands back. The app's store is
 * the config's owner once the scape has mounted, and it commits a *new* object
 * on every write — so a section destructured at build time and read every frame
 * is a section frozen at whatever it held before the reader touched a slider.
 * Anything that outlives a single tick takes this instead of a `ScapeConfig`,
 * which is a distinction the compiler enforces rather than a rule to remember.
 */
export type LiveConfig = () => ScapeConfig

/** Every module in this scape projects the same state: the config itself. */
export type ScapeModule = AppModule<ScapeConfig>

export const SCAPE_CONFIG = {
  seed:    7_319,
  // The plane is far wider than the island it carries. `islandInner` and
  // `islandOuter` are fractions of the half-extent, so they are scaled to keep
  // the farmstead's landmass exactly where it was — the extra span is open sea,
  // and it is the only place islets big enough to read as islets can stand
  // without either merging into the mainland or running off the plane's edge.
  terrain: {
    // The island is a bearing away from a disc, not a radius: `sinkToIsland`
    // warps the falloff with the coast noise, so neither of these two is a
    // shoreline any more. `islandInner` is where the *average* bearing starts
    // falling away and `islandOuter` where it has finished; the coast wanders
    // either side of that band by `COAST_REACH` of its width, which is what
    // `landRadiusOf` subtracts back off to find ground that is dry whichever way
    // you walk. Widening the band buys raggedness and spends buildable middle.
    size:        196,
    height:      11.5,
    waterLevel:  -1.25,
    shoreBand:   1.15,
    islandInner: 0.52,
    islandOuter: 0.63,
    seabedDrop:  9,
    // An archipelago, not a pair of outliers. Every one of these clears the
    // mainland's `islandOuter` and its neighbours' skirts, so they surface as
    // separate islands rather than merging into a reef — the spacing is the
    // whole design, and it is why the ring reads as distance.
    // An archipelago, not a pair of outliers. Every one of these clears the
    // mainland's warped shore and its neighbours' skirts, so they surface as
    // separate islands rather than merging into a reef.
    //
    // The sizes are deliberately unequal and the spacing deliberately uneven.
    // A ring of like-sized islets at even bearings reads as decoration however
    // well each one is modelled — real archipelagos come in clusters with open
    // water between them, so these are grouped: a close pair off the west shore,
    // a scattered chain to the south, skerries too small to land on filling the
    // gaps, and one substantial outlier holding the north-east horizon.
    // Every one of these has to clear three things: the mainland's warped shore,
    // its neighbours' skirts, and — the one that is easy to forget — the plane's
    // own edge. An islet is placed by its centre and then grows a radius and a
    // warp on top of it, so `hypot(x, z) + radius * 1.34` is the number that
    // must stay under about 0.85. Past that the skerry is half in the void.
    // Every one of these has to clear three things: the mainland's *warped*
    // shore, its neighbours' skirts, and — the one that is easy to forget — the
    // plane's own edge. An islet is placed by its centre and then grows a radius
    // and a warp of its own on top of it, so the number that matters is
    // `hypot(x, z) ± radius * 1.34`: it must stay outside the mainland's
    // furthest headland (`islandOuter` plus the coast reach, about 0.70) and
    // inside about 0.88, past which the skerry is half in the void.
    isles:       [
      // The near western pair, close enough in to read as part of the place.
      { x: -0.754, z: 0.183, radius: 0.078, height: 5.2 },
      { x: -0.723, z: 0.376, radius: 0.045, height: 2.6 },

      // The southern chain, thinning as it runs out to sea.
      { x: 0.424, z: -0.666, radius: 0.068, height: 4.1 },
      { x: 0.602, z: -0.66, radius: 0.042, height: 2.3 },
      { x: 0.724, z: -0.656, radius: 0.026, height: 1.4 },

      // The north-eastern outlier, and the biggest thing out there.
      { x: 0.648, z: 0.401, radius: 0.088, height: 6.4 },
      { x: 0.795, z: 0.243, radius: 0.036, height: 2 },

      // Skerries. Barely more than rock, and the reason the water between the
      // clusters is not simply empty.
      { x: -0.26, z: -0.75, radius: 0.032, height: 1.6 },
      { x: 0.106, z: 0.799, radius: 0.055, height: 3.1 },
      { x: -0.346, z: 0.75, radius: 0.04, height: 2.2 },
      { x: -0.702, z: -0.378, radius: 0.062, height: 3.6 },
      { x: -0.613, z: -0.574, radius: 0.03, height: 1.5 },
      { x: 0.794, z: -0.255, radius: 0.034, height: 1.8 },
      { x: -0.577, z: 0.643, radius: 0.045, height: 2.5 },
      { x: 0.372, z: 0.735, radius: 0.042, height: 2.4 },
    ],
    detailScale: 7.5,
    detailGrain: 0.34,
    detailMacro: 0.62,

    // The home island has no fjord, and `depth: 0` is how it says so — every
    // island that omits the section inherits this one, so an archipelago is
    // ice-free until a coast asks for otherwise. The other five are the shape an
    // inlet would take on this island if one were switched on, which keeps the
    // section readable rather than a row of zeroes nobody could size.
    fjord: {
      depth:   0,
      sill:    0.34,
      length:  76,
      width:   16,
      bearing: 90,
      bend:    0.55,
    },

    // And the home island has no ice, said the same way: `crown: 0`, inherited
    // by every island that does not ask for a cap of its own. The rest is the
    // dome this island would carry if one were switched on — a crown at 12 m
    // over an 8.6 m summit and a reach of a third of the half-extent — so the
    // section reads as a shape rather than as a row of zeroes.
    icecap: {
      x:             0,
      z:             0,
      reach:         0.33,
      crown:         0,
      grounding:     1.6,
      crevasse:      0.55,
      crevasseScale: 26,
    },

    ruggedness:      0.45,
    reliefSmoothing: 0.6,
    propGrain:       0.82,

    // The moss carries further than the bleach because it is the darker move of
    // the two, and dark reads across a hillside that pale does not.
    //
    // Both are stronger than the first pass authored them, and the line is more
    // than twice as high, because the first pass was measured rather than
    // guessed at: at 0.34, 0.2 and a five-metre line the whole thing came in
    // under two per cent of the pixels of a frame *pointed straight at a
    // hillside* — the ground is only a share of what is on screen, and the trees,
    // the scatter and the grade take the rest. Eleven metres is the number that
    // matters most of the three: these hills crown at fifteen, so a line at five
    // gated the aspect out of exactly the steep upper ground that has the most
    // of one. The band now gives out on the bare crowns, which is where a
    // northern hill this size actually loses its cover.
    //
    // The other half of the same measurement went into `palette.moss` rather
    // than here. A lerp can only carry a surface as far as the colour it is
    // aimed at, and the first moss sat close enough to `meadow` that six tenths
    // of the way toward it moved the ground by a fiftieth of a channel.
    aspectMoss:   0.6,
    aspectBleach: 0.38,
    aspectLine:   11,
    ...SCAPE_DUNES,
    ...SCAPE_CRAG,
    ...SCAPE_STACK,
    ...SCAPE_ARCH,
    ...SCAPE_SALTINGS,
  },
  // Five full holdings, each generated by the same local survey and projected
  // into one world only after its terrain, paths and landings have agreed. Their
  // terrain numbers are deliberately not cosmetic labels: the western island
  // is a compact high ridge, the eastern one a broader low meadow, and the two
  // great landmasses to the north are a drowned sound and a fell.
  archipelago: {
    worldSize:  1_520,
    landmasses: SCAPE_LANDMASSES,
  },
  boats: {
    speed:         4.2,
    dwellSeconds:  7,
    turnRate:      1.4,
    turnLookAhead: 5,
    clearance:     0.42,
    separation:    7,
    routeCell:     5.2,
    dockReach:     6.4,
  },
  // The farmstead is not scaled with the island, and that is the point of a
  // bigger island: one holding on a landmass that is mostly wild, rather than a
  // landmass that is entirely one holding. Only the field count grows, because
  // three plots on this much arable read as a smallholding on a moor.
  layout: {
    yardRadius:     19,
    trackWidth:     3.2,
    plotCount:      4,
    fenceSpacing:   2.2,
    forestBias:     0.72,
    harbourSpread:  38,
    pastureRadius:  6,
    pastureGateway: 17,
  },
  ...SCAPE_CREEL,
  ...SCAPE_CROPPING,
  ...SCAPE_DYKE,
  ...SCAPE_FORCE,
  ...SCAPE_FRONT,
  ...SCAPE_GUARD,
  ...SCAPE_HAAR,
  ...SCAPE_HALO,
  ...SCAPE_HOWE,
  ...SCAPE_KELP,
  ...SCAPE_LEDGES,
  ...SCAPE_MOLE,
  ...SCAPE_PACK_ICE,
  ...SCAPE_RIGS,
  ...SCAPE_ROOST,
  ...SCAPE_SHAFTS,
  ...SCAPE_SHELTER,
  ...SCAPE_SWASH,
  ...SCAPE_SHIELING,
  ...SCAPE_CARTER,
  ...SCAPE_SNOW_FENCE,
  ...SCAPE_HJELL,
  ...SCAPE_KILN,
  ...SCAPE_SEASON,
  ...SCAPE_CROSSING,
  ...SCAPE_FAR_SHORE,
  ...SCAPE_SHORE_LIGHTS,
  ...SCAPE_SHOAL,
  ...SCAPE_TREELINE,
  ...SCAPE_WASH,
  ...SCAPE_LOD,
  ...SCAPE_WATERMILL,
  ...SCAPE_WEIR,
  ...SCAPE_WRECK,
  ...SCAPE_SEA,
  ...SCAPE_LIGHTS,
  ...SCAPE_SITES,

  // Roughly doubled against the run before this one, because the island is
  // roughly twice the ground. A budget is a *count*, not a density, so leaving
  // these alone would have grown the island and thinned everything standing on
  // it — the same forest spread over twice the hillside is a wood turning into
  // a scrub. What did not grow is the farm: one holding has the barrels, bales
  // and firewood one holding has, whatever it is standing on.
  //
  // The tree budgets went up by about a third the run the treeline arrived, and
  // it is a restoration rather than a thickening. A budget is a number of darts
  // and the treeline halved the ground they may land on — mean vigour over this
  // archipelago's land is 0.59 — so leaving them alone would have kept the
  // wood's new *shape* and thrown away half of the wood. Juniper went up further
  // than the trees because it is the plant that takes the ground they lost.
  dressing: {
    spruce:     700,
    pine:       244,
    birch:      200,
    deadSpruce: 62,
    sapling:    300,
    stump:      80,
    juniper:    210,
    grass:      1_700,
    marram:     620,
    // A third of the marram for a tenth of the ground, which is the density a
    // sward needs and a tussock field does not: the dune belt is meant to read
    // as scattered clumps in bare sand, and the saltings is meant to close over.
    cordgrass:  520,
    heather:    500,
    wildflower: 230,
    reeds:      330,
    lilyPads:   70,
    crop:       560,
    erratic:    52,
    talus:      190,
    fieldStone: 176,
    cobble:     300,
    pathStone:  900,
    cairn:      14,
    hayBale:    14,
    firewood:   7,
    barrel:     9,
    driftwood:  44,

    mooringPost: 22,

    // Both of these are counts *per named feature* rather than per island, the
    // way the flock's is — the pasture and the peat bank are things the survey
    // found, so what stands on them is scaled by how many were found. Nine
    // ricks to a working is one summer's cutting stood up to dry with room to
    // walk between them; a 14x9 floor holds that comfortably and the spacing
    // solver declines the ones it cannot.
    hayPole:   7,
    peatStack: 9,

    // Head *to a flock*, unlike every other budget here, which is a count for
    // the whole archipelago scaled by its island area: the flock is a feature
    // the survey found, so its stock is scaled by the flocks. Twenty-six ewes
    // and ten lambs on a hillside is a smallholding's flock rather than a hill
    // station's — the scale the rest of this steading is drawn at, which is one
    // barn, four plots and seven drying poles. Twenty-six ewes over a
    // seven-metre disc is one animal to six square metres, which is a flock
    // feeding rather than a dozen sheep standing about on a hill — and the
    // spacing solver is what keeps the last few out rather than a lower number
    // here: on this seed 122 of the 182 ewe slots and 64 of the 70 lamb slots
    // find ground, and the rest are zero-scaled and cost nothing. Seven flocks,
    // 186 animals standing, two draw calls, about 54k triangles.
    sheep: 26,
    lamb:  10,
  },
  // A flock feeds over about a fifteen-metre patch of hill: wide enough that
  // twelve animals in it are spread out rather than heaped, tight enough that
  // the patch fits between the plots and the forest on an island whose whole
  // land radius is forty-four metres. Two flocks a farm — the infield and the
  // hill — and a reach of eighty metres, which is the far side of the home
  // island's dry ground and about as far as anybody walks to gather sheep.
  //
  // 1.2 m of lift keeps them off the wet strand the tide works, and a slope of
  // 0.55 is the ground a sheep actually feeds on: steeper than the mown pasture
  // the drying poles stand in, well short of the scree the juniper takes.
  grazing: {
    spread:   7,
    flocks:   2,
    reach:    90,
    minLift:  1.2,
    maxSlope: 0.55,
  },
  // A 1.6 m wingspan is a great black-backed gull, the largest bird on this
  // coast, and it is the largest on purpose: pulled fully out a metre is three
  // pixels, and a herring gull's 1.2 m is a speck the grain eats. 26 m of
  // ceiling keeps the flocks well over the 9 m peak and under the 34 m cloud
  // deck. 28 m of spread is a ring the width of the harbour mouth — wide enough to
  // read as a wheel, tight enough that every bank in the archipelago fits one.
  birds: {
    flight:   0.85,
    speed:    0.34,
    flap:     1.6,
    wingspan: 1.6,
    ceiling:  26,
    spread:   28,
  },
  // A steady onshore breeze with a real gust in it. The bearing is the same
  // quarter the mill's search assumes the weather comes from — see
  // `landscape/mill.ts` — so the sails are turned into a wind that is now
  // actually blowing that way rather than into a wind nobody had written down.
  wind: {
    strength: 0.9,
    speed:    1.35,
    bearing:  -106,
    gust:     0.45,
    time:     0.31,
  },
  // The screen-scale class, grown with the world it frames. `maxViewSize` is
  // what the cloud and aurora tiles are sized against, so a world that tripled
  // without it would have both of them repeating three times as often across the
  // archipelago and reading as wallpaper. `viewSize` opens on the whole thing.
  camera: {
    viewSize:    1_400,
    minViewSize: 8,
    maxViewSize: 1_600,
    rotation:    45,
    focusX:      0,
    focusZ:      0,
    tiltNear:    21,
    tiltFar:     52,
  },
  atmosphere: {
    fogDensity:   0.3,
    fogBreath:    0.08,
    hazeHeight:   120,
    mistAmount:   0.34,
    mistDrag:     0.36,
    skyTop:       0x5c727e,
    sunColor:     0xffe8bd,
    sunStrength:  2.85,
    hemiSky:      0xc2cfd2,
    hemiGround:   0x3d4433,
    hemiStrength: 0.72,
    cloudShadow:  0.84,
    cloudScale:   92,

    // Measured against the cut rather than picked: the cloud field spans about
    // 0.17..0.83 and `CLOUD_CUT` is 0.55, so 0.6 of a full swing carries the
    // field ±0.3 — far enough that a low bank never reaches the cut and a high
    // one clears it everywhere, and short of the ±0.5 that would leave half the
    // archipelago under a flat overcast and the other half under a bare sky.
    weatherBank:  0.6,
    cloudDrag:    0.9,
    cloudCover:   0.5,
    cloudHeight:  34,
    aurora:       1,
    auroraHeight: 52,
    auroraSpeed:  0.45,
    starlight:    0.85,

    // Measured the way the beacon's glow was. The disc's own white is ~0.86
    // linear and a full moon opens at the whole of it, so 1.35 puts the lit face
    // over the bloom's 0.94 threshold and leaves a crescent's thin limb under
    // it — a full moon that flares and a young one that does not.
    moonlight: 1.35,
  },
  // `time` and `azimuth` are set to land the opening frame on the light the
  // scape was graded under, so the cycle starts where the stills were taken.
  // 68°N is a degree and a half inside the arctic circle, which is the whole
  // point of the number: it is the southernmost coast that still gets a true
  // polar night and a true midnight sun, so both ends of the year are real
  // rather than nearly. At midsummer it puts the noon sun at 45.4°, close
  // enough to the fixed 52° arc this replaced that the frame the scape was
  // graded on is still the frame it opens with.
  daylight: {
    time:         0.42,
    speed:        0.4,
    azimuth:      -106,
    latitude:     68,
    axialTilt:    23.44,
    dusk:         0xff9c56,
    night:        0x2b3d5e,
    nightLift:    0.4,
    // A sixth of the noon sun at full moon, which is nothing like the
    // four-hundred-thousandth the real one manages and is the number this
    // scape's night wants: the ambient floor is already up at 0.4, so a key
    // light much under this reads as a flat grey rather than as a direction,
    // and much over it is a second daylight. Scaled by the phase and the
    // altitude on top, so a quarter moon low over the sound gets a tenth of it.
    moonStrength: 0.16,
  },
  look: {
    grade:     'nordic',
    intensity: 0.78,
    grain:     0.16,
    glare:     1,
    lens:      1,
    godRays:   0.26,
    ao:        0.7,
  },
  ...SCAPE_PALETTE,

  // Placeholders. `main.ts` overwrites all three from the resolved tier before
  // the settings store is built, so these are only ever what a test or a
  // headless import sees.
  runtime: {
    pixelRatio:    1,
    frameCap:      0,
    shadowCadence: 1,
    effects:       'tier' as QualityEffects,
  },
} satisfies ScapeConfig
