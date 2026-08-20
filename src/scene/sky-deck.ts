import { smoothstep } from 'threejs-scene'
import type { OrthographicCamera } from 'three'
import type { ScapeConfig } from './config.ts'


/**
 * Where a sky deck starts and finishes coming into view, as fractions of the
 * zoom range.
 *
 * Every deck in this scape is a horizontal sheet hung above the water, and the
 * camera at the near zoom sits *underneath* it — four metres off the ground
 * against a deck fifty metres up. There is nothing an overhead sheet can do
 * from there but cover the picture, so the decks fade out on the way in rather
 * than being drawn from below.
 */
export const REVEAL_IN  = 0.45
export const REVEAL_OUT = 0.9

/**
 * How much of a sky deck the view is far enough back to see, 0..1.
 *
 * Shared by the aurora and the night sky, because the two decks are hung at the
 * same kind of altitude for the same reason and a second copy of this curve is
 * a second answer to one question — one of the two skies fading at a different
 * zoom from the other is exactly the sort of thing nobody notices until the
 * pull-out looks wrong.
 */
export function deckReveal (viewSize: number, limits: ScapeConfig['camera']): number {
  const span = limits.maxViewSize - limits.minViewSize

  return smoothstep(
    limits.minViewSize + span * REVEAL_IN,
    limits.minViewSize + span * REVEAL_OUT,
    viewSize,
  )
}

/**
 * The live view size, or the authored one before the controls have set theirs.
 *
 * The camera carries it on `userData` because an orthographic camera's own
 * frustum is a half-height in world units and the scape thinks in the full
 * frame; reading it back off the camera rather than off the config is what
 * makes a deck follow the zoom instead of the opening pose.
 */
export function deckViewSize (camera: OrthographicCamera, config: ScapeConfig): number {
  return camera.userData.viewSize as number ?? config.camera.viewSize
}

/** Where the camera is looking, in world metres. The origin before the controls have aimed. */
export function deckFocus (camera: OrthographicCamera): readonly [number, number, number] {
  return camera.userData.target as readonly [number, number, number] | undefined ?? [ 0, 0, 0 ]
}
