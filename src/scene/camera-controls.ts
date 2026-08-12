import { MathUtils, Raycaster, Vector2, Vector3 } from 'three'
import type { OrthographicCamera } from 'three'
import { aimIsoCamera, defineModule, resizeIsoCamera, smoothstep } from 'threejs-scene'
import type { AppModule, FrameContext } from 'threejs-scene'
import type { Landscape } from './landscape/index.ts'


interface CameraPose {
  focus:    Vector3
  viewSize: number
  heading:  number
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
  tiltNear:      number
  tiltFar:       number
  maxFocus:      number
  reducedMotion: boolean
  onFocus(point: Vector3): void
  onManualControl(): void
}

const ROTATE_PER_PIXEL         = 0.32
const WATER_CLEARANCE          = 4
const KEYBOARD_STEP            = 38
const KEYBOARD_ZOOM            = 1.12
const WHEEL_SPEED              = 0.001
const TAP_MOVE_PX              = 8
const TAP_MAX_MS               = 350
const ORBIT_DEGREES_PER_SECOND = 6

/** Exponential approach rate for the whole pose, in e-folds per second. */
const SETTLE_RATE = 6.2

/**
 * Floor on the camera distance, as a multiple of the visible height.
 *
 * The lift below only has to clear the waterline, and the steeper the tilt the
 * less distance that takes — but `radius` is also what the atmosphere reads to
 * place its fog, as `near = radius - viewSize * 0.9`. Let the lift fall where
 * the geometry allows and `near` collapses to zero the moment the view tips
 * over, which fogs the foreground and washes the whole frame grey. Tying the
 * floor to `viewSize` keeps the fog band where it was at every elevation.
 */
const DISTANCE_FLOOR = 1.15

function clamp (value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function wrapHeading (heading: number): number {
  return (heading % 360 + 360) % 360
}

/** Signed shortest way round from `from` to `to`, in degrees. */
export function headingDelta (from: number, to: number): number {
  return (to - from + 540) % 360 - 180
}

export function zoomViewSize (
  viewSize: number,
  scale: number,
  minimum: number,
  maximum: number,
): number {
  return clamp(viewSize / Math.max(scale, 0.01), minimum, maximum)
}

/**
 * Elevation as a function of zoom.
 *
 * Tilt is not a thing the pointer gets to set any more. Dragging it is how you
 * end up under the waterline or looking straight down without meaning to, and
 * the *right* elevation is fully determined by how close you are anyway:
 * pushed in, you want a low, near-horizontal, cinematic angle; pulled out, you
 * want the map. Binding one to the other removes a control and improves every
 * frame it used to produce.
 */
export function tiltForViewSize (
  viewSize: number,
  minViewSize: number,
  maxViewSize: number,
  near: number,
  far: number,
): number {
  return near + (far - near) * smoothstep(minViewSize, maxViewSize, viewSize)
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
    tiltNear,
    tiltFar,
    maxFocus,
    reducedMotion,
    onFocus,
    onManualControl,
  } = options

  const baseRotation = camera.userData.rotation as number
  const baseRadius   = camera.userData.radius as number
  const waterLine    = landscape.layout.waterLevel

  const pose: CameraPose = {
    focus:    new Vector3(0, landscape.heightAt(0, 0), 0),
    viewSize: camera.userData.viewSize as number,
    heading:  0,
  }
  const target: CameraPose = {
    focus:    pose.focus.clone(),
    viewSize: pose.viewSize,
    heading:  pose.heading,
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
  let settling                     = true
  let lastViewSize                 = Number.NaN
  let detach: (() => void) | null  = null

  const aspect = (): number => canvas.clientWidth / canvas.clientHeight || 1
  const tiltOf = (viewSize: number): number =>
    tiltForViewSize(viewSize, minViewSize, maxViewSize, tiltNear, tiltFar)

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
  function liftedRadius (tilt: number): number {
    const radians = MathUtils.degToRad(tilt)
    const drop    = pose.viewSize * 0.5 * Math.cos(radians)
    const need    = (drop + WATER_CLEARANCE - (pose.focus.y - waterLine)) / Math.max(Math.sin(radians), 1e-3)

    return Math.max(baseRadius, need, pose.viewSize * DISTANCE_FLOOR)
  }

  function apply (): void {
    const tilt = tiltOf(pose.viewSize)

    aimTarget[0] = pose.focus.x
    aimTarget[1] = pose.focus.y
    aimTarget[2] = pose.focus.z

    aimIsoCamera(camera, {
      target:   aimTarget,
      radius:   liftedRadius(tilt),
      rotation: baseRotation + pose.heading,
      tilt,
    })

    if (pose.viewSize !== lastViewSize) {
      camera.userData.viewSize = pose.viewSize
      resizeIsoCamera(camera, aspect())
      lastViewSize = pose.viewSize
    }
    camera.updateMatrixWorld()
  }

  /** Every input funnels through here: write the target, let `update` chase it. */
  function retarget (): void {
    settling = true
  }

  function stopRevolving (): void {
    revolving = false
  }

  function panTo (dx: number, dy: number): void {
    stopRevolving()

    const perPixel = pose.viewSize / (canvas.clientHeight || 1)

    right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0)
      .normalize()
    forward.setFromMatrixColumn(camera.matrixWorld, 1).setY(0)
      .normalize()

    target.focus
      .addScaledVector(right, -dx * perPixel)
      .addScaledVector(forward, dy * perPixel)
    target.focus.x = clamp(target.focus.x, -maxFocus, maxFocus)
    target.focus.z = clamp(target.focus.z, -maxFocus, maxFocus)
    target.focus.y = landscape.heightAt(target.focus.x, target.focus.z)
    retarget()
  }

  // Dragging right swings the world right, which means the *camera* goes the
  // other way. The scaffold had the sign of a turntable, not of a grab.
  function rotateTo (dx: number): void {
    stopRevolving()
    target.heading = wrapHeading(target.heading + dx * ROTATE_PER_PIXEL)
    retarget()
  }

  function zoomTo (scale: number): void {
    target.viewSize = zoomViewSize(target.viewSize, scale, minViewSize, maxViewSize)
    retarget()
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
    target.focus.y = landscape.heightAt(target.focus.x, target.focus.z)
    revolving = !reducedMotion
    retarget()
    onFocus(target.focus)
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

    // Pan is the default gesture. On a map, dragging means "move the map" to
    // everyone who has ever used one; orbiting is the specialist verb and gets
    // the modifier.
    const rotates = event.pointerType === 'mouse' &&
      (event.button === 1 || event.button === 2 || event.shiftKey || event.ctrlKey || event.metaKey)

    pointers.set(event.pointerId, {
      action:    rotates ? 'rotate' : 'pan',
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
      if (pointer.action === 'pan')
        panTo(pointer.x - previousX, pointer.y - previousY)
      else
        rotateTo(pointer.x - previousX)
      return
    }

    const nextTouch = touchFrame()
    if (!nextTouch || !lastTouch)
      return

    panTo(nextTouch.centerX - lastTouch.centerX, nextTouch.centerY - lastTouch.centerY)
    if (lastTouch.distance > 0)
      zoomTo(nextTouch.distance / lastTouch.distance)
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
        pointer.action === 'pan' &&
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
    zoomTo(Math.exp(-event.deltaY * unit * WHEEL_SPEED))
  }

  function onContextMenu (event: MouseEvent): void {
    event.preventDefault()
  }

  function onKeyDown (event: KeyboardEvent): void {
    const shifted = event.shiftKey

    if (event.key === 'ArrowLeft')
      if (shifted)
        rotateTo(KEYBOARD_STEP)
      else
        panTo(KEYBOARD_STEP, 0)
    else if (event.key === 'ArrowRight')
      if (shifted)
        rotateTo(-KEYBOARD_STEP)
      else
        panTo(-KEYBOARD_STEP, 0)
    else if (event.key === 'ArrowUp')
      if (shifted)
        zoomTo(KEYBOARD_ZOOM)
      else
        panTo(0, KEYBOARD_STEP)
    else if (event.key === 'ArrowDown')
      if (shifted)
        zoomTo(1 / KEYBOARD_ZOOM)
      else
        panTo(0, -KEYBOARD_STEP)
    else if (event.key === '+' || event.key === '=')
      zoomTo(KEYBOARD_ZOOM)
    else if (event.key === '-' || event.key === '_')
      zoomTo(1 / KEYBOARD_ZOOM)
    else if (event.key === 'Escape')
      stopRevolving()
    else
      return

    onManualControl()
    event.preventDefault()
  }

  /**
   * The only place the rendered pose ever changes.
   *
   * Input writes `target` and nothing else, so every motion in the scape — a
   * drag, a wheel tick, a tap, a keypress, the idle orbit — arrives through the
   * same exponential approach and comes out eased. There is no separate tween
   * for each verb because there is only one integrator.
   */
  function update (frame: FrameContext): void {
    const delta = Math.min(frame.delta, 0.1)

    if (revolving)
      target.heading = wrapHeading(target.heading + ORBIT_DEGREES_PER_SECOND * delta)
    else if (!settling)
      return

    const blend   = reducedMotion ? 1 : 1 - Math.exp(-delta * SETTLE_RATE)
    const heading = headingDelta(pose.heading, target.heading)

    pose.focus.lerp(target.focus, blend)
    pose.viewSize += (target.viewSize - pose.viewSize) * blend
    pose.heading = wrapHeading(pose.heading + heading * blend)

    const landed = pose.focus.distanceToSquared(target.focus) < 1e-4 &&
      Math.abs(target.viewSize - pose.viewSize) < 1e-3 &&
      Math.abs(heading) < 1e-2

    if (landed) {
      pose.focus.copy(target.focus)
      pose.viewSize = target.viewSize
      pose.heading  = target.heading
      settling      = revolving
    }

    pose.focus.y = landscape.heightAt(pose.focus.x, pose.focus.z)
    apply()
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

// perf: input work is event-driven and only ever writes four numbers. Frames
// where the pose already matches its target return before touching the camera;
// the rest run one lerp, two scalars and one aim, with no allocation.
