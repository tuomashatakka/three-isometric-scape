import type { Pose } from './scape-poses.ts'


/**
 * The pose set for the places the ways get over water.
 *
 * Its own file for the reason `scape-poses-cart.ts` and `scape-poses-coast.ts`
 * are: `scape-poses.ts` sits a handful of lines under the 666-line ceiling, and
 * a thirtieth set squeezed in there would take it over.
 *
 * Folded back into `TOURS` at its definition, so `--poses crossing` reads
 * exactly as every other set does.
 *
 * **The tour cannot see any of this, and that is not a failure of the tour.**
 * The home island — the one every default frame is composed around — has no
 * crossing at all: its beck comes off the high ground in the north-east corner
 * and nothing the farm walks to is on the far bank of it, which the survey
 * reports as `bridges NONE` rather than as a blank. Every deck in the
 * archipelago is on one of the other five islands, between a hundred and six
 * hundred metres out, and the longest of them is twelve metres of timber. At
 * the tour's widest frame that is a third of a pixel. So this set exists for
 * the same reason the cart's and the smokehouse's do: a subject small enough
 * and far enough out that it is either photographed on purpose or not
 * photographed.
 */

/**
 * The meadow island's road over its own beck, which is the largest of them.
 *
 * Nine metres of cart deck on two trestles, standing a metre over the drowned
 * mouth of the channel — the one crossing in the archipelago that three ways
 * go over, and the one where the beck and the tide are the same water. It is
 * the frame that argues the structure, because it has every part of it in
 * shot: abutments on both banks, piles in the stream and no handrail, which is
 * what a crossing the cart uses gets.
 */
const MEADOW_BECK = [ 'camera.focusX=155', 'camera.focusZ=110' ]

/**
 * The sound island's footbridge over a sea gut, which is the longest.
 *
 * Eleven metres of plank over eight and a half metres of standing salt water,
 * three and a half metres below the deck — the crossing that is furthest from
 * what anybody means by "a bridge over a stream", and the one that says this
 * structure is sited on *water in the way* rather than on the beck.
 */
const SOUND_GUT = [ 'camera.focusX=-320', 'camera.focusZ=-438' ]

/** The shield island's, which is the smallest: four and a half metres and a rail. */
const SHIELD_GUT = [ 'camera.focusX=-45', 'camera.focusZ=582' ]

export const CROSSING_TOURS: Record<string, Pose[]> = {

  /**
   * Three decks, at the three sizes the archipelago builds them in.
   *
   * `crossing` is the meadow island's cart bridge at twenty metres, close
   * enough to count the boards, read the stone at each end and see the cart
   * track arrive at one of them. `crossing-wide` is the same deck at
   * forty-six, which is the frame that says a bridge is a thing *on* a road
   * rather than an object placed near one.
   * `crossing-gut` is the sound island's eleven-metre footbridge over salt
   * water, and `crossing-small` the shield island's four and a half, which is
   * one bay, two abutments and a handrail.
   * `crossing-low` drops to a near-horizontal angle on the meadow deck at the
   * bottom of the tide, which is the one view that can see *under* a bridge —
   * the whole argument for a freeboard is invisible from above.
   *
   * Every frame names a `rot`, and that is not taste. The tilt in this scape
   * is derived from the zoom, so the frames that are close enough to read a
   * deck are also the ones lying nearest the ground — and at the default
   * bearing the meadow island's own steading stands between the eye and its
   * bridge. The first cut of this set photographed a farmyard five times.
   *
   * Nothing here is in `STILL`. A bridge integrates no rate of its own: it is
   * geometry baked into the steading's merged draw, so the only clocks that
   * touch it are the tide under it and the sun on it, and naming a time is the
   * whole of the control.
   */
  crossing: [
    { name: 'crossing', zoom: 20, rot: 135, set: MEADOW_BECK },
    { name: 'crossing-wide', zoom: 46, rot: 135, set: MEADOW_BECK },
    { name: 'crossing-gut', zoom: 15, rot: 135, set: SOUND_GUT },
    { name: 'crossing-small', zoom: 15, rot: 135, set: SHIELD_GUT },
    {
      name: 'crossing-low',
      zoom: 14,
      rot:  135,
      // The ebb, which is where the tide set puts the waterline at its lowest
      // on this coast — the sheet drops away from the soffit and the piles
      // under the deck come out of the water they were driven into.
      set:  [ ...MEADOW_BECK, 'tide.lag=0' ],
    },
  ],
}
