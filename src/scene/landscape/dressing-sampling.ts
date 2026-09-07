import type { SeededRng } from 'threejs-scene'
import type { ScapeConfig } from '../config.ts'
import type { ArchipelagoSurvey } from './archipelago.ts'
import { planGrazing } from './grazing.ts'
import { createDiscSampler, createSpotSampler } from './samplers.ts'


/**
 * What the darts are thrown at, and how many of them each feature gets.
 *
 * Split off `dressing.ts` the run the treeline arrived, and the seam is a real
 * one rather than a line count: everything in here answers *where a candidate
 * spot comes from* — the island at large, or one of the discs the composition
 * already found — and nothing in it knows what will be stood on the spot. The
 * placement rules that do are in `dressing-zones.ts`, and the module that puts
 * geometry on the ground is what is left.
 *
 * The samplers are built in a fixed order off the shared rng, and that order is
 * load-bearing: each `createDiscSampler` forks the stream, so reordering these
 * declarations reshuffles every prop in the scape.
 */
export function createDressingSampling (
  config:      ScapeConfig,
  archipelago: ArchipelagoSurvey,
  rng:         SeededRng,
) {
  const sampleSpot = createSpotSampler(archipelago, rng)
  const pastures   = archipelago.landmasses.flatMap(landmass => {
    const pasture = landmass.survey.layout.pasture

    return pasture
      ? [{
        x:      pasture.x + landmass.origin.x,
        z:      pasture.z + landmass.origin.z,
        radius: pasture.radius,
      }]
      : []
  })
  const yards = archipelago.landmasses.map(landmass => ({
    x:      landmass.survey.layout.yard.x + landmass.origin.x,
    z:      landmass.survey.layout.yard.z + landmass.origin.z,
    radius: landmass.survey.layout.yard.radius * 0.72,
  }))
  const harbours = archipelago.landmasses.flatMap(landmass => {
    const harbour = landmass.survey.harbour

    return harbour
      ? [{
        x:      harbour.x + landmass.origin.x,
        z:      harbour.z + landmass.origin.z,
        radius: 30,
      }]
      : []
  })
  // The turf cuttings, one per island that has one. A working is a hundred and
  // twenty square metres of a landmass that is tens of thousands, so it takes a
  // disc of its own for the reason the pasture does — darts thrown at the island
  // land on it about never.
  const workings = archipelago.landmasses.flatMap(landmass => {
    const peat = landmass.survey.peat

    return peat
      ? [{
        x:      peat.floor.x + landmass.origin.x,
        z:      peat.floor.z + landmass.origin.z,
        radius: peat.floor.radius,
      }]
      : []
  })
  // The flocks are surveyed, not sampled: `grazing.ts` walks out from each yard
  // and hands back the discs of hill a farm would turn its stock out onto. What
  // the dressing does with them is what it does with the pasture — one sampler
  // over all of them, and one per flock so every farm keeps its own sheep.
  const grazings      = planGrazing(archipelago, config)
  const samplePasture = createDiscSampler(rng, pastures)
  const sampleYard    = createDiscSampler(rng, yards)
  const sampleHarbour = createDiscSampler(rng, harbours)
  const sampleGrazing = createDiscSampler(rng, grazings)
  const samplePeat    = createDiscSampler(rng, workings)
  const pastureQuota  = pastures.map(feature => createDiscSampler(rng, [ feature ]))
  const grazingQuota  = grazings.map(feature => createDiscSampler(rng, [ feature ]))
  const yardQuota     = yards.map(feature => createDiscSampler(rng, [ feature ]))
  const harbourQuota  = harbours.map(feature => createDiscSampler(rng, [ feature ]))
  const peatQuota     = workings.map(feature => createDiscSampler(rng, [ feature ]))
  const homeArea      = config.terrain.size ** 2

  // Weighted by each island's own `detail`, which is what keeps a landmass of
  // ten times the area from multiplying every budget in the scape by ten. A
  // budget is a count, so leaving this alone would not have thinned the outer
  // islands — it would have thickened the whole archipelago, and put the
  // placement solver, which is O(claims) per attempt, through six times the work
  // for ground the camera rarely reaches.
  const areaScale     = archipelago.landmasses.reduce(
    (total, landmass) => total + landmass.config.terrain.size ** 2 * landmass.detail,
    0,
  ) / homeArea

  return {
    sampleSpot,
    samplePasture,
    sampleYard,
    sampleHarbour,
    sampleGrazing,
    samplePeat,
    pastureQuota,
    yardQuota,
    harbourQuota,
    grazingQuota,
    peatQuota,
    grazings,
    workings,
    areaScale,
  }
}
