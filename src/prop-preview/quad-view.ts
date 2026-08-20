import {
  AxesHelper,
  Box3,
  Box3Helper,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  Sphere,
  Vector3,
} from 'three'
import type { WebGLRenderer } from 'three'
import { createRenderer } from 'threejs-scene'


/**
 * A four-viewport prop editor: top, front, left, and the angle it is played at.
 *
 * The scape is one composition, and looking at it is how you judge the
 * composition — but it is a bad way to judge a *mesh*. A building forty metres
 * off, at one fixed angle, under a colour grade, is exactly the viewing
 * condition that let a gable end poke through its own roof for months.
 *
 * So this is deliberately the opposite of the scape: orthographic, unfogged,
 * ungraded, gridded, and showing all four sides at once. No terrain, no
 * atmosphere, no post — a prop and the axes it was built against.
 *
 * ## Why one renderer and four scissors
 *
 * Four canvases would mean four WebGL contexts, and browsers cap those at
 * around sixteen — but the real reason is that four contexts cannot share the
 * geometry, so the thing in the top view would be a different upload from the
 * thing in the front view. One context, four scissor rectangles, one mesh: what
 * you compare across viewports is guaranteed to be the same object.
 */

/** Which of the four panes. Also the keyboard digit that maximises it. */
export const PANES = [ 'top', 'front', 'left', 'iso' ] as const

export type PaneName = (typeof PANES)[number]

/** Where a pane's camera sits, relative to what it is looking at. */
const EYE: Record<PaneName, [number, number, number]> = {
  top:   [ 0, 1, 0 ],
  front: [ 0, 0, 1 ],
  left:  [ -1, 0, 0 ],
  iso:   [ 1, Math.SQRT1_2, 1 ],
}

/** Which way is up in each pane. Top-down needs telling; the rest are obvious. */
const UP: Record<PaneName, [number, number, number]> = {
  top:   [ 0, 0, -1 ],
  front: [ 0, 1, 0 ],
  left:  [ 0, 1, 0 ],
  iso:   [ 0, 1, 0 ],
}

/** The plane each pane's grid lies in — the one the pane can measure. */
const GRID_TURN: Record<PaneName, [number, number, number]> = {
  top:   [ 0, 0, 0 ],
  front: [ Math.PI / 2, 0, 0 ],
  left:  [ 0, 0, Math.PI / 2 ],
  iso:   [ 0, 0, 0 ],
}

interface Pane {
  name:   PaneName
  camera: OrthographicCamera
  grids:  Group

  /** Half-height of the view frustum, in metres. Zoom is 1/this. */
  radius: number

  /** Pan, in the pane's own screen axes. */
  panU: number
  panV: number

  /** Orbit, `iso` only — the other three are locked to their axis on purpose. */
  yaw:   number
  pitch: number
}

export interface QuadViewOptions {
  grid?:      boolean
  wireframe?: boolean
  bounds?:    boolean
  axes?:      boolean

  /** Only this pane, filling the canvas. */
  solo?: PaneName | null
}

export interface QuadView {
  setGeometry(geometry: BufferGeometry | null): void
  setOptions(options: QuadViewOptions): void

  /** Fit every pane around the current prop. */
  frame(): void

  /** Which pane covers a point in CSS pixels, for hit-testing input. */
  paneAt(x: number, y: number): PaneName | null

  readonly size:      { x: number; y: number; z: number }
  readonly base:      number
  readonly triangles: number

  dispose(): void
}

const GRID_LINE   = new Color('#2f3a33')
const GRID_MAJOR  = new Color('#46564b')
const CLEAR       = new Color('#12150f')
const CLEAR_FOCUS = new Color('#171b13')

/**
 * Build the two-density grid one pane measures against.
 *
 * A single density cannot do both jobs: one-metre lines are what you count a
 * wall's cladding boards against, and they turn into a grey wash by the time a
 * whole barn is in view. The coarse five-metre set stays readable when the fine
 * one has given up.
 */
function makeGrid (turn: [number, number, number], extent: number): Group {
  const group = new Group()
  const span  = Math.max(4, Math.ceil(extent / 5) * 10)

  const fine   = new GridHelper(span, span, GRID_LINE, GRID_LINE)
  const coarse = new GridHelper(span, Math.max(2, span / 5), GRID_MAJOR, GRID_MAJOR)

  for (const grid of [ fine, coarse ]) {
    const material = grid.material as { transparent: boolean; opacity: number; depthWrite: boolean }

    material.transparent = true
    material.opacity     = grid === fine ? 0.32 : 0.6
    material.depthWrite  = false
    group.add(grid)
  }

  group.rotation.set(turn[0], turn[1], turn[2])

  return group
}

interface Stage {
  renderer:     WebGLRenderer
  scene:        Scene
  material:     MeshStandardMaterial
  mesh:         Mesh
  bounds:       Box3
  boundsHelper: Box3Helper
  axes:         AxesHelper
}

/**
 * The scene the prop is shown in, which is as close to nothing as is useful.
 *
 * Two directional lights and a hemisphere, all neutral: the job is to read
 * form, not to flatter it. The scape's own low key light is beautiful and
 * throws half of every prop into a black that hides exactly the sort of fault
 * this page exists to find.
 */
function buildStage (canvas: HTMLCanvasElement): Stage {
  // The runtime's bootstrap, with both of its flattering defaults turned off.
  // Shadows have nothing to fall on here, and ACES is a *film* curve: it rolls
  // off the highlights, which is the half of a facet this page exists to let
  // you read. A viewer that grades what it shows cannot be measured from.
  const renderer = createRenderer({
    canvas,
    shadows:     false,
    toneMapping: NoToneMapping,
  })

  // Four panes, one canvas: each is cleared and drawn inside its own scissor
  // rectangle rather than the renderer clearing the whole frame per pass.
  renderer.autoClear = false
  renderer.setScissorTest(true)

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

  const bounds         = new Box3()
  const boundsHelper   = new Box3Helper(bounds, new Color('#c8a24a'))
  boundsHelper.visible = false
  scene.add(boundsHelper)

  const axes = new AxesHelper(2)
  scene.add(axes)

  return { renderer, scene, material, mesh, bounds, boundsHelper, axes }
}

export function createQuadView (canvas: HTMLCanvasElement, initial: QuadViewOptions = {}): QuadView {
  const { renderer, scene, material, mesh, bounds, boundsHelper, axes } = buildStage(canvas)

  const target = new Vector3()
  const sphere = new Sphere()

  const panes: Pane[] = PANES.map(name => ({
    name,
    camera: new OrthographicCamera(-1, 1, 1, -1, 0.01, 4_000),
    grids:  makeGrid(GRID_TURN[name], 12),
    radius: 6,
    panU:   0,
    panV:   0,
    yaw:    Math.PI / 4,
    pitch:  Math.atan(Math.SQRT1_2),
  }))

  for (const pane of panes) {
    pane.grids.visible = false
    scene.add(pane.grids)
  }

  let options: Required<QuadViewOptions> = {
    grid:      initial.grid ?? true,
    wireframe: initial.wireframe ?? false,
    bounds:    initial.bounds ?? false,
    axes:      initial.axes ?? true,
    solo:      initial.solo ?? null,
  }

  let triangles = 0
  let width     = 1
  let height    = 1

  /** Pixel rectangle of a pane, in WebGL's bottom-up coordinates. */
  function rectOf (pane: Pane): [number, number, number, number] {
    if (options.solo)
      return [ 0, 0, width, height ]

    const halfW = Math.floor(width / 2)
    const halfH = Math.floor(height / 2)
    const index = PANES.indexOf(pane.name)
    const col   = index % 2
    const row   = index < 2 ? 0 : 1

    // Row 0 is the top of the screen, which is the HIGH y in GL.
    return [ col * halfW, row === 0 ? height - halfH : 0, halfW, halfH ]
  }

  function place (pane: Pane, aspect: number): void {
    const halfH = pane.radius
    const halfW = halfH * aspect

    pane.camera.left   = -halfW + pane.panU
    pane.camera.right  = halfW + pane.panU
    pane.camera.top    = halfH + pane.panV
    pane.camera.bottom = -halfH + pane.panV
    pane.camera.updateProjectionMatrix()

    const distance = 1_000
    const eye      = EYE[pane.name]

    if (pane.name === 'iso')
      pane.camera.position.set(
        target.x + Math.cos(pane.pitch) * Math.sin(pane.yaw) * distance,
        target.y + Math.sin(pane.pitch) * distance,
        target.z + Math.cos(pane.pitch) * Math.cos(pane.yaw) * distance,
      )
    else
      pane.camera.position.set(
        target.x + eye[0] * distance,
        target.y + eye[1] * distance,
        target.z + eye[2] * distance,
      )

    pane.camera.up.set(UP[pane.name][0], UP[pane.name][1], UP[pane.name][2])
    pane.camera.lookAt(target)
  }

  function render (): void {
    for (const pane of panes) {
      if (options.solo && options.solo !== pane.name)
        continue

      const [ x, y, w, h ] = rectOf(pane)

      if (w <= 0 || h <= 0)
        continue

      place(pane, w / h)

      // CSS pixels, not device pixels: setViewport and setScissor multiply by
      // the renderer's own pixel ratio. Scaling them here as well squares the
      // ratio, which on a retina display makes every pane the size of the whole
      // canvas — so all four draw on top of each other and only the last shows.
      renderer.setViewport(x, y, w, h)
      renderer.setScissor(x, y, w, h)
      renderer.setClearColor(pane.name === 'iso' ? CLEAR_FOCUS : CLEAR, 1)
      renderer.clear()

      pane.grids.visible = options.grid
      axes.visible       = options.axes
      renderer.render(scene, pane.camera)
      pane.grids.visible = false
    }
  }

  function resize (): void {
    const rect = canvas.getBoundingClientRect()

    width  = Math.max(2, Math.round(rect.width))
    height = Math.max(2, Math.round(rect.height))
    renderer.setSize(width, height, false)
    render()
  }

  function frame (): void {
    if (!mesh.geometry.boundingSphere)
      mesh.geometry.computeBoundingSphere()

    const radius = Math.max(0.5, mesh.geometry.boundingSphere?.radius ?? 4)

    sphere.copy(mesh.geometry.boundingSphere ?? sphere)
    target.copy(sphere.center)

    // Frame on the prop's own centre rather than on the origin: an aitta on
    // stilts and a jetty reaching seven metres out are both "one prop", and
    // splitting the difference would put neither of them in the middle.
    for (const pane of panes) {
      pane.radius = radius * 1.25
      pane.panU   = 0
      pane.panV   = 0
    }

    for (const pane of panes) {
      scene.remove(pane.grids)
      pane.grids         = makeGrid(GRID_TURN[pane.name], radius * 2)
      pane.grids.visible = false
      scene.add(pane.grids)
    }

    axes.scale.setScalar(Math.max(1, radius * 0.4))
    render()
  }

  const view: QuadView = {
    setGeometry (geometry) {
      mesh.geometry.dispose()
      mesh.geometry = geometry ?? new BufferGeometry()
      mesh.geometry.computeBoundingSphere()
      mesh.geometry.computeBoundingBox()

      bounds.copy(mesh.geometry.boundingBox ?? bounds)
      boundsHelper.box.copy(bounds)

      const position = mesh.geometry.getAttribute('position')
      triangles = position ? Math.floor(position.count / 3) : 0

      frame()
    },

    setOptions (next) {
      options = { ...options, ...next }
      material.wireframe   = options.wireframe
      boundsHelper.visible = options.bounds
      render()
    },

    frame,

    paneAt (x, y) {
      if (options.solo)
        return options.solo

      return PANES[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)]
    },

    get size () {
      const span = new Vector3()
      bounds.getSize(span)

      return { x: span.x, y: span.y, z: span.z }
    },

    get base () {
      return bounds.min.y
    },

    get triangles () {
      return triangles
    },

    dispose () {
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('wheel', onWheel)
      mesh.geometry.dispose()
      material.dispose()
      renderer.dispose()
    },
  }

  // ---- input ---------------------------------------------------------------

  let dragging: Pane | null = null
  let lastX                 = 0
  let lastY                 = 0
  let orbiting              = false

  function paneFor (event: PointerEvent | WheelEvent): Pane | null {
    const rect = canvas.getBoundingClientRect()
    const name = view.paneAt(event.clientX - rect.left, event.clientY - rect.top)

    return panes.find(pane => pane.name === name) ?? null
  }

  function onPointerDown (event: PointerEvent): void {
    dragging = paneFor(event)

    if (!dragging)
      return

    // The three axis panes never rotate. That is the whole reason they are
    // worth having: an elevation you can nudge off-axis is no longer a
    // measurement, and you would not notice it had happened.
    orbiting = dragging.name === 'iso' && !event.shiftKey
    lastX    = event.clientX
    lastY    = event.clientY
    canvas.setPointerCapture(event.pointerId)
  }

  function onPointerMove (event: PointerEvent): void {
    if (!dragging)
      return

    const dx = event.clientX - lastX
    const dy = event.clientY - lastY

    lastX = event.clientX
    lastY = event.clientY

    if (orbiting) {
      dragging.yaw -= dx * 0.008
      dragging.pitch = Math.max(-1.5, Math.min(1.5, dragging.pitch + dy * 0.008))
    }
    else {
      const halfH    = Math.max(1, options.solo ? height : height / 2)
      const perPixel = dragging.radius * 2 / halfH

      dragging.panU -= dx * perPixel
      dragging.panV += dy * perPixel
    }

    render()
  }

  function onPointerUp (event: PointerEvent): void {
    dragging = null
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId)
  }

  function onWheel (event: WheelEvent): void {
    const pane = paneFor(event)

    if (!pane)
      return

    event.preventDefault()
    pane.radius = Math.max(0.15, Math.min(400, pane.radius * Math.exp(event.deltaY * 0.0012)))
    render()
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  // Deliberately not `attachResizeObserver`: it watches the canvas's *parent*
  // where this watches the canvas, and the camera it keeps in sync is a
  // perspective one. Four orthographic frustums and four pane rectangles are
  // recomputed in `resize` regardless, so routing through it would add a layer
  // that does none of the work and changes which element is measured.
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)

  resize()

  return view
}
