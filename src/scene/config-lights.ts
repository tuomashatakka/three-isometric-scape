/**
 * The lit things: the cursor's lamp, the hearths and the windows.
 *
 * Moved whole out of `config.ts`.
 */
export interface LightsConfig {

  /**
   * The light that follows the cursor over the ground.
   *
   * A warm point light that sits at the point on the landscape under the mouse
   * pointer, so moving the cursor over the scape lights the ground, props and
   * buildings around it — a torch the reader carries. It is day-dependent the
   * same way the coastal lamp is: a lantern at midday is invisible and costs the
   * same forward-lit pass as a lantern at midnight, so the strength scales with
   * how far the sun is down.
   *
   * Every one of these is read per frame, and every one of them is in the
   * overlay. There is nothing build-time here: the light follows the pointer and
   * the daylight, both of which are resolved each tick. `intensity` at zero is
   * the switch — there is nothing to draw and the module does not mount.
   */
  cursorLight: {

    /** Lamp colour, as a hex integer. Warm by default — lantern light, not LED white. */
    color: number

    /**
     * Lamp brightness. 0 is a light that was never carried, and it is the switch.
     *
     * Scaled by how far the sun is down, so the lamp comes up through dusk and
     * out again at dawn without this being touched — the same way the coastal
     * lamp works. The multiplier is `(1 - day)^2`, so midday is invisible and
     * midnight is full strength.
     */
    intensity: number

    /**
     * How far the light reaches, in metres.
     *
     * Metres and not a fraction of the view: the light throws the same radius
     * of ground at any zoom, which is what a carried lantern does. 15 m is a
     * small clearing around the pointer — enough to see nearby props and the
     * ground they stand on, not a floodlight.
     */
    distance: number

    /** How quickly the light falls off, 0..2. 2 is physically correct inverse-square. */
    decay: number

    /**
     * Metres above the ground point the light sits at.
     *
     * A light buried in the surface it is lighting throws nothing. Two metres
     * is just over head height — close enough to feel like a carried lamp,
     * high enough to cast downward onto the ground and the props.
     */
    lift: number

    /**
     * Damping time constant for position and intensity smoothing, in seconds.
     *
     * The light does not snap to the raw pointer position every frame — that
     * reads as jitter because the pointer sample is not continuous. Instead it
     * is damped toward the target with an exponential form that is frame-rate
     * independent: `1 - exp(-dt / tau)`. 0.15 s is a quarter of a sixth at
     * sixty hertz, fast enough to feel responsive and slow enough to smooth
     * out a sub-pixel twitch.
     */
    damping: number
  }

  /**
   * The fires in the farmhouse and the sauna, and the smoke standing over them.
   *
   * Every one of these is live, and every length here is **metres and stays
   * metres**. A chimney is the same chimney over a wider archipelago and at any
   * zoom, so nothing in this section is scaled by `archipelago.worldSize` or by
   * the live `viewSize` — the audit the scale rule asks for, written down at the
   * knob rather than discovered by a later run.
   *
   * Where the stacks *are* is not here: that comes out of the survey and the
   * prop's own frame — see `FARMHOUSE_CHIMNEY` in `props/buildings.ts` — the
   * same way the lantern hubs and the mill's wheels do.
   */
  hearth: {

    /**
     * How thick the smoke stands over the roofs, 0..1.
     *
     * 0 is a farm with cold hearths, and it is the switch — there is no plume to
     * draw when this is zero. How much harder the fires are banked in the cold
     * is the year's business; see {@link ScapeConfig.hearth.winter}.
     */
    smoke: number

    /** Metres a plume climbs before it has thinned into the air. */
    rise: number

    /**
     * Metres a plume climbs in a second. 0 hangs the smoke where it stands.
     *
     * Its own rate rather than a share of `wind.speed`, because a column rises
     * on the heat under it and would go on rising on a still day. It is
     * therefore its own line in `STILL` — see `scripts/scape-shot.ts`.
     */
    speed: number

    /**
     * How hard a plume answers the wind, 0..1.
     *
     * A response, not a speed, the way `atmosphere.cloudDrag` and
     * `atmosphere.mistDrag` are: the bearing and the strength are the scape's
     * one wind, and this only decides how far downwind the column has been laid
     * over by the time it has climbed its full {@link ScapeConfig.hearth.rise}.
     */
    drag: number

    /**
     * How much harder the fires are banked in deep winter, as a multiple of
     * {@link ScapeConfig.hearth.smoke}.
     *
     * 0 is a farm that burns the same fire in July it burns in January. There is
     * no second winter strength, because there is one year in the scape: what
     * this reads is the same `season.growth` the grass is withered by.
     */
    winter: number
  }

  /**
   * The lamps behind the farmstead windows.
   *
   * Every one of these is read per frame, so every one of them is in the
   * overlay. There is nothing build-time here on purpose: even which windows are
   * occupied is a kept draw compared against `occupancy` each frame rather than
   * a lit set decided at build, so turning the farm up at midnight is a slider
   * rather than a reload. How much geometry the spill is drawn from is the
   * tier's — see `quality.lampSpill`.
   *
   * There is no length in this section, which is worth saying out loud given the
   * scale rule: the glow is sized by the pane it comes out of, in the pane's own
   * units, and `props/lamp.ts` is where that decision is written down.
   */
  windows: {

    /**
     * How brightly a lit pane burns, and the switch — 0 is a farm that never
     * lights a lamp. Whether it is *dusk* is the sun's business.
     */
    glow: number

    /**
     * How much of the farm is occupied, 0..1.
     *
     * Weighted per building by how lived-in it is, so this lights the farmhouse
     * before the sauna and the sauna before the byre. 1 is every pane in the
     * archipelago burning, which reads less like a farm than like a hotel.
     */
    occupancy: number

    /** Phase of the day the household is up, 0..1. 0 is midnight, 0.5 is noon. */
    rising: number

    /** Phase of the day it turns in. At or before {@link rising}, nobody gets up. */
    bedtime: number

    /**
     * How low a window falls once the house is asleep, 0..1.
     *
     * Not to nothing: a farmhouse at four in the morning still has a stove in
     * it, and a scape whose farms go absolutely black at the small hours reads
     * as abandoned rather than as asleep.
     */
    banked: number

    /**
     * Wobbles a second in a lamp's flame. 0 holds every lamp dead steady.
     *
     * Its own rate rather than a share of the wind — a wick gutters indoors on a
     * still night — and therefore its own line in `STILL`. See
     * `scripts/scape-shot.ts`.
     */
    flicker: number

    /** How deep the wobble goes, 0..1. 1 takes a lamp all the way out at the bottom. */
    unsteady: number
  }
}

export const SCAPE_LIGHTS: LightsConfig = {
  // A carried lantern. The colour is a warm amber — the same family as the
  // farmhouse lamps but without the pane to soften it. 0.6 of intensity is
  // visible against a daylit ground but not blinding at night; raising it past
  // about 1.5 would bloom on the desktop tier. 15 m of distance is a small
  // clearing; 2 m of lift is just over head height. 0.15 s of damping is fast
  // enough to feel responsive without reading as jitter.
  cursorLight: {
    color:     0xffa84c,
    intensity: 0.6,
    distance:  15,
    decay:     2,
    lift:      2,
    damping:   0.15,
  },

  // 11 metres of rise against a chimney standing 7 m over its own floor puts the
  // top of a plume at about 18 m — well clear of the 9 m peak on the home island
  // and well under the 34 m cloud deck, which is the band a column of smoke
  // actually occupies. 1.6 m/s is a domestic fire drawing steadily rather than a
  // bonfire. 0.55 of drag lays the column over by about six metres downwind at
  // the top of its climb in the authored breeze — a plume leaning hard without
  // being flattened onto the roof. 0.6 of winter takes midwinter to 0.99 — the
  // fire that is lit all day in January against the one lit for the sauna in
  // July, and just under the ceiling `hearthDensity` clamps at, so every week of
  // the year is a different plume rather than a third of them being the same
  // fully opaque one.
  hearth: {
    smoke:  0.62,
    rise:   11,
    speed:  1.6,
    drag:   0.55,
    winter: 0.6,
  },

  // A farmhouse keeps roughly two thirds of its windows lit in the evening, and
  // the weights in `landscape/windows.ts` take the sauna and the byre down from
  // there — so 0.66 is thirteen panes a holding of which six or seven burn,
  // which is a house with people in it rather than a row of identical lamps.
  //
  // Up at half past six and turned in at half past ten, which at this latitude
  // means the lamps are wanted for six hours in January and not at all in June —
  // and that is the daylight doing it, not a second seasonal knob.
  //
  // `banked` at 0.3 is what keeps a sleeping farm distinguishable from an empty
  // one, and 0.3 rather than the 0.12 it was first tuned at because the captures
  // are taken at the `mobile` tier, which has no bloom to spread a dim pane:
  // a tenth of the evening's brightness photographed as nothing at all at the
  // `yard-night` pose, which made the claim in the readme false at exactly the
  // frame that states it.
  windows: {
    glow:      0.95,
    occupancy: 0.66,
    rising:    0.27,
    bedtime:   0.94,
    banked:    0.3,
    flicker:   0.55,
    unsteady:  0.22,
  },
}
