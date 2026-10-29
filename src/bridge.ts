import { InstancedMesh, Mesh } from 'three'
import type { Object3D, Scene, WebGLRenderer } from 'three'
import type { ConfigAccess, ConfigValue } from './scene/config-access.ts'


/**
 * The page's remote control, for `scripts/scape-studio.ts` and nothing else.
 *
 * Installed only under `?bridge`. A capture used to cost a full page load per
 * pose — module import, scene build, shader link — because the only way to move
 * a knob from outside was the url. With this, a long-lived page takes a write,
 * draws a few frames and is photographed: the camera, the hour, the season and
 * every per-frame knob move without a rebuild, and `rebuild()` covers the
 * build-time ones without reloading the bundle.
 */
export interface ScapeBridge {
  write(path: string, value: ConfigValue): void
  read(path: string): unknown
  rebuild(): void

  /** Put every leaf back to what the page opened with — the url's overrides included. */
  reset(): void

  /** Frames drawn since the current mount — the shutter waits on this. */
  drawn(): number

  /** Where the triangles and draws go, biggest first. */
  census(limit?: number): CensusRow[]

  /** The renderer's own counters for the last frame. */
  info(): { calls: number, triangles: number, programs: number, geometries: number, textures: number }
}

export interface CensusRow {
  name:      string
  kind:      string
  draws:     number
  triangles: number
  instances: number
}

export interface BridgeOptions {
  config:  ConfigAccess
  rebuild: () => void
  ctx:     () => { scene: Scene, renderer: WebGLRenderer } | null
}

function trianglesOf (mesh: Mesh): number {
  const { index, attributes, drawRange } = mesh.geometry
  const total                            = index ? index.count : attributes.position?.count ?? 0

  return Math.min(total, drawRange.count) / 3
}

function nameOf (object: Object3D): string {
  let at: Object3D | null = object

  while (at && !at.name)
    at = at.parent

  return at?.name || object.type
}

export function census (scene: Scene, limit = 30): CensusRow[] {
  const rows = new Map<string, CensusRow>()

  scene.traverseVisible(object => {
    if (!(object instanceof Mesh))
      return

    const instances = object instanceof InstancedMesh ? object.count : 1
    const name      = nameOf(object)
    const row       = rows.get(name) ?? { name, kind: object.type, draws: 0, triangles: 0, instances: 0 }

    row.draws     += 1
    row.instances += instances
    row.triangles += trianglesOf(object) * instances
    rows.set(name, row)
  })

  return [ ...rows.values() ].sort((a, b) => b.triangles - a.triangles)
    .slice(0, limit)
}

function leaves (root: object, prefix = ''): [string, ConfigValue][] {
  return Object.entries(root).flatMap(([ key, value ]): [string, ConfigValue][] => {
    const path = prefix ? `${prefix}.${key}` : key

    if (value !== null && typeof value === 'object')
      return leaves(value as object, path)

    return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' ? [[ path, value ]] : []
  })
}

export function installBridge ({ config, rebuild, ctx }: BridgeOptions): void {
  const opened = leaves(config.read())

  const bridge: ScapeBridge = {
    write: (path, value) => config.write(path, value),
    read (path) {
      return path.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], config.read())
    },
    rebuild,
    reset () {
      const now = new Map(leaves(config.read()))

      for (const [ path, value ] of opened)
        if (now.get(path) !== value)
          config.write(path, value)
    },
    drawn: () => Number(document.documentElement.dataset.scapeDrawn ?? 0),
    census (limit) {
      const live = ctx()

      return live ? census(live.scene, limit) : []
    },
    info () {
      const info = ctx()?.renderer.info

      return {
        calls:      info?.render.calls ?? 0,
        triangles:  info?.render.triangles ?? 0,
        programs:   info?.programs?.length ?? 0,
        geometries: info?.memory.geometries ?? 0,
        textures:   info?.memory.textures ?? 0,
      }
    },
  }

  Object.assign(window, { scape: bridge })
}
