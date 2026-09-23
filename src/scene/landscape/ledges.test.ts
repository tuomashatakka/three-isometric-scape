import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import type { ScapeConfig } from '../config.ts'
import { surveyArchipelago, toLocal } from './archipelago.ts'
import { cragClaim, cragFoot } from './crag.ts'
import {
  colonyAshore,
  faceHeight,
  guanoClaim,
  isBirdCliff,
  ledgeBirds,
  ledgeTiers,
  planCliffColonies,
} from './ledges.ts'
import { birdAshore } from './seabirds.ts'


const clone  = (): ScapeConfig => structuredClone(SCAPE_CONFIG) as ScapeConfig
const config = clone()
const world  = surveyArchipelago(config)
const water  = config.terrain.waterLevel

/** The budget the desktop tier deals, which is what `scape:map` reports against. */
const BUDGET = 30

const colonies = planCliffColonies(world, config, BUDGET)
const birds    = ledgeBirds(colonies)

/** Every island in the archipelago that has a headland at all. */
const headlands = world.landmasses.filter(land => land.survey.crag)


describe('the search for a bird cliff', () => {
  test('every headland in the archipelago carries a colony', () => {
    expect(headlands.length).toBe(5)
    expect(colonies.length).toBe(headlands.length)
    expect(birds.length).toBeGreaterThan(100)
  })

  test('the island with no crag on it gets no birds', () => {
    const bare = world.landmasses.find(land => !land.survey.crag)

    expect(bare).toBeDefined()
    expect(colonies.some(cliff => cliff.id === bare?.id)).toBe(false)
  })

  test('the gate refuses every headland once it asks for more face than there is', () => {
    const taller = clone()

    taller.ledges.face = faceHeight(headlands[0].survey.crag!, config) + 0.5

    expect(planCliffColonies(world, taller, BUDGET)).toHaveLength(0)
  })

  test('a colony that never lands is a colony with no birds in it', () => {
    const away = clone()

    away.ledges.ashore = 0

    expect(planCliffColonies(world, away, BUDGET)).toHaveLength(0)
  })

  test('no tiers is an empty cliff, and it is the same refusal', () => {
    const flat = clone()

    flat.ledges.tiers = 0

    expect(ledgeTiers(headlands[0].survey.crag!, flat)).toHaveLength(0)
    expect(planCliffColonies(world, flat, BUDGET)).toHaveLength(0)
  })

  test('the tier budget is what decides how many, and mobile fits inside ultra', () => {
    const mobile = ledgeBirds(planCliffColonies(world, config, 14))
    const ultra  = ledgeBirds(planCliffColonies(world, config, 56))

    expect(mobile.length).toBeGreaterThan(0)
    expect(mobile.length).toBeLessThan(birds.length)
    expect(birds.length).toBeLessThanOrEqual(ultra.length)
  })

  test('one seed builds one colony, bird for bird', () => {
    const again = planCliffColonies(world, clone(), BUDGET)

    expect(ledgeBirds(again)).toEqual(birds)
  })
})


describe('where the birds ended up', () => {
  // Every bird, back in the frame its own island's crag is solved in.
  const local = colonies.flatMap(cliff => {
    const landmass = world.landmasses.find(land => land.id === cliff.id)!

    return cliff.birds.map(bird => ({ cliff, ...toLocal(landmass, bird), y: bird.y }))
  })

  test('every one of them is standing on the crag rather than beside it', () => {
    for (const bird of local)
      expect(cragClaim(bird.cliff.crag, bird.x, bird.z)).toBeGreaterThan(0)
  })

  test('the band sits between the wash below and the turf above', () => {
    const { foot, brow } = config.ledges

    for (const bird of local) {
      const up = (bird.y - water) / bird.cliff.face

      // A little slack either way: the perch stands the bird off the rock along
      // its own normal, which on seventy degrees of ground carries it a few
      // centimetres up as well as out.
      expect(up).toBeGreaterThan(foot - 0.04)
      expect(up).toBeLessThan(brow + 0.04)
    }
  })

  test('the rows are ordered, and none of them is under water', () => {
    for (const cliff of colonies) {
      expect(cliff.tiers).toHaveLength(config.ledges.tiers)

      for (const [ index, level ] of cliff.tiers.entries()) {
        expect(level).toBeGreaterThan(water)

        if (index > 0)
          expect(level).toBeGreaterThan(cliff.tiers[index - 1])
      }
    }
  })
})


describe('the year the colony answers to', () => {
  const { ashore } = config.ledges

  test('midsummer fills the cliff and midwinter empties it', () => {
    expect(colonyAshore(0.5, ashore)).toBe(1)
    expect(colonyAshore(0, ashore)).toBe(0)
  })

  test('the window closes at both ends of the year, not one', () => {
    expect(colonyAshore(0.5 - ashore * 0.6, ashore)).toBe(0)
    expect(colonyAshore(0.5 + ashore * 0.6, ashore)).toBe(0)
  })

  test('a colony that never leaves is the other end of the same knob', () => {
    expect(colonyAshore(0, 1)).toBe(1)
    expect(colonyAshore(0.5, 0)).toBe(0)
  })

  test('the cliff fills in an order rather than all at once', () => {
    const early = birds.reduce((keenest, bird) => Math.min(keenest, bird.keen), 1)
    const late  = birds.reduce((keenest, bird) => Math.max(keenest, bird.keen), 0)

    expect(late).toBeGreaterThan(early)

    // Somewhere in the ramp there is a week with some of the colony ashore and
    // the rest of it still at sea. That is the claim; a step would have none.
    const partway = colonyAshore(0.5 - ashore * 0.47, ashore)

    expect(birdAshore(partway, early)).toBeGreaterThan(birdAshore(partway, late))
  })

  test('every bird is fully ashore at midsummer and gone at midwinter', () => {
    for (const bird of birds) {
      expect(birdAshore(colonyAshore(0.5, ashore), bird.keen)).toBe(1)
      expect(birdAshore(colonyAshore(0, ashore), bird.keen)).toBe(0)
    }
  })
})


describe('the whitewash on the rock', () => {
  const cliff = colonies[0]
  const land  = world.landmasses.find(current => current.id === cliff.id)!
  const crag  = cliff.crag

  /** A point on the face at a share of its height, on the middle of the headland. */
  type OnFaceReturnType = { x: number, z: number, height: number }

  function onFace (up: number): OnFaceReturnType {
    const height = water + cliff.face * up
    const shore  = crag.shoreAt(crag.bearing)

    for (let radius = shore + 4; radius >= shore - 30; radius -= 0.2) {
      const x = Math.cos(crag.bearing) * radius
      const z = Math.sin(crag.bearing) * radius

      if (land.survey.field.heightAt(x, z) >= height)
        return { x, z, height }
    }

    throw new Error('no face at that height')
  }

  test('the nesting band is marked', () => {
    const { foot, brow } = config.ledges
    const middle         = onFace((foot + brow) * 0.5)

    expect(guanoClaim(crag, config, middle.x, middle.z, middle.height)).toBeGreaterThan(0.2)
  })

  test('the turf over the brow is clean, and so is the ground below the wash', () => {
    // The same point on the rock, asked about at three heights. The drawn face
    // stops short of the nominal lip, so there is no ground to stand on over the
    // brow at all — which is why this asks the query rather than the terrain.
    const top   = onFace(config.ledges.brow - 0.02)
    const above = water + cliff.face * (config.ledges.brow + 0.2)

    expect(guanoClaim(crag, config, top.x, top.z, top.height)).toBeGreaterThan(0)
    expect(guanoClaim(crag, config, top.x, top.z, above)).toBe(0)
    expect(guanoClaim(crag, config, top.x, top.z, water - 1)).toBe(0)
  })

  test('nothing off the headland is stained', () => {
    const away = crag.bearing + Math.PI
    const at   = crag.shoreAt(away) - 4
    const x    = Math.cos(away) * at
    const z    = Math.sin(away) * at

    expect(cragClaim(crag, x, z)).toBe(0)
    expect(guanoClaim(crag, config, x, z, land.survey.field.heightAt(x, z))).toBe(0)
  })

  test('the sea scrubs what it reaches: no stain survives a full wash', () => {
    const { stain } = config.ledges

    let over = 0

    for (let step = 0; step <= 90; step += 1) {
      const bearing = crag.bearing + (step / 90 - 0.5) * crag.arc * 2.4
      const shore   = crag.shoreAt(bearing)

      for (let out = -12; out <= 8; out += 0.5) {
        const x      = Math.cos(bearing) * (shore + out)
        const z      = Math.sin(bearing) * (shore + out)
        const height = land.survey.field.heightAt(x, z)
        const bound  = stain * (1 - cragFoot(crag, x, z))

        over = Math.max(over, guanoClaim(crag, config, x, z, height) - bound)
      }
    }

    expect(over).toBeLessThanOrEqual(1e-9)
  })

  test('the stain is its own switch, and it is not the birds’', () => {
    const clean          = clone()
    const { foot, brow } = clean.ledges

    clean.ledges.stain = 0

    const middle = onFace((foot + brow) * 0.5)

    expect(guanoClaim(crag, clean, middle.x, middle.z, middle.height)).toBe(0)

    // And the colony is still there, which is the point of their being two
    // numbers: a tier with no birds in it still gets a cliff that reads as one.
    expect(isBirdCliff(crag, clean)).toBe(true)
    expect(planCliffColonies(world, clean, BUDGET).length).toBe(colonies.length)
  })
})
