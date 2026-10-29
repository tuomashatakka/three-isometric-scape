import { SCAPE_CONFIG } from '../src/scene/config.ts'
import { surveyArchipelago } from '../src/scene/landscape/archipelago.ts'
import { createDressing } from '../src/scene/landscape/dressing.ts'
import { createScapeMaterials } from '../src/scene/props/material.ts'
import { atmosphereQuality, isAtmosphereQualityTier } from '../src/scene/quality.ts'
import { parseArgs } from './args.ts'


/**
 * What the page's first load spends on the CPU, without a browser: the
 * archipelago survey and the dressing, timed, and a fingerprint of everything
 * the dressing placed.
 *
 *   bun run scape:bench                    # mobile tier
 *   bun run scape:bench --tier ultra       # the heaviest dressing
 *   bun --cpu-prof scripts/scape-bench.ts  # where the time goes
 *
 * The fingerprint is the proof a build-time optimisation needs: run it on main
 * and on the branch, and if the two lines differ the change moved the world,
 * whatever it claimed. `scape:map --stats` is the same check for the survey.
 */

const args = parseArgs(Bun.argv.slice(2))
const tier = args.str('tier', 'mobile')

if (!isAtmosphereQualityTier(tier))
  throw new Error(`--tier wants minimal, mobile, desktop or ultra, not ${tier}`)

const config  = structuredClone(SCAPE_CONFIG)
const quality = atmosphereQuality(tier)
let started   = performance.now()
const world  = surveyArchipelago(config)
const survey = performance.now() - started

started = performance.now()

const dressing = createDressing(config, world, createScapeMaterials(() => config), quality)
const dressed  = performance.now() - started

let instances = 0
let print     = 0

dressing.object.traverse(object => {
  if (!('isInstancedMesh' in object))
    return

  const mesh  = object as unknown as { count: number, instanceMatrix: { array: ArrayLike<number> }}
  const cells = mesh.instanceMatrix.array

  instances += mesh.count
  for (let index = 0; index < cells.length; index += 1)
    print += cells[index] * (index % 13 + 1)
})

console.log(`${tier}  survey ${survey.toFixed(0)} ms  dressing ${dressed.toFixed(0)} ms  ` +
  `fingerprint ${instances} instances ${print.toFixed(6)}`)
