import { MathUtils, Raycaster, Vector2, Vector3 } from 'three'
import type { OrthographicCamera } from 'three'
import { aimIsoCamera, attachPointerGesture, defineModule, resizeIsoCamera, smoothstep } from 'threejs-scene'
import type { FrameContext } from 'threejs-scene'
import { BOAT_FOLLOW_VIEW_SIZE, createBoatFollowController } from './camera-follow.ts'
import type { BoatFollowSource } from './camera-follow.ts'
import type { CameraPath } from './camera-path.ts'
import type { ScapeConfig, ScapeModule } from './config.ts'
import type { Landscape } from './landscape/index.ts'


interface CameraPose {
  focus:    Vector3
  viewSize: number
  heading:  number
}

type DragAction = 'pan' | 'rotate'

export interface CameraControlsOptions {
  camera:     OrthographicCamera
  canvas:     HTMLCanvasElement
  landscape:  Landscape
  boatFleet?: () => BoatFollowSource | null

  /** Read live, so the tuning overlay can reshape the zoom and tilt range. */
  /**
   * The camera section, as of the tick asking.
   *
   * A reader rather than the section itself: `tiltNear` and `tiltFar` are both
   * on the overlay, and the store commits a new config object every time one of
   * them moves — so a section captured when the rig was built is a section that
   * stops answering the moment the reader drags a tilt slider.
   */
  limits: () => ScapeConfig['camera']

  maxFocus:      number
  reducedMotion: boolean
  onFocus(point: Vector3): void
  onManualControl(): void

  /**
   * A waypoint tour driving the camera, when one is running.
   *
   * Drives the same `target` a drag writes, for the same reason the boat follow
   * does: there is one integrator in this module and adding a second tween
   * beside it is how two things end up disagreeing about where the camera is.
   * Any manual input stops the tour — a tour you cannot interrupt by grabbing
   * the scape is a cutscene.
   */
  path?: CameraPath

  /**
   * Where the camera settled, whenever it settles.
   *
   * Debounced by the settle itself rather than by a timer: this fires when the
   * chase has landed, so it is at most one call per gesture and never one per
   * frame. Persisting it is what lets a reload open where the reader left off.
   */
  onPoseSettled?(pose: CameraOpening): void

  /** Where to open, when a previous session left an answer. Overrides the config. */
  opening?: CameraOpening | null
}

/** A camera pose as four plain numbers — storable, and the same shape a waypoint is. */
export interface CameraOpening {
  x:        number
  z:        number
  viewSize: number
  heading:  number
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

/**
 * A ground point the camera is allowed to look at.
 *
 * The same box a drag is held inside, applied to the opening focus too — a
 * configured focus out past the world's edge would otherwise open on a view a
 * drag can never return to.
 */
type ClampFocusReturnType = { x: number, z: number }

export function clampFocus (x: number, z: number, reach: number): ClampFocusReturnType {
  return { x: clamp(x, -reach, reach), z: clamp(z, -reach, reach) }
}

/** Signed shortest way round from `from` to `to`, in degrees. */
export function headingDelta (from: number, to: number): number {
  return (to - from + 540) % 360 - 180
}

/**
 * Rotate a ground point around a pivot by a heading change.
 *
 * The point under the cursor stays fixed while the rest of the world swings
 * around it — the same feel as grabbing a map. Pure maths, no side effects:
 * the caller owns all three vectors.
  */
type FocusType = { x: number, z: number }

type PivotType = { x: number, z: number }

type RotateAroundPivotReturnType = { x: number, z: number }

export function rotateAroundPivot (
  focus:    FocusType,
  pivot:    PivotType,
  dHeading: number,
): RotateAroundPivotReturnType {
  const dx  = focus.x - pivot.x
  const dz  = focus.z - pivot.z
  const rad = dHeading * Math.PI / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  // Positive heading change is clockwise in the XZ plane (top-down), so the
  // sin term is negated relative to the standard CCW rotation matrix.
  return {
    x: pivot.x + dx * cos + dz * sin,
    z: pivot.z - dx * sin + dz * cos,
  }
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

/**
 * Where the camera opens.
 *
 * Read from the config once. The focus is live state from there on — a drag
 * writes the target rather than the config — so this decides where the scape
 * arrives, not where it has to stay.
 */
function openingPose (
  limits:    () => ScapeConfig['camera'],
  maxFocus:  number,
  landscape: Landscape,
  viewSize:  number,
  stored:    CameraOpening | null | undefined,
): CameraPose {
  const { x, z } = clampFocus(
    stored?.x ?? limits().focusX,
    stored?.z ?? limits().focusZ,
    maxFocus,
  )

  return {
    focus:    new Vector3(x, landscape.heightAt(x, z), z),
    viewSize: clamp(stored?.viewSize ?? viewSize, limits().minViewSize, limits().maxViewSize),
    heading:  wrapHeading(stored?.heading ?? 0),
  }
}

export function createCameraControls (
  options: CameraControlsOptions,
): ScapeModule {
  const {
    camera,
    canvas,
    landscape,
    boatFleet,
    limits,
    maxFocus,
    reducedMotion,
    onFocus,
    onManualControl,
    path,
    onPoseSettled,
  } = options

  const baseRotation = camera.userData.rotation as number
  const baseRadius   = camera.userData.radius as number

  const pose = openingPose(
    limits,
    maxFocus,
    landscape,
    camera.userData.viewSize as number,
    options.opening,
  )
  const target: CameraPose = {
    focus:    pose.focus.clone(),
    viewSize: pose.viewSize,
    heading:  pose.heading,
  }

  // One scratch set for the whole module. Every frame reads from these and none
  // of them ever escapes, which is what keeps the update path allocation-free.
  const scratch = {
    right:         new Vector3(),
    forward:       new Vector3(),
    aim:           [ 0, 0, 0 ] as [number, number, number],
    raycaster:     new Raycaster(),
    pointerNdc:    new Vector2(),
    rotationPivot: null as { x: number, z: number } | null,
    pivotHeading:  0,
    pivotFocus:    new Vector3(),
    pointerGround: null as { x: number, y: number, z: number } | null,
  }

  const { right, forward, raycaster, pointerNdc, aim: aimTarget } = scratch

  // The cursor's vertical position in 0..1 screen space, for the tilt-shift
  // focus band. NaN means no pointer has entered the canvas yet — the post
  // chain falls back to the camera's look-at point. Only a fine pointer (mouse
  // or pen) drives this; coarse pointers (touch) never write it, so the band
  // stays at the look-at for the whole session.
  let pointerScreenY = Number.NaN
  const boatFollow                                                = createBoatFollowController(baseRotation)

  /**
   * What a drag means, decided when the press starts and held for the gesture.
   *
   * Re-reading the modifiers per move would let releasing shift halfway through
   * an orbit turn it into a pan under the reader's hand.
   */
  let dragAction: DragAction = 'pan'
  let revolving              = false
  // One declaration rather than three, which is a lint ceiling talking: this
  // function is one statement over `max-statements` and these three are the
  // cheapest to merge without moving anything real. They are the closure's
  // whole mutable state, so grouping them also says so.
  let settling                  = true,
    lastViewSize                = Number.NaN,
    detach: (() => void) | null = null

  const aspect = (): number => canvas.clientWidth / canvas.clientHeight || 1
  const tiltOf = (viewSize: number): number =>
    tiltForViewSize(viewSize, limits().minViewSize, limits().maxViewSize, limits().tiltNear, limits().tiltFar)

  /**
   * Resolve the ground point under the pointer and cache it for anchored
   * zooming and for other modules that read `camera.userData.pointerGround`.
   *
   * Called on every pointer move (hover for mouse, press-start for touch/pen)
   * rather than per frame — a raycast per wheel tick is fine, per frame is not.
   */
  function resolvePointerGround (clientX: number, clientY: number): void {
    const [ nx, ny ] = clientPointToNdc(clientX, clientY, canvas.getBoundingClientRect())
    pointerNdc.set(nx, ny)
    raycaster.setFromCamera(pointerNdc, camera)

    const hit = raycaster.intersectObjects(landscape.surfaces, false)[0]

    if (hit) {
      scratch.pointerGround         = { x: hit.point.x, y: hit.point.y, z: hit.point.z }
      camera.userData.pointerGround = [ hit.point.x, hit.point.y, hit.point.z ]
    }
    else {
      scratch.pointerGround         = null
      camera.userData.pointerGround = undefined
    }
  }

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
    const need    = (drop + WATER_CLEARANCE - (pose.focus.y - landscape.layout.waterLevel)) /
      Math.max(Math.sin(radians), 1e-3)

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

    // The frustum's near and far planes are set once by `createIsoCamera` and
    // never updated — at `maxViewSize` the frame extends ~2000 m along the view
    // axis but the far plane sits at 500 m, clipping the top of the frame.
    // Scale both with the camera distance and the view so the whole archipelago
    // stays inside the frustum at every zoom. `near` stays positive and `far`
    // stretches to cover the ground footprint plus the height the camera sits at.
    const radius  = liftedRadius(tilt)
    const sinTilt = Math.max(Math.sin(MathUtils.degToRad(tilt)), 1e-3)

    // The orthographic camera sits at `radius` along the view axis from its
    // target. The near and far planes must bracket every piece of geometry
    // along that axis — not stop short of the subject (the old bug at zoom-in)
    // and not cut off the far islands ( the old bug at zoom-out). `halfDepth`
    // covers the on-screen footprint (`viewSize / sinTilt`) plus the world's
    // own extent beyond the visible frame (half the archipelago size, also
    // divided by sinTilt because the view axis is tilted), plus a margin for
    // terrain peaks and troughs. The slab is symmetric around `radius` so
    // both ends stay correct at every zoom.
    const halfWorld = landscape.archipelago.size * 0.5
    const halfDepth = (pose.viewSize + halfWorld) / sinTilt + 20

    camera.near = Math.max(0.1, radius - halfDepth)
    camera.far  = radius + halfDepth
    camera.updateProjectionMatrix()

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

  /**
   * Anything the reader does with their hands ends the tour.
   *
   * Grabbing the scape mid-flight has to hand it back, and it has to hand it
   * back *where it is* rather than snapping to wherever the tour was heading —
   * so the target is pulled to the live pose before the gesture writes to it.
   */
  function leavePath (): void {
    if (!path?.playing)
      return

    path.stop()
    target.focus.copy(pose.focus)
    target.viewSize = pose.viewSize
    target.heading  = pose.heading
  }

  /** Where the camera has come to rest, in the four numbers worth remembering. */
  function opening (): CameraOpening {
    return {
      x:        pose.focus.x,
      z:        pose.focus.z,
      viewSize: pose.viewSize,
      heading:  pose.heading,
    }
  }

  /** The tour, if one is running. Writes the same target every other input does. */
  function syncPath (delta: number): boolean {
    const at = path?.advance(delta)

    if (!at)
      return false

    target.focus.set(at.x, landscape.heightAt(at.x, at.z), at.z)
    target.viewSize = clamp(at.viewSize, limits().minViewSize, limits().maxViewSize)
    target.heading  = at.heading
    settling        = true
    return true
  }

  function leaveBoat (): void {
    if (!boatFollow.clear())
      return

    target.focus.y = landscape.heightAt(target.focus.x, target.focus.z)
    retarget()
  }

  function syncBoatFollow (): boolean {
    const wasActive = boatFollow.active

    if (!boatFollow.update()) {
      if (wasActive) {
        target.focus.y = landscape.heightAt(target.focus.x, target.focus.z)
        retarget()
      }
      return false
    }

    const chase = boatFollow.target

    target.focus.set(chase.x, chase.y, chase.z)
    target.heading = chase.heading
    settling      = true
    return true
  }

  function panTo (dx: number, dy: number): void {
    leavePath()
    leaveBoat()
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
  //
  // When a pivot was captured at press, the focus orbits around that fixed
  // point — the world turns about where the reader grabbed it, the way a map
  // does. Without a pivot the old single-point orbit is preserved.
  function rotateTo (dx: number, pivot?: { x: number, z: number } | null): void {
    leavePath()
    leaveBoat()
    stopRevolving()

    const dHeading = dx * ROTATE_PER_PIXEL
    target.heading = wrapHeading(target.heading + dHeading)

    if (pivot) {
      const rotated = rotateAroundPivot(
        { x: scratch.pivotFocus.x, z: scratch.pivotFocus.z },
        pivot,
        dHeading,
      )
      target.focus.x = clamp(rotated.x, -maxFocus, maxFocus)
      target.focus.z = clamp(rotated.z, -maxFocus, maxFocus)
      target.focus.y = landscape.heightAt(target.focus.x, target.focus.z)
    }

    retarget()
  }

  /**
   * Change the zoom level.
   *
   * Centred on the focus, deliberately, and it is worth writing down why since
   * anchoring it to the cursor is the obvious thing to reach for.
   *
   * The zoom is *damped*: `target.viewSize` is where the wheel has asked to go
   * and `pose.viewSize` is where the camera actually is, easing toward it over
   * several frames. An anchored zoom has to shift the focus by the ratio of the
   * two view sizes — and on a wheel burst the target runs several ticks ahead of
   * the pose, so every tick computes its ratio across two different timelines
   * and moves the focus by the wrong amount. The result reads as jitter, and it
   * gets worse the faster you spin the wheel, which is exactly when a reader is
   * least able to tolerate it.
   *
   * Rotation keeps its cursor pivot, and can: a rotation is a rigid turn about
   * a point with no damped scalar in the arithmetic, so there are no two clocks
   * to disagree.
   */
  function zoomTo (scale: number): void {
    leavePath()

    target.viewSize = zoomViewSize(target.viewSize, scale, limits().minViewSize, limits().maxViewSize)
    retarget()
  }

  function focusAt (clientX: number, clientY: number): void {
    leavePath()

    const [ x, y ] = clientPointToNdc(clientX, clientY, canvas.getBoundingClientRect())
    pointerNdc.set(x, y)
    raycaster.setFromCamera(pointerNdc, camera)

    const fleet   = boatFleet?.()
    const boatHit = fleet
      ? raycaster.intersectObject(fleet.mesh, false)[0]
      : null
    const surfaceHit = raycaster.intersectObjects(landscape.surfaces, false)[0]

    if (
      fleet &&
      boatHit?.instanceId !== undefined &&
      (!surfaceHit || boatHit.distance <= surfaceHit.distance)
    ) {
      if (boatFollow.select(fleet, boatHit.instanceId)) {
        target.viewSize = clamp(BOAT_FOLLOW_VIEW_SIZE, limits().minViewSize, limits().maxViewSize)
        stopRevolving()
        syncBoatFollow()
        onFocus(target.focus)
      }
      return
    }

    leaveBoat()

    if (!surfaceHit)
      return

    target.focus.copy(surfaceHit.point)
    target.focus.x = clamp(target.focus.x, -maxFocus, maxFocus)
    target.focus.z = clamp(target.focus.z, -maxFocus, maxFocus)
    target.focus.y = landscape.heightAt(target.focus.x, target.focus.z)
    revolving = !reducedMotion
    retarget()
    onFocus(target.focus)
  }

  /**
   * What the press that just started means, and that it happened at all.
   *
   * A press is an act of intent before it is a drag: it leaves the boat chase,
   * the tour and the idle orbit whether or not it ever moves, and it focuses
   * the canvas so the arrow keys work afterwards. Both are why this hangs off
   * the press rather than the first move.
   */
  function onPressStart (x: number, y: number, event: PointerEvent): void {
    onManualControl()
    canvas.focus({ preventScroll: true })

    // Pan is the default gesture. On a map, dragging means "move the map" to
    // everyone who has ever used one; orbiting is the specialist verb and gets
    // the modifier.
    const rotates = event.pointerType === 'mouse' &&
      (event.button === 1 || event.button === 2 || event.shiftKey || event.ctrlKey || event.metaKey)

    dragAction = rotates ? 'rotate' : 'pan'

    // Capture the pivot for any mouse drag, not only rotate — a pan that
    // switches to rotate mid-gesture (releasing the modifier) inherits the
    // pivot captured at press, so the world does not jump.
    if (event.pointerType === 'mouse') {
      const bounds     = canvas.getBoundingClientRect()
      const [ nx, ny ] = clientPointToNdc(x, y, bounds)
      pointerNdc.set(nx, ny)
      raycaster.setFromCamera(pointerNdc, camera)

      const hit = raycaster.intersectObjects(landscape.surfaces, false)[0]

      if (hit) {
        scratch.rotationPivot = { x: hit.point.x, z: hit.point.z }
        scratch.pivotHeading  = target.heading
        scratch.pivotFocus.copy(target.focus)
      }
      else
        scratch.rotationPivot = null
    }

    // For touch/pen, resolve the pointer ground once at press — the gesture
    // will read it for anchored zooming if the handler requests it. Mouse
    // resolves per hover instead.
    if (event.pointerType === 'touch' || event.pointerType === 'pen')
      resolvePointerGround(x, y)

    // Track where the cursor is for the tilt-shift focus band — only a fine
    // pointer (mouse/pen) drives it; the gesture callback already filters by
    // pointerType for the rotate verb, so this just writes the screen y.
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      const bounds = canvas.getBoundingClientRect()
      pointerScreenY = 1 - (y - bounds.top) / bounds.height
    }
  }

  function onDrag (dx: number, dy: number): void {
    if (dragAction === 'pan')
      panTo(dx, dy)
    else
      rotateTo(dx, scratch.rotationPivot)
  }

  /**
   * Two fingers pan and zoom at once, because on a map they always have.
   *
   * The pinch carries how far its own centre travelled, so the pan is the same
   * gesture rather than a second one derived from it.
   */
  function onPinch (scale: number, _centerX: number, _centerY: number, panX: number, panY: number): void {
    panTo(panX, panY)

    if (scale > 0)
      zoomTo(scale)
  }

  function onTap (x: number, y: number): void {
    // Only a pan-mode tap opens somewhere: a modifier-held click is the start of
    // an orbit that happened not to travel, not a request to go there.
    if (dragAction === 'pan')
      focusAt(x, y)
  }

  function onWheel (delta: number, event: WheelEvent): void {
    onManualControl()

    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? canvas.clientHeight : 1

    // The ground point is still resolved here, but it no longer steers the
    // zoom — see `zoomTo`. It is kept because the wheel moves the scape under a
    // stationary cursor, so without this the ground point the cursor light is
    // sitting on would go stale for as long as the reader keeps scrolling.
    resolvePointerGround(event.clientX, event.clientY)

    zoomTo(Math.exp(-delta * unit * WHEEL_SPEED))
  }

  /**
   * Track the cursor for the tilt-shift focus band and resolve the ground point
   * under the pointer for anchored zooming.
   *
   * Only a fine pointer (mouse, pen) drives this — touch has no hover, so the
   * band stays at the camera look-at for the whole session. A coarse pointer
   * never writes `pointerScreenY` or `pointerGround`.
   */
  function onHover (x: number, y: number): void {
    const bounds = canvas.getBoundingClientRect()
    pointerScreenY = 1 - (y - bounds.top) / bounds.height
    resolvePointerGround(x, y)
  }

  /** Clear the orbit pivot when the gesture ends. */
  function onPressEnd (): void {
    scratch.rotationPivot = null
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
    else if (event.key === 'Escape') {
      // The documented way out of everything that is driving the camera for
      // you: the boat chase, the idle orbit and now the waypoint tour.
      leavePath()
      leaveBoat()
      stopRevolving()
    }
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

    // Before the boat, because selecting a boat is a manual act and a tour is
    // not: a running tour that also had a boat selected would otherwise have two
    // writers of the same target on the same frame.
    syncPath(delta)
    syncBoatFollow()

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
      settling      = revolving || boatFollow.active || Boolean(path?.playing)

      // Only where the camera came to rest, which is the only pose worth
      // reopening on. Mid-gesture and mid-tour frames are not places the reader
      // ever chose to be.
      if (!settling)
        onPoseSettled?.(opening())
    }

    if (!boatFollow.active)
      pose.focus.y = landscape.heightAt(pose.focus.x, pose.focus.z)
    apply()

    // Expose the cursor position for the tilt-shift focus band. NaN means no
    // pointer has entered the canvas — the post chain uses the look-at point.
    camera.userData.pointerScreenY = pointerScreenY
  }

  function attach (): () => void {
    // The pointer bookkeeping — capture, the map of live pointers, the pinch
    // frame, tap detection — is the runtime's. What is left here is only what
    // this scape means by a gesture.
    const detachGesture = attachPointerGesture(
      canvas,
      {
        onPressStart,
        onPressEnd,
        onDrag,
        onPinch,
        onTap,
        onWheel,
        onHover,
        onLeave () {
          pointerScreenY                = Number.NaN
          scratch.pointerGround         = null
          camera.userData.pointerGround = undefined
        },
      },
      { tapMovePx: TAP_MOVE_PX, tapThresholdMs: TAP_MAX_MS },
    )

    canvas.addEventListener('keydown', onKeyDown)

    return () => {
      detachGesture()
      canvas.removeEventListener('keydown', onKeyDown)
    }
  }

  return defineModule<ScapeConfig>({
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
