import {
  BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { createSeededRng } from 'threejs-scene'
import { buildProp, resolvePalette } from '../scene/props/index.ts'
import type { PropName } from '../scene/props/index.ts'


/**
 * Thumbnails for the whole roster, drawn once into one throwaway context.
 *
 * The index exists because a name is a bad handle for a mesh. `aitta`, `hayRack`
 * and `netRack` are three words that tell you nothing about which one you are
 * looking for, and the roster is past forty entries — so the way to pick a prop
 * is to look at it, which means the landing page has to be a contact sheet
 * rather than a list.
 *
 * ## One context, then none
 *
 * Every card gets its own 2D canvas, but they are all drawn by a single
 * WebGL renderer that is destroyed the moment the sheet is built. Forty live
 * contexts would be well past what a browser will hand out — and the sheet is
 * static once drawn, so keeping even one alive would be paying rent on
 * something nobody is using. `forceContextLoss` is what actually returns it;
 * `dispose` alone frees the resources and leaves the context attached.
 */

/** The angle the scape is played at — the same one the iso pane opens on. */
const YAW   = Math.PI / 4
const PITCH = Math.atan(Math.SQRT1_2)

/** Rendered size. Cards display at half this, so they stay sharp on retina. */
const WIDTH  = 512
const HEIGHT = 384

export interface Thumbnail {
  name:      PropName
  canvas:    HTMLCanvasElement
  triangles: number
  size:      { x: number; y: number; z: number }
  base:      number
}

/**
 * Draw every named prop once, at the play angle, each framed to fill its card.
 *
 * Framing each prop to its own bounds is a deliberate loss of information: a
 * stump and a farmhouse end up the same size on screen. Framing them all to a
 * common scale instead would make the sheet honest and useless, because the
 * grass tuft would be four pixels. The dimensions go in the caption, where they
 * can be read rather than guessed.
 */
interface Sheet {
  canvas:   HTMLCanvasElement
  renderer: WebGLRenderer
  scene:    Scene
  material: MeshStandardMaterial
  mesh:     Mesh
}

/**
 * The one context every card is drawn through.
 *
 * `preserveDrawingBuffer` is not optional here: the sheet copies each render
 * straight out with `drawImage`, and without it the buffer is allowed to be
 * gone by the time we read it.
 */
function buildSheet (): Sheet {
  const canvas = document.createElement('canvas')

  canvas.width  = WIDTH
  canvas.height = HEIGHT

  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })

  renderer.setPixelRatio(1)
  renderer.setSize(WIDTH, HEIGHT, false)
  renderer.setClearColor(new Color('#12150f'), 1)

  const scene = new Scene()

  scene.add(new HemisphereLight('#c3d6e4', '#5b5040', 2.1))

  const key = new DirectionalLight('#fff4e2', 1.9)
  key.position.set(-5, 9, 6)
  scene.add(key)

  const fill = new DirectionalLight('#dce6ef', 0.7)
  fill.position.set(6, 3, -7)
  scene.add(fill)

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness:    0.92,
    metalness:    0,
    flatShading:  true,
  })

  const mesh = new Mesh(new BufferGeometry(), material)
  scene.add(mesh)

  return { canvas, renderer, scene, material, mesh }
}

/** Point the camera at one prop's centre, framed to just contain it. */
function frameOn (camera: OrthographicCamera, centre: Vector3, radius: number): void {
  const halfH = radius * 1.08
  const halfW = halfH * (WIDTH / HEIGHT)

  camera.left   = -halfW
  camera.right  = halfW
  camera.top    = halfH
  camera.bottom = -halfH
  camera.updateProjectionMatrix()

  camera.position.set(
    centre.x + Math.cos(PITCH) * Math.sin(YAW) * 1_000,
    centre.y + Math.sin(PITCH) * 1_000,
    centre.z + Math.cos(PITCH) * Math.cos(YAW) * 1_000,
  )
  camera.up.set(0, 1, 0)
  camera.lookAt(centre)
}

/**
 * Draw every named prop once, at the play angle, each framed to fill its card.
 *
 * Framing each prop to its own bounds is a deliberate loss of information: a
 * stump and a farmhouse end up the same size on screen. Framing them all to a
 * common scale instead would make the sheet honest and useless, because the
 * grass tuft would be four pixels. The dimensions go in the caption, where they
 * can be read rather than guessed.
 */
export function renderContactSheet (names: readonly PropName[], seed: number): Thumbnail[] {
  const { canvas, renderer, scene, material, mesh } = buildSheet()

  const camera           = new OrthographicCamera(-1, 1, 1, -1, 0.01, 4_000)
  const palette          = resolvePalette()
  const target           = new Vector3()
  const out: Thumbnail[] = []

  for (const name of names) {
    const geometry = buildProp(name, createSeededRng(seed), palette)

    geometry.computeBoundingSphere()
    geometry.computeBoundingBox()

    const sphere = geometry.boundingSphere
    const box    = geometry.boundingBox
    const radius = Math.max(0.4, sphere?.radius ?? 1)

    target.copy(sphere?.center ?? target.set(0, 0, 0))

    frameOn(camera, target, radius)

    mesh.geometry = geometry
    renderer.render(scene, camera)

    // Copy out now, in this same task. The card keeps a plain 2D canvas, so the
    // sheet survives the GL context being taken away two dozen lines below.
    const card = document.createElement('canvas')

    card.width  = WIDTH
    card.height = HEIGHT
    card.getContext('2d')?.drawImage(canvas, 0, 0)

    const span = new Vector3()
    box?.getSize(span)

    out.push({
      name,
      canvas:    card,
      triangles: Math.floor((geometry.getAttribute('position')?.count ?? 0) / 3),
      size:      { x: span.x, y: span.y, z: span.z },
      base:      box?.min.y ?? 0,
    })

    geometry.dispose()
  }

  material.dispose()
  renderer.dispose()
  renderer.forceContextLoss()

  return out
}
