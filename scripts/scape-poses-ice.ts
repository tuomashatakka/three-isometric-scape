import type { Pose } from './scape-poses.ts'


/**
 * The pose sets for the frozen sound.
 *
 * Its own file for the reason `scape-poses-coast.ts` is one: `scape-poses.ts`
 * is within a few lines of the 666-line ceiling, and this is a whole subject
 * rather than a frame or two bolted onto an existing set.
 *
 * It is folded back into `TOURS` at its definition, so `--poses pack` reads
 * exactly as every other set does.
 */

/**
 * A plate in the sound east of the home island, in world metres.
 *
 * Named rather than repeated — six frames aim at it — and it is a *plate*
 * rather than a stretch of water on purpose. The first cut of this set aimed at
 * the middle of the sound on the reasoning that a pack is everywhere, and the
 * close frame came back with an empty sea: at the tier a capture pins, the pack
 * stands about one plate to every eighty metres of sound, so a forty-metre frame
 * has rather less than one in it and which one is a matter of luck. A pose that
 * wants a floe in it has to name a floe.
 *
 * This is the twenty-three-metre plate nearest the home island on the mobile
 * tier's own deal, sixty metres off the east shore, which keeps the coast in the
 * frame at the two wider views and fills the close one with ice.
 */
const OVER_THE_SOUND = [ 'camera.focusX=111', 'camera.focusZ=-6' ]

/**
 * The week the sound is shut *and* there is light on it.
 *
 * **Not midwinter, and that is the finding this set was nearly useless without.**
 * `freezeAmount` peaks a little after the shortest day — the sea runs six
 * hundredths of a year behind the land, see `ICE_LAG` — so the obvious frame to
 * photograph a pack in is the one at season 0.02. At this latitude that week is
 * a polar night: the tour's own `winter` frame is a dark grey rectangle with the
 * islands barely in it, and the whole pack photographed in it moves 0.63 % of
 * the picture. Six weeks later the sound is still at 89 % of a full freeze and
 * the sun is above the horizon, where the same ice is 1.5 % of a frame a
 * quarter as wide and unmistakable in it.
 *
 * Every frame in the set names an hour as well, for the same reason the tour's
 * `night` pose has to name a week: the arc is seasonal, so an unqualified hour
 * in a winter frame is whatever the config's clock happens to be parked at.
 */
const SHUT = 0.12

/** Midday, because a low sun in a winter frame is a picture of the fog. */
const NOON = 0.5

/**
 * The week the pack is half in.
 *
 * Solved off the freeze curve rather than guessed at: at 0.17 the year is
 * running about seven tenths of a full freeze, which is where the lobes the
 * front closes first have ice standing on them and the rest of the sound is
 * still open. It is the one frame that shows the pack as a *front* rather than
 * as a state, and it is on the *spring* side of the peak for {@link SHUT}'s
 * reason — the same freeze a fortnight before midwinter is photographed in the
 * dark.
 */
const MAKING = 0.17


export const ICE_TOURS: Record<string, Pose[]> = {

  /**
   * The pack, and the four things it is easy to get wrong about it.
   *
   * The tour's `winter` frame sees this system — the pack is dealt across the
   * whole archipelago and that frame opens on the whole archipelago — but it
   * sees it as a texture. At 1400 m a fourteen-metre plate is fourteen pixels,
   * and everything this run is actually about happens at the edge of one: the
   * rafted ridge, the wet course at the waterline, the shadow one plate throws
   * across the next. So the set opens close and pulls back, rather than the
   * other way round.
   *
   * `pack-none` is the control and the switch: the identical frame at
   * `pack.cover=0`, which is the sound this scape had before any of this and
   * must be identical to the reference build. If it is not, something in here
   * has moved the *sheet* rather than standing plates on it, and the sheet is
   * the water surface's and not this system's.
   *
   * `pack-making` is the claim the seasonal coupling makes, and it needs its own
   * frame because a pack half in and a pack fully in are the same picture at a
   * glance and different pictures on a diff.
   *
   * `pack-summer` is the other control: the same camera in the week the ice has
   * no business existing. A single plate in that frame is a floe that forgot to
   * read the year.
   *
   * `pack.working` is in {@link STILL}, so nothing here has to name it.
   */
  pack: [
    { name: 'pack', zoom: 110, season: SHUT, time: NOON, set: OVER_THE_SOUND },
    { name: 'pack-near', zoom: 40, season: SHUT, time: NOON, set: OVER_THE_SOUND },
    { name: 'pack-reach', zoom: 320, season: SHUT, time: NOON, set: OVER_THE_SOUND },
    { name: 'pack-making', zoom: 110, season: MAKING, time: NOON, set: OVER_THE_SOUND },
    {
      name:   'pack-none',
      zoom:   110,
      season: SHUT,
      time:   NOON,
      set:    [ ...OVER_THE_SOUND, 'pack.cover=0' ],
    },
    { name: 'pack-summer', zoom: 110, season: 0.5, time: NOON, set: OVER_THE_SOUND },
  ],
}
