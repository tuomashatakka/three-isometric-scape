import type { Pose } from './scape-poses.ts'


/**
 * The pose sets for what the winter does to the ground, and for the one thing
 * on these islands built against it.
 *
 * Its own file for the reason `scape-poses-coast.ts` is one: `scape-poses.ts`
 * was back at the 666-line ceiling the moment a twenty-sixth set arrived, and
 * these two are one subject rather than a frame or two bolted onto an existing
 * set. `drift` is where the wind puts the winter it has already dropped, and
 * `fence` is the run of palings sited from exactly that reading — a set for the
 * cause and a set for the only thing in the scape that answers it.
 *
 * Both are folded back into `TOURS` at its definition, so `--poses drift` and
 * `--poses fence` read exactly as every other set does.
 */
export const SNOW_TOURS: Record<string, Pose[]> = {

  /**
   * The winter, with the wind in it and without.
   *
   * The snow line has swung with the sun's aspect for as long as the ground has
   * had one, and the tour saw none of that either — the run that put it there
   * moved `winter` by hundredths and had to be judged on a pose set of its own.
   * The wind's swing is a bigger number on a smaller share of the frame, so it
   * lands in the same place: at 1 520 m every island is a white lozenge, and
   * whether one *side* of a ridge came out from under the cover is a question
   * about forty metres of hillside.
   *
   * The fell island is the subject because it is the tallest ground in the
   * archipelago with no ice cap on it — the shield stands higher and wears a
   * glacier over a third of itself, and a run about lying snow cannot be judged
   * on the one island where the white is mostly not snow.
   *
   * Three winters in one frame, and the set is the claim rather than any one of
   * them. `drift` is the ground as it now is; `drift-even` is the same hillside
   * with `season.snowDrift` at zero, which is the winter the scape had before
   * this run and the control every other frame is read against; `drift-lee` is
   * the wind turned right around, which has to take the bare ground to the far
   * side of every ridge — the dune belt's own argument, in snow. `drift-near` is
   * 45 m, where the scoured face and the packed bank either side of one shoulder
   * are surfaces rather than a tone.
   *
   * Deep winter at 0.02 and noon, pinned for the reason `beck-winter` is: the
   * cover is a curve over the year and a frame taken at the configured phase
   * would be measuring the calendar. Nothing here is in {@link STILL} — a drift
   * is a winter's worth of weather resolved from a bearing and a normal, and
   * neither of those is a clock.
   */
  drift: [
    {
      name:   'drift',
      zoom:   120,
      time:   0.5,
      season: 0.02,
      set:    [ 'camera.focusX=322', 'camera.focusZ=-462' ],
    },
    {
      name:   'drift-even',
      zoom:   120,
      time:   0.5,
      season: 0.02,
      set:    [ 'camera.focusX=322', 'camera.focusZ=-462', 'season.snowDrift=0' ],
    },
    {
      name:   'drift-lee',
      zoom:   120,
      time:   0.5,
      season: 0.02,
      set:    [ 'camera.focusX=322', 'camera.focusZ=-462', 'wind.bearing=74' ],
    },
    {
      name:   'drift-near',
      zoom:   45,
      time:   0.5,
      season: 0.02,
      set:    [ 'camera.focusX=322', 'camera.focusZ=-462' ],
    },
  ],

  /**
   * The snow fence, the road behind it, and the island without one.
   *
   * The twenty-sixth set, and added for the reason `drift`'s was: the subject
   * is twenty-six metres of lath fence on an island six hundred metres from the
   * tour's own focus, and at 1 520 m that is less than a pixel of timber. A run
   * that trusted the tour would report `same` at all six poses on a change that
   * put a new structure on two coasts.
   *
   * The sound island is the subject because it is the one that gets the long
   * run — twenty-six metres of eleven bays, against the fell island's ten — and
   * because its fence stands on open fell with nothing else in the frame to
   * read it against. Deep winter at 0.02 and noon, pinned for `drift`'s reason:
   * the thing this fence exists for is a season, and a frame taken at the
   * configured phase would be photographing the calendar.
   *
   * Four frames, and the pair is the claim rather than any one of them.
   *
   * - `fence` is the structure and the stretch of track it guards, at 60 m —
   *   far enough that the setback between the two is in the frame, which is the
   *   one thing about this siting a reader would otherwise have to take on
   *   trust. A fence photographed alone is a fence that could be standing
   *   anywhere.
   * - `fence-bare` is the same frame with `snowFence.height` at zero, which is
   *   the scape exactly as it was before this run. It is the control, and the
   *   only honest way to say how much of the frame the run actually changed.
   * - `fence-near` is 22 m, and it is the one frame in the set taken in **high
   *   summer**. A fence stands all year and the timber is the subject here
   *   rather than the drift — the laths, the gap under them and the braces
   *   raking downwind — and a midwinter noon at this latitude is a twilight
   *   that renders every one of them as the same dark grey.
   * - `fence-fell` is the other island's short run, at 40 m. Two islands got a
   *   fence out of six and they got very different ones, and a set that showed
   *   only the good one would be a set chosen to flatter the search.
   */
  fence: [
    {
      name:   'fence',
      zoom:   60,
      time:   0.5,
      season: 0.02,
      set:    [ 'camera.focusX=-377', 'camera.focusZ=-480' ],
    },
    {
      name:   'fence-bare',
      zoom:   60,
      time:   0.5,
      season: 0.02,
      set:    [ 'camera.focusX=-377', 'camera.focusZ=-480', 'snowFence.height=0' ],
    },
    {
      name:   'fence-near',
      zoom:   22,
      time:   0.5,
      season: 0.45,
      set:    [ 'camera.focusX=-375', 'camera.focusZ=-473' ],
    },
    {
      name:   'fence-fell',
      zoom:   40,
      time:   0.5,
      season: 0.02,
      set:    [ 'camera.focusX=331', 'camera.focusZ=-446' ],
    },
  ],
}
