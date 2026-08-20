import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import { planColonies } from './colony.ts'


const survey   = surveyArchipelago(SCAPE_CONFIG)
const colonies = planColonies(survey, SCAPE_CONFIG)

function withBirds (birds: Partial<typeof SCAPE_CONFIG.birds>) {
  return { ...SCAPE_CONFIG, birds: { ...SCAPE_CONFIG.birds, ...birds }}
}


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
