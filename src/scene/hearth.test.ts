import { describe, expect, test } from 'bun:test'
import type { BufferAttribute } from 'three'
import { SCAPE_CONFIG } from './config.ts'
import { hearthDensity, hearthGeometry, plumeLean } from './hearth.ts'
import type { HearthStack } from './hearth.ts'
import { surveyHearths } from './landscape/hearths.ts'
import { surveyArchipelago } from './landscape/archipelago.ts'
import { LADDER, atmosphereQuality, unlockEffects } from './quality.ts'


const survey   = surveyArchipelago(SCAPE_CONFIG)
const stacks   = surveyHearths(survey)
const PUFFS    = 11
const seed     = 0x3f0d
const geometry = hearthGeometry(stacks, PUFFS, seed)

const read = (name: string): BufferAttribute => geometry.getAttribute(name) as BufferAttribute


describe('where the smoke comes from', () => {
  test('is a stack for every fire in the archipelago', () => {
    // Two unconditional — the farmhouse chimney and the sauna flue — plus the
    // smokehouse's ridge cowl on each island whose harbour had a dry bank
    // behind it, plus the croft's stone flue on each island whose ring of
    // islets had a rock free to build on. The last two are conditional because
    // the *buildings* are: see `landscape/smokehouse.ts` and `landscape/croft.ts`.
    const smoking = survey.landmasses.filter(landmass => landmass.survey.smokehouse).length
    const crofted = survey.landmasses.filter(landmass => landmass.survey.croft).length

    expect(stacks.length)
      .toBe(SCAPE_CONFIG.archipelago.landmasses.length * 2 + smoking + crofted)
  })

  /**
   * The claim, stated as a fact about the data rather than as a re-run of the
   * arithmetic: a plume starts *above the roof it comes through*.
   *
   * The failure this catches is real and not hypothetical. A building is
   * levelled onto the highest ground under its own footprint, and a chimney
   * stands 2.6 m off the middle of that footprint — so on a slope the mouth is
   * placed against one height and stands over another. Three metres of clearance
   * is comfortably under the shortest of the two stacks (the sauna's flue leaves
   * its ridge 5.1 m over its own floor) and comfortably over anything the ground
   * can do inside a yard the layout has already flattened.
   */
  test('every mouth stands clear of the ground under it', () => {
    const buried = stacks.filter(stack => stack.y - survey.field.heightAt(stack.x, stack.z) < 3)

    expect(buried).toEqual([])
  })

  test('every stack is over dry land', () => {
    const drowned = stacks.filter(stack =>
      survey.field.heightAt(stack.x, stack.z) <= SCAPE_CONFIG.terrain.waterLevel)

    expect(drowned).toEqual([])
  })

  /**
   * A stack belongs to the building it is on. The mouth is offset from the
   * standing's centre by the chimney's own place on the ridge, so anything past
   * the standing's radius plus a metre means the rotation was applied the wrong
   * way round — the failure a mirrored yaw produces, and the one that only shows
   * up on the seeds where a farmhouse does not happen to face square.
   */
  test('every stack sits on its own building', () => {
    const places = survey.landmasses.flatMap(landmass => {
      const { croft, places: steading, smokehouse } = landmass.survey

      // In the order `surveyHearths` publishes them, so the pairing below is
      // the identity rather than a lookup — a stack that has strayed onto its
      // neighbour's roof is exactly the failure this is here to catch.
      return [
        steading.farmhouse,
        steading.sauna,
        ...smokehouse ? [ smokehouse ] : [],
        ...croft ? [ croft ] : [],
      ]
        .map(place => ({
          x:     place.x + landmass.origin.x,
          z:     place.z + landmass.origin.z,
          reach: place.radius + 1,
        }))
    })

    const strayed = stacks
      .map((stack, which) => ({ stack, place: places[which] }))
      .filter(({ stack, place }) => Math.hypot(stack.x - place.x, stack.z - place.z) > place.reach)

    expect(strayed).toEqual([])
  })

  test('is the same survey every time it is asked', () => {
    expect(surveyHearths(survey)).toEqual(stacks)
  })
})

describe('the plume buffer', () => {
  test('is four corners and two triangles for every puff of every stack', () => {
    expect(read('position').count).toBe(stacks.length * PUFFS * 4)
    expect(geometry.getIndex()?.count).toBe(stacks.length * PUFFS * 6)
  })

  test('carries a stack and a puff beside every corner', () => {
    for (const name of [ 'position', 'aStack', 'aPuff' ])
      expect(read(name).count).toBe(stacks.length * PUFFS * 4)

    expect(read('aStack').itemSize).toBe(3)
    expect(read('aPuff').itemSize).toBe(4)
  })

  /**
   * The count buys continuity, so the queue has to be an even one: every puff
   * takes a fixed slot along the shared climb and only its character is drawn
   * from the rng. A slot that came out of the rng would leave gaps the eye reads
   * as a fire going out and coming back.
   */
  test('spaces the puffs evenly along one climb', () => {
    const slots = new Set<number>()
    const puff  = read('aPuff')

    // One corner of each puff of the first stack is enough: the four corners
    // repeat the same habits, which is the whole reason they are per-vertex.
    for (let which = 0; which < PUFFS; which += 1)
      slots.add(Number(puff.getX(which * 4).toFixed(6)))

    expect([ ...slots ].sort((a, b) => a - b)).toEqual(
      Array.from({ length: PUFFS }, (_, step) => Number((step / PUFFS).toFixed(6))),
    )
  })

  test('is byte for byte the same buffer for the same seed', () => {
    const again = hearthGeometry(stacks, PUFFS, seed)

    for (const name of [ 'position', 'aStack', 'aPuff' ])
      expect(Array.from(read(name).array)).toEqual(Array.from(
        (again.getAttribute(name) as BufferAttribute).array,
      ))

    expect(Array.from(geometry.getIndex()!.array)).toEqual(Array.from(again.getIndex()!.array))
  })

  test('is empty rather than broken when a tier has no puffs to give', () => {
    const none = hearthGeometry(stacks, 0, seed)

    expect(none.getAttribute('position').count).toBe(0)
    expect(none.getIndex()?.count).toBe(0)
  })

  test('is empty on an archipelago with no hearth in it', () => {
    const none = hearthGeometry([] as readonly HearthStack[], PUFFS, seed)

    expect(none.getAttribute('position').count).toBe(0)
  })
})

describe('how hard the fires burn', () => {
  test('a cold hearth smokes at every week of the year', () => {
    const off = { ...SCAPE_CONFIG, hearth: { ...SCAPE_CONFIG.hearth, smoke: 0 }}

    for (const growth of [ 0, 0.5, 1 ])
      expect(hearthDensity(off, growth)).toBe(0)
  })

  test('midsummer is the authored strength and nothing on top of it', () => {
    expect(hearthDensity(SCAPE_CONFIG, 1)).toBeCloseTo(SCAPE_CONFIG.hearth.smoke, 6)
  })

  /**
   * Strictly, at the authored tuning, and that is the whole point of the
   * tuning: `smoke * (1 + winter)` is held just under the ceiling, so every week
   * of the year is a different plume rather than a third of them being the same
   * fully opaque one. The clamp is a guard, not a working range — the test below
   * states that it is there and this one states that it is not in the way.
   */
  test('the colder the week the thicker the smoke', () => {
    const weeks = [ 1, 0.75, 0.5, 0.25, 0 ].map(growth => hearthDensity(SCAPE_CONFIG, growth))

    for (let step = 1; step < weeks.length; step += 1)
      expect(weeks[step]).toBeGreaterThan(weeks[step - 1])

    expect(weeks.at(-1)).toBeLessThan(1)
  })

  test('never runs past a fully opaque plume', () => {
    const banked = { ...SCAPE_CONFIG, hearth: { ...SCAPE_CONFIG.hearth, smoke: 1, winter: 4 }}

    expect(hearthDensity(banked, 0)).toBe(1)

    // And never turns back down on the way there: a clamp that a caller can walk
    // past is a plume that gets thinner as the year gets colder.
    expect(hearthDensity(banked, 0)).toBeGreaterThanOrEqual(hearthDensity(banked, 0.5))
  })
})

describe('what the wind does to a column', () => {
  test('a still day leaves it standing straight up', () => {
    expect(plumeLean(SCAPE_CONFIG, 0)).toBe(0)
  })

  test('a plume that answers nothing stands straight up in any wind', () => {
    const rigid = { ...SCAPE_CONFIG, hearth: { ...SCAPE_CONFIG.hearth, drag: 0 }}

    expect(plumeLean(rigid, 3)).toBe(0)
  })

  /**
   * The lean is metres and it is proportional to the rise, which is what keeps
   * a plume the same *shape* whatever it is asked to climb — the alternative is
   * a taller column that leans the same distance and reads as more upright.
   */
  test('leans in metres, in proportion to the climb', () => {
    const taller = { ...SCAPE_CONFIG, hearth: { ...SCAPE_CONFIG.hearth, rise: SCAPE_CONFIG.hearth.rise * 2 }}

    expect(plumeLean(taller, 1)).toBeCloseTo(plumeLean(SCAPE_CONFIG, 1) * 2, 6)
  })
})

describe('the tiers', () => {
  test('every tier answers how many puffs a plume is drawn from', () => {
    for (const tier of LADDER)
      expect(atmosphereQuality(tier).hearthPuffs).toBeGreaterThanOrEqual(0)
  })

  test('a phone asked for every effect gets a plume it can afford', () => {
    const unlocked = unlockEffects(atmosphereQuality('mobile'))

    expect(unlocked.hearthPuffs).toBeGreaterThan(0)
    expect(unlocked.hearthPuffs).toBeLessThanOrEqual(atmosphereQuality('desktop').hearthPuffs)
  })
})
