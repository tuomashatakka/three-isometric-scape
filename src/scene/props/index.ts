import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { buildAitta, buildBarn, buildFarmhouse, buildSauna, buildWoodshed } from './buildings.ts'
import { buildBarrel, buildFirewood, buildHayBale, buildMailbox, buildRowboat } from './objects.ts'
import type { NordicPalette } from './palette.ts'
import { buildCairn, buildCobble, buildErratic, buildFieldStone } from './stone.ts'
import {
  buildBridge,
  buildCart,
  buildFlagpole,
  buildGate,
  buildHayRack,
  buildJetty,
  buildLogPile,
  buildWell,
} from './structures.ts'
import {
  buildBirch,
  buildCropRow,
  buildDeadSpruce,
  buildGrassTuft,
  buildHeather,
  buildLilyPads,
  buildPine,
  buildReeds,
  buildSapling,
  buildSpruce,
  buildStump,
  buildWildflower,
} from './vegetation.ts'


/** Every prop builder is a pure geometry factory — no scene, no GL context. */
export type PropBuilder = (rng: SeededRng, palette: NordicPalette) => BufferGeometry

/**
 * The whole roster, in one table.
 *
 * Hero props are placed by hand at layout anchors and merged into a single
 * geometry; scattered props are stamped through `scatterInstances`, one draw
 * call each. Which list a prop belongs to is a cost decision, not a taste one —
 * see the part-count discipline noted in `vegetation.ts`.
 */
export const PROPS = {
  barn:      buildBarn,
  farmhouse: buildFarmhouse,
  sauna:     buildSauna,
  aitta:     buildAitta,
  woodshed:  buildWoodshed,

  jetty:    buildJetty,
  well:     buildWell,
  hayRack:  buildHayRack,
  logPile:  buildLogPile,
  flagpole: buildFlagpole,
  bridge:   buildBridge,
  cart:     buildCart,
  gate:     buildGate,
  rowboat:  buildRowboat,
  hayBale:  buildHayBale,
  firewood: buildFirewood,
  barrel:   buildBarrel,
  mailbox:  buildMailbox,

  spruce:     buildSpruce,
  pine:       buildPine,
  birch:      buildBirch,
  deadSpruce: buildDeadSpruce,
  sapling:    buildSapling,
  stump:      buildStump,
  grass:      buildGrassTuft,
  heather:    buildHeather,
  wildflower: buildWildflower,
  reeds:      buildReeds,
  lilyPads:   buildLilyPads,
  crop:       buildCropRow,

  erratic:    buildErratic,
  fieldStone: buildFieldStone,
  cobble:     buildCobble,
  cairn:      buildCairn,
} as const satisfies Record<string, PropBuilder>

/** Name of a prop in {@link PROPS}. */
export type PropName = keyof typeof PROPS

/** Placed once, by hand, then merged into the steading draw. */
export const HERO_PROPS = [
  'barn', 'farmhouse', 'sauna', 'aitta', 'woodshed',
  'jetty', 'well', 'hayRack', 'logPile', 'flagpole',
  'bridge', 'cart', 'gate', 'rowboat', 'mailbox',
] as const satisfies readonly PropName[]

/** Stamped in quantity through a single `InstancedMesh` each. */
export const SCATTER_PROPS = [
  'spruce', 'pine', 'birch', 'deadSpruce', 'sapling', 'stump',
  'grass', 'heather', 'wildflower', 'reeds', 'lilyPads', 'crop',
  'erratic', 'fieldStone', 'cobble', 'cairn',
  'hayBale', 'firewood', 'barrel',
] as const satisfies readonly PropName[]

/** Build one prop's geometry. The caller owns and disposes the result. */
export function buildProp (name: PropName, rng: SeededRng, palette: NordicPalette): BufferGeometry {
  return PROPS[name](rng.fork(name), palette)
}

export { NORDIC_PALETTE, resolvePalette } from './palette.ts'
export type { NordicColor, NordicPalette } from './palette.ts'
export { buildFenceRun } from './fence.ts'
export type { FencePoint, FenceRunOptions } from './fence.ts'
export { createScapeMaterials } from './material.ts'
export type { ScapeMaterials } from './material.ts'
export { Ploppable } from './ploppable.ts'
export type { GroundAt, PlopOptions } from './ploppable.ts'
