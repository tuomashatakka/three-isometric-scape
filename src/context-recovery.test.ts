import { describe, expect, test } from 'bun:test'
import { MAX_LOSSES, reduce } from './context-recovery.ts'
import type { ScapeStatus } from './context-recovery.ts'
import { atmosphereQuality } from './scene/quality.ts'


function booting (tier: 'minimal' | 'mobile' | 'desktop' | 'ultra'): ScapeStatus {
  return { scape: 'booting', quality: atmosphereQuality(tier), losses: 0 }
}


/**
 * The ladder is the one piece of this file worth a test, and it is the one piece
 * that needs no GPU: every decision a context loss forces — spend another
 * context or stop, drop a tier or admit there is none left — is a pure
 * transition, so it can be argued with here rather than on a handset.
 */
describe('the scape status ladder', () => {
  test('a draw call is what makes a booting scape ready', () => {
    expect(reduce(booting('ultra'), { type: 'drawn' }).scape).toBe('ready')
  })

  test('a stray frame does not revive a scape that already failed', () => {
    const dead = reduce(booting('ultra'), { type: 'failed' })

    expect(reduce(dead, { type: 'drawn' })).toBe(dead)
  })

  test('an unchanged transition keeps the same object, so no listener fires', () => {
    const ready = reduce(booting('ultra'), { type: 'drawn' })

    expect(reduce(ready, { type: 'drawn' })).toBe(ready)
    expect(reduce(booting('ultra'), { type: 'booting' })).toEqual(booting('ultra'))
  })

  test('a lost context costs a tier and is counted', () => {
    const after = reduce(booting('ultra'), { type: 'lost' })

    expect(after.scape).toBe('lost')
    expect(after.quality.tier).toBe('desktop')
    expect(after.losses).toBe(1)
  })

  test('the second loss stops the page rather than spending a third context', () => {
    let status = booting('ultra')

    for (let i = 0; i < MAX_LOSSES; i += 1)
      status = reduce(status, { type: 'lost' })

    expect(status.losses).toBe(MAX_LOSSES)
    expect(status.scape).toBe('failed')

    // And it stopped one rung above the floor, which is the point: the budget
    // ran out before the ladder did.
    expect(status.quality.tier).toBe('desktop')
  })

  test('losing the floor tier fails outright — there is nothing cheaper to try', () => {
    const after = reduce(booting('minimal'), { type: 'lost' })

    expect(after.scape).toBe('failed')
    expect(after.losses).toBe(1)
    expect(after.quality.tier).toBe('minimal')
  })
})
