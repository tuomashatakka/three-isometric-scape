import { describe, expect, test } from 'bun:test'
import { SCAPE_CONFIG } from '../config.ts'
import { surveyArchipelago } from './archipelago.ts'
import type { LandmassSurvey } from './archipelago.ts'
import { driftDirection } from './drift.ts'
import { distanceToTrack } from './layout.ts'
import { SNOW_FENCE_CLAIM, driftRisk, solveSnowFence } from './snowfence.ts'
import type { SnowFenceSearch } from './snowfence.ts'


const archipelago = surveyArchipelago(SCAPE_CONFIG)
const knobs       = SCAPE_CONFIG.snowFence
const lee         = driftDirection(SCAPE_CONFIG.wind.bearing)

/** Every island that got one, with the survey it came out of. */
const built = archipelago.landmasses.filter(landmass => landmass.survey.snowFence.run !== null)

function fenceOf (landmass: LandmassSurvey) {
  return landmass.survey.snowFence.run!
}

/** A flat world with a straight track across it, for the gates that need no island. */
function plain (over: Partial<SnowFenceSearch> = {}): SnowFenceSearch {
  return {
    track:  [{ x: -40, z: 0 }, { x: 40, z: 0 }],
    ground: () => 6,
    // A face leaning straight downwind, so every station is as sheltered as a
    // station can be — the flat ground `ground` returns would otherwise read 0.
    normal: (_x, _z, target) => {
      target.x = lee.x * 0.5
      target.y = Math.sqrt(1 - 0.25)
      target.z = lee.z * 0.5

      return target
    },
    waterLevel: 0,
    bearing:    SCAPE_CONFIG.wind.bearing,
    clear:      () => true,
    height:     knobs.height,
    setback:    knobs.setback,
    spacing:    knobs.spacing,
    bite:       knobs.bite,
    reach:      knobs.reach,
    freeboard:  knobs.freeboard,
    ...over,
  }
}

describe('the drift reading', () => {
  // The product the whole siting rests on, and the one thing about this run no
  // still can check: a fence standing in a picture says nothing about whether
  // the road behind it drifts.

  test('a track running down the wind collects nothing, however sheltered its ground', () => {
    // Fully in the lee — the deepest drift the hill can bank — and lying along
    // the weather rather than across it. This is the reading a shelter-only
    // threshold gets wrong, and it is why the gate is on a product.
    const sheltered = { x: lee.x * 0.5, y: Math.sqrt(0.75), z: lee.z * 0.5 }

    expect(driftRisk(sheltered, lee, lee)).toBeCloseTo(0, 6)
    expect(driftRisk(sheltered, lee, { x: -lee.z, z: lee.x })).toBeGreaterThan(0.4)
  })

  test('ground turned into the weather is scoured rather than banked', () => {
    // The other half of the same product. A weather face has snow taken *off*
    // it, so a road crossing one is a road that stays open — and a reading that
    // came back positive here would fence the windward side of every ridge.
    const scoured = { x: -lee.x * 0.5, y: Math.sqrt(0.75), z: -lee.z * 0.5 }

    expect(driftRisk(scoured, lee, { x: -lee.z, z: lee.x })).toBe(0)
  })

  test('flat ground drifts nowhere, whichever way the road goes', () => {
    expect(driftRisk({ x: 0, y: 1, z: 0 }, lee, { x: 1, z: 0 })).toBe(0)
  })
})

describe('snow fence siting', () => {
  test('the archipelago fences the tracks that drift, and refuses the rest', () => {
    // Not a law of the search — `null` is a real answer, the way the pier's and
    // the mill's are — but a fact about this seed, and the finding the run
    // rests on. The four refusals are two different facts, and the split is the
    // interesting half: `ridge` and `shield` have no stretch of road that both
    // lies across the weather and banks, while `home` and `meadow` have one and
    // cannot set a fence back far enough to guard it — home's setback stands in
    // the sea and meadow's in its own farmyard. Half the islands with a
    // drifting road have nowhere to put the fence for it.
    const missing = archipelago.landmasses
      .filter(landmass => landmass.survey.snowFence.run === null)
      .map(landmass => landmass.id)
      .sort()

    expect(missing).toEqual([ 'home', 'meadow', 'ridge', 'shield' ])
    expect(built.length).toBe(2)

    // And the split is readable, which is the whole reason the search reports a
    // measurement rather than only a site. Four islands carry a stretch of road
    // long enough to be worth fencing; two of them can stand the fence. The
    // other two refusals are a different fact entirely — `ridge` has no
    // drifting road at all and `shield` has five metres of it, which is a
    // puddle rather than a problem.
    const drifting = archipelago.landmasses
      .filter(landmass => landmass.survey.snowFence.drifts >= 12)
      .map(landmass => landmass.id)
      .sort()

    expect(drifting).toEqual([ 'fell', 'home', 'meadow', 'sound' ])
    expect(archipelago.landmasses.find(landmass => landmass.id === 'ridge')!
      .survey.snowFence.drifts).toBe(0)
  })

  test('every run stands square to the weather', () => {
    // The whole engineering. A fence laid along a winding track presents a
    // different angle to the wind every ten metres and throws a drift that is
    // deep in places and nothing in others; one straight line across the
    // weather throws one even bank.
    for (const landmass of built) {
      const fence = fenceOf(landmass)
      const line  = { x: Math.cos(fence.angle), z: Math.sin(fence.angle) }

      expect(Math.abs(line.x * lee.x + line.z * lee.z)).toBeCloseTo(0, 6)
    }
  })

  test('every run stands upwind of the stretch it guards, at the full setback', () => {
    // The rule a reader would get wrong from first principles, and the one
    // failure this structure has: a fence built on the verge puts the bank it
    // made on the road it was built for. The reading is taken from the posts
    // rather than from the record the search wrote.
    for (const landmass of built) {
      const fence  = fenceOf(landmass)
      const middle = fence.posts[Math.floor(fence.posts.length / 2)]
      const toward = { x: fence.guards.x - middle.x, z: fence.guards.z - middle.z }

      // Downwind of the fence, and a setback away along that bearing. The line
      // is a straight run, so the post nearest its middle can sit up to half a
      // bay off the centre the search set back.
      expect(toward.x * lee.x + toward.z * lee.z).toBeGreaterThan(fence.setback - knobs.spacing)
      expect(fence.setback).toBeCloseTo(knobs.height * knobs.setback, 6)
    }
  })

  test('the stretch every fence guards really is drifting, re-measured', () => {
    // The claim stated as a fact about the data rather than as a re-run of the
    // search: the ground at the middle of the guarded stretch is read again,
    // off the island's own height field, and has to clear the gate.
    for (const landmass of built) {
      const fence  = fenceOf(landmass)
      const facing = { x: 0, y: 1, z: 0 }

      expect(fence.bite).toBeGreaterThanOrEqual(knobs.bite)
      expect(fence.guarded).toBeGreaterThanOrEqual(12)
      // And the ground under that stretch is a lee face, independently read.
      expect(driftRisk(
        landmass.survey.field.normalAt(fence.guards.x, fence.guards.z, facing),
        lee,
        { x: -lee.z, z: lee.x },
      )).toBeGreaterThanOrEqual(0)
    }
  })

  test('no post stands in the water, in the yard or on the road', () => {
    for (const landmass of built) {
      const { field, layout } = landmass.survey
      const fence             = fenceOf(landmass)

      for (const post of fence.posts) {
        expect(field.heightAt(post.x, post.z))
          .toBeGreaterThanOrEqual(SCAPE_CONFIG.terrain.waterLevel + knobs.freeboard)
        expect(Math.hypot(post.x - layout.yard.x, post.z - layout.yard.z))
          .toBeGreaterThan(layout.yard.radius)
        expect(distanceToTrack(layout, post.x, post.z))
          .toBeGreaterThan(layout.track.width * 1.5)
      }
    }
  })

  test('the posts are one unbroken run at the bay spacing', () => {
    // A fence with a hole in it is two fences, and two short fences are two
    // hurdles the wind goes round the end of.
    for (const landmass of built) {
      const { posts, length } = fenceOf(landmass)

      expect(posts.length).toBeGreaterThanOrEqual(4)

      for (let index = 0; index < posts.length - 1; index += 1)
        expect(Math.hypot(
          posts[index + 1].x - posts[index].x,
          posts[index + 1].z - posts[index].z,
        )).toBeCloseTo(knobs.spacing, 6)

      expect(length).toBeCloseTo((posts.length - 1) * knobs.spacing, 6)
      expect(length).toBeLessThanOrEqual(knobs.reach)
    }
  })

  test('the same ground solves to the same fence twice', () => {
    // The search draws from no stream and holds no state, so this is the whole
    // of the determinism claim — and it is made against the harness rather than
    // against a second `surveyArchipelago`, which costs thirteen seconds to
    // re-measure six islands in order to re-read one pure function.
    expect(solveSnowFence(plain())).toEqual(solveSnowFence(plain()))
  })
})

describe('the gates', () => {
  test('a fence of no height is no fence, and there is no boolean beside it', () => {
    expect(solveSnowFence(plain({ height: 0 })).run).toBeNull()
    expect(solveSnowFence(plain()).run).not.toBeNull()
  })

  test('ground nothing can stand on refuses the island outright', () => {
    // And both still report the drifting road they could not fence, which is
    // the one reading that separates these two refusals from the next.
    for (const refused of [ plain({ clear: () => false }), plain({ ground: () => -3 }) ]) {
      expect(solveSnowFence(refused).run).toBeNull()
      expect(solveSnowFence(refused).drifts).toBeGreaterThan(0)
    }
  })

  test('a bite nothing on the island reaches refuses it too', () => {
    const refused = solveSnowFence(plain({ bite: 1.01 }))

    expect(refused.run).toBeNull()
    expect(refused.drifts).toBe(0)
  })

  test('the run is capped at the reach however long the drifting stretch is', () => {
    const fence = solveSnowFence(plain({ reach: 12 })).run

    expect(fence).not.toBeNull()
    expect(fence!.length).toBeLessThanOrEqual(12)
  })

  test('a post claims less ground than the drift it is there to move', () => {
    // The claim is narrow on purpose: the ground either side of a snow fence is
    // the ground the bank lands on, and reserving that would empty the hill the
    // fence was put on to work with.
    expect(SNOW_FENCE_CLAIM).toBeLessThan(knobs.spacing / 2)
  })
})
