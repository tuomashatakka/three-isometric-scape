/**
 * How many repeats of a world-space pattern the frame is wide, and so how much
 * of it the frame may draw.
 *
 * Everything the scape lays on the ground in world metres — the grit, the
 * wear, the cloud shadow — was authored at a tile sized for a close frame. At
 * the archipelago frame the same tile repeats fifteen to two hundred times
 * across the picture, and what reads at that count is not grit or cloud but
 * the pattern itself: the 92 m cloud shadow drew the islands and the whole far
 * shore as brown camouflage. A photograph of a coast from that far shows the
 * pattern's *mean*, and its larger shapes, and nothing at the tile.
 *
 * So a reader lets its tile go between two repeat counts, to the tile's mean,
 * and anything it only spends on the tile — the relief march, a normal fetch —
 * goes with it. The count is read off the projection: an orthographic frame is
 * `2 / projection[0][0]` metres wide whatever the zoom, and it is the same for
 * every fragment of the frame, so a branch on it is uniform and skips the work
 * outright. A perspective camera (the prop viewer) reads a frame of a metre or
 * two and keeps everything.
 */

/** The curve the shader's `smoothstep` draws: 1 under `from` repeats, 0 past `to`. */
export function repeatKeep (repeats: number, [ from, to ]: readonly [number, number]): number {
  const t = Math.min(1, Math.max(0, (repeats - from) / (to - from)))

  return 1 - t * t * (3 - 2 * t)
}

/** `repeatKeep` in glsl, for a band written out as two literals. */
export function repeatKeepGlsl (repeats: string, [ from, to ]: readonly [number, number]): string {
  return `(1.0 - smoothstep(${from.toFixed(1)}, ${to.toFixed(1)}, ${repeats}))`
}

/**
 * The frame's width in metres, declared once however many readers a program
 * splices in. `projectionMatrix` is uploaded to every program that declares
 * it; three declares it in the fragment stage itself only for transmission.
 */
export const FRAME_GLSL = /* glsl */`
#ifndef SCAPE_FRAME
#define SCAPE_FRAME
  #ifndef USE_TRANSMISSION
    uniform mat4 projectionMatrix;
  #endif

  float scapeFrameMetres () {
    return 2.0 / max(projectionMatrix[0][0], 1e-6);
  }
#endif
`
