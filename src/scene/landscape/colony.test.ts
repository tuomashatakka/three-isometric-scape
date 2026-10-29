import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { planColonies } from './colony.ts'
import { isBirdCliff, ledgeTiers } from './ledges.ts'


const survey   = surveyArchipelago(SCAPE_CONFIG)
const colonies = planColonies(survey, SCAPE_CONFIG)

function withBirds (birds: Partial<typeof SCAPE_CONFIG.birds>) {
  return { ...SCAPE_CONFIG, birds: { ...SCAPE_CONFIG.birds, ...birds }}
}

function withLedges (ledges: Partial<typeof SCAPE_CONFIG.ledges>) {
  return { ...SCAPE_CONFIG, ledges: { ...SCAPE_CONFIG.ledges, ...ledges }}
}

/** The islands whose crag is tall enough for the colony gate to take it. */
const birdCliffs = survey.landmasses
  .filter(landmass =>
    isBirdCliff(landmass.survey.crag, { ...landmass.config, ledges: SCAPE_CONFIG.ledges }))
  .map(landmass => landmass.id)


describe('siting the flocks', () => {
  test('the archipelago has water to hang them over', () => {
    expect(colonies.length).toBeGreaterThan(0)
  })

  test('every landmass with a landing gets a harbour flock', () => {
    const landed = survey.landmasses
      .filter(landmass => landmass.survey.landing)
      .map(landmass => landmass.id)

    const harbours = colonies.filter(colony => colony.kind === 'harbour').map(colony => colony.id)

    expect([ ...harbours ].sort()).toEqual([ ...landed ].sort())
  })

  test('the outer rock carries one too, and only where a light was built', () => {
    const rocks = colonies.filter(colony => colony.kind === 'rock').map(colony => colony.id)
    const lit   = survey.landmasses
      .filter(landmass => landmass.survey.beacon)
      .map(landmass => landmass.id)

    expect([ ...rocks ].sort()).toEqual([ ...lit ].sort())
  })

  /**
   * The claim, stated as a fact about the ground rather than about the search.
   *
   * A ring is a circle a gull flies all the way round, so it is not enough that
   * its centre is over water: every bearing on it has to be. This is the test
   * that would have caught the obvious first version, which walked one step off
   * the bank and put half the wheel over the beach.
   */
  test('no bearing on any ring crosses dry land', () => {
    expect(colonies.length).toBeGreaterThan(0)

    for (const colony of colonies)
      for (let step = 0; step < 64; step += 1) {
        const around = step / 64 * Math.PI * 2
        const level  = survey.field.heightAt(
          colony.x + Math.cos(around) * colony.radius,
          colony.z + Math.sin(around) * colony.radius,
        )

        expect(level).toBeLessThanOrEqual(survey.waterLevel)
      }
  })

  test('a ring is never wider than it was asked to be, and never zero', () => {
    for (const colony of colonies) {
      expect(colony.radius).toBeGreaterThan(0)
      expect(colony.radius).toBeLessThanOrEqual(SCAPE_CONFIG.birds.spread)
    }
  })

  test('the same survey sites the same colonies', () => {
    expect(planColonies(survey, SCAPE_CONFIG)).toEqual(colonies)
  })

  /**
   * The graceful absence. A spread nothing on this coast can fit takes the birds
   * out of the scape rather than dropping them somewhere arbitrary — and zero,
   * like every other strength in the config, is the switch.
   */
  test('a spread no water can hold leaves the coast empty', () => {
    expect(planColonies(survey, withBirds({ spread: 0 }))).toEqual([])
  })

  /**
   * The other absence, and the one the shrink floor is for: a coast with no open
   * water off it fits no ring at any radius, so it carries no flock rather than
   * a flock over the fields.
   */
  test('dry ground off every bank leaves the coast empty', () => {
    const dry = { ...survey, field: { ...survey.field, heightAt: () => 10 }}

    expect(planColonies(dry, SCAPE_CONFIG)).toEqual([])
  })

  test('a tighter ring is easier to fit, never harder', () => {
    const tight = planColonies(survey, withBirds({ spread: SCAPE_CONFIG.birds.spread * 0.5 }))

    expect(tight.length).toBeGreaterThanOrEqual(colonies.length)
  })
})


/**
 * The cliff rings, which are the half of a colony that is not on the rock.
 *
 * Every claim here is about the *band* rather than about the search, because
 * the search is the one the harbour flocks already pass. What is new is that a
 * ring can be pinned in metres instead of hanging at the live ceiling, and
 * every way that goes wrong — a band that misses the face, a band inverted, a
 * band on a headland with no birds on it — is invisible from any pose but one.
 */
describe('the flocks off the bird cliffs', () => {
  const ledges = colonies.filter(colony => colony.kind === 'ledge')

  test('every headland the colony gate takes carries one', () => {
    expect([ ...ledges.map(colony => colony.id) ].sort()).toEqual([ ...birdCliffs ].sort())
    expect(birdCliffs.length).toBeGreaterThan(0)
  })

  /**
   * The claim: the air a cliff flock flies in is the air over its own face.
   *
   * Stated against the ledges rather than against the numbers the planner used,
   * so a change to either side has to move both to stay true.
   */
  test('the band runs from the lowest ledge to the air over the lip', () => {
    for (const colony of ledges) {
      const landmass = survey.landmasses.find(island => island.id === colony.id)

      expect(landmass).toBeDefined()

      const local = { ...landmass!.config, ledges: SCAPE_CONFIG.ledges }
      const crag  = landmass!.survey.crag!
      const tiers = ledgeTiers(crag, local)
      const water = SCAPE_CONFIG.terrain.waterLevel

      expect(colony.band).not.toBeNull()
      expect(colony.band!.low).toBeCloseTo(tiers[0] - water, 6)
      expect(colony.band!.high).toBeCloseTo(crag.lip - water + SCAPE_CONFIG.ledges.wheel, 6)
      expect(colony.band!.high).toBeGreaterThan(colony.band!.low)
    }
  })

  test('the flocks over open water are not pinned to anything', () => {
    for (const colony of colonies.filter(flock => flock.kind !== 'ledge'))
      expect(colony.band).toBeNull()
  })

  /** `wheel` at 0 is a flock level with its own clifftop, and still a flock. */
  test('no air over the lip stops the band at the lip', () => {
    for (const colony of planColonies(survey, withLedges({ wheel: 0 })).filter(f => f.kind === 'ledge')) {
      const crag = survey.landmasses.find(island => island.id === colony.id)!.survey.crag!

      expect(colony.band!.high).toBeCloseTo(crag.lip - SCAPE_CONFIG.terrain.waterLevel, 6)
    }
  })

  /**
   * The absence, by the route every other switch in this scape takes. A gate no
   * headland clears is a coast with no cliff flocks on it — the harbour rings
   * are untouched, which is the half of the claim a count alone would miss.
   */
  test('a face gate nothing clears leaves the cliffs empty and the harbours alone', () => {
    const bare = planColonies(survey, withLedges({ face: 1e4 }))

    expect(bare.filter(colony => colony.kind === 'ledge')).toEqual([])
    expect(bare.length).toBe(colonies.length - ledges.length)
  })

  test('a cliff ring is worth `ledges.flock` harbour rings and a harbour ring is worth one', () => {
    for (const colony of colonies)
      expect(colony.wheel).toBe(colony.kind === 'ledge' ? SCAPE_CONFIG.ledges.flock : 1)
  })
})
