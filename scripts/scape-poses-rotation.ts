import type { Pose } from './scape-poses.ts'


/**
 * The pose set for the rotation — which course each field is in.
 *
 * Its own file for the reason `scape-poses-rigs.ts` and `scape-poses-cart.ts`
 * are: `scape-poses.ts` sits a handful of lines under the 666-line ceiling,
 * and a thirty-second set squeezed in would take it over.
 *
 * Folded back into `TOURS` at its definition, so `--poses rotation` reads
 * exactly as every other set does.
 */

/**
 * The weather, pinned dry, on every frame in the set.
 *
 * For the reason the swell set and the close half of the rig set pin one: the
 * default phase parks a snow shower over the scape, and a shower over the one
 * surface a set is about is a frame that cannot be read. The rig set's *wide*
 * frames did not pin it, and this is the set that found out what that costs —
 * the infield at 26 m under falling snow is a grey wash with four pale
 * rectangles in it, which is a picture of a shower rather than of a farm.
 */
const DRY = 'weather.time=0.62'

/**
 * The two fields the rotation is argued in, in one frame.
 *
 * The ley at (-11.2, 25.2) and the corn at (3.7, 19.6) are the pair on the
 * home island that sit nearest each other in different courses, and the claim
 * of the whole section is a *difference between two fields* — which needs both
 * of them in the same frame under the same light, the way the rig set's two
 * suns need the same camera.
 *
 * 26 m is the frame that holds the pair and little else, aimed between them
 * rather than at either.
 */
const PAIR = [ 'camera.focusX=-3.7', 'camera.focusZ=22.4', DRY ]

export const ROTATION_TOURS: Record<string, Pose[]> = {

  /**
   * One infield, three courses, and the year over the top of it.
   *
   * The set is the claim and the claim is that the infield stopped being one
   * colour. Three of the six frames are the three courses at 12 m, one each,
   * because what separates them close up is partly shape — a ley's rigs have
   * slumped to under half their height and carry nothing, a fallow's are this
   * year's and carry nothing, a corn field's are this year's with the crop
   * standing on them — and no single frame holds a difference.
   *
   * The other three are the ley and the corn field together at 26 m, which is
   * where the corduroy goes sub-pixel and colour is the only thing left. If a
   * future run ever flattens the three grounds back toward one, `rotation` is
   * the frame that says so, and `rotation-turn` and `rotation-winter` are the
   * two that catch the year disagreeing with the rotation rather than tinting
   * it — a ley under snow should hold its crowns the way a corn field does,
   * and it has less of them to hold.
   *
   * Nothing here is in `STILL` and nothing needs to be: a course is decided at
   * build and baked into the terrain's own draw, so the pose's hour and week
   * are the whole of the control.
   */
  rotation: [
    { name: 'rotation', zoom: 26, set: PAIR },
    { name: 'rotation-corn', zoom: 12, time: 0.3, set: [ 'camera.focusX=3.7', 'camera.focusZ=19.6', DRY ]},
    { name: 'rotation-ley', zoom: 12, time: 0.3, set: [ 'camera.focusX=-11.2', 'camera.focusZ=25.2', DRY ]},
    { name: 'rotation-fallow', zoom: 12, time: 0.3, set: [ 'camera.focusX=10.9', 'camera.focusZ=10.2', DRY ]},
    { name: 'rotation-turn', zoom: 26, season: 0.72, set: PAIR },
    { name: 'rotation-winter', zoom: 26, season: 0.02, set: PAIR },
  ],
}
