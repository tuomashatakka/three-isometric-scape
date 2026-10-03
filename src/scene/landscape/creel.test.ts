import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { tideAmplitudeAt } from '../tide.ts'
import { surveyArchipelago, toWorld } from './archipelago.ts'
import { creelAground, creelDepth, creelPots, planCreels } from './creel.ts'


const clone  = (): ScapeConfig => structuredClone(SCAPE_CONFIG) as ScapeConfig
const config = clone()
const world  = surveyArchipelago(config)
const water  = config.terrain.waterLevel
const spring = tideAmplitudeAt(1, config.tide)

/** The budget the desktop tier deals, which is what `scape:map` reports against. */
const BUDGET = 3

const fleets  = planCreels(world, config, BUDGET)
const strings = fleets.flatMap(fleet => fleet.strings)
const pots    = creelPots(fleets)

/** The jetty of the island a string belongs to, in world metres. */
type HarbourOfReturnType = { x: number, z: number }

function harbourOf (island: string): HarbourOfReturnType {
  const landmass = world.landmasses.find(mass => mass.id === island)

  if (!landmass?.survey.landing)
    throw new Error(`no landing on ${island}`)

  return toWorld(landmass, landmass.survey.landing)
}


describe('where the pots are shot', () => {
  test('the search finds ground off the harbours', () => {
    expect(fleets.length).toBe(world.landmasses.length)
    expect(strings.length).toBeGreaterThan(0)
    expect(pots.length).toBeGreaterThan(70)

    // Every harbour in the archipelago, not three of them. The first cut shot
    // each string straight out from the jetty, crossed the band in four pots
    // and left two islands with no gear at all — see the note on contours in
    // `creel.ts`.
    expect(fleets.every(fleet => fleet.strings.length > 0)).toBe(true)
  })

  test('no harbour works more strings than the tier paid for', () => {
    for (const fleet of fleets)
      expect(fleet.strings.length).toBeLessThanOrEqual(BUDGET)
  })

  test('every pot lies in the water the rule asked for', () => {
    // The siting rule, stated as a fact about the data rather than re-derived.
    // A pot outside this window is gear in the surf or gear off the shelf, and
    // either one is a string nobody could haul.
    for (const pot of pots) {
      const depth = creelDepth(pot, water, 0)

      expect(depth).toBeGreaterThanOrEqual(config.creel.sill - 1e-6)
      expect(depth).toBeLessThanOrEqual(config.creel.deep + 1e-6)
    }
  })

  test('every string stays inside its own harbour\'s reach, and outside its mouth', () => {
    // Both halves of the one rule here that is about people. The near end is
    // the fairway the boats actually use — a backline across it is a rope round
    // somebody's propeller — and the far end is how far a hand-hauled boat goes
    // from home.
    for (const string of strings) {
      const harbour = harbourOf(string.island)

      for (const pot of string.pots) {
        const out = Math.hypot(pot.x - harbour.x, pot.z - harbour.z)

        expect(out).toBeGreaterThanOrEqual(config.creel.clear - 1e-6)
        expect(out).toBeLessThanOrEqual(config.creel.range + 1e-6)
      }
    }
  })

  test('every string is a row rather than a scatter', () => {
    // The claim the headline makes: a fleet is a *line* of marks, shot at one
    // spacing on one bearing. Stated as the distance between neighbours, which
    // is the thing a reader sees and the thing a bug in the walk would break.
    for (const string of strings) {
      expect(string.pots.length).toBeGreaterThanOrEqual(4)

      for (let index = 1; index < string.pots.length; index += 1) {
        const back = string.pots[index - 1]
        const here = string.pots[index]

        expect(Math.hypot(here.x - back.x, here.z - back.z))
          .toBeCloseTo(config.creel.spacing, 6)
      }
    }
  })

  test('no two strings out of one harbour are shot on the same ground', () => {
    // What `GAP` is for, and the claim stated the way a boat would feel it:
    // pot to pot across the whole of both lines. Without it the strings out of
    // one harbour all trace the same contour from starts a few degrees apart
    // and lie on top of one another, which from above is one string drawn
    // twice.
    for (const fleet of fleets)
      for (const [ index, string ] of fleet.strings.entries())
        for (const other of fleet.strings.slice(index + 1))
          for (const here of string.pots)
            for (const there of other.pots)
              expect(Math.hypot(here.x - there.x, here.z - there.z)).toBeGreaterThanOrEqual(24)
  })

  test('every string lies along one depth rather than down the shelf', () => {
    // The headline's own claim, and the one the window test above cannot make:
    // the window is four and a half metres wide and the shelf crosses it in a
    // dozen, so a line shot straight out of the harbour passes that test with
    // the full spread. A traced contour wanders — the seabed is noisy and the
    // bearing solver is clamped — but it wanders inside a *third* of the
    // window, which is what says the backline followed the ground.
    const band = config.creel.deep - config.creel.sill

    for (const string of strings) {
      const depths = string.pots.map(pot => creelDepth(pot, water, 0))

      expect(Math.max(...depths) - Math.min(...depths)).toBeLessThan(band / 3)
    }
  })

  test('no harbour shoots gear on a neighbour\'s doorstep', () => {
    // `creel.range` alone is a circle, and a circle round one harbour on this
    // archipelago reaches another island's shelf — at the default seed the
    // ridge's boat found a string on the home island's south coast, a hundred
    // and fifty metres from its own pier and fifty from somebody else's. Gear
    // belongs to the harbour nearest it, which is how a coast divides its
    // ground, and it needs no second knob.
    for (const string of strings) {
      const mine = harbourOf(string.island)

      for (const pot of string.pots) {
        const home = Math.hypot(pot.x - mine.x, pot.z - mine.z)

        for (const landmass of world.landmasses) {
          if (landmass.id === string.island || !landmass.survey.landing)
            continue

          const theirs = toWorld(landmass, landmass.survey.landing)

          expect(Math.hypot(pot.x - theirs.x, pot.z - theirs.z)).toBeGreaterThanOrEqual(home)
        }
      }
    }
  })

  test('an island with no landing has no gear', () => {
    // Gear belongs to a harbour. An island nobody lands on has nobody to haul
    // it, and the honest answer is an empty fleet rather than a missing case.
    for (const fleet of fleets) {
      const landmass = world.landmasses.find(mass => mass.id === fleet.island)

      if (!landmass?.survey.landing)
        expect(fleet.strings.length).toBe(0)
    }
  })
})

describe('what the tide does to the gear', () => {
  test('a spring tide changes the water over every float', () => {
    // The system's one coupling, as a fact rather than an intention: the same
    // pot, at the two ends of one spring tide, has different water over it. If
    // these ever match, the fishery has stopped answering to the sea.
    for (const pot of pots)
      expect(creelDepth(pot, water, spring) - creelDepth(pot, water, -spring))
        .toBeCloseTo(spring * 2, 6)
  })

  test('no float is left sitting on the ground at low springs', () => {
    // The claim `creel.sill` is authored to keep. A mark aground is a float
    // lying on wet rock, and at the authored sill the shallowest gear in the
    // archipelago still has well over a metre under it at the lowest water the
    // month reaches.
    for (const pot of pots)
      expect(creelAground(pot, water, -spring)).toBe(false)
  })
})

describe('the search itself', () => {
  test('it is deterministic', () => {
    // The same world twice rather than two surveys of it: `surveyArchipelago`
    // has its own determinism test and costs seconds, and what is under test
    // here is the plan.
    const again = creelPots(planCreels(world, clone(), BUDGET))

    expect(again.map(pot => [ pot.x, pot.z, pot.phase ]))
      .toEqual(pots.map(pot => [ pot.x, pot.z, pot.phase ]))
  })

  test('a tier with no budget takes the whole system away', () => {
    expect(planCreels(world, config, 0)).toEqual([])
  })

  test('a window the shelf cannot straddle takes it away too', () => {
    const shut = clone()

    shut.creel.deep = shut.creel.sill

    // A graceful absence rather than a cheap version, and without a boolean
    // beside the depth saying the same thing twice.
    expect(planCreels(world, shut, BUDGET)).toEqual([])
  })
})
