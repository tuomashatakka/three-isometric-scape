/**
 * How much of the scatter is drawn at the zoom it is seen at. See
 * `landscape/scatter-lod.ts`.
 *
 * **Pixels and metres.** `pixels` is a screen size; `tile` and `wide` are world
 * metres, because a tile is a patch of ground and `wide` is compared against
 * how much ground the camera shows.
 */
export interface LodConfig {
  lod: {

    /**
     * The smallest a scattered family is drawn at, in pixels on screen.
     *
     * Measured off the family's typical instance, so at the whole-archipelago
     * frame the grass, cobbles and weed — a fifth of a pixel each — are not
     * drawn and the trees are. 0 draws everything at every zoom.
     */
    pixels: number

    /** Edge of a culling tile, in metres. Build-time; 0 is no tiles. */
    tile: number

    /**
     * Metres of view past which each family is drawn as one world-wide mesh
     * rather than as its tiles. Wider than this, most tiles are in frame anyway
     * and one draw beats twenty.
     */
    wide: number
  }
}

export const SCAPE_LOD: LodConfig = {
  lod: {
    pixels: 0.9,
    tile:   160,
    wide:   420,
  },
}
