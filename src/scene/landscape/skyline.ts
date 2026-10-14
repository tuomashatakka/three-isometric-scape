import { BufferAttribute, BufferGeometry, Color, Mesh } from 'three'
import type { Material } from 'three'
import type { ScapeConfig } from '../config.ts'
import { SHORE_STEPS } from './farshore.ts'
import type { FarShore } from './farshore.ts'


/**
 * The far coast, as one static mesh.
 *
 * ## a coast, not a reef
 *
 * The cross-section is four points swept round the ring the survey solved: a
 * toe under the water, the coastal ridge, a vale behind it, and an outer rim
 * out past the corner of the widest frame the camera has.
 *
 * The first build stopped at the ridge and brought a second toe back down into
 * the water behind it, which is a prism — and a prism is an island. The
 * capture said so immediately: a dark ribbon curled round the archipelago with
 * open sea on both sides of it, at every one of the four tour poses wide
 * enough to see it. The thing that makes a far shore a far shore is not its
 * height, it is that *the sea ends*, and a sea that closes again a hundred and
 * sixty metres later has not ended. So the land carries on outward until it is
 * off the picture, and `farShore.hinterland` is how far that is.
 *
 * It costs nothing to do it this way. The outer rim is one more ring of
 * vertices and the plain between is two more triangles a bearing, and the
 * camera is orthographic: a quad that leaves the frustum is clipped, not
 * shaded.
 *
 * ## the sounds cost a few triangles rather than a branch
 *
 * Where the sea runs out there is no land, and the obvious build is to break
 * the strip and start a new one. It is not worth it. The survey has already
 * tapered the crest down to zero on those bearings, so pushing the crest to the
 * toe's own depth collapses the whole cross-section — ridge, vale and rim — to a
 * line three metres under mean water: the strip stays one unbroken ring, the
 * index buffer stays a loop with no special cases at either end of a headland,
 * the sea runs out through the gap to the edge of the picture because there is
 * nothing standing in it, and the price is a few hundred degenerate triangles
 * under the water. A branch in that loop would have cost
 * more to read than the triangles cost to draw.
 *
 * ## what it is made of, and what it is not
 *
 * The shared `ground` material, which is the whole reason this is as cheap as
 * it is: no program of its own, no uniform of its own, no texture. It picks up
 * the scape's linear fog — which is what hazes it, and `atmosphere.fogDensity`
 * is therefore its only live knob — the snow line, the wet pass and the cloud
 * shadow, all for nothing, because every one of those is already in the
 * material every other static surface in the scape draws with.
 *
 * It casts no shadow and receives none. The sun's shadow camera is fitted to
 * the ground the view can see; a kilometre-wide ring of mountains in the caster
 * list would blow that fit open and cost the islands their shadow resolution to
 * light a thing the fog has half dissolved anyway.
 */

/**
 * The cross-section, as four radii and four heights.
 *
 * {@link RINGS} is where each ring stands, past the ridge, as a multiple of
 * the half-width between the waterline and the ridge — except the last, which
 * is `farShore.hinterland` and is resolved per build because it is sized
 * against the camera rather than against the coast.
 *
 * {@link HIGH} is what each one does with the bearing's crest height: the
 * ridge is the crest, the vale behind it keeps half, and the rim inland comes
 * back up to most of it. A rim at the same height as the ridge would be a
 * plateau, and a rim lower than the vale would be a second coast falling into
 * a sea that is not there.
 */
const RINGS = [ -1, 0, 1.6 ]
const HIGH  = [ 0, 1, 0.5, 0.86 ]

/**
 * How much of the crest's own height each ring takes as colour, and how far
 * each is pulled toward the horizon.
 *
 * The lift is the rock: `seaRock` is what this scape paints anything standing
 * in salt water and `scree` is bare mountain, and a summit is scree where a
 * shoreline is not. Without it a hundred-metre wall reads as one flat
 * silhouette the moment the air has taken the contrast out of it.
 *
 * The haze is aerial perspective, baked, and it is not a cheat. The scape's
 * fog is linear in *view depth*, and this camera at the zoom that can see the
 * far shore looks down at fifty degrees — so the outer rim, a kilometre
 * further across the water than the ridge, is barely any further from the
 * camera than the ridge is and the fog treats them the same. Distance through
 * the air is radial here, not axial, and this is that distance. It is an
 * albedo rather than a light, so a hazier rim is still a dark rim at night.
 */
const LIFT = [ 0, 1, 0.55, 0.8 ]
const HAZE = [ 0, 0.05, 0.18, 0.3 ]

/** What the rock is worth before the crest's own height is added to it. */
const ROCK_FLOOR = 0.5

const crestTone = new Color()
const toeTone   = new Color()
const hazeTone  = new Color()
const blend     = new Color()

/**
 * Write the ring's four vertices per bearing — toe, ridge, vale, rim.
 *
 * Its own function because the build was past the lint config's statement
 * ceiling with it inline, and this is the seam worth cutting on: everything
 * above is the mesh's own bookkeeping and everything here is the cross-section.
 */
function sweepRing (
  config:   ScapeConfig,
  shore:    FarShore,
  position: Float32Array,
  colour:   Float32Array,
): void {
  const { farShore, terrain, palette } = config
  const seabed                         = terrain.waterLevel - terrain.seabedDrop
  const toeY                           = terrain.waterLevel - farShore.sink
  const inland                         = farShore.hinterland

  // Where each ring stands before the taper has had it: the toe under the
  // waterline, and everything inland measured up from the waterline itself.
  // Derived off {@link HIGH} rather than written out, so a cross-section that
  // grows a ring cannot grow one without a base to stand on.
  const base = HIGH.map((_, ring) => ring === 0 ? toeY : terrain.waterLevel)

  toeTone.set(palette.seaRock)
  crestTone.set(palette.scree)
  hazeTone.set(palette.fog)

  for (let step = 0; step < SHORE_STEPS; step += 1) {
    const { bearing, distance, crest, land } = shore.samples[step]
    const dirX                               = Math.cos(bearing)
    const dirZ                               = Math.sin(bearing)
    const half                               = distance * farShore.width * 0.5
    const share                              = farShore.rise > 0 ? crest / farShore.rise : 0

    for (let ring = 0; ring < RINGS.length + 1; ring += 1) {
      const at     = (step * (RINGS.length + 1) + ring) * 3
      const offset = ring < RINGS.length ? half * RINGS[ring] : distance * inland

      // The taper does two things at once where the land runs out, and both
      // were learned from a capture.
      //
      // It **shrinks** the cross-section, so a headland running into a sound
      // closes to a point on the crest line rather than lying down flat where
      // it stood. Sinking alone left a hundred-and-ninety-metre ramp of drowned land
      // either side of every sound, reaching in under the water toward the
      // islands — three dark spikes in the noon frame.
      //
      // And it **sinks** it to the seabed rather than to the toe's own depth.
      // Three metres under mean water is inside the lake's depth tint, and
      // that drew every sound as a pale bar straight across itself: a shoal
      // nothing had surveyed, in the one place the coast has to be open.
      const radius = distance + offset * land

      position[at]     = dirX * radius
      position[at + 1] = seabed + (base[ring] + crest * HIGH[ring] - seabed) * land
      position[at + 2] = dirZ * radius

      blend
        .lerpColors(toeTone, crestTone, ROCK_FLOOR + (1 - ROCK_FLOOR) * share * LIFT[ring])
        .lerp(hazeTone, HAZE[ring])

      colour[at]     = blend.r
      colour[at + 1] = blend.g
      colour[at + 2] = blend.b
    }
  }
}

/**
 * Wind every band of the sweep so its face looks up.
 *
 * One rule for all three bands rather than one per face, and it falls out of
 * the cross product: for an inner ring `a` and the ring `b` outside it, the
 * triangles `(aᵢ, bⱼ, bᵢ)` and `(aᵢ, aⱼ, bⱼ)` give a normal whose vertical part
 * is the radial step between the two rings — positive whatever the *slope*
 * does. So a face that climbs away from the sea and a face that falls back
 * toward it are wound the same way and neither has to be special-cased, which
 * is the whole reason the sweep could grow from two bands to three without the
 * index buffer being rethought. `skyline.test.ts` asserts it against the
 * geometry rather than against this comment.
 */
function windRing (index: Uint32Array, rings: number): void {
  const bands = rings - 1

  for (let step = 0; step < SHORE_STEPS; step += 1) {
    const here = step * rings
    const next = (step + 1) % SHORE_STEPS * rings

    for (let band = 0; band < bands; band += 1)
      index.set([
        here + band, next + band + 1, here + band + 1,
        here + band, next + band, next + band + 1,
      ], (step * bands + band) * 6)
  }
}

/**
 * Build the far coast, or `null` when the scape has none.
 *
 * Null rather than an empty mesh when nothing stands: `farShore.rise` at zero
 * is a scape with open ocean on every bearing, and an empty draw call is still
 * a draw call.
 */
export function createFarShore (
  config:   ScapeConfig,
  shore:    FarShore,
  material: Material,
): Mesh | null {
  if (!shore.headlands.length)
    return null

  const rings    = RINGS.length + 1
  const vertices = SHORE_STEPS * rings
  const position = new Float32Array(vertices * 3)
  const colour   = new Float32Array(vertices * 3)
  const index    = new Uint32Array(SHORE_STEPS * (rings - 1) * 6)

  sweepRing(config, shore, position, colour)
  windRing(index, rings)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('color', new BufferAttribute(colour, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  geometry.computeVertexNormals()

  const mesh         = new Mesh(geometry, material)
  mesh.name          = 'far-shore'
  mesh.castShadow    = false
  mesh.receiveShadow = false
  mesh.updateMatrix()
  mesh.matrixAutoUpdate = false
  return mesh
}
