import type { ArchipelagoSurvey } from './archipelago.ts'
import { surfaceQueries } from './height.ts'
import type { HeightField } from './height.ts'


/** Lattice points per tile side. */
const TILE = 32

/** Half the span of tiles a key packs — far past any world this scape builds. */
const SPAN = 1 << 14

/**
 * A height field read through a lattice: each lattice point asks the field once,
 * the first time anything near it is asked, and everything between is bilinear.
 *
 * The full field is a stack of fBm, warps, carves and claims — tens of noise
 * reads per height — and the first load asked it millions of times: the terrain
 * mesh read every vertex five times over for its slope and its normal, and the
 * scatter rules read a dozen heights per dart for every dart thrown. Those
 * readers ask about the same few square metres again and again, so a lattice
 * at the mesh's own spacing (the mesh) or at the slope probe's reach (the
 * scatter) answers them for a fraction of the cost.
 *
 * Not exact between lattice points, and that is the trade: a lattice at
 * `spacing` metres rounds away detail finer than that, which is detail the
 * drawn terrain does not carry either. Deterministic, because every point is the
 * field's own answer at a fixed place.
 *
 * Tiles are filled lazily, so a lattice over the whole world costs only the
 * ground somebody actually asked about.
 */
export function latticeField (
  field:   Pick<HeightField, 'heightAt'>,
  spacing: number,
  originX = 0,
  originZ = 0,
): HeightField {
  const tiles = new Map<number, Float64Array>()
  let lastKey            = Number.NaN
  let last: Float64Array = new Float64Array(0)

  function point (column: number, row: number): number {
    const tileColumn = Math.floor(column / TILE)
    const tileRow    = Math.floor(row / TILE)
    const key        = (tileColumn + SPAN) * SPAN * 2 + tileRow + SPAN

    if (key !== lastKey) {
      let tile = tiles.get(key)

      if (!tile) {
        tile = new Float64Array(TILE * TILE).fill(Number.NaN)
        tiles.set(key, tile)
      }
      lastKey = key
      last    = tile
    }

    const slot   = (row - tileRow * TILE) * TILE + column - tileColumn * TILE
    const cached = last[slot]

    if (cached === cached)
      return cached
    return last[slot] = field.heightAt(originX + column * spacing, originZ + row * spacing)
  }

  function heightAt (x: number, z: number): number {
    const u      = (x - originX) / spacing
    const v      = (z - originZ) / spacing
    const column = Math.floor(u)
    const row    = Math.floor(v)
    const tx     = u - column
    const tz     = v - row
    const a      = point(column, row)
    const b      = point(column + 1, row)
    const c      = point(column, row + 1)
    const d      = point(column + 1, row + 1)
    const near   = a + (b - a) * tx

    return near + (c + (d - c) * tx - near) * tz
  }

  return { heightAt, ...surfaceQueries(heightAt) }
}

/**
 * A survey whose field answers through a lattice, for readers that throw many
 * darts at the ground — the scatter rules ask a dozen heights a dart. Only the
 * height and its slope and normal change; everything else is the survey's own.
 */
export function latticeSurvey (survey: ArchipelagoSurvey, spacing: number): ArchipelagoSurvey {
  return { ...survey, field: { ...survey.field, ...latticeField(survey.field, spacing) }}
}
