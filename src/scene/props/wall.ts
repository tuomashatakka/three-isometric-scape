import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { createRockGeometry, mergeParts, part } from 'threejs-scene/modules/assets'
import { resamplePath } from './fence.ts'
import type { FencePoint } from './fence.ts'
import type { NordicPalette } from './palette.ts'


export interface StoneWallRunOptions {

  /** The line the wall follows, in world space. Two points minimum. */
  points: readonly FencePoint[]

  /** Ground height, sampled per station. */
  heightAt(x: number, z: number): number
  rng:     SeededRng
  palette: NordicPalette

  /** Metres between stone stations. Below the stone length, so they interlock. @defaultValue 0.7 */
  spacing?: number

  /** Wall height above ground, in metres. @defaultValue 0.92 */
  height?: number

  /** Close the run back to its first point. @defaultValue false */
  closed?: boolean

  /** Skip any station whose ground falls below this. @defaultValue -Infinity */
  minHeight?: number
}

/** Courses per station. Three reads as stacked; two reads as a kerb. */
const COURSES = 3

/**
 * A drystone wall (kiviaita) following a line on the ground.
 *
 * The same principle as [`fence.ts`](fence.ts) and for the same reason: each
 * station resolves its own ground height, so the wall climbs the slope it is
 * built across instead of floating over the dips. It is not a fence in stone,
 * though — there are no spans. A wall is only ever a pile that happens to be
 * long, so the stations sit *closer* than a stone is wide and the courses
 * overlap into each other. Gaps are what separate a wall from a row of rocks.
 *
 * Every stone is a `createRockGeometry` at `detail: 0` — twenty faces each, and
 * the whole run merges into one geometry, so a hundred metres of wall is a few
 * thousand vertices and no draw call of its own.
 *
 * @returns One merged, world-space, vertex-coloured geometry. The caller owns it.
 */
export function buildStoneWallRun ({
  points,
  heightAt,
  rng,
  palette,
  spacing = 0.7,
  height = 0.92,
  closed = false,
  minHeight = -Infinity,
}: StoneWallRunOptions): BufferGeometry | null {
  if (points.length < 2)
    return null

  const parts: BufferGeometry[] = []
  const stations                = resamplePath(points, spacing, closed)
  const colors                  = [ palette.granite, palette.graniteDark, palette.graniteWarm, palette.lichen ]

  for (const [ index, station ] of stations.entries()) {
    const ground = heightAt(station.x, station.z)

    if (ground < minHeight)
      continue

    // The bearing of the run through this station, taken from its neighbours so
    // that the stones lie lengthwise along the wall rather than across it.
    const previous = stations[Math.max(0, index - 1)]
    const next     = stations[Math.min(stations.length - 1, index + 1)]
    const along    = Math.atan2(next.z - previous.z, next.x - previous.x)
    const across   = along + Math.PI / 2

    for (let course = 0; course < COURSES; course += 1) {
      const rise = (course + 0.5) / COURSES

      // The courses narrow going up, but barely. Every course has to stay
      // longer than the spacing or it stops being a course — the first cut of
      // this tapered hard, and the top of the wall came out as a dotted line of
      // separate stones sitting on a solid base.
      const radius = height * (0.42 - rise * 0.08)

      // Upper courses sit straighter than lower ones — a wall is built by
      // dropping the big stones roughly and correcting on the way up.
      const sway = rng.range(-1, 1) * height * 0.2 * (1 - rise)

      parts.push(part(
        createRockGeometry({ radius, detail: 0, rng, roughness: 0.3, scale: [ 1.3, 0.78, 1 ]}),
        {
          at: [
            station.x + Math.cos(across) * sway,
            ground + height * rise - 0.08,
            station.z + Math.sin(across) * sway,
          ],
          rotate: [ 0, along + rng.range(-0.35, 0.35), 0 ],
          color:  rng.pick(colors),
          jitter: 0.16,
          rng,
        },
      ))
    }
  }

  return parts.length > 0
    ? mergeParts(parts)
    : null
}

// perf: one merged geometry for a whole enclosure. No grime pass — this
// geometry is in world space, and grime darkens toward the *geometry's* base,
// which on a wall crossing a hillside would shade the downhill end and not the
// bottom of each stone.
