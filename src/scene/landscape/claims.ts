import { hypot } from '../hypot.ts'


/** Metres per bucket of the index. */
const CELL = 8

/** Half the span of columns a key packs — far past any world this scape builds. */
const SPAN = 4096

interface Claim {
  x:      number
  z:      number
  radius: number
}

export interface ClaimIndex {

  /** Claim ground, with the solver and in the index. */
  reserve(x: number, z: number, radius: number): void

  /** Whether a footprint of `radius` at (x, z) clears every claim, each widened by `claimScale`. */
  spacingClear(x: number, z: number, radius: number, claimScale: number): boolean
}

/**
 * The scatter solver's claims, bucketed by ground cell.
 *
 * The solver keeps its claims in one list, and the dressing asked every one of
 * them about every dart — O(claims) per attempt, the largest single cost of the
 * page's first load on the desktop tiers. The same claims in 8 m buckets answer
 * the same question from the few cells a dart can reach: a claim can only stop
 * a footprint within its own widened radius plus the footprint's, and the
 * widest claim bounds how many cells that is.
 */
type SolverType = { reserve(x: number, z: number, radius: number): void }

export function createClaimIndex (solver: SolverType): ClaimIndex {
  const cells = new Map<number, Claim[]>()
  let widest  = 0

  const key = (column: number, row: number): number => (column + SPAN) * SPAN * 2 + row + SPAN

  return {
    reserve (x, z, radius) {
      solver.reserve(x, z, radius)

      const at   = key(Math.floor(x / CELL), Math.floor(z / CELL))
      const cell = cells.get(at)

      if (cell)
        cell.push({ x, z, radius })
      else
        cells.set(at, [{ x, z, radius }])
      widest = Math.max(widest, radius)
    },

    spacingClear (x, z, radius, claimScale) {
      const reach  = Math.ceil((widest * claimScale + radius) / CELL)
      const column = Math.floor(x / CELL)
      const row    = Math.floor(z / CELL)

      for (let dc = -reach; dc <= reach; dc += 1)
        for (let dr = -reach; dr <= reach; dr += 1)
          for (const claim of cells.get(key(column + dc, row + dr)) ?? [])
            if (hypot(claim.x - x, claim.z - z) <= claim.radius * claimScale + radius)
              return false
      return true
    },
  }
}
