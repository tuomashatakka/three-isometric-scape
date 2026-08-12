import { MathUtils, Raycaster, Vector2, Vector3 } from 'three'
import type { OrthographicCamera } from 'three'
import { aimIsoCamera, defineModule, resizeIsoCamera } from 'threejs-scene'
import type { AppModule, FrameContext } from 'threejs-scene'
import type { Landscape } from './landscape/index.ts'


interface CameraPose {
  focus:    Vector3
  viewSize: number
  heading:  number
  tilt:     number
}

type DragAction = 'pan' | 'rotate'

interface PointerState {
  action:    DragAction
  x:         number
  y:         number
  startedX:  number
  startedY:  number
  startedAt: number
}

interface TouchFrame {
  centerX:  number
  centerY:  number
  distance: number
}

export interface CameraControlsOptions {
  camera:        OrthographicCamera
  canvas:        HTMLCanvasElement
  landscape:     Landscape
  minViewSize:   number
  maxViewSize:   number
  maxFocus:      number
  reducedMotion: boolean
  onFocus(point: Vector3): void
  onManualControl(): void
}

const ROTATE_PER_PIXEL         = 0.32
const TILT_PER_PIXEL           = 0.16
const MIN_TILT                 = 18
const WATER_CLEARANCE          = 4
const MAX_TILT                 = 58
const KEYBOARD_STEP            = 38
const KEYBOARD_ZOOM            = 1.12
const WHEEL_SPEED              = 0.001
const TAP_MOVE_PX              = 8
const TAP_MAX_MS               = 350
const ORBIT_DEGREES_PER_SECOND = 6

function clamp (value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function wrapHeading (heading: number): number {
  return (heading % 360 + 360) % 360
}

export function zoomViewSize (
  viewSize: number,
  scale: number,
  minimum: number,
  maximum: number,
): number {
  return clamp(viewSize / Math.max(scale, 0.01), minimum, maximum)
}

export function clientPointToNdc (
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): readonly [number, number] {
  return [
    (clientX - bounds.left) / bounds.width * 2 - 1,
    -((clientY - bounds.top) / bounds.height) * 2 + 1,
  ]
}

export function createCameraControls (
  options: CameraControlsOptions,
): AppModule<Record<string, never>> {
  const {
    camera,
    canvas,
    landscape,
    minViewSize,
    maxViewSize,
    maxFocus,
    reducedMotion,
    onFocus,
    onManualControl,
  } = options

  const baseRotation     = camera.userData.rotation as number
  const baseRadius       = camera.userData.radius as number
  const waterLine        = landscape.layout.waterLevel
  const pose: CameraPose = {
    focus:    new Vector3(0, landscape.heightAt(0, 0), 0),
    viewSize: camera.userData.viewSize as number,
    heading:  0,
    tilt:     camera.userData.tilt as number,
  }
  const target: CameraPose = {
    focus:    pose.focus.clone(),
    viewSize: pose.viewSize,
    heading:  pose.heading,
    tilt:     pose.tilt,
  }

  const pointers                            = new Map<number, PointerState>()
  const right                               = new Vector3()
  const forward                             = new Vector3()
  const aimTarget: [number, number, number] = [ 0, 0, 0 ]
  const raycaster                           = new Raycaster()
  const pointerNdc                          = new Vector2()
  let lastTouch: TouchFrame | null = null
  let multiTouch                   = false
  let revolving                    = false
  let landed                       = true
  let lastViewSize                 = Number.NaN
  let detach: (() => void) | null  = null

  const aspect = (): number => canvas.clientWidth / canvas.clientHeight || 1

  /**
   * How far back to sit the camera.
   *
   * Irrelevant to an orthographic projection — moving along the view axis
   * changes nothing you can see — but it decides where the frustum's *bottom
   * edge* sits in world space. Let that edge drop under the waterline and the
   * lower band of the frame is made of rays that start below the sea and point
   * down: they can never intersect a horizontal plane above them, so the water
   * simply stops partway up the screen. Rise with the zoom to stay clear of it.
   */
  function liftedRadius (): number {
    const tilt = MathUtils.degToRad(pose.tilt)
    const drop = pose.viewSize * 0.5 * Math.cos(tilt)
    const need = (drop + WATER_CLEARANCE - (pose.focus.y - waterLine)) / Math.max(Math.sin(tilt), 1e-3)

    return Math.max(baseRadius, need)
  }

  function apply (): void {
    aimTarget[0] = pose.focus.x
    aimTarget[1] = pose.focus.y
    aimTarget[2] = pose.focus.z

    aimIsoCamera(camera, {
      target:   aimTarget,
      radius:   liftedRadius(),
      rotation: baseRotation + pose.heading,
      tilt:     pose.tilt,
    })

    if (pose.viewSize !== lastViewSize) {
      camera.userData.viewSize = pose.viewSize
      resizeIsoCamera(camera, aspect())
      lastViewSize = pose.viewSize
    }
    camera.updateMatrixWorld()
  }

  function stopRevolving (): void {
    revolving = false
    landed = true
    target.focus.copy(pose.focus)
    target.heading  = pose.heading
    target.tilt     = pose.tilt
    target.viewSize = pose.viewSize
  }

  function pan (dx: number, dy: number): void {
    stopRevolving()

    const perPixel = pose.viewSize / (canvas.clientHeight || 1)

    right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0)
      .normalize()
    forward.setFromMatrixColumn(camera.matrixWorld, 1).setY(0)
      .normalize()

    pose.focus
      .addScaledVector(right, -dx * perPixel)
      .addScaledVector(forward, dy * perPixel)
    pose.focus.x = clamp(pose.focus.x, -maxFocus, maxFocus)
    pose.focus.z = clamp(pose.focus.z, -maxFocus, maxFocus)
    pose.focus.y = landscape.heightAt(pose.focus.x, pose.focus.z)
    target.focus.copy(pose.focus)
    apply()
  }

  function rotate (dx: number, dy: number): void {
    stopRevolving()
    pose.heading   = wrapHeading(pose.heading - dx * ROTATE_PER_PIXEL)
    pose.tilt      = clamp(pose.tilt + dy * TILT_PER_PIXEL, MIN_TILT, MAX_TILT)
    target.heading = pose.heading
    target.tilt    = pose.tilt
    apply()
  }

  function zoom (scale: number): void {
    stopRevolving()
    pose.viewSize   = zoomViewSize(pose.viewSize, scale, minViewSize, maxViewSize)
    target.viewSize = pose.viewSize
    apply()
  }

  function focusAt (clientX: number, clientY: number): void {
    const [ x, y ] = clientPointToNdc(clientX, clientY, canvas.getBoundingClientRect())
    pointerNdc.set(x, y)
    raycaster.setFromCamera(pointerNdc, camera)

    const hit = raycaster.intersectObjects(landscape.surfaces, false)[0]
    if (!hit)
      return

    target.focus.copy(hit.point)
    target.focus.x = clamp(target.focus.x, -maxFocus, maxFocus)
    target.focus.z = clamp(target.focus.z, -maxFocus, maxFocus)
    landed = false
    revolving = !reducedMotion
    onFocus(target.focus)

    if (reducedMotion) {
      pose.focus.copy(target.focus)
      apply()
      landed = true
    }
  }

  function touchFrame (): TouchFrame | null {
    if (pointers.size !== 2)
      return null

    const values = pointers.values()
    const first  = values.next().value as PointerState | undefined
    const second = values.next().value as PointerState | undefined
    if (!first || !second)
      return null

    return {
      centerX:  (first.x + second.x) / 2,
      centerY:  (first.y + second.y) / 2,
      distance: Math.hypot(first.x - second.x, first.y - second.y),
    }
  }

  function onPointerDown (event: PointerEvent): void {
    event.preventDefault()
    onManualControl()
    canvas.focus({ preventScroll: true })
    canvas.setPointerCapture(event.pointerId)

    const pans = event.pointerType === 'mouse' &&
      (event.button === 1 || event.button === 2 || event.shiftKey || event.ctrlKey || event.metaKey)

    pointers.set(event.pointerId, {
      action:    pans ? 'pan' : 'rotate',
      x:         event.clientX,
      y:         event.clientY,
      startedX:  event.clientX,
      startedY:  event.clientY,
      startedAt: event.timeStamp,
    })
    multiTouch ||= pointers.size > 1
    lastTouch = touchFrame()
  }

  function onPointerMove (event: PointerEvent): void {
    const pointer = pointers.get(event.pointerId)
    if (!pointer)
      return

    event.preventDefault()

    const previousX = pointer.x
    const previousY = pointer.y
    pointer.x       = event.clientX
    pointer.y       = event.clientY

    if (pointers.size === 1) {
      const dx = pointer.x - previousX
      const dy = pointer.y - previousY
      if (pointer.action === 'pan')
        pan(dx, dy)
      else
        rotate(dx, dy)
      return
    }

    const nextTouch = touchFrame()
    if (!nextTouch || !lastTouch)
      return

    pan(nextTouch.centerX - lastTouch.centerX, nextTouch.centerY - lastTouch.centerY)
    if (lastTouch.distance > 0)
      zoom(nextTouch.distance / lastTouch.distance)
    lastTouch = nextTouch
  }

  function onPointerEnd (event: PointerEvent): void {
    const pointer = pointers.get(event.pointerId)
    if (pointer && event.type === 'pointerup') {
      const travelled = Math.hypot(
        event.clientX - pointer.startedX,
        event.clientY - pointer.startedY,
      )
      const elapsed = event.timeStamp - pointer.startedAt
      if (
        !multiTouch &&
        pointers.size === 1 &&
        pointer.action === 'rotate' &&
        travelled <= TAP_MOVE_PX &&
        elapsed <= TAP_MAX_MS
      )
        focusAt(event.clientX, event.clientY)
    }

    pointers.delete(event.pointerId)
    lastTouch = touchFrame()
    if (!pointers.size)
      multiTouch = false
  }

  function onWheel (event: WheelEvent): void {
    event.preventDefault()
    onManualControl()

    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientHeight : 1
    zoom(Math.exp(-event.deltaY * unit * WHEEL_SPEED))
  }

  function onContextMenu (event: MouseEvent): void {
    event.preventDefault()
  }

  function onKeyDown (event: KeyboardEvent): void {
    const shifted  = event.shiftKey
    const move     = shifted ? rotate : pan
    const vertical = shifted ? -KEYBOARD_STEP : KEYBOARD_STEP

    if (event.key === 'ArrowLeft')
      move(KEYBOARD_STEP, 0)
    else if (event.key === 'ArrowRight')
      move(-KEYBOARD_STEP, 0)
    else if (event.key === 'ArrowUp')
      move(0, vertical)
    else if (event.key === 'ArrowDown')
      move(0, -vertical)
    else if (event.key === '+' || event.key === '=')
      zoom(KEYBOARD_ZOOM)
    else if (event.key === '-' || event.key === '_')
      zoom(1 / KEYBOARD_ZOOM)
    else if (event.key === 'Escape')
      stopRevolving()
    else
      return

    onManualControl()
    event.preventDefault()
  }

  function update (frame: FrameContext): void {
    if (!landed) {
      const blend = 1 - Math.exp(-Math.min(frame.delta, 0.1) * 4.8)
      pose.focus.lerp(target.focus, blend)

      if (pose.focus.distanceToSquared(target.focus) < 0.0009) {
        pose.focus.copy(target.focus)
        landed = true
      }
      apply()
    }

    if (revolving && landed) {
      pose.heading   = wrapHeading(pose.heading + ORBIT_DEGREES_PER_SECOND * frame.delta)
      target.heading = pose.heading
      apply()
    }
  }

  function attach (): () => void {
    canvas.style.touchAction = 'none'
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerEnd)
    canvas.addEventListener('pointercancel', onPointerEnd)
    canvas.addEventListener('lostpointercapture', onPointerEnd)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('keydown', onKeyDown)
    canvas.addEventListener('contextmenu', onContextMenu)

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerEnd)
      canvas.removeEventListener('pointercancel', onPointerEnd)
      canvas.removeEventListener('lostpointercapture', onPointerEnd)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      pointers.clear()
    }
  }

  return defineModule<Record<string, never>>({
    name: 'camera-controls',

    build () {
      apply()
      detach = attach()
    },

    update (_state, frame) {
      update(frame)
    },

    resize () {
      lastViewSize = Number.NaN
      apply()
    },

    dispose () {
      detach?.()
      detach = null
    },
  })
}

// perf: input work is event-driven. frame updates only run vector damping while
// landing or one scalar orbit step while revolving; all scratch objects are reused.
