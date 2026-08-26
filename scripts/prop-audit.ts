#!/usr/bin/env bun

/**
 * Audit every prop in the registry for floating, detached, buried, and heavy
 * geometry. Uses threejs-scene's `reviewProp` which measures built props and
 * reports what a person would say looking at them.
 *
 * Wrapped outputs are advisory only — a floating cloud is fine, a floating
 * chair is not, and only the author knows which one this is. Exit code is
 * always 0; failures are reported in the output.
 *
 * Exit code 1 only on internal error (can't load palette, can't build a prop).
 */

import type { SeededRng } from 'threejs-scene'

import * as THREE from 'three'
import { createSeededRng } from 'threejs-scene'
import { Prop, reviewProp } from 'threejs-scene/modules/assets'

import type { NordicPalette, PropName } from '../src/scene/props/index.ts'
import { PROPS, resolvePalette } from '../src/scene/props/index.ts'


type PropBuilder = (rng: SeededRng, palette: NordicPalette) => THREE.BufferGeometry

const entries = Object.entries(PROPS) as Array<[PropName, PropBuilder]>

async function main () {
  try {
    const palette                                  = resolvePalette()
    const reviews: ReturnType<typeof reviewProp>[] = []

    for (const [ name, builder ] of entries)
      try {
        const rng      = createSeededRng(0xCAFEBABE).fork(name)
        const geometry = builder(rng, palette)

        // Wrap geometry in a basic material and mesh, then wrap in a Prop
        // (Prop is a THREE.Group, and reviewProp measures what's inside)
        const material = new THREE.MeshStandardMaterial({ color: 0x999999 })
        const mesh     = new THREE.Mesh(geometry, material)
        const prop     = new Prop(name)
        prop.add(mesh)

        const review = reviewProp(prop)
        reviews.push(review)

        // Dispose the geometry and material after audit
        geometry.dispose()
        material.dispose()
        prop.clear()
      }
      catch (e) {
        console.error(`prop:audit · ${name} · build failed`)
        console.error(e instanceof Error ? e.message : String(e))
        process.exit(1)
      }

    // Report all reviews in a table
    console.log(`\nprop:audit · ${reviews.length} props reviewed\n`)

    for (const review of reviews)
      console.log(review.report)

    // Check for any critical issues (notes other than floating/sinking)
    const withIssues = reviews.filter(r => r.notes.length > 0)
    if (withIssues.length > 0)
      console.log(`\n${withIssues.length} props with notes (see above)`)
  }
  catch (e) {
    console.error(`prop:audit · setup failed`)
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
}

main()
