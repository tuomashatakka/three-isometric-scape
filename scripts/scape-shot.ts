import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import type { Browser, ConsoleMessage, Page } from 'playwright-core'
import { GPU_FLAGS, SOFTWARE_FLAGS, findChromium, serve } from './browser.ts'
import { parseArgs } from './args.ts'
import type { Args } from './args.ts'


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
      '                        shallows (4, the light on the bottom)',
      '                        beck (4, the water in the channel)',
      '                        tide (3, the sea at both ends of its swing) | quick (1)',
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
