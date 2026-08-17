import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { CATALOGUE_TEXTURES, TEXTURES, createTextureCatalogue } from './catalogue.ts'


const SCENE = new URL('..', import.meta.url).pathname

/** The calls that put a texture on the gpu. Anything here has to be catalogued. */
const CONSTRUCTORS = /new DataTexture\(|createNoiseTexture\(|createSeamlessNoiseTexture\(|createCinematicLUT\(/u

function sourceFiles (root: string): string[] {
  return readdirSync(root).flatMap(name => {
    const path = join(root, name)

    if (statSync(path).isDirectory())
      return sourceFiles(path)

    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [ path ] : []
  })
}


describe('the texture catalogue', () => {
  test('names every id exactly once', () => {
    const ids = TEXTURES.map(entry => entry.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  test('says something useful about every one of them', () => {
    for (const entry of TEXTURES) {
      expect(entry.purpose.length).toBeGreaterThan(12)
      expect(entry.module).toMatch(/\.ts$/u)
      expect(entry.consumers.length).toBeGreaterThan(0)
      expect(entry.size).toBeGreaterThan(0)
    }
  })

  /**
   * The rule the catalogue exists to make keepable.
   *
   * A texture built somewhere in `src/scene` that this roster has never heard of
   * is exactly the state the catalogue was written to end — a map nobody can
   * find, whose size and wrap mode are written out again where it happened to be
   * needed. So the roster is checked against the source rather than trusted.
   */
  test('accounts for every module in the scene that builds one', () => {
    const known = new Set(TEXTURES.map(entry => entry.module))
    const found = sourceFiles(SCENE)
      .filter(path => CONSTRUCTORS.test(readFileSync(path, 'utf8')))
      .map(path => relative(SCENE, path))
      .filter(path => !known.has(path))

    expect(found).toEqual([])
  })

  test('builds each of its own on first ask, and hands the same one back after', () => {
    const catalogue = createTextureCatalogue(11)

    for (const id of CATALOGUE_TEXTURES) {
      const first = catalogue.get(id)

      expect(first.name).toBe(id)
      expect(catalogue.get(id)).toBe(first)
    }

    catalogue.dispose()
  })

  test('two catalogues on one seed agree, and on two seeds do not', () => {
    const a = createTextureCatalogue(11)
    const b = createTextureCatalogue(11)
    const c = createTextureCatalogue(12)

    const read = (catalogue: ReturnType<typeof createTextureCatalogue>): number[] =>
      [ ...(catalogue.get('ground.grain').image as { data: Uint8Array }).data.slice(0, 64) ]

    expect(read(a)).toEqual(read(b))
    expect(read(a)).not.toEqual(read(c))

    a.dispose()
    b.dispose()
    c.dispose()
  })

  test('the ground’s two octaves are two different fields, not one read twice', () => {
    // The whole reason `ground.wear` exists. A single field sampled at two
    // frequencies is self-similar, so the broad patches landed exactly where the
    // fine grit was already darkest and the two reinforced into a weave.
    const catalogue = createTextureCatalogue(7_319)
    const grain     = (catalogue.get('ground.grain').image as { data: Uint8Array }).data
    const wear      = (catalogue.get('ground.wear').image as { data: Uint8Array }).data

    expect([ ...grain.slice(0, 32) ]).not.toEqual([ ...wear.slice(0, 32) ])
    catalogue.dispose()
  })

  test('refuses to hand out a map it does not build, rather than answering nothing', () => {
    const catalogue = createTextureCatalogue(1)

    expect(() => catalogue.get('mist.field')).toThrow(/baked/u)
    catalogue.dispose()
  })

  test('reports what it has actually spent, not what it might', () => {
    const catalogue = createTextureCatalogue(1)

    expect(catalogue.describe()).toStartWith(`0/${CATALOGUE_TEXTURES.length}`)
    catalogue.get('prop.bark')
    expect(catalogue.describe()).toStartWith(`1/${CATALOGUE_TEXTURES.length}`)

    catalogue.dispose()
    expect(catalogue.describe()).toStartWith(`0/${CATALOGUE_TEXTURES.length}`)
  })
})
