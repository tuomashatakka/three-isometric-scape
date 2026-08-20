import { describe, expect, test } from 'bun:test'
import { parseArgs } from './args.ts'
import { captureShape, structuralLine } from './scape-diff.ts'


const legacy: Record<string, unknown> = {
  land:      19.6,
  creek:     { length: 38.7 },
  footpaths: { routes: 20 },
  peak:      { height: 9.09 },
  plots:     4,
  isles:     { surfacing: 15 },
}

const archipelago: Record<string, unknown> = {
  ...legacy,
  landmasses: [
    {
      id:        'home',
      profile:   'home',
      origin:    [ 0, 0 ],
      land:      19.6,
      peak:      { height: 9.09 },
      footpaths: { routes: 16, length: 210, longest: 23 },
      plots:     4,
      ridges:    5,
      steading:  { farmhouse: [ -8, 3 ]},
      landing:   [ -26, -17 ],
      harbour:   [ -13, -28 ],
    },
    {
      id:        'ridge',
      profile:   'ridge',
      origin:    [ -178, 128 ],
      land:      15.1,
      peak:      { height: 9.8 },
      footpaths: { routes: 11, length: 188, longest: 26 },
      plots:     3,
      ridges:    5,
      steading:  { farmhouse: [ -171, 121 ]},
      landing:   [ -151, 138 ],
      harbour:   [ -163, 148 ],
    },
    {
      id:        'meadow',
      profile:   'meadow',
      origin:    [ 178, 128 ],
      land:      27,
      peak:      { height: 5.68 },
      footpaths: { routes: 12, length: 190, longest: 25 },
      plots:     5,
      ridges:    5,
      steading:  { farmhouse: [ 184, 132 ]},
      landing:   [ 151, 126 ],
      harbour:   [ 164, 116 ],
    },
  ],
  waterways: { legs: 3, length: 809.7, connected: true, wet: true, clearance: 0.67 },
  boats:     { count: 3, separation: 103.41, conflicts: 0 },
}

describe('the structural diff', () => {
  test('still reads refs from before the archipelago schema', () => {
    const line = structuralLine(legacy, legacy)

    expect(line).toContain('landmasses legacy-home->legacy-home')
    expect(line).toContain('waterways legacy->legacy')
    expect(line).toContain('no structural change')
  })

  test('compares the projected landmass array when a new ref meets an old one', () => {
    const line = structuralLine(legacy, archipelago)

    expect(line).toContain('landmasses legacy-home->home/home@0,0:J')
    expect(line).toContain('waterways legacy->3/809.7m/OK/wet/0.67m')
    expect(line).toContain('boats legacy->3/103.41m/0')
    expect(line).toContain('STRUCTURE MOVED')
  })

  test('compares each island\'s projected settlement summary', () => {
    const moved = structuredClone(archipelago)
    const ridge = (moved.landmasses as Array<{ steading: Record<string, [number, number]> }>)[1]

    ridge.steading.farmhouse = [ -170, 121 ]

    const line = structuralLine(archipelago, moved)

    expect(line).toContain('farmhouse@-171,121')
    expect(line).toContain('farmhouse@-170,121')
    expect(line).toContain('STRUCTURE MOVED')
  })

  test('flags a route or fleet safety regression', () => {
    const unsafe: Record<string, unknown> = {
      ...archipelago,
      waterways: { legs: 3, length: 809.7, connected: false, wet: false, clearance: 0.2 },
      boats:     { count: 3, separation: 4.5, conflicts: 1 },
    }
    const line = structuralLine(archipelago, unsafe)

    expect(line).toContain('waterways 3/809.7m/OK/wet/0.67m->3/809.7m/BROKEN/DRY/0.2m')
    expect(line).toContain('boats 3/103.41m/0->3/4.5m/1')
    expect(line).toContain('STRUCTURE MOVED')
  })
})


/**
 * The reference cache's key, as a fact rather than as an assumption.
 *
 * A prewarm keyed on the commit alone is reusable across `--tier`, and the tiers
 * do not merely look different — they build different programs. A `mobile`
 * reference against a `desktop` head reported a third of the frame changed for
 * a change whose subject moved a few pixels, and every number in that table was
 * wrong in a way nothing in it admitted.
 */
describe('what a cached reference is a reference *of*', () => {
  test('two tiers are two different references', () => {
    expect(captureShape(parseArgs([ '--tier', 'desktop' ])))
      .not.toBe(captureShape(parseArgs([ '--tier', 'mobile' ])))
  })

  test('the default is stated, so an unflagged run and an explicit one agree', () => {
    expect(captureShape(parseArgs([]))).toBe(captureShape(parseArgs([ '--tier', 'mobile' ])))
  })

  test('every flag that changes the picture changes the key', () => {
    const plain = captureShape(parseArgs([]))

    for (const flag of [
      [ '--ratio', '2' ],
      [ '--skip', 'water' ],
      [ '--aa', 'off' ],
      [ '--post', 'off' ],
      [ '--size', '400x250' ],
      [ '--no-still' ],
      [ '--gpu' ],
    ])
      expect(captureShape(parseArgs(flag))).not.toBe(plain)
  })

  test('a flag that changes nothing about the picture does not', () => {
    // The poses are checked by whether their files are on disk, and the port is
    // not a property of the image. A key that moved on either would throw the
    // prewarm away for no reason, which costs the whole head start.
    expect(captureShape(parseArgs([ '--port', '5000' ]))).toBe(captureShape(parseArgs([])))
    expect(captureShape(parseArgs([ '--poses', 'near' ]))).toBe(captureShape(parseArgs([])))
  })
})
