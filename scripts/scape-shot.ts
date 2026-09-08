import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import type { Browser, ConsoleMessage, Page } from 'playwright-core'
import { GPU_FLAGS, SOFTWARE_FLAGS, findChromium, serve } from './browser.ts'
import { parseArgs } from './args.ts'
import type { Args } from './args.ts'
import { SCAPE_CONFIG } from '../src/scene/config.ts'
import { bowPeak } from '../src/scene/rainbow.ts'
import { stormPeak } from '../src/scene/storm.ts'


/**
 * The brightest strike the default front carries, and when it fires.
 *
 * Resolved from the config rather than written down, because a strike is a fact
 * about the seed: a phase typed into a pose would go stale the moment anybody
 * retuned the storm or moved the seed, and it would go stale *silently* — the
 * pose would photograph an empty sky and the diff would report `same`, which is
 * indistinguishable from the system being broken.
 *
 * The offset is a fiftieth of one flash into the strike rather than its first
 * instant, which is inside the first stroke and still at nine tenths of full
 * brightness. It is not zero because the phase reaches the page as a rounded
 * decimal, and a value that landed a millionth *before* the strike would be a
 * frame of clear sky at the far end of the front's whole cycle.
 */
const STRIKE = stormPeak(SCAPE_CONFIG)

const AT_STRIKE = STRIKE
  ? [ `weather.time=${(STRIKE.strike.phase + SCAPE_CONFIG.storm.flash * 0.02).toFixed(6)}` ]
  : []

/** The same front a quarter of a cycle on, which no strike can reach. See `STORM_SLOTS`. */
const NO_STRIKE = STRIKE
  ? [ `weather.time=${(STRIKE.strike.phase + 0.25).toFixed(6)}` ]
  : []

const OVER_STRIKE = STRIKE
  ? [ `camera.focusX=${Math.round(STRIKE.site.x)}`, `camera.focusZ=${Math.round(STRIKE.site.z)}` ]
  : []

/**
 * The instant of the front the bow is brightest at, and the instant it cannot
 * reach.
 *
 * Asked of `bowPeak` rather than written down here, for the reason `AT_STRIKE`
 * asks `stormPeak`: the phase is a property of the shape of the front, and a
 * decimal copied into this file goes stale the moment `weather.ts` reshapes a
 * band. `NO_BOW` is the *heart* of that same band — full cover, no gap in the
 * cloud, and therefore nothing to disperse — which makes it the control frame
 * of the set.
 */
const AT_BOW = [ `weather.time=${bowPeak().toFixed(6)}` ]
const NO_BOW = [ 'weather.time=0.3' ]

/** The middle of the sound's inlet, which four of the `fjord` poses sit on. */
const SOUND_INLET = [ 'camera.focusX=-306', 'camera.focusZ=-374' ]

/** The crown of the fell, which is the steepest and least built-on ground there is. */
const FELL_CROWN = [ 'camera.focusX=300', 'camera.focusZ=-480' ]

/**
 * The broadest haul-out in the guard, which the three `haulout` poses sit on.
 *
 * Chosen by measurement rather than by eye: it is the rock the search deals the
 * most animals, and four of the eight are on ledges the spring tide covers — so
 * it is the one rock in the archipelago where the whole of the claim is inside
 * one frame.
 */
const HAUL_ROCK = [ 'camera.focusX=300', 'camera.focusZ=375' ]

/**
 * The seaward edge of that rock, where the animals the tide reaches are lying.
 *
 * A second anchor rather than a closer zoom on the first: the colony is dealt
 * round the whole crown, so a close frame on the middle of the rock is a close
 * frame on the emptiest part of it.
 */
const HAUL_EDGE = [ 'camera.focusX=305', 'camera.focusZ=366' ]

/** The middle of the causeway, which the three `causeway` poses all sit on. */
const OVER_CROSSING = [ 'camera.focusX=52.4', 'camera.focusZ=32.5' ]

/** One camera and clock the scape gets photographed from. */
export interface Pose {
  name:    string
  rot?:    number
  zoom?:   number
  time?:   number
  season?: number
  set?:    string[]
}

/**
 * The six frames stage 5 of the brief asks for.
 *
 * "Both zoom extremes and across the day/night cycle" is not a suggestion —
 * most of this scape's historical bugs were angle- or time-dependent and
 * invisible from the default pose, which is exactly why the brief says it. One
 * command, one browser launch, six answers.
 */
export const TOURS: Record<string, Pose[]> = {
  tour: [
    { name: 'default' },
    { name: 'near', zoom: 10 },
    { name: 'far', zoom: 540 },
    { name: 'noon', time: 0.5 },
    // A night pose now has to name a week as well as an hour. The sun runs a
    // seasonal arc, and at this latitude the default midsummer year has no
    // night in it at all — an unqualified 'night' captured a white one. Late
    // autumn puts the sun twenty-six degrees under at the same hour.
    { name: 'night', time: 0.02, season: 0.78 },
    { name: 'winter', season: 0.02 },
  ],

  /**
   * The lightning, at the one instant of the front that has any in it.
   *
   * The tour cannot see this system and no arrangement of cameras would fix it:
   * every other thing in the scape is somewhere in every frame, and a strike is
   * somewhere for two thirds of a second in seven minutes. What a pose has to
   * name here is not a place but a *time* — see `STRIKE` — and every frame in
   * this set except the last one names the same one.
   *
   * `storm` is the whole archipelago at the default frame, which is what the
   * flash was sized against: a lit cloud two hundred metres across over an
   * island four hundred metres out. `storm-night` is the same instant in the
   * dark half of the year, where an additive flash has the most to add and the
   * grade has the least. `storm-fork` drops onto the striking island itself,
   * because the channel is thirty-four metres of ribbon that is deliberately
   * faded out of every wide frame — the two ends of the zoom are two different
   * pictures of one strike, and a set that only held one of them would be
   * testing half the module.
   *
   * `storm-clear` is the control, and it is the frame that catches the failure
   * this system is most likely to have: a quarter of a cycle on, where the front
   * carries no strike at all. It must be identical to the reference. A flash
   * that showed up *there* would be lightning out of a clear sky, which is
   * exactly what a schedule read against the wrong phase looks like.
   */
  storm: [
    { name: 'storm', set: AT_STRIKE },
    { name: 'storm-night', time: 0.02, season: 0.78, set: AT_STRIKE },
    { name: 'storm-fork', zoom: 70, set: [ ...OVER_STRIKE, ...AT_STRIKE ]},
    { name: 'storm-clear', set: NO_STRIKE },
  ],

  /**
   * The bow, at three heights of sun and once with nothing to make one from.
   *
   * The tour cannot see this system, for a reason it shares with the storm and
   * a second reason of its own. The first is the front: a bow stands on the
   * *edges* of a shower, and the six frames of `tour` are all parked on one
   * phase of the weather that is not one of them. The second is the sun. A
   * rainbow's arc is 42° from the point opposite the sun, so the whole of it is
   * under the sea whenever the sun is higher than that — and this coast's
   * midsummer sun stands at 42.1° at the hour the scape opens on, a tenth of a
   * degree over the line. The opening frame therefore has the *outer* bow in it
   * and not the inner one, which is correct and is also exactly the sort of
   * thing a set of six wide frames would report as nothing at all.
   *
   * So these four move the hour rather than the camera. `bow-morning` is the
   * mid-morning sun at 28°, which stands both arcs well clear of the water;
   * `bow-low` is late evening at 10°, where the arc is at its tallest and the
   * gap between the two bows is widest; `bow-noon` is the one frame in the day
   * that has only the secondary in it, and it is there to prove that the
   * horizon takes the inner arc rather than the module switching off; and
   * `bow-clear` is the control, parked in the heart of the same band, where
   * full cover leaves no sunlight to disperse. It must be identical to the
   * reference — a bow in `bow-clear` would be an arc drawn out of a curve that
   * had stopped reading the front.
   */
  bow: [
    { name: 'bow-morning', time: 0.3, set: AT_BOW },
    { name: 'bow-low', time: 0.85, set: AT_BOW },
    { name: 'bow-noon', time: 0.5, set: AT_BOW },
    { name: 'bow-clear', time: 0.3, set: NO_BOW },
  ],

  /**
   * The lighthouse, from four sides, at night.
   *
   * The tour aims at nothing in particular and the beacon is 74.7 metres out to
   * the south-east, so no pose in it has ever had the tower in frame — which is
   * how a heading-dependent beam bug survived six green diffs. These four sit on
   * the light itself and turn all the way around it, because the failure was a
   * render-order tie broken by projected depth: it flips with the camera's yaw,
   * and a single heading can only ever photograph one side of the flip.
   *
   * The view size is chosen so the shoreline is still in the corner. Beams over
   * water and beams over ground in the same frame is the whole comparison.
   */
  beacon: [ 0, 90, 180, 270 ].map(rot => ({
    name:   `beacon-${rot}`,
    rot,
    zoom:   90,
    time:   0.02,
    season: 0.78,
    set:    [ 'camera.focusX=60.9', 'camera.focusZ=39.3' ],
  })),

  /**
   * The shoreline, from the water's side.
   *
   * Added for the same reason `beacon` was. Every pose in `tour` is aimed at the
   * middle of the home island: `near` at ten metres is standing in the farmyard,
   * `default` and `far` take in the whole archipelago at better than half a
   * metre to the pixel, and a coastline at that scale is a hairline. So a change
   * that repaints every shore in the scape reads as `same` at all six — not
   * because it is invisible, but because the instrument is not pointed at it.
   *
   * These four are. `wash` is one bay at a zoom where the water meets the
   * ground; `lee` is the *same* frame with the wind turned right around, which
   * is the whole exposure claim as a picture — whatever the surf does, it has to
   * do it on the other side of the island here; `shores` pulls back far enough
   * to hold the home island's entire coast plus its skerries; and `frozen` is
   * the winter, where the ice is supposed to take the white water away.
   */
  coast: [
    { name: 'wash', zoom: 90, set: [ 'camera.focusX=-30', 'camera.focusZ=-30' ]},
    {
      name: 'lee',
      zoom: 90,
      set:  [ 'camera.focusX=-30', 'camera.focusZ=-30', 'wind.bearing=74' ],
    },
    { name: 'shores', zoom: 260, set: [ 'camera.focusX=0', 'camera.focusZ=0' ]},
    {
      name:   'frozen',
      zoom:   90,
      season: 0.02,
      set:    [ 'camera.focusX=-30', 'camera.focusZ=-30' ],
    },
  ],

  /**
   * The farmyard, from close enough to see what stands in it.
   *
   * Added for the reason `beacon` and `coast` were, and it is the same reason
   * each time: the tour is aimed at the middle of the archipelago, and anything
   * whose whole scale is a building is a few pixels in five of its six frames.
   * `near` at ten metres is the exception, and it is focused on the world origin
   * — which is open yard between the farmhouse and the sauna and takes neither
   * of them in.
   *
   * These three sit on the home island's steading at a view size that holds the
   * house, the sauna and the ground between them. `yard` is the authored light;
   * `yard-winter` is the same frame at midwinter, where anything that answers to
   * the year has to answer differently; and `yard-night` is the frame a light
   * source or a silhouette shows up in and the graded daytime one hides.
   */
  steading: [
    { name: 'yard', zoom: 48, set: [ 'camera.focusX=-13', 'camera.focusZ=5' ]},
    {
      name:   'yard-winter',
      zoom:   48,
      season: 0.02,
      set:    [ 'camera.focusX=-13', 'camera.focusZ=5' ],
    },
    {
      name:   'yard-night',
      zoom:   48,
      time:   0.02,
      season: 0.78,
      set:    [ 'camera.focusX=-13', 'camera.focusZ=5' ],
    },

    /**
     * The same yard four hours earlier, and the only pose in the scape that
     * catches an evening rather than a night.
     *
     * `yard-night` is half past midnight, which is deliberately *after* the
     * household has turned in — so the lamps in the windows are banked to a
     * stove glow there, and a pose that only ever saw them banked could not tell
     * a farm with people in it from one without. Nine in the evening is when the
     * windows are actually lit, and the week is held in the dark half of the
     * year for the same reason `night` pins one: at 68° north an hour without a
     * week is full daylight for half the year.
     */
    {
      name:   'yard-evening',
      zoom:   48,
      time:   0.875,
      season: 0.78,
      set:    [ 'camera.focusX=-13', 'camera.focusZ=5' ],
    },
  ],

  /**
   * The rocks in the open sea, from close enough to be measured.
   *
   * Added for the reason `beacon`, `coast` and `steading` were, and it is the
   * same reason a fourth time. The tour *can* see the guard — the chains read
   * as strings of rock across water that used to be empty at `default`, `far`
   * and `noon` — but a forty-metre rock in a 1400 m frame is twenty pixels, so
   * forty-nine of them together move a fraction of one per cent of the pixels
   * and the whole-frame column reports `same`. `maxblock` is the honest number
   * there, and a pose that fills the frame with a reef is a better one still.
   *
   * `reef` is the chain at (305, -99), a 199 m line of five, at a view that
   * holds the whole of it and the water either side. `reef-near` is its widest
   * rock at a zoom where the drowned shelf, the break on it and the dry crown
   * are three separate things rather than one speck. `reef-lee` is the
   * *identical* frame to `reef` with the wind turned right around, which is the
   * whole claim that a rock breaks white on the side the sea is running at,
   * stated as a picture — same instrument, same argument as `coast/lee`. And
   * `reef-winter` is midwinter, where the shallows the guard has created are
   * the first water in the archipelago to shut.
   */
  guard: [
    { name: 'reef', zoom: 230, set: [ 'camera.focusX=305', 'camera.focusZ=-99' ]},
    { name: 'reef-near', zoom: 70, set: [ 'camera.focusX=405', 'camera.focusZ=-81' ]},
    {
      name: 'reef-lee',
      zoom: 230,
      set:  [ 'camera.focusX=305', 'camera.focusZ=-99', 'wind.bearing=74' ],
    },
    {
      name:   'reef-winter',
      zoom:   230,
      season: 0.02,
      set:    [ 'camera.focusX=305', 'camera.focusZ=-99' ],
    },
  ],

  /**
   * The colony on the guard, at both ends of one spring tide.
   *
   * Added for the reason `guard` was, and then for a second reason no other pose
   * set in this file has. The first is the familiar one: a seal is two metres
   * long and the nearest haul-out is three hundred metres off the origin every
   * frame in `tour` is aimed at, so at the whole-world poses the colony is a
   * scatter of sub-pixel specks and the frame column reports `same`.
   *
   * The second is that the thing worth photographing is not the animals. It is
   * *how many* of them there are, and that is a difference between two states of
   * the sea rather than anything in one picture. So `haul-low` and `haul-high`
   * are the identical frame — same rock, same week, same camera — at low water
   * and at high water of the same spring tide, and the diff between them is the
   * claim. Same instrument and same argument as `coast/lee` and `reef-lee`.
   *
   * The two hours are not guesses. `tide.lag`, the lunar day and the moon's own
   * phase decide when high water is, so the pair was solved rather than chosen:
   * week 0.687 is where `springAmount` reaches 1 with the sun still well up, and
   * 0.35 and 0.6 of that day are the low and the high inside it — ±0.4 m, which
   * is the whole of the default spring range.
   *
   * `haul-edge` and `haul-edge-high` are the same pair again on the rock's
   * seaward side, at a zoom where an animal is an animal rather than a mark.
   * That is the frame that catches a seal lying through its own stone or hanging
   * off the crown — it caught exactly that while this run was being written —
   * and it is where the water actually taking one is legible rather than
   * statistical.
   */
  haulout: [
    {
      name:   'haul-low',
      zoom:   19,
      time:   0.35,
      season: 0.687,
      set:    HAUL_ROCK,
    },
    {
      name:   'haul-high',
      zoom:   19,
      time:   0.6,
      season: 0.687,
      set:    HAUL_ROCK,
    },
    {
      name:   'haul-edge',
      zoom:   11,
      time:   0.35,
      season: 0.687,
      set:    HAUL_EDGE,
    },
    {
      name:   'haul-edge-high',
      zoom:   11,
      time:   0.6,
      season: 0.687,
      set:    HAUL_EDGE,
    },
  ],

  /**
   * The drowned valley in the sound, and the bar across its mouth.
   *
   * Added for the reason `beacon`, `coast`, `steading` and `guard` were, and it
   * is the same reason a sixth time. The inlet is 300 m out on the far side of
   * the archipelago, so the four whole-world poses in the tour carry it at about
   * fifty pixels a side — enough to move `maxblock` and nowhere near enough to
   * judge.
   *
   * All five are turned off the default 45°, and that is the one thing about
   * this set that was measured rather than chosen: an inlet photographed along
   * its own axis is foreshortened into a nick in the coast. 135° puts the
   * sound's trench broadside and its walls in the light; the fell's runs the
   * other way, so its frame is the one pose here left at 45°.
   *
   * `fjord` holds the whole of the sound's, mouth to head, with the ground
   * either side. `fjord-sill` sits on the entrance at a zoom where the bar
   * across it is a shelf rather than a shade of blue. `fjord-noon` is the light
   * the shape reads best under, and `fjord-winter` the frame where the ice
   * front — which follows depth — has to treat the trench differently from the
   * shallows over its bar. `fjord-fell` is the second inlet, on the other great
   * southern landmass, which is what says the section is per-island.
   */
  fjord: [
    { name: 'fjord', rot: 135, zoom: 200, set: SOUND_INLET },
    { name: 'fjord-sill', rot: 135, zoom: 80, set: [ 'camera.focusX=-312', 'camera.focusZ=-372' ]},
    { name: 'fjord-noon', rot: 135, zoom: 200, time: 0.5, set: SOUND_INLET },
    { name: 'fjord-winter', rot: 135, zoom: 200, season: 0.02, set: SOUND_INLET },
    { name: 'fjord-fell', rot: 45, zoom: 200, set: [ 'camera.focusX=222', 'camera.focusZ=-402' ]},
  ],

  /**
   * Two sides of one hill.
   *
   * Added for the reason `fjord` and `coast` were, and it is the same reason
   * again: the aspect — the moss on the shaded faces, the bleach on the sunward
   * ones and the snow line that swings between them — landed measuring `same` at
   * every pose in the tour, and the tour was right. `default` and `far` frame
   * the whole archipelago, where an island is forty pixels across; `near` at ten
   * metres stands in the farmyard, which is level ground painted over by the
   * yard, the track and a thousand instances of grass. The one thing in the tour
   * that could have seen a hillside is the thing none of its six frames contains.
   *
   * The fell is the subject because it is the steepest ground in the
   * archipelago — a 15 m crown over a 100 m island — and the least built on, so
   * what is in frame is ground rather than farm. `aspect` and `aspect-turned`
   * are the same hill from opposite headings, which is the whole claim in two
   * pictures: the face that is dark and green from one is pale from the other.
   * `aspect-thaw` is the week the snow line's swing lives in — a *thaw* rather
   * than midwinter, because at `season: 0.02` the cover is 1.0 and a line that
   * has run off the top of the island cannot be seen to swing; 0.16 leaves
   * roughly two thirds of it, which is when where the line falls is the whole
   * picture. `aspect-home` is the home island's own upland, where the effect has
   * to survive being seen next to a farm.
   */
  aspect: [
    { name: 'aspect', rot: 45, zoom: 170, time: 0.5, set: FELL_CROWN },
    { name: 'aspect-turned', rot: 225, zoom: 170, time: 0.5, set: FELL_CROWN },
    { name: 'aspect-thaw', rot: 45, zoom: 170, time: 0.5, season: 0.16, set: FELL_CROWN },
    { name: 'aspect-home', rot: 45, zoom: 90, time: 0.5, set: [ 'camera.focusX=24', 'camera.focusZ=8' ]},
  ],

  /**
   * The chapel on its knoll, from close enough to read the building.
   *
   * Added for the reason `beacon`, `coast`, `steading` and `guard` were, and it
   * is the same reason a fifth time. The chapel is 31 m north-east of the world
   * origin, which is exactly far enough for `near` at ten metres to be standing
   * in the farmyard with its back to it — so the one pose in the tour that could
   * resolve a ten-metre tower is the one pose aimed away from it.
   *
   * `chapel` holds the whole enclosure: the building, the wall, the gate and the
   * markers between them. `chapel-far` pulls back to the view the composition
   * claim is actually about — the church on its rise *above* the farm, with the
   * steading in the same frame, which is the only way to see whether the siting
   * search put it where a parish would. `chapel-evening` is the hour the windows
   * are lit and the week the north has a dark one, the same pair `yard-evening`
   * pins and for the same reason. `chapel-winter` is midwinter, where a
   * limewashed wall has to hold its own against lying snow.
   */
  chapel: [
    { name: 'chapel', zoom: 46, set: [ 'camera.focusX=26.8', 'camera.focusZ=15.1' ]},
    { name: 'chapel-far', zoom: 120, set: [ 'camera.focusX=5', 'camera.focusZ=8' ]},
    {
      name:   'chapel-evening',
      zoom:   46,
      time:   0.875,
      season: 0.78,
      set:    [ 'camera.focusX=26.8', 'camera.focusZ=15.1' ],
    },
    {
      name:   'chapel-winter',
      zoom:   46,
      season: 0.02,
      set:    [ 'camera.focusX=26.8', 'camera.focusZ=15.1' ],
    },
  ],

  /**
   * The smokehouse, and the plume that is the whole point of it.
   *
   * Added for the reason `chapel` was, and it is the same reason again: the hut
   * is 3.4 m long against the chapel's fourteen, so at the tour's default frame
   * it is a smudge and at `near`'s ten metres the camera is standing beside it
   * facing the other way. A building this small is either photographed on
   * purpose or not photographed.
   *
   * `smokehouse` reads the building — turf roof, log courses, the billets
   * against the blind gable — and the cowl the smoke leaves through. `harbour`
   * pulls back to the claim the siting is actually about: the hut and the water
   * it works for in one frame, so a reviewer can see whether the search put it
   * with the boats or wandered off up the hill. `smokehouse-still` is the
   * same close frame on a windless day, because the plume is laid over by the
   * wind and a column that only reads when it is bent is a column that vanishes
   * the first calm morning.
   */
  smokehouse: [
    { name: 'smokehouse', zoom: 30, set: [ 'camera.focusX=-8.5', 'camera.focusZ=-10.3' ]},
    { name: 'harbour', zoom: 40, set: [ 'camera.focusX=-13', 'camera.focusZ=-21' ]},
    {
      name: 'smokehouse-still',
      zoom: 30,
      set:  [ 'camera.focusX=-8.5', 'camera.focusZ=-10.3', 'wind.strength=0' ],
    },
  ],

  /**
   * The pier, and the two coasts that answer differently about one.
   *
   * The tour cannot see this one and it is worth saying exactly why: a pier here
   * is nine metres of two-and-a-half-metre deck standing a metre over the water,
   * which at the tour's default 1400 m frame is a hairline and at `near`'s ten
   * metres is inside the farmyard on the wrong side of the island. The one set
   * already aimed at this ground — `smokehouse`'s `harbour` frame — looks up the
   * *bank*, away from the water the trestle is out over, and it is on an island
   * that has no pier at all.
   *
   * `pier` reads the structure on the ridge island: the bents, the cut of the
   * piles down to the bed, the bollards and the ladder at the head. `pier-reach`
   * pulls back to the claim the siting makes — the boathouse, the trestle beside
   * it and the open water it walks into, in one frame. `pier-none` is the third
   * and it is the control: the home island's harbour at the same view, where the
   * shelf gives no pier at all. Half of what this run decided is which coasts
   * *cannot* have one, and a set with no refusal in it cannot show that.
   */
  pier: [
    { name: 'pier', zoom: 30, set: [ 'camera.focusX=-139', 'camera.focusZ=120.7' ]},
    { name: 'pier-reach', zoom: 62, set: [ 'camera.focusX=-152', 'camera.focusZ=126' ]},
    { name: 'pier-none', zoom: 62, set: [ 'camera.focusX=-13', 'camera.focusZ=-28' ]},
  ],

  /**
   * The croft, and the water it is cut off by.
   *
   * The lesson `smokehouse` and `chapel` both wrote down, applied before the
   * fact rather than after it: this hut is 3.8 m long and it stands 66 m out
   * from the island's middle, so at the tour's default frame it is two pixels of
   * turf against open water and at `near` it is off the edge entirely.
   *
   * `croft` reads the building — the boarded walls, the stone flue, the oars
   * against the blind gable. `croft-reach` pulls back far enough to hold the
   * hut, the harbour it is worked from and the water between them in one frame,
   * which is the claim the siting actually makes and the only way to see whether
   * the search picked a short row or the prettiest rock. `croft-evening` is the
   * hut after dark: the silhouette, the plume standing over it, and whichever of
   * its two panes the occupancy roll has lit. It is deliberately the *evening*
   * rather than the tour's small hours, for `yard-evening`'s reason — a
   * household that turned in hours ago has its lamps banked, and a pose that
   * only ever saw them banked cannot tell a lit window from an unglazed one.
   *
   * Whether either pane is lit is a roll rather than a promise. At the default
   * seed both of the croft's come up dark, which is a hut whose people are
   * ashore — the same answer `windows.occupancy` gives four windows in ten
   * everywhere else in the archipelago, and not a thing to tune a weight
   * around.
   */
  croft: [
    { name: 'croft', zoom: 26, set: [ 'camera.focusX=-66.2', 'camera.focusZ=-37' ]},
    { name: 'croft-reach', zoom: 110, set: [ 'camera.focusX=-40', 'camera.focusZ=-33' ]},
    {
      // Nine in the evening in late autumn, which is `window-evening`'s hour and
      // for its reason: the sun runs a seasonal arc, so an unqualified late hour
      // in the default midsummer year photographs broad daylight.
      name:   'croft-evening',
      zoom:   24,
      time:   0.875,
      season: 0.78,
      set:    [ 'camera.focusX=-66.2', 'camera.focusZ=-37' ],
    },
  ],

  /**
   * One farmhouse wall, from close enough to see a window as a window.
   *
   * The sixth set added for the reason the first five were, and the smallest
   * subject yet: a pane is 0.8 m across, which at the tour's closest frame is
   * four pixels and at its default one is a third of a pixel. Every set before
   * this was aimed at something a building tall; this is aimed at something a
   * *window* tall, because that is the scale at which the kit's glass and the
   * lamplight behind it are either there or not — and for two runs they were not,
   * with no pose in the scape pointed anywhere near them.
   *
   * `window` is the daylight frame: the surround, the reveal and the dark glass
   * in it. `window-evening` is the same wall at nine in the evening in late
   * autumn, which is the hour the household has its lamps lit — the one frame in
   * the scape where a window is a light source rather than a hole.
   *
   * The heading is deliberately not the default 45°. The farmhouse turns its
   * front to the yard and the yard is west of it, so the door wall — the one with
   * four of the house's thirteen panes in it — faces away from the camera at
   * every pose the scape opens on.
   */
  window: [
    {
      name: 'window',
      rot:  225,
      zoom: 16,
      time: 0.5,
      set:  [ 'camera.focusX=-8', 'camera.focusZ=3' ],
    },
    {
      name:   'window-evening',
      rot:    225,
      zoom:   16,
      time:   0.875,
      season: 0.78,
      set:    [ 'camera.focusX=-8', 'camera.focusZ=3' ],
    },
  ],

  /**
   * The rough grazing, from close enough to see what is standing on it.
   *
   * The seventh set added for the reason the first six were, and the smallest
   * *subject* of the lot after the window: a ewe is 1.4 m long, which is three
   * pixels at the tour's default frame and nothing at all pulled out. The home
   * island's two flocks are on the east shoulder at (32, 12) and (32, -14),
   * which no pose in the tour is aimed at — `near` at ten metres is in the
   * farmyard, forty-five metres west of the nearer of them.
   *
   * `flock` holds one disc at a view where an animal is an animal — eleven
   * metres, which is about as far out as a fleece is still a fleece rather than
   * two pale pixels. `graze` pulls back to hold both of the home island's
   * flocks and the walled hay meadow between them, which is the composition
   * claim: the stock is *outside* the wall, on the ground the wall was built
   * to keep them off.
   * `flock-winter` is midwinter, where lying snow takes the ground the flock
   * stands on and a fleece has to hold its own against it — the one frame where
   * a white animal on white ground either reads or does not.
   */
  grazing: [
    { name: 'flock', zoom: 11, set: [ 'camera.focusX=32', 'camera.focusZ=12' ]},
    { name: 'graze', zoom: 45, set: [ 'camera.focusX=30', 'camera.focusZ=-1' ]},
    {
      name:   'flock-winter',
      zoom:   11,
      time:   0.5,
      season: 0.06,
      set:    [ 'camera.focusX=32', 'camera.focusZ=12' ],
    },
  ],

  /**
   * The bottom of the shallows, from close enough for the light on it to read.
   *
   * The eighth set added for the reason the first seven were, and the first one
   * whose subject is not a *thing* at all: the caustic net is a metre-scaled
   * pattern on the seabed, so it is a subject with a size the way a ewe or a
   * pane is, and the size is about two and a half metres. `coast/wash` at ninety
   * metres is the closest any existing pose comes to the water, and at that view
   * a cell is fifteen pixels of a shore fringe a few pixels wide — the whole
   * archipelago's shallows together move seven hundredths of one per cent of the
   * frame, which the whole-frame column correctly calls `same`.
   *
   * `shallows` is the harbour bank west of the landing, at a view where the
   * bottom of the water is a surface rather than a colour. `shallows-noon` is
   * the same frame with the sun at its highest, which is the top of the ramp the
   * effect is scaled by — that ramp saturates well before noon, so this pose and
   * `shallows-winter` are its two ends and the authored pose sits between them. `shallows-winter` is
   * midwinter, where the sun does not clear the horizon at this latitude *and*
   * the ice has shut the bank: the net has to be absent twice over.
   *
   * `shallows-far` is the guard. The net is procedural and has no mipmap to fall
   * back on, so at a view where a cell is smaller than a pixel it would be
   * moiré marching across the whole sea rather than detail — `scapeCaustics`
   * measures its own footprint with `fwidth` and hides instead. This pose is the
   * frame that has to come back `same` for that to be true, and it is aimed at
   * the same water the other three are.
   */
  shallows: [
    { name: 'shallows', zoom: 26, set: [ 'camera.focusX=-30', 'camera.focusZ=-24' ]},
    {
      name: 'shallows-noon',
      zoom: 26,
      time: 0.5,
      set:  [ 'camera.focusX=-30', 'camera.focusZ=-24' ],
    },
    {
      name:   'shallows-winter',
      zoom:   26,
      time:   0.5,
      season: 0.02,
      set:    [ 'camera.focusX=-30', 'camera.focusZ=-24' ],
    },
    { name: 'shallows-far', zoom: 620, set: [ 'camera.focusX=-30', 'camera.focusZ=-24' ]},
  ],

  /**
   * The beck, from close enough for the water in it to be water.
   *
   * The ninth set added for the reason the first eight were. The home island's
   * course runs from a spring at (19, 23) to a mouth at (36, 56) — sixty-odd
   * metres off the world origin every pose in `tour` is aimed at, and three
   * metres wide where it starts. At `default` that is a hairline and at `near`
   * it is off the bottom of the frame.
   *
   * The two close frames are aimed at the *wetted* reach rather than at the
   * course, and those are not the same sixteen metres: the water runs from the
   * spring down to about (26, 36), and everything below that is tidal inlet the
   * sea's own surface has always drawn.
   *
   * `beck` is the middle of that reach, where the fall is steepest and the
   * white water is; `beck-mouth` is the tideline, which is the one frame that
   * shows the sheet meeting the sea rather than ending in the air above it;
   * `beck-winter` is the same middle reach in deep winter, at *noon* and a
   * fortnight off the shortest day — pinned that way for the reason
   * `grazing/flock-winter` is: an unqualified midwinter frame at 68° north is a
   * polar night, and a frame with no light in it cannot say whether the water
   * in it has locked; and `beck-far` is the guard — the water is a metre-scaled surface
   * with no mipmap behind it, so a view where a streak is under a pixel has to
   * come back as a channel rather than as a shimmer.
   */
  beck: [
    { name: 'beck', zoom: 26, set: [ 'camera.focusX=22.5', 'camera.focusZ=29' ]},
    { name: 'beck-mouth', zoom: 22, set: [ 'camera.focusX=26', 'camera.focusZ=36.5' ]},
    {
      name:   'beck-winter',
      zoom:   26,
      time:   0.5,
      season: 0.06,
      set:    [ 'camera.focusX=22.5', 'camera.focusZ=29' ],
    },
    { name: 'beck-far', zoom: 320, set: [ 'camera.focusX=22.5', 'camera.focusZ=29' ]},
  ],

  /**
   * The fall, from the two sides a fall has.
   *
   * Added for the reason `beck` was and at a tighter zoom again: the home
   * island's step is a metre and a half of drop over eight tenths of a metre of
   * channel, three and a half metres across. At `beck`'s 26 m of view it is four
   * pixels of white in the middle of a stripe.
   *
   * `force` looks down the flow at the sheet, which is the heading the drop
   * reads at — the home island's water goes over on a bearing of 66°, and at
   * the other three quarter-turns the lip is either edge-on or behind the hill
   * it is cut into. `force-across` is the same fall from 330°, side on and
   * pulled back far enough to hold the chapel, which is where the *throw* reads:
   * the sheet leaves the lip travelling and lands out from the foot, and a frame
   * square on cannot show that. `force-winter` is the column locked, at noon and
   * a fortnight off the shortest day, pinned that way for the reason
   * `beck-winter` is. `force-shield` is the biggest fall in the archipelago, on
   * the one island whose course falls twenty-two metres — a check that the sheet
   * is sized against the drop it found rather than against the home island's.
   */
  force: [
    { name: 'force', rot: 60, zoom: 14, set: [ 'camera.focusX=19.6', 'camera.focusZ=27.5' ]},
    { name: 'force-across', rot: 330, zoom: 16, set: [ 'camera.focusX=19.6', 'camera.focusZ=27.5' ]},
    {
      name:   'force-winter',
      rot:    60,
      zoom:   14,
      time:   0.5,
      season: 0.06,
      set:    [ 'camera.focusX=19.6', 'camera.focusZ=27.5' ],
    },
    { name: 'force-shield', rot: 60, zoom: 18, set: [ 'camera.focusX=-36.7', 'camera.focusZ=582.9' ]},
  ],

  /**
   * The turf cutting, which is a hole and photographs like one.
   *
   * The lesson every one of the sets above wrote down, applied to a feature that
   * needs it more than most: a peat bank is eleven metres by seven and its whole
   * claim is a step nine tenths of a metre high. At `tour/default` that is four
   * pixels of dark ground and at `near` the camera is over the yard, forty
   * metres away and facing the other way.
   *
   * It is also the one feature in the scape whose reading depends on the *yaw*
   * rather than only on the zoom. A cutting seen from the downhill side is a
   * wall of peat; seen from over the face it is a rectangle of dark paint with
   * nothing standing in it at all — which is exactly the failure `scape:map`'s
   * `face ... standing` exists to catch, and exactly the one a single camera
   * angle would hide. So there are two close frames a quarter turn apart, and
   * the pair is the check.
   *
   * `peat` looks along the face from the downhill side, where the step and the
   * ricks stood out on the bank are both in frame. `peat-across` is the same
   * working a quarter turn round, which is the angle a flat cut would look
   * identical at — and it is 290° rather than the 110° that is the same quarter
   * turn the other way, because from there the wood on the seaward shoulder
   * stands between the camera and the cutting and the frame is spruces.
   * `peat-moor` is the claim the siting makes — the working, the pool above it
   * and the mill on the shoulder in one frame, so a reviewer can see whether the
   * search took the wet low ground or wandered up the hill.
   *
   * Nothing here is in {@link STILL}, and nothing needs to be: a cut face does
   * not move.
   */
  peat: [
    { name: 'peat', rot: 20, zoom: 24, set: [ 'camera.focusX=29.1', 'camera.focusZ=-21.8' ]},
    { name: 'peat-across', rot: 290, zoom: 24, set: [ 'camera.focusX=29.1', 'camera.focusZ=-21.8' ]},
    { name: 'peat-moor', zoom: 90, set: [ 'camera.focusX=31', 'camera.focusZ=-8' ]},
  ],

  /**
   * The pool on the home island's shoulder, and one of the far ones.
   *
   * Added for the reason `beacon`, `chapel` and `beck` were, and it is the same
   * reason again: the home tarn is 33 m east of the origin and about twelve
   * across, so `near` at ten metres is standing in the farmyard with the yard
   * wall between it and the water, and `default` renders the whole pool in
   * roughly the area of a full stop.
   *
   * `tarn` is the pool itself, close enough to read the depth tint and the reed
   * bed at its margin. `tarn-far` is the claim about the *composition* — the
   * water up on the shoulder with the farm below it, which is the frame that
   * says whether the search put it somewhere a place would have one.
   * `tarn-winter` is the difference this water has from every other surface in
   * the scape: it locks weeks ahead of the sound, so it is pinned at a week the
   * sea is still open — and at noon, because an unqualified midwinter frame at
   * 68° north is a polar night and a frame with no light in it cannot say
   * whether the water in it has frozen. `tarn-fell` is the second pool, on the
   * biggest landmass and turned 45° off the default heading, because a basin
   * photographed down its own slope is a nick in a hillside.
   */
  tarn: [
    { name: 'tarn', zoom: 40, set: [ 'camera.focusX=33', 'camera.focusZ=3.7' ]},
    { name: 'tarn-far', zoom: 130, set: [ 'camera.focusX=12', 'camera.focusZ=2' ]},
    {
      name:   'tarn-winter',
      zoom:   40,
      time:   0.5,
      season: 0.06,
      set:    [ 'camera.focusX=33', 'camera.focusZ=3.7' ],
    },
    {
      name: 'tarn-fell',
      rot:  45,
      zoom: 60,
      set:  [ 'camera.focusX=319', 'camera.focusZ=-524' ],
    },
  ],

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

  /**
   * The ice on the northern island, which no pose in `tour` can measure.
   *
   * The cap is 520 m north of the world origin every frame in the tour is aimed
   * at, so `default` and `far` render a dome a hundred metres across as a white
   * thumbprint — enough to say the ice is there and nothing at all about what it
   * is doing. These three are the instrument for the landform itself.
   *
   * `ice` is the whole island at a zoom where the dome, its margin and the
   * holding below it are three things rather than one. It is *also* the claim
   * the run makes, without needing a pose of its own to make it: the config
   * opens at midsummer, so this is the archipelago at the week every other white
   * thing in it has gone — and the cap has not.
   *
   * `ice-front` drops onto the seaward side, which is the only frame that shows
   * the ice *ending*: a wall standing in the water with the surf breaking
   * against it, and the one place a grounding line that had quietly failed
   * would show as a shelf lying flat on the sea.
   *
   * `ice-winter` is the control. At midwinter the lying snow reaches the same
   * white down to the shore, and the cap has to still read as a *shape* rather
   * than merging into a white island — which is what the fractures, the margin
   * and the nunataks are carrying at that hour.
   *
   * Nothing here is in {@link STILL}: ice does not move, and the only thing in
   * these frames that does is the sea at the front.
   */
  ice: [
    { name: 'ice', zoom: 200, set: [ 'camera.focusX=-6', 'camera.focusZ=505' ]},
    { name: 'ice-front', rot: 200, zoom: 90, set: [ 'camera.focusX=-11', 'camera.focusZ=470' ]},
    {
      name:   'ice-winter',
      zoom:   200,
      season: 0.02,
      set:    [ 'camera.focusX=-6', 'camera.focusZ=505' ],
    },
  ],

  /**
   * The wood's edge, from the one distance it has a shape at.
   *
   * Added for the reason `coast` was, and the arithmetic is the same. A treeline
   * is a *hillside*-scaled subject: shore to summit on the home island is about
   * seventy metres, and every pose in `tour` is either the whole archipelago at
   * better than half a metre to the pixel — where the entire wood is a texture —
   * or `near` at ten metres, which is standing in the yard between two buildings
   * with the crop in frame and no skyline in it at all. The change that put the
   * wood's edge on the map moved `tour/near` by a quarter of the frame and
   * `tour/default` by three tenths of one per cent, and neither number is about
   * the treeline.
   *
   * `wood` is the home island's hill from the shore up over the summit at (9,
   * 18), at a view that holds both ends of the line. `wood-lee` is the *same*
   * frame with the wind turned right around, and it is the whole exposure claim
   * as a picture: the line has to climb on the side that was the weather side
   * and drop on the side that was the lee, so a treeline that had quietly become
   * a contour reads as `same` here and nowhere else. `wood-shield` is the
   * northern island, whose 22.85 m peak stands two and a half times the
   * sheltered line — the one landmass where the bare ground is most of it.
   *
   * Nothing here is in {@link STILL}: a wood grows on a clock no frame of this
   * scape advances.
   */
  wood: [
    { name: 'wood', zoom: 120, set: [ 'camera.focusX=9', 'camera.focusZ=18' ]},
    {
      name: 'wood-lee',
      zoom: 120,
      set:  [ 'camera.focusX=9', 'camera.focusZ=18', 'wind.bearing=74' ],
    },
    { name: 'wood-shield', zoom: 240, set: [ 'camera.focusX=0', 'camera.focusZ=520' ]},
  ],

  /**
   * The dune belt, from the side of the island it is on.
   *
   * Added for the reason `wood` was, and the arithmetic is nearly the same. A
   * belt is a *coast*-scaled subject: 105 m of the home island's shore, twenty
   * metres deep, on one bearing. Every pose in `tour` is aimed at the middle of
   * the archipelago, where a coastal band twenty metres wide is a few pixels, or
   * at `near`, which is ten metres of open farmyard forty metres inland of it.
   * The run that put the sand on the map moved `tour/default` by fourteen
   * hundredths of one per cent, and that number is not about the belt.
   *
   * `dune` is the home island's weather shore at (12, 42), at a view that holds
   * the ridge, the blowouts through it and the bare lee coast beyond. `dune-lee`
   * is the *same* frame with the wind turned right around, and it is the whole
   * claim as a picture: the belt is on the shore the weather arrives at, so
   * turning the weather has to take the sand to the far side of the island and
   * leave this one bare. `dune-near` is the ridge itself at 40 m, which is the
   * only frame where a marram tussock is more than a pixel and the one that
   * shows the sand as a surface rather than as a stripe. `dune-winter` is the
   * control the belt needs most: lying snow whitens the whole island, and a pale
   * band that cannot be told from snow is a pale band that is not reading as
   * sand.
   *
   * Nothing here is in {@link STILL}: sand moves on a clock no frame of this
   * scape advances, and the marram takes the wind sway every other plant does.
   */
  dune: [
    { name: 'dune', zoom: 110, set: [ 'camera.focusX=12', 'camera.focusZ=42' ]},
    {
      name: 'dune-lee',
      zoom: 110,
      set:  [ 'camera.focusX=12', 'camera.focusZ=42', 'wind.bearing=74' ],
    },
    { name: 'dune-near', zoom: 40, set: [ 'camera.focusX=12', 'camera.focusZ=42' ]},
    {
      name:   'dune-winter',
      zoom:   110,
      season: 0.02,
      set:    [ 'camera.focusX=12', 'camera.focusZ=42' ],
    },
  ],

  // The cheap pass: is there a scape at all, and does it survive being drawn.
  quick: [{ name: 'default' }],
}

/**
 * A capture the diff can rely on.
 *
 * Every clock in the scape is stopped rather than merely slowed, because a
 * "slow" clock still advances by however long the page took to get to `ready`,
 * which is the one number that is different on every run. Grain is stopped for
 * the same reason and wind for a subtler one: the foliage sway is driven from
 * elapsed time, so a tree is only in the same place twice if no time passed.
 */
export const STILL = [
  'daylight.speed=0',
  'season.speed=0',
  'wind.strength=0',

  // The wind's rate as well as its amplitude. `wind.strength=0` already zeroes
  // everything the wind is multiplied into, so this changes no capture today —
  // but the rain integrates it (`heading += delta * wind.speed`), and a rate
  // that keeps advancing behind a zeroed amplitude is one refactor away from
  // being visible again. Same reasoning as `mill.spin` below.
  //
  // It is also what holds the surf. The breakers march in on `wind.travel`, so
  // these two lines are the only thing stopping the sets — and deliberately not
  // `water.surf`, because a coastline with the white water switched off is not
  // the still a run about surf wants to be judged on.
  'wind.speed=0',

  'look.grain=0',
  'atmosphere.auroraSpeed=0',
  'water.waveHeight=0',

  // The running water. Its own rate rather than a share of the wind, because a
  // beck runs on the fall under it — so nothing else in this list stops it, and
  // a surface that scrolls a metre a second is a different beck in every frame
  // of a tour.
  'beck.flow=0',

  // And the fall's own rate, which nothing above stops: the sheet goes over the
  // lip faster than the channel above it runs, so it carries a speed of its own
  // rather than a share of `beck.flow`. A fall left running is a different
  // pattern of white in every frame of a tour, and it is the one surface in the
  // scape whose texture crosses its whole extent in under a second.
  'force.flow=0',

  'boats.speed=0',

  // The sails are already stopped by `wind.strength=0` above, because that is
  // the factor their rate is scaled by. Named anyway: a capture must not depend
  // on a second knob's value to be reproducible, and the day the gearing stops
  // reading the wind is the day every still taken after it moves.
  'mill.spin=0',

  // The optic. A rotation the config could not stop is a beam somewhere else in
  // every frame of a tour, and the lamp is at its brightest in exactly the two
  // poses — night and winter — a diff is most sensitive at.
  'beacon.turn=0',

  // The lamps in the farmstead windows. `windows.flicker` is the wick's own
  // rate — a lamp gutters indoors on a still night, so nothing else stops it —
  // and the farm is at its brightest in exactly the two poses a diff is most
  // sensitive at.
  'windows.flicker=0',

  // Both of the flock's rates. The sweep is what carries a gull round its ring
  // and the beat is what its wings are doing while it goes — two integrals, two
  // ways for the same bird to be somewhere else in the next frame.
  'birds.speed=0',
  'birds.flap=0',

  // Both of the weather's rates. `speed` holds the front where `weather.time`
  // put it; `fall` stops the drops themselves, which are the only thing in the
  // scape that moves fast enough to be somewhere else between two frames.
  'weather.speed=0',
  'weather.fall=0',

  // The far band's march. Already held by `wind.speed=0` above, because the
  // curtains cross the frame on a share of the wind's own travel rather than on
  // a rate of their own — named anyway, for the reason `mill.spin` is: a capture
  // must not depend on a second knob's value to be reproducible, and a squall
  // somewhere else in every frame is a tour that cannot be diffed.
  'squall.drift=0',

  // The column's own climb. Its wander is already held by `wind.speed=0` above,
  // because the sway is carried by the wind's travel — but the rise is heat and
  // not weather, so it would go on rising through a dead calm and be a different
  // plume in every frame of a tour.
  'hearth.speed=0',

  // The colony's own rate. A hauled seal shifts its weight on the rock whatever
  // the weather is doing, so nothing else in this list stops it — and a rockful
  // of animals lying at a different angle in every frame is a guard that cannot
  // be diffed. Nothing here for the *tide* that decides how many of them are
  // ashore: that is a function of the two clocks already stopped at the top of
  // this list, and it is the same reason the sea itself has no entry.
  'haulout.shuffle=0',

  // Nothing for the lightning, deliberately, and it is the reason the storm has
  // no rate of its own to zero. A strike's whole life is measured in the front's
  // cycle — see `stormAge` in `scene/storm.ts` — so `weather.speed=0` above
  // freezes a flash exactly where `weather.time` leaves it. A storm with a clock
  // of its own could only have been stopped by a knob that, at zero, meant no
  // strike ever fired: a system that could be photographed only by being turned
  // off. The `storm` tour is what actually parks the front on a lit one.

  // Nothing for the tide, deliberately. It integrates no rate of its own: the
  // water is a function of `daylight.time` and `season.time`, and both of those
  // are already stopped at the top of this list — so a still is taken at
  // whatever state of the sea the pose's hour puts it at, and taken there
  // again. The moon it is derived from has nothing here for the same reason.
]

export interface ShotOptions {
  base:  string
  pose:  Pose
  tier:  string
  skip?: string
  ratio: number
  aa?:   string
  post?: string
  still: boolean

  /**
   * Fake the browser's clock as well as stopping the scape's own.
   *
   * Off by default, and that is a finding rather than a preference: freezing
   * `requestAnimationFrame` also freezes the compositor, and playwright's
   * screenshot waits for a frame that then never arrives. With every speed in
   * the config already at zero there is almost nothing left for a real clock to
   * move, so the fake one buys very little and costs a pump loop to keep the
   * shutter unblocked. Kept for the cases where it earns that.
   */
  clock: boolean

  /** Leave the overlay, card and frame counter in the picture. */
  chrome: boolean
  extra:  string[]

  /**
   * Frames the scape must have drawn before the shutter opens.
   *
   * Not milliseconds. Under software rasterisation this scape runs anywhere
   * between a fifth of a frame and five frames a second depending on tier and
   * how warm the shader cache is, so a fixed wait captures a different stage of
   * the same fade-in every time — measured, on this machine, as 72 draw calls
   * on one run and 108 on the next. A frame count is the same everywhere.
   */
  frames: number
}

/** Build the url that puts the scape in one pose. */
export function shotUrl (options: ShotOptions): string {
  const { pose } = options
  const sets     = [
    ...options.still ? STILL : [],
    ...pose.rot === undefined ? [] : [ `camera.rotation=${pose.rot}` ],
    ...pose.zoom === undefined ? [] : [ `camera.viewSize=${pose.zoom}` ],
    ...pose.time === undefined ? [] : [ `daylight.time=${pose.time}` ],
    ...pose.season === undefined ? [] : [ `season.time=${pose.season}` ],
    ...pose.set ?? [],
    ...options.extra,
  ]

  const params = new URLSearchParams()

  // Pinned rather than detected. `readQualitySignals` answers from cores,
  // pointer and viewport, so the same command would pick a different tier on a
  // laptop than on a build box — and two captures at two tiers are not a diff,
  // they are two different scapes.
  params.set('tier', options.tier)
  params.set('ratio', String(options.ratio))

  // Storage is per origin rather than per page load, so a tour of six poses
  // through one browser context would have each pose open on wherever the pose
  // before it came to rest. Pinned for the same reason the tier is.
  if (options.still)
    params.set('camera', 'fresh')

  if (options.skip)
    params.set('skip', options.skip)

  if (options.aa !== undefined)
    params.set('aa', options.aa)

  if (options.post !== undefined)
    params.set('post', options.post)

  if (sets.length)
    params.set('set', sets.join(','))

  return `${options.base}?${params.toString()}`
}

export interface ShotResult {
  pose:      string
  state:     string
  fps:       number
  calls:     number
  triangles: number
  drawn:     number
  errors:    string[]
  ms:        number
  path:      string
}

/** How long a capture is allowed to spend getting to its first draw. */
const READY_BUDGET = 40_000

/**
 * Photograph one pose.
 *
 * The clock is faked before the page is opened, so the whole load happens on a
 * timeline this script controls: `runFor` is what advances `requestAnimationFrame`,
 * which means the scape draws exactly the number of frames it is given and not
 * one that depends on how busy the machine was.
 */
export async function shoot (page: Page, options: ShotOptions, out: string): Promise<ShotResult> {
  const errors: string[] = []
  const started          = Date.now()

  const onConsole = (message: ConsoleMessage): void => {
    // The page asks for a favicon it does not have and the browser logs the
    // 404 as an error. It is not one, and counting it would put every capture
    // ever taken into the broken column.
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text())
  }

  page.on('console', onConsole)
  page.on('pageerror', error => errors.push(error.message))

  // The overlay, the card and the frame counter are not the scape, and the
  // counter in particular prints a different number every single run — leaving
  // it in frame would mean every diff of every pose reported a change in the
  // bottom-left corner and nowhere else.
  if (!options.chrome)
    await page.addInitScript(() => {
      const hide = document.createElement('style')

      hide.textContent = '.gfx, .fps, #scape-card, .card-toggle { display: none !important }'
      document.addEventListener('DOMContentLoaded', () => document.head.append(hide))
    })

  if (options.clock)
    await page.clock.install({ time: 0 })

  await page.goto(shotUrl(options), { waitUntil: 'commit' })

  const readState = (): Promise<string> =>
    page.evaluate(() => document.documentElement.dataset.scapeState ?? 'booting')

  let state = 'booting'

  while (state === 'booting' && Date.now() - started < READY_BUDGET) {
    if (options.clock)
      await page.clock.runFor(120)
    else
      await page.waitForTimeout(120)

    state = await readState()
  }

  // Settle. The cloud deck fades in with the zoom, the mist drifts up, and the
  // temporal passes resolve over several frames — so the first drawn frame is
  // never the frame worth keeping, and "drawn enough" is counted rather than
  // waited out.
  const drawn = (): Promise<number> =>
    page.evaluate(() => Number(document.documentElement.dataset.scapeDrawn ?? 0))

  while (state === 'ready' && await drawn() < options.frames && Date.now() - started < READY_BUDGET)
    if (options.clock)
      await page.clock.runFor(250)
    else
      await page.waitForTimeout(250)

  const vitals = await page.evaluate(() => {
    const root = document.documentElement.dataset

    return {
      state:     root.scapeState ?? 'booting',
      fps:       Number(root.scapeFps ?? 0),
      calls:     Number(root.scapeCalls ?? 0),
      triangles: Number(root.scapeTris ?? 0),
      drawn:     Number(root.scapeDrawn ?? 0),
    }
  })

  // Under a faked clock nothing presents unless something advances it, and the
  // shutter is waiting on exactly that — so the clock is pumped alongside the
  // capture rather than before it.
  const shutter = page.screenshot({ path: out, animations: 'disabled' })

  if (options.clock)
    for (let tick = 0; tick < 24; tick += 1)
      await page.clock.runFor(32).catch(() => undefined)

  await shutter
  page.off('console', onConsole)

  return { ...vitals, pose: options.pose.name, errors, ms: Date.now() - started, path: out }
}

/** One line per pose, and enough of one that most runs never open the image. */
export function formatResult (result: ShotResult): string {
  const millions = (result.triangles / 1e6).toFixed(2)
  const verdict  = result.state === 'ready' && !result.errors.length ? 'ok  ' : result.state.toUpperCase()

  return [
    result.pose.padEnd(11),
    verdict.padEnd(8),
    `${(result.ms / 1000).toFixed(1)}s`.padStart(6),
    `fps ${result.fps.toFixed(1).padStart(5)}`,
    `draws ${String(result.calls).padStart(4)}`,
    `tris ${millions}M`,
    `f ${String(result.drawn).padStart(3)}`,
    `err ${result.errors.length}`,
    `-> ${result.path}`,
  ].join('  ')
}

export function posesFrom (args: Args): Pose[] {
  const named = args.str('poses')

  if (named)
    return TOURS[named] ?? named.split(',').map(name => TOURS.tour.find(pose => pose.name === name) ?? { name })

  return [{
    name:   args.str('name', 'shot'),
    rot:    args.has('rot') ? args.num('rot', 45) : undefined,
    zoom:   args.has('zoom') ? args.num('zoom', 70) : undefined,
    time:   args.has('time') ? args.num('time', 0.42) : undefined,
    season: args.has('season') ? args.num('season', 0.5) : undefined,
  }]
}

export function optionsFrom (args: Args, base: string, pose: Pose): ShotOptions {
  return {
    base,
    pose,
    tier:   args.str('tier', 'mobile'),
    skip:   args.str('skip'),
    ratio:  args.num('ratio', 1),
    aa:     args.str('aa'),
    post:   args.str('post'),
    still:  !args.has('no-still'),
    clock:  args.has('clock'),
    chrome: args.has('chrome'),
    extra:  args.list('set'),
    frames: args.num('frames', 40),
  }
}

export async function withBrowser<T> (gpu: boolean, run: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args:           gpu ? GPU_FLAGS : SOFTWARE_FLAGS,
  })

  try {
    return await run(browser)
  }
  finally {
    await browser.close()
  }
}

async function main (): Promise<void> {
  const args = parseArgs(Bun.argv.slice(2))

  if (args.has('help')) {
    console.log([
      'scape:shot — the scape, from a pose, without anybody watching',
      '',
      '  --poses tour          named set: tour (6) | beacon (4, the light) | window (2)',
      '                        coast (4, the shoreline) | steading (3, the farmyard)',
      '                        grazing (3, the flocks on the rough ground)',
      '                        guard (4, the rocks in the open sea)',
      '                        chapel (4, the church and its yard)',
      '                        smokehouse (3, the hut above the harbour)',
      '                        pier (3, the trestle out to deep water, and a coast without one)',
      '                        croft (3, the holding out on the islets)',
      '                        shallows (4, the light on the bottom)',
      '                        beck (4, the water in the channel)',
      '                        force (4, the fall the beck goes over)',
      '                        peat (3, the turf cutting on the moor)',
      '                        tide (3, the sea at both ends of its swing)',
      '                        causeway (3, the bar out to the nearest rock)',
      '                        fjord (4, the drowned valley in the sound)',
      '                        haulout (4, the seals on the guard, low and high water)',
      '                        bow (4, the rainbow at three heights of sun)',
      '                        wood (3, the treeline on two hillsides)',
      '                        dune (4, the blown sand on the weather shore) | quick (1)',
      '  --rot 45 --zoom 70    camera yaw, and view size (tilt is derived from zoom)',
      '  --time 0.42           the day, 0..1',
      '  --season 0.5          the year, 0..1',
      '  --tier mobile         pinned, not detected — a detected tier is undiffable',
      '  --skip post,mist      drop scene families',
      '  --set look.bloom=0    raw dotted-path override, repeatable',
      '  --size 800x500        viewport',
      '  --frames 40           frames the scape must draw before the shutter opens',
      '  --gpu                 real adapter instead of swiftshader (fast, noisy)',
      '  --no-still            let the scape clocks run (never diff the result)',
      '  --clock               fake the browser clock too — slower, rarely needed',
      '  --chrome              leave the overlay and frame counter in the picture',
      '  --dist dist           serve a built directory instead of starting a dev server',
      '  --port 4174           leaves an existing server on that port alone',
      '  --out .scape/shots    directory',
    ].join('\n'))
    return
  }

  const out               = args.str('out', '.scape/shots')
  const port              = args.num('port', 4174)
  const poses             = posesFrom(args)
  const [ width, height ] = args.str('size', '800x500').split('x')
    .map(Number)

  await mkdir(out, { recursive: true })

  const server                = await serve(port, args.str('dist'))
  const results: ShotResult[] = []

  try {
    await withBrowser(args.has('gpu'), async browser => {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })

      for (const pose of poses) {
        const page = await context.newPage()

        try {
          const options = optionsFrom(args, `http://127.0.0.1:${port}/`, pose)
          const result  = await shoot(page, options, `${out}/${pose.name}.png`)

          results.push(result)
          console.log(formatResult(result))
        }
        finally {
          await page.close()
        }
      }

      await context.close()
    })
  }
  finally {
    server.stop()
  }

  const broken = results.filter(result => result.state !== 'ready' || result.errors.length)

  for (const result of broken)
    for (const line of result.errors.slice(0, 3))
      console.log(`  ${result.pose}: ${line}`)

  if (broken.length)
    process.exitCode = 1
}

if (import.meta.main)
  await main()
