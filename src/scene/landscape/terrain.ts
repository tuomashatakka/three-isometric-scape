import { BufferAttribute, Color, Mesh, PlaneGeometry } from 'three'
import type { BufferGeometry, Material } from 'three'
import { hash2, smoothstep } from 'threejs-scene'
import { createSurfaceRibbon, mergeGeometryList } from 'threejs-scene/modules/assets'
import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { cartRutGeometry, trafficAt } from './cart-ruts.ts'
import type { Footpaths } from './footpath.ts'
import { surfaceQueries } from './height.ts'
import type { HeightField } from './height.ts'
import { distanceToTrack, pastureInfluence, plotInfluence } from './layout.ts'
import type { ScapeLayout } from './layout.ts'
import type { Vec2 } from './path.ts'
import type { Strand } from './strand.ts'


/**
 * Terrain colour.
 *
 * The scaffold lerped two colours by height, which reads as a gradient rather
 * than as ground. Real Nordic terrain is banded *and* slope-driven: granite
 * shows wherever the face is too steep to hold soil, whatever the altitude.
 * The slope override is what stops the bands looking like contour lines.
 */
export interface TerrainPainter {
  paint(height: number, slope: number, x: number, z: number, target: Color): Color
}

interface Band {
  offset: number
  color:  Color
}

/**
 * The altitude band a height falls in, blended with its neighbour.
 *
 * Clamps rather than extrapolates at both ends: below the first band and above
 * the last there is nothing to lerp toward, and lerping toward the band itself
 * is the only answer that does not invent a colour the palette never authored.
 */
function bandAt (bands: readonly Band[], relative: number, target: Color): Color {
  let lower = bands[0]
  let upper = bands[bands.length - 1]

  for (let index = 0; index < bands.length - 1; index += 1)
    if (relative >= bands[index].offset && relative <= bands[index + 1].offset) {
      lower = bands[index]
      upper = bands[index + 1]
      break
    }

  if (relative < bands[0].offset)
    upper = lower
  else if (relative > bands[bands.length - 1].offset)
    lower = upper

  const span = upper.offset - lower.offset
  const mix  = span === 0 ? 0 : smoothstep(lower.offset, upper.offset, relative)

  return target.copy(lower.color).lerp(upper.color, mix)
}

export function createTerrainPainter (
  config: ScapeConfig,
  layout: ScapeLayout,
  paths:  Footpaths,
): TerrainPainter {
  const { palette }    = config
  const { waterLevel } = config.terrain

  const bands: Band[] = [
    { offset: -2.4, color: new Color(palette.silt) },
    { offset: -0.25, color: new Color(palette.shore) },
    { offset: 0.55, color: new Color(palette.shore) },
    { offset: 1.6, color: new Color(palette.meadow) },
    { offset: 3.4, color: new Color(palette.dryGrass) },
    { offset: 5.2, color: new Color(palette.heath) },
    { offset: 7, color: new Color(palette.scree) },
    { offset: 9, color: new Color(palette.lichen) },
  ]

  const scree     = new Color(palette.scree)
  const track     = new Color(palette.track)
  const tilled    = new Color(palette.tilled)
  const yard      = new Color(palette.yard)
  const pasture   = new Color(palette.pasture)
  const streambed = new Color(palette.streambed)
  const trodden   = new Color(palette.trodden)

  // The same colour the ribbon darkens toward, and it has to be: the two lerp
  // at the same target from either side of the seam, so the corridor's soiling
  // and the rut cores are one gradient rather than two tones meeting.
  const rutSoil   = new Color(palette.track).multiplyScalar(0.4)

  const corridor = layout.track.width * 1.5

  /** Share of the rut wear the broad soiling carries. The lines keep the rest. */
  const soil = config.cartRuts.wear * 0.34

  return {
    paint (height, slope, x, z, target) {
      const relative = height - waterLevel

      bandAt(bands, relative, target)

      const exposed = smoothstep(0.34, 0.78, slope)
      if (exposed > 0)
        target.lerp(scree, exposed * 0.82)

      for (const plot of layout.plots) {
        const claim = plotInfluence(plot, x, z)

        if (claim > 0 && height > waterLevel + 0.4)
          target.lerp(tilled, claim * 0.72)
      }

      // Mown ground, painted over the altitude bands rather than under them.
      // The pasture sits high enough that the bands have already turned it
      // toward heath and scree, and grazed grass is exactly what that is not.
      const grazed = pastureInfluence(layout, x, z)
      if (grazed > 0)
        target.lerp(pasture, grazed * 0.62)

      const fromYard = Math.hypot(x - layout.yard.x, z - layout.yard.z)
      const onYard   = 1 - smoothstep(layout.yard.radius * 0.5, layout.yard.radius * 1.15, fromYard)
      if (onYard > 0)
        target.lerp(yard, onYard * 0.65)

      const onTrack = 1 - smoothstep(layout.track.width * 0.42, corridor, distanceToTrack(layout, x, z))
      if (onTrack > 0)
        target.lerp(track, onTrack * 0.88)

      // The dirt the ruts run in, as opposed to the ruts themselves.
      //
      // The ribbon carries the two wheel lines because at 0.34 m of width it is
      // the only thing that can — the terrain's vertices sit 0.68 m apart at
      // best and 2.3 m apart on mobile, so a rut painted into this grid is a
      // dotted line or nothing at all. A *corridor* is metres across, though,
      // and that the grid holds comfortably. So the paint takes the half of the
      // wear the ribbon cannot: the broad damp soiling of a road that gets
      // driven on, heaviest at the gate and gone where the traffic is.
      //
      // It runs under the ribbon rather than beside it. The ribbon samples this
      // painter for its own outer edge, so the edge picks the soiling up and
      // the seam stays invisible; and because both lerp toward `rutSoil`, the
      // middle of a rut simply lands nearer that colour instead of overshooting
      // past it.
      // Squared, so the dirt sits on the crown of the road and the verges keep
      // the track's own colour. Flat across the corridor the soiling darkens
      // the edges as hard as the middle, and a road evenly browner edge to edge
      // reads as a narrower road rather than as a worn one — the wear has to
      // fall where the wheels are, which is where the ribbon is too.
      //
      // Unguarded: off the track `onTrack` is zero and past the reach the
      // traffic is, so the lerp is already the no-op the branch would have been.
      const crown = onTrack * onTrack

      target.lerp(rutSoil, crown * soil * trafficAt(fromYard, config.cartRuts.reach))

      // Over the track, under the beck.
      //
      // Weighted by how green the ground under it already is, which is the whole
      // reason this does not simply darken the farm. A path is *turf that has
      // been walked off*, so it can only show where there was turf: across the
      // meadow the full lerp lands, and on the yard, the road and the tilled
      // plots — ground that is bare because something else already made it bare —
      // it barely registers. Without the weight, eight routes converging on one
      // well turn the middle of the farm into a single brown patch, which reads
      // as a stain rather than as paths.
      const worn = paths.wearAt(x, z)
      if (worn > 0 && height > waterLevel + 0.1) {
        const green = Math.min(1, Math.max(
          0,
          (target.g * 2 - target.r - target.b) / (target.g + 0.05),
        ))

        target.lerp(trodden, worn * config.footpath.wear * (0.3 + 0.7 * green))
      }

      // Last, and over the track: the beck cuts *under* the road rather than
      // stopping at it, so the channel keeps its gravel across the crossing and
      // the bridge reads as spanning something. The wash is strongest on the
      // floor and thins onto the banks, which is where the altitude bands are
      // already doing the right thing on their own.
      const wet = layout.creek?.claimAt(x, z) ?? 0
      if (wet > 0)
        target.lerp(streambed, Math.min(1, wet * 1.15) * 0.74)

      const macro = hash2(x * 0.031, z * 0.031) * 0.14 + hash2(x * 0.19, z * 0.19) * 0.06
      target.multiplyScalar(0.92 + macro)

      return target
    },
  }
}

/**
 * The ground *as drawn* — the chord between the terrain's vertices, not the
 * continuous field they were sampled from.
 *
 * The two are not the same surface, and anything laid flat on the terrain has
 * to be laid on this one. The patch is a `PlaneGeometry` of `segments` quads
 * split along the diagonal that runs from a quad's far-near corner to its
 * near-far one, so the height inside a quad is a plane through three of its
 * corners, and it can stand tens of centimetres off `heightAt` where the ground
 * is curved — enough to swallow anything lifted by less than that.
 */
export function drawnSurfaceOf (
  field:    HeightField,
  size:     number,
  segments: number,
): (x: number, z: number) => number {
  const step = size / segments
  const half = size / 2
  const cell = (value: number): number =>
    Math.min(segments - 1, Math.max(0, Math.floor((value + half) / step)))

  return (x, z) => {
    const column = cell(x)
    const row    = cell(z)
    const left   = -half + column * step
    const near   = -half + row * step
    const across = (x - left) / step
    const along  = (z - near) / step

    const corner = field.heightAt(left, near)
    const far    = field.heightAt(left, near + step)
    const right  = field.heightAt(left + step, near)

    if (across + along <= 1)
      return corner + (right - corner) * across + (far - corner) * along

    const opposite = field.heightAt(left + step, near + step)

    return opposite + (far - opposite) * (1 - across) + (right - opposite) * (1 - along)
  }
}

function terrainGeometry (
  config:   ScapeConfig,
  layout:   ScapeLayout,
  field:    HeightField,
  paths:    Footpaths,
  segments: number,
): BufferGeometry {
  const geometry = new PlaneGeometry(config.terrain.size, config.terrain.size, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const positions = geometry.getAttribute('position')
  const colors    = new Float32Array(positions.count * 3)
  const painter   = createTerrainPainter(config, layout, paths)
  const color     = new Color()

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const y = field.heightAt(x, z)

    positions.setY(index, y)
    painter.paint(y, field.slopeAt(x, z), x, z, color).toArray(colors, index * 3)
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * The rut ribbon for one island, in that island's local space.
 *
 * It shares the terrain's painter rather than a second opinion about the ground
 * colour, which is what lets its outer edge sit invisibly on the surface it
 * lies on.
 */
function cartRutPatch (
  config:   ScapeConfig,
  layout:   ScapeLayout,
  field:    HeightField,
  paths:    Footpaths,
  segments: number,
): BufferGeometry | null {
  const painter = createTerrainPainter(config, layout, paths)
  const surface = drawnSurfaceOf(field, config.terrain.size, segments)

  return cartRutGeometry({
    ...config.cartRuts,
    track:     layout.track.points,
    yard:      layout.yard,
    rut:       new Color(config.palette.track).multiplyScalar(0.4),
    surfaceAt: surface,
    groundAt:  (x, z, target) =>
      painter.paint(field.heightAt(x, z), field.slopeAt(x, z), x, z, target),
  })
}

/**
 * How finely one island's patch is drawn.
 *
 * A *density*, held constant across the archipelago: the segment count follows
 * the patch's own size so a bigger island arrives with the same metres to a
 * quad rather than the same number of them. `detail` is the one island's own
 * answer on top of that — a fell nobody lands on is drawn coarser, which is
 * what makes an island of ten times the area affordable at all.
 *
 * Exported because the terrain is no longer the only reader: the dressing has
 * to sample the ground *as drawn*, and it can only do that if it knows the grid
 * the drawing is on.
 */
export function patchSegments (
  worldSize:    number,
  patchSize:    number,
  baseSegments: number,
  detail = 1,
): number {
  return Math.max(24, Math.round(baseSegments * patchSize / worldSize * detail))
}

function terrainMesh (geometry: BufferGeometry, material: Material): Mesh {
  const terrain         = new Mesh(geometry, material)
  terrain.name          = 'terrain'
  terrain.receiveShadow = true
  terrain.castShadow    = true

  // The island never moves. Recomposing its matrix from a position, a rotation
  // and a scale that are the same three values every frame is a small cost, but
  // it is a cost with no possible effect.
  terrain.updateMatrix()
  terrain.matrixAutoUpdate = false
  return terrain
}

export function createTerrain (
  config:   ScapeConfig,
  layout:   ScapeLayout,
  field:    HeightField,
  paths:    Footpaths,
  material: Material,
  segments: number,
): Mesh {
  return terrainMesh(terrainGeometry(config, layout, field, paths, segments), material)
}

/**
 * The bar between two patches, as geometry.
 *
 * The height field has it — `createCompositeField` folds it in as a maximum —
 * but nothing *draws* it: the terrain is one patch per island, the patches stop
 * at their own edges by construction, and between them is the seabed quad nine
 * metres down. So the crest is a strip of its own, draped on the composite field
 * the same way the cart ruts are draped on the ground they run over, and merged
 * into the same single terrain draw.
 *
 * Five edges rather than three. The outer pair sit out where the skirt has
 * already fallen back to the seabed, which is what puts the seam under several
 * metres of water instead of along the waterline where it would be read as a
 * cut edge.
 *
 * Sampled from the composite field rather than from a drawn surface, and that is
 * the one place in this scape where those two are the same thing: over the gap
 * there is no drawn terrain for the strip to stand off from.
 */
/**
 * One island's local field, with the bar's own claim folded into it.
 *
 * Local coordinates in and local heights out, so the patch sampler is unchanged
 * — the translation to world space and back happens here, in the one place that
 * knows the patch has an origin at all.
 */
function withStrand (field: HeightField, strand: Strand, origin: Vec2): HeightField {
  const heightAt = (x: number, z: number): number =>
    Math.max(field.heightAt(x, z), strand.heightAt(x + origin.x, z + origin.z))

  return { heightAt, ...surfaceQueries(heightAt) }
}

function strandGeometry (config: ScapeConfig, strand: Strand, field: HeightField): BufferGeometry | null {
  const { width }      = config.strand
  const { waterLevel } = config.terrain
  const sand           = new Color(config.palette.shore)
  const silt           = new Color(config.palette.silt)
  const shingle        = new Color(config.palette.scree)

  return createSurfaceRibbon({
    path:   strand.points,
    // Half-widths, in metres, outward from the centreline.
    across: [ -2.4, -1.15, 0, 1.15, 2.4 ].map(edge => edge * width),
    step:   3,

    // Lifted by a hand's breadth. Both ends overlap the island patch they run
    // into, which draws its own copy of the bar's rounded root — the two agree
    // about the height to the millimetre, and two coplanar surfaces are a
    // z-fight that flickers as the camera moves.
    heightAt: (x, z) => field.heightAt(x, z) + 0.05,

    colorAt: ({ x, z, u }, target) => {
      const depth = waterLevel - field.heightAt(x, z)

      // Shingle along the dry crown, sand at the waterline, silt out on the
      // drowned skirt. The crown reads as coarser than the beach on purpose: a
      // bar is what the sea could not carry any further.
      target.copy(depth > 0 ? silt : sand)

      if (depth <= 0)
        target.lerp(shingle, (1 - Math.abs(u - 0.5) * 2) * 0.45)
      else
        target.lerp(silt, Math.min(1, depth * 0.4))

      const grain = hash2(x * 0.09, z * 0.09) * 0.16
      target.multiplyScalar(0.9 + grain)
    },
  })
}

/**
 * How coarsely a rock is drawn, against the density an island is drawn at.
 *
 * The same argument the outer fells' `detail` makes: a skerry is looked at from
 * four hundred metres up with a metre of water breaking over it, and drawn at
 * the island's own two metres to a quad fifty of them would cost more triangles
 * than the home island does.
 *
 * Not the fells' number, though. 0.45 was the first cut and `--poses guard`
 * refused it: it puts a 45 m patch on eight quads a side — five and a half
 * metres to a quad, against the home island's two — and at `reef-near` the
 * crowns are visibly faceted lumps rather than rock. 0.7 is three metres to a
 * quad, which the whole guard pays for in about 22k triangles against the
 * scape's 1.84M. The tier still scales it underneath: `mobile` draws the same
 * rocks at ten quads a side.
 */
const SKERRY_DETAIL = 0.7

/**
 * The floor is eight quads a side, not the twenty-four an island patch keeps.
 *
 * That floor exists to stop a small island collapsing into a pyramid; a rock is
 * a dome forty metres across and eight quads is already finer than the shore
 * mask that shades the water round it.
 */
function skerrySegments (config: ScapeConfig, side: number, baseSegments: number): number {
  return Math.max(8, Math.round(baseSegments * side / config.terrain.size * SKERRY_DETAIL))
}

/**
 * The rocks in the open sea, as geometry.
 *
 * Same standing as the bar: the composite field has them — `surveySkerries` is
 * folded in as a maximum — but nothing *draws* them, because the terrain is one
 * patch per island and between the patches is the seabed quad. So each rock gets
 * a small patch of its own, sampled from the composite field and merged into the
 * same single terrain draw. No draw call, and no material.
 *
 * The patch is squared off round the rock's widest possible reach, so its outer
 * ring is already back on the seabed — which puts the seam under nine metres of
 * water, three tenths of a metre above the seabed quad, rather than along the
 * waterline where it would read as a cut edge.
 *
 * The colour is the one thing a skerry does not inherit. The island painter
 * bands by height above *its* waterline and would put meadow on anything with a
 * metre of freeboard; a rock that the sea washes over has no soil on it at all.
 * So it is bare stone, wet to the tideline and bleached above it, with the same
 * hashed grain the bar uses so the two read as the same world.
 *
 * All four colours are already in the palette and none of them is new. The
 * tideline is `streambed`, which the beck's channel already uses and which the
 * palette documents as wet gravel above and below the waterline alike — a
 * second name for the same tone is how two rocks in one scape end up different
 * colours.
 */
function skerryGeometry (
  config:       ScapeConfig,
  archipelago:  ArchipelagoSurvey,
  baseSegments: number,
): BufferGeometry[] {
  const { waterLevel } = config.terrain
  const wet            = new Color(config.palette.silt)
  const tide           = new Color(config.palette.streambed)
  const dry            = new Color(config.palette.scree)
  const crown          = new Color(config.palette.lichen)
  const paint          = new Color()

  return archipelago.skerries.skerries.map(skerry => {
    const side     = skerry.radius * 2.5
    const segments = skerrySegments(config, side, baseSegments)
    const geometry = new PlaneGeometry(side, side, segments, segments)

    geometry.rotateX(-Math.PI / 2)
    geometry.translate(skerry.x, 0, skerry.z)

    const positions = geometry.getAttribute('position')
    const colors    = new Float32Array(positions.count * 3)

    for (let index = 0; index < positions.count; index += 1) {
      const x      = positions.getX(index)
      const z      = positions.getZ(index)
      const height = archipelago.field.heightAt(x, z)
      const over   = height - waterLevel

      positions.setY(index, height)

      // Three metres of water is where the depth mask saturates, so the drowned
      // skirt fades into the same silt the seabed is, and the join needs no
      // blend of its own.
      if (over <= 0)
        paint.copy(tide).lerp(wet, smoothstep(0, -3, over))
      else
        paint.copy(tide).lerp(dry, smoothstep(0, 0.7, over))
          .lerp(crown, smoothstep(0.9, 2.2, over) * 0.5)

      paint.multiplyScalar(0.9 + hash2(x * 0.11, z * 0.11) * 0.17)
      paint.toArray(colors, index * 3)
    }

    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    return geometry
  })
}

/**
 * One seabed, every island's patch, the bar between two of them and the rocks in
 * the water between all of them, merged into one draw. Each patch keeps its own
 * metres-per-segment density.
 */
export function createArchipelagoTerrain (
  config:       ScapeConfig,
  archipelago:  ArchipelagoSurvey,
  material:     Material,
  baseSegments: number,
): Mesh {
  const pieces: BufferGeometry[] = []
  const seabed                   = new PlaneGeometry(archipelago.size, archipelago.size, 1, 1)
  seabed.rotateX(-Math.PI / 2)

  const seabedPositions = seabed.getAttribute('position')
  const seabedColors    = new Float32Array(seabedPositions.count * 3)
  const seabedColor     = new Color(config.palette.silt)

  for (let index = 0; index < seabedPositions.count; index += 1) {
    seabedPositions.setY(
      index,
      config.terrain.waterLevel - config.terrain.seabedDrop - 0.3,
    )
    seabedColor.toArray(seabedColors, index * 3)
  }

  seabed.setAttribute('color', new BufferAttribute(seabedColors, 3))
  pieces.push(seabed)

  for (const landmass of archipelago.landmasses) {
    const segments = patchSegments(
      config.terrain.size,
      landmass.config.terrain.size,
      baseSegments,
      landmass.detail,
    )

    // The patch draws its own share of the bar. A strand's rounded root reaches
    // a couple of dozen metres inland of the shore it starts at, and a patch
    // sampled from its local field alone would draw the island the bar is *not*
    // joined to — with the strip then hovering over ground that had never heard
    // of it.
    const ground = archipelago.strand
      ? withStrand(landmass.survey.field, archipelago.strand, landmass.origin)
      : landmass.survey.field

    const geometry = terrainGeometry(
      landmass.config,
      landmass.survey.layout,
      ground,
      landmass.survey.paths,
      segments,
    )

    geometry.translate(landmass.origin.x, 0, landmass.origin.z)
    pieces.push(geometry)

    // The ruts are the one piece of the island whose density is its own rather
    // than the terrain grid's, which is the whole reason they exist as geometry.
    // They still merge into the same draw.
    const ruts = cartRutPatch(
      landmass.config,
      landmass.survey.layout,
      landmass.survey.field,
      landmass.survey.paths,
      segments,
    )

    if (ruts) {
      ruts.translate(landmass.origin.x, 0, landmass.origin.z)
      pieces.push(ruts)
    }
  }

  if (archipelago.strand) {
    const bar = strandGeometry(config, archipelago.strand, archipelago.field)

    if (bar)
      pieces.push(bar)
  }

  pieces.push(...skerryGeometry(config, archipelago, baseSegments))

  const merged = mergeGeometryList(pieces, false)
  for (const piece of pieces)
    piece.dispose()

  merged.computeBoundingSphere()
  return terrainMesh(merged, material)
}

// perf: one draw. Colour and height are baked at build time, so the per-frame
// cost is a single vertex-coloured standard material with no texture fetch
// beyond the shared cloud-shadow map.
