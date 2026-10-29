import { InstancedMesh, Line, Mesh, Points, Raycaster, Sprite, Vector2 } from 'three'
import type { Camera, Object3D, Scene, WebGLRenderer } from 'three'
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

  /** Hide every object whose name contains one of these, until the next reset. Returns how many. */
  hide(names: string[]): number

  /** The named meshes under a point of the canvas (0..1 from the top left), nearest first. */
  probe(x: number, y: number): string[]

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
  ctx:     () => { scene: Scene, renderer: WebGLRenderer, camera: Camera } | null
}

function trianglesOf (mesh: Mesh | Points | Line | Sprite): number {
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
    // Points, lines and sprites are draws too, and a census that skipped them
    // hid a whole-frame sheet of rain streaks from the run that went looking.
    if (!(object instanceof Mesh || object instanceof Points || object instanceof Line || object instanceof Sprite))
      return

    const instances = object instanceof InstancedMesh ? object.count : 1
    const name      = nameOf(object)
    const row       = rows.get(name) ?? { name, kind: object.type, draws: 0, triangles: 0, instances: 0 }

    row.draws     += 1
    row.instances += instances
    row.triangles += object instanceof Mesh ? trianglesOf(object) * instances : 0
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
  // Hidden through the layer mask rather than `visible`: modules that fade a
  // sheet in and out write `visible` every frame and would undo it.
  const hidden = new Map<Object3D, number>()

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
      for (const [ object, mask ] of hidden)
        object.layers.mask = mask
      hidden.clear()
    },
    hide (names) {
      ctx()?.scene.traverse(object => {
        if (!hidden.has(object) && names.some(name => object.name.includes(name))) {
          hidden.set(object, object.layers.mask)
          object.layers.disableAll()
        }
      })
      return hidden.size
    },
    probe (x, y) {
      const live = ctx()

      if (!live)
        return []

      const ray = new Raycaster()

      ray.setFromCamera(new Vector2(x * 2 - 1, 1 - y * 2), live.camera)
      return [ ...new Set(ray.intersectObject(live.scene, true).map(hit => nameOf(hit.object))) ].slice(0, 8)
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
