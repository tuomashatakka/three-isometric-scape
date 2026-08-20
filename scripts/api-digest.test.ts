import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'


/**
 * The digest is generated, so the thing worth testing is not its content but
 * that it still describes the runtime actually installed — and that the two
 * facts it exists to carry are true of it.
 *
 * A stale digest is worse than none: a run would read it, believe a symbol is
 * unavailable, and rebuild it. So this fails rather than warns when the version
 * drifts. `bun run brief` warns about the same drift without failing, which is
 * the right split — orientation reports, the gate refuses.
 */

const ROOT    = resolve(import.meta.dir, '..')
const digest  = readFileSync(resolve(ROOT, 'threejs-scene-api.md'), 'utf8')
const version = JSON.parse(readFileSync(resolve(ROOT, 'node_modules/threejs-scene/package.json'), 'utf8')).version

describe('the api digest', () => {
  test('is stamped with the installed version', () => {
    expect(digest.match(/^# threejs-scene (\S+)/)?.[1]).toBe(version)
  })

  test('covers every subpath this repo can import from', () => {
    for (const entry of [
      'threejs-scene',
      'threejs-scene/modules/lighting',
      'threejs-scene/modules/post',
      'threejs-scene/modules/post/webgl',
      'threejs-scene/modules/assets',
    ])
      expect(digest).toContain(`## \`${entry}\``)
  })

  test('resolves symbols through both barrel forms', () => {
    // An explicit `export { … } from`, a wildcard `export * from` two levels
    // deep (geometry/ribbon.ts), and a type-only re-export. If the parser
    // regresses to one form, one of these goes missing rather than everything.
    expect(digest).toContain('`createApp`')
    expect(digest).toContain('`createSurfaceRibbon`')
    expect(digest).toContain('`rasterizeAscii`')
    expect(digest).toContain('`AppModule`')
  })

  test('knows what this scape actually uses', () => {
    const row = (name: string): string =>
      digest.split('\n').find(line => line.startsWith(`| \`${name}\``)) ?? ''

    // Used, and the call site is named — the digest is only worth reading if
    // "used" means "here".
    expect(row('createSurfaceRibbon')).toContain('cart-ruts.ts')
    expect(row('createApp')).toContain('create-isometric-scape.ts')

    // Unused, and this one is load-bearing: it is the next thing to adopt, and
    // a digest that quietly called it used would hide that.
    expect(row('attachPointerGesture')).toMatch(/\|\s*—\s*\|$/)
  })

  test('counts something', () => {
    const counted = digest.match(/\*\*(\d+) of (\d+) exports used/)

    expect(counted).toBeTruthy()
    expect(Number(counted?.[2])).toBeGreaterThan(200)
    expect(Number(counted?.[1])).toBeGreaterThan(20)
  })
})
