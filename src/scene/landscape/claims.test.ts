import { describe, expect, test } from 'bun:test'
import { createClaimIndex } from './claims.ts'


describe('createClaimIndex', () => {
  test('answers exactly what a scan of every claim answers', () => {
    const claims: { x: number, z: number, radius: number }[] = []
    const index                                              = createClaimIndex({ reserve: (x, z, radius) => claims.push({ x, z, radius }) })
    let seed     = 7

    const next = (): number => {
      seed = Math.imul(seed, 1_664_525) + 1_013_904_223 >>> 0
      return seed / 4_294_967_296
    }

    for (let i = 0; i < 300; i += 1)
      index.reserve((next() - 0.5) * 400, (next() - 0.5) * 400, next() * (i % 50 === 0 ? 30 : 3))

    for (let i = 0; i < 4000; i += 1) {
      const x     = (next() - 0.5) * 420
      const z     = (next() - 0.5) * 420
      const r     = next() * 4
      const scale = next() * 2
      const scan  = claims.every(claim => Math.hypot(claim.x - x, claim.z - z) > claim.radius * scale + r)

      expect(index.spacingClear(x, z, r, scale)).toBe(scan)
    }
  })
})
