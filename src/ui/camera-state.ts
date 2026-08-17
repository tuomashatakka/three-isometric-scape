import type { CameraOpening } from '../scene/camera-controls.ts'
import type { CameraWaypoint } from '../scene/camera-path.ts'
import { openStorage } from './settings-store.ts'


/**
 * Where the reader last was, and the tour they last built.
 *
 * Its own key, beside the card's and apart from the graphics snapshot, for the
 * reason given in `overlay-state.ts`: that snapshot is derived from the control
 * list and typed against the config it writes into. A camera pose is neither. It
 * is not a knob, nobody authored a default for it, and inventing config fields
 * for a live pose would put two copies of the camera's position in the program —
 * which is the one thing `camera-controls.ts` is built to avoid.
 */
const KEY = 'three-iso.camera.v1'

export interface CameraSession {

  /** The last pose the camera came to rest at. */
  opening: CameraOpening | null

  /** The waypoints the reader placed, in order. */
  waypoints: CameraWaypoint[]

  /** Seconds per leg of the tour. */
  legSeconds: number
  loop:       boolean
}

export const NO_CAMERA_SESSION: CameraSession = {
  opening:    null,
  waypoints:  [],
  legSeconds: 6,
  loop:       true,
}

function finite (value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * A pose, or nothing.
 *
 * Every field has to be a finite number for the record to survive. A stored pose
 * is applied straight to the camera before the first frame, so a `NaN` that got
 * in through a hand-edited key or a half-written record is a scape that opens
 * looking at nowhere and never recovers — and the failure would look like a
 * broken build rather than like bad data.
 */
export function readOpening (value: unknown): CameraOpening | null {
  if (typeof value !== 'object' || value === null)
    return null

  const record   = value as Record<string, unknown>
  const x        = finite(record.x)
  const z        = finite(record.z)
  const viewSize = finite(record.viewSize)
  const heading  = finite(record.heading)

  if (x === null || z === null || viewSize === null || heading === null || viewSize <= 0)
    return null

  return { x, z, viewSize, heading }
}

/** A stored session, with every field that failed to parse replaced by its default. */
export function readSession (raw: string | null): CameraSession {
  if (!raw)
    return { ...NO_CAMERA_SESSION, waypoints: []}

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return { ...NO_CAMERA_SESSION, waypoints: []}
  }

  if (typeof parsed !== 'object' || parsed === null)
    return { ...NO_CAMERA_SESSION, waypoints: []}

  const record    = parsed as Record<string, unknown>
  const waypoints = Array.isArray(record.waypoints)
    ? record.waypoints.map(readOpening).filter((point): point is CameraWaypoint => point !== null)
    : []

  return {
    opening:    readOpening(record.opening),
    waypoints,
    legSeconds: Math.max(0.1, finite(record.legSeconds) ?? NO_CAMERA_SESSION.legSeconds),
    loop:       typeof record.loop === 'boolean' ? record.loop : NO_CAMERA_SESSION.loop,
  }
}

export interface CameraStore {
  load(): CameraSession
  save(session: CameraSession): void
  clear(): void
}

/** How long to sit on a change before writing it. */
const DELAY = 300

export function createCameraStore (storage: Storage | null = openStorage(KEY)): CameraStore {
  let pending: ReturnType<typeof setTimeout> | null = null
  let latest: CameraSession | null                  = null

  function flush (): void {
    pending = null

    if (!storage || !latest)
      return

    try {
      storage.setItem(KEY, JSON.stringify(latest))
    }
    catch {
      // Quota, or a store that only pretended to be writable. The camera is
      // already where the reader put it; only the next load loses out.
    }
  }

  return {
    load () {
      try {
        return readSession(storage?.getItem(KEY) ?? null)
      }
      catch {
        return { ...NO_CAMERA_SESSION, waypoints: []}
      }
    },

    save (session) {
      latest = { ...session, waypoints: session.waypoints.map(point => ({ ...point })) }

      if (pending)
        clearTimeout(pending)
      pending = setTimeout(flush, DELAY)
    },

    clear () {
      if (pending)
        clearTimeout(pending)
      pending = null
      latest  = null

      try {
        storage?.removeItem(KEY)
      }
      catch {
        // As above — a store that will not forget is not worth a crash.
      }
    },
  }
}
