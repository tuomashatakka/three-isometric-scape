import type { Pose } from './scape-poses.ts'


/** The middle of the causeway, which the three `causeway` poses all sit on. */
const OVER_CROSSING = [ 'camera.focusX=52.4', 'camera.focusZ=32.5' ]

/**
 * The sound island's tidal flat, in world metres.
 *
 * Named rather than repeated, the way the crossing and the strike are: four
 * frames aim at it, and four copies of a pair of coordinates is four chances for
 * one of them to drift off the subject.
 */
const OVER_MARSH = [ 'camera.focusX=-378', 'camera.focusZ=-557' ]

/**
 * The pose sets whose subject is the sea's own level, and the four things it
 * does.
 *
 * Split off `scape-poses.ts` when that file went past the 666-line ceiling for
 * the fourth time, on the same seam `scape-poses-coast.ts`, `-ice.ts` and
 * `-sky.ts` were cut on: these four sets are one subject read four ways. `tide`
 * is the water level itself, `roost` is the water the level has to *move* to
 * change, `saltings` is the ground that level walks across and `causeway` is
 * the crossing it closes. All four share the one trick the subject forces —
 * hold the hour, turn `tide.lag`, and the only thing that can have moved between
 * two frames is the sea — and all four take `tide.spring=0` to get a flat month
 * at the full range rather than a week that happens to suit.
 *
 * They are folded back into `TOURS` at its definition, so `--poses tide` reads
 * exactly as it did before.
 */
export const TIDE_TOURS: Record<string, Pose[]> = {

  /**
   * The state of the sea, twice, in the same light.
   *
   * The tenth set, and the first whose subject is a *difference* rather than a
   * place: a tide is only visible as two frames of one shore, and any two
   * frames taken at two hours of the day differ by the light as well, which is
   * the larger signal. So the hour is held and `tide.lag` is turned instead —
   * half a cycle of lag is the same instant of the same day at the opposite end
   * of the swing, and the only thing that can have moved between `ebb` and
   * `flood` is the water.
   *
   * `ebb` and `flood` are the harbour bank west of the landing, where the
   * ground shelves gently enough for a 0.4 m rise to walk the waterline several
   * metres up the beach and to take the wrack band on the skerries with it.
   * `tide-slack` is the guard: a range of zero has to come back `same` as the
   * scape did before there was a tide, or the switch is not a switch.
   */
  tide: [
    {
      name: 'ebb',
      zoom: 60,
      set:  [ 'camera.focusX=-30', 'camera.focusZ=-24', 'tide.lag=0' ],
    },
    {
      name: 'flood',
      zoom: 60,
      set:  [ 'camera.focusX=-30', 'camera.focusZ=-24', 'tide.lag=6.21' ],
    },
    {
      name: 'tide-slack',
      zoom: 60,
      set:  [ 'camera.focusX=-30', 'camera.focusZ=-24', 'tide.range=0' ],
    },
  ],

  /**
   * The narrows, running and at slack, in one light.
   *
   * The `tide` set's argument for the third time, and the one it fits best. A
   * roost is *only* visible as a difference — flat water and broken water in the
   * same gate an hour and a half apart — and any two frames taken at two hours
   * of one day differ by the light as well, which is the larger signal. So the
   * hour is held and the tide is turned underneath it: `tide.spring=0` is a flat
   * month at the full range, which is what puts the stream at its own maximum
   * without moving the week, and `tide.lag` is what walks the water round the
   * cycle at a fixed hour. At the scape's own hour and lag that lands at 0.99 of
   * the stream; 5.664 hours of lag is high water at the same instant, which is
   * slack.
   *
   * **The tour cannot see this system, and the reason is the frame rather than
   * the clock.** Every whole-world pose in `tour` is 1400 m across and this
   * archipelago's gates are six to forty metres wide — a race in one of them is
   * a handful of pixels there, under the haze, and the tour reports the run as
   * `same` at five of its six poses with the effect drawing correctly. That is
   * not a bug in the run and it is not a reason to open `roost.gate` until an
   * instrument can read it: a tide race is a local thing, and a knob turned
   * until a tool can see it is a knob that has been lied to.
   *
   * `roost` is the strait between the home island's northern shore and the islet
   * off it — 23 m of gate, and the tightest piece of water anyone at the farm
   * would have to cross. `roost-slack` is the same frame at high water and is
   * the whole claim: it has to come back as smooth as the sound around it.
   * `roost-none` is the switch and the control, `roost.strength=0`, which must
   * be the scape this run started from. `roost-calm` is the same frame with
   * `water.whitecap=0`, which is the one frame where the race is the only white
   * water in the picture — the caps are the larger signal at every zoom and this
   * is how the two are told apart. `roost-guard` is a lane through one of the
   * outer skerry chains, where there is no land in the frame to read the water
   * against. `roost-sound` is four gates at once at a frame wide enough to hold
   * the archipelago's middle, which is what says whether the system reads as a
   * sound with tide in it or as a scatter of white smears.
   */
  roost: [
    {
      name: 'roost',
      zoom: 55,
      set:  [ 'camera.focusX=-59', 'camera.focusZ=-26', 'tide.spring=0' ],
    },
    {
      name: 'roost-slack',
      zoom: 55,
      set:  [ 'camera.focusX=-59', 'camera.focusZ=-26', 'tide.spring=0', 'tide.lag=5.664' ],
    },
    {
      name: 'roost-none',
      zoom: 55,
      set:  [ 'camera.focusX=-59', 'camera.focusZ=-26', 'tide.spring=0', 'roost.strength=0' ],
    },
    {
      name: 'roost-calm',
      zoom: 55,
      set:  [ 'camera.focusX=-59', 'camera.focusZ=-26', 'tide.spring=0', 'water.whitecap=0' ],
    },
    {
      name: 'roost-guard',
      zoom: 70,
      set:  [ 'camera.focusX=357', 'camera.focusZ=-11', 'tide.spring=0', 'water.whitecap=0' ],
    },
    {
      name: 'roost-sound',
      zoom: 200,
      set:  [ 'tide.spring=0' ],
    },
  ],

  /**
   * The tidal flat at the sound's beck mouth, at both ends of one spring tide.
   *
   * The `tide` set's argument, applied to the ground that argument is about.
   * Those three frames are the harbour bank west of the home landing, where the
   * shore shelves at about a metre in four and 0.4 m of rise walks the
   * waterline a couple of metres up the beach — which is the most any coast in
   * this scape could show until there was a marsh in it. On a flat whose whole
   * surface stands inside the spring range the same water crosses seventeen
   * metres, and that is a difference no single still can carry.
   *
   * So the hour is held and `tide.lag` is turned, exactly as `ebb` and `flood`
   * do it: half a cycle of lag is the same instant of the same day at the
   * opposite end of the swing, so the only thing that can have moved between
   * `marsh-low` and `marsh-high` is the sea.
   *
   * `tide.spring=0` on all four is the month rather than a cheat, and the
   * causeway set takes it for the same reason: the marsh's two levels are set
   * *outside* half the neap range on purpose, so on a quarter-moon day the water
   * neither covers the flat nor leaves it and the pair comes back as two frames
   * of one shore. A flat month is the state the landform is about. `marsh-near` is the surface itself
   * at a zoom where the drainage gutters, the bare mud and the cordgrass on the
   * turf are three things rather than one brown patch, and `marsh-bare` is the
   * control — the identical frame at `terrain.saltings.top=0`, which is the
   * coast this island had before the run.
   *
   * The sound's flat rather than the home island's, because the home island has
   * none: its beck comes out through the dune belt, on the one coast the silt is
   * refused. No pose in the tour is pointed at any of the three that do.
   */
  saltings: [
    {
      name: 'marsh-low',
      zoom: 70,
      set:  [ ...OVER_MARSH, 'tide.spring=0', 'tide.lag=0' ],
    },
    {
      name: 'marsh-high',
      zoom: 70,
      set:  [ ...OVER_MARSH, 'tide.spring=0', 'tide.lag=6.21' ],
    },
    {
      name: 'marsh-near',
      zoom: 34,
      set:  [ ...OVER_MARSH, 'tide.spring=0', 'tide.lag=0' ],
    },
    {
      name: 'marsh-bare',
      zoom: 70,
      set:  [ ...OVER_MARSH, 'tide.spring=0', 'tide.lag=0', 'terrain.saltings.top=0' ],
    },
  ],

  /**
   * The crossing out to the nearest rock, at both ends of the swing.
   *
   * The eighteenth set, and the second whose subject is a *difference* — the
   * whole claim of a causeway is that the sea takes it and gives it back, and
   * one frame of a bar cannot say which of the three things it is. So the pair
   * is built the way `tide` builds its own: the hour and the week are held and
   * only the sea is moved, because two frames taken at two hours of the day
   * differ by the light as well and the light is the larger signal.
   *
   * `tide.spring=0` on both is the month rather than a cheat. It is the
   * documented switch for the monthly swing — a coast whose every tide is the
   * same size — so both frames are taken at the full spring range, which is the
   * only state in which the crossing is covered at all. `tide.lag` then puts
   * that range's high water and its low water at the same captured instant, the
   * same half-cycle turn `flood` and `ebb` use.
   *
   * `causeway-reach` is the third frame and the one that says *why* there is a
   * bar here: at 90 m the mainland shore, the thirteen metres of water and the
   * light on the rock at the far end are all in one picture, which is the
   * composition the search actually found.
   *
   * All three are turned to 315 rather than left at the default 45. The bar runs
   * at 32° and the default heading looks very nearly along it, which foreshortens
   * a thirteen-metre crossing into a smudge between two rocks; a quarter turn off
   * that puts it across the frame, which is the one angle a strip this narrow can
   * be read from at all.
   */
  causeway: [
    {
      name: 'causeway',
      rot:  315,
      zoom: 24,
      set:  [ ...OVER_CROSSING, 'tide.spring=0', 'tide.lag=0' ],
    },
    {
      name: 'causeway-covered',
      rot:  315,
      zoom: 24,
      set:  [ ...OVER_CROSSING, 'tide.spring=0', 'tide.lag=6.21' ],
    },
    {
      name: 'causeway-reach',
      rot:  315,
      zoom: 90,
      set:  [ ...OVER_CROSSING, 'tide.spring=0', 'tide.lag=0' ],
    },
  ],
}
