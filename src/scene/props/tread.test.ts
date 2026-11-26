import { describe, expect, it } from 'bun:test'
import { GRAVEL_FRAGMENT, GRAVEL_PARS_FRAGMENT } from './gravel.ts'
import { BARE_KEY_GLSL, DAMP_CELL, DAMP_REPEATS, TREAD_CELL, TREAD_FRAGMENT, TREAD_REPEATS, bareness } from './tread.ts'

describe('tread', () => {
  it('rides inside the bare-ground block, after the one bareness key', () => {
    expect(GRAVEL_PARS_FRAGMENT).toContain(BARE_KEY_GLSL.trim())
    expect(GRAVEL_FRAGMENT).toContain(TREAD_FRAGMENT.trim())
    expect(GRAVEL_FRAGMENT.indexOf('scapeBare(')).toBeLessThan(GRAVEL_FRAGMENT.indexOf('scapeStone('))
  })

  it('is the gravel lattice turned over: a pit is a stone with its slope inverted', () => {
    expect(TREAD_FRAGMENT).toContain('scapeStone(')
    expect(TREAD_FRAGMENT).toMatch(/normal \+ mat3\(viewMatrix\)/)
    expect(GRAVEL_FRAGMENT).toMatch(/normal - mat3\(viewMatrix\)/)
  })

  it('reads the yard at the zoom people see it, and lets go before a wide frame', () => {
    // `near` is a frame of roughly sixteen metres; `default` is hundreds.
    expect(16 / TREAD_CELL).toBeLessThan(TREAD_REPEATS[0])
    expect(16 / DAMP_CELL).toBeLessThan(DAMP_REPEATS[0])
    expect(300 / DAMP_CELL).toBeGreaterThan(DAMP_REPEATS[1])
  })

  it('keys on warm, unvegetated, not pale ground', () => {
    expect(bareness(0.2, 0.14, 0.08)).toBeGreaterThan(0.5)
    expect(bareness(0.1, 0.2, 0.06)).toBe(0)
    expect(bareness(0.8, 0.8, 0.82)).toBe(0)
  })

  it('stands water only in a shower', () => {
    expect(TREAD_FRAGMENT).toMatch(/pool\s*=.*uWetAmount/)
  })
})
