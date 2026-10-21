import type { Pose } from './scape-poses.ts'


/**
 * The pose set for the field pattern.
 *
 * Its own file for the reason `scape-poses-cart.ts` and `scape-poses-shore.ts`
 * are: `scape-poses.ts` sits a handful of lines under the 666-line ceiling,
 * and a thirty-first set squeezed in would take it over.
 *
 * Folded back into `TOURS` at its definition, so `--poses rigs` reads exactly
 * as every other set does.
 */

/**
 * The four fields on the shoulder above the yard, in one frame.
 *
 * The infield is a 25 m scatter of rectangles between (-11, 25) and (12, -3),
 * which is most of a tour pose filled with something other than fields. 26 is
 * the frame that holds all four and little else, and it is aimed at their
 * centre of area rather than at any one of them.
 */
const INFIELD = [ 'camera.focusX=8', 'camera.focusZ=11' ]

/**
 * One field, close enough that a 0.17 m crown is a measurable number of pixels.
 *
 * The plot at (10.9, 10.2) rather than the larger one at (11.8, -2.9), and the
 * difference is occlusion rather than taste — the same trap the cart set fell
 * into at the farmyard door. This camera's ground depth is its view size over
 * the sine of its tilt, so at close range it is looking along forty metres of
 * hillside, and the chapel stands on that line a little nearer the eye than
 * the lower field. A frame pinned there photographs a chapel. This one does
 * not have anything in front of it.
 *
 * The weather phase is pinned dry for the same reason the swell set pins one:
 * the default phase parks a snow shower over the scape, and a shower over the
 * one surface the set is about is a frame that cannot be read.
 */
const FIELD = [ 'camera.focusX=10.9', 'camera.focusZ=10.2', 'weather.time=0.62' ]

export const RIG_TOURS: Record<string, Pose[]> = {

  /**
   * One field pattern, under two lights and across two seasons.
   *
   * The set is the claim, and the claim has two halves that no single frame
   * carries. The first is that the corduroy is *geometry*: `rigs-low` and
   * `rigs-noon` are the identical camera an hour apart, and a painted stripe
   * would be the same in both. A raised one is lit down one flank at the low
   * sun and nearly edge-on at the high one, so the difference between those
   * two frames is the whole of the argument for building this out of ribbons
   * rather than out of vertex colour.
   *
   * The second is that the crop belongs to the year rather than to this
   * section. `rigs-turn` is the week the sown green goes straw, and
   * `rigs-winter` is the week it is under snow with only the crowns showing —
   * neither authored anywhere, both falling out of the seasonal tint in
   * `props/material.ts` weighing itself by how green a fragment already is.
   * If a run ever puts a colour for harvest in `config-rigs.ts`, these two
   * frames are where the second opinion shows up.
   *
   * Nothing here is in `STILL` and nothing needs to be: the rigs are baked
   * into the terrain at build and integrate no rate of their own, so the
   * pose's own hour and week are the whole of the control.
   */
  rigs: [
    { name: 'rigs', zoom: 26, set: INFIELD },
    { name: 'rigs-near', zoom: 10, time: 0.3, set: FIELD },
    { name: 'rigs-low', zoom: 10, time: 0.21, set: FIELD },
    { name: 'rigs-noon', zoom: 10, time: 0.5, set: FIELD },
    { name: 'rigs-turn', zoom: 26, season: 0.72, set: INFIELD },
    { name: 'rigs-winter', zoom: 26, season: 0.02, set: INFIELD },
  ],
}
