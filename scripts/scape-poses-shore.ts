import type { Pose } from './scape-poses.ts'


/**
 * The pose set for the lights of the places on the far coast.
 *
 * Its own file for the reason `scape-poses-crossing.ts` and
 * `scape-poses-cart.ts` are: `scape-poses.ts` sits a handful of lines under
 * the 666-line ceiling, and a thirty-first set squeezed in there would take it
 * over. Folded back into `TOURS` at its definition, so `--poses shore` reads
 * exactly as every other set does.
 *
 * **The tour cannot see any of this, and that is geometry rather than
 * framing.** Every pose in `tour` opens on the middle of the world, and the
 * far coast stands between 808 and 1203 m out from it; the widest frame the
 * camera has is `camera.maxViewSize` 1600, which reaches about 1130 m to a
 * corner and 800 m to an edge. So at the only tour pose that is both wide and
 * dark — `night`, at a 1400 m view — the coast is two wedges in opposite
 * corners, and a lit window on it is six pixels of a frame that is otherwise
 * ice. The first capture of this system ran at 3.4 px a light and `scape:diff`
 * correctly reported `same` at all six poses.
 *
 * These frames move the camera out to the coast instead. Nothing here is a
 * trick of exposure: the hour, the week and the zoom are named, every frame is
 * taken on the pinned mobile tier with no bloom, and the control is the same
 * frame with the lamps turned off.
 */

/**
 * The north-western quarter of the coast, which is where the places are.
 *
 * Five of the fourteen stand between 292° and 343°, and the two largest of
 * them — six windows and five — are on that stretch. It is also the part of
 * the ring the archipelago pushes furthest out, so the frame holds a kilometre
 * of coastline with nothing of the islands in it but the water in front.
 */
const NORTH_WEST = [ 'camera.focusX=600', 'camera.focusZ=-700' ]

/**
 * Late evening in the week the tour's own night pose names.
 *
 * Both halves matter and neither is taste. The **week** is the one the sun arc
 * has to be told about: at 68° the default midsummer year has no night in it,
 * so an unqualified evening photographs a white one — the same trap `night`
 * documents in `scape-poses.ts`. The **hour** is late rather than past
 * midnight because `householdWake` banks every lamp in the scape down to
 * `windows.banked` outside the household's day: at the tour's 0.02 the whole
 * coast burns at three tenths, which is the right picture of four in the
 * morning and the wrong one to argue a new system from. 0.9 is the hour the
 * places are awake *and* the sun is well down.
 */
const EVENING = { time: 0.9, season: 0.78 }

export const SHORE_TOURS: Record<string, Pose[]> = {

  /**
   * The lit coast, the coast without it, and the claim that daylight is
   * untouched.
   *
   * `shore` is the frame the run was for: a kilometre of the north-western
   * coast at an 1100 m view, late on a winter evening, with four places strung
   * along the waterline of it. `shore-near` is the same hour at 420 m, where a
   * place is a cluster of separate windows climbing off the water rather than
   * a mark on a silhouette — the frame that says these are *buildings* and not
   * a dotted line.
   *
   * `shore-none` is the switch: the identical frame at `shoreLights.glow=0`,
   * which is the coast this scape had before any of this and which must read
   * `same` against any reference taken before the system landed. It is the
   * control the other two are read against, because a dark mountain at night
   * is a shape that a capture cannot otherwise tell apart from a dark mountain
   * at night with four hamlets on it.
   *
   * `shore-noon` is the second control and the more interesting one: the same
   * camera at midday, which must come out **identical** to a reference at any
   * setting of `shoreLights.glow`. The lamps are gated on `1 - day` squared,
   * so a frame with the sun up that moves at all is a gate that has stopped
   * working.
   *
   * Nothing here is in `STILL`, and nothing needs to be. The lights integrate
   * no rate: where the coast is in its evening is a pure function of
   * `daylight.time`, the way the tide's level and the cart's round already
   * are, so naming an hour is the whole of the control.
   */
  shore: [
    { name: 'shore', zoom: 1_100, ...EVENING, set: NORTH_WEST },
    { name: 'shore-near', zoom: 420, ...EVENING, set: NORTH_WEST },
    { name: 'shore-none', zoom: 1_100, ...EVENING, set: [ ...NORTH_WEST, 'shoreLights.glow=0' ]},
    { name: 'shore-noon', zoom: 1_100, time: 0.5, season: 0.78, set: NORTH_WEST },
  ],
}
