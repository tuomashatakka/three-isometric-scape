/**
 * The sea surface and the tide that moves it.
 *
 * Moved whole out of `config.ts`.
 */
export interface SeaConfig {

  /** The lake's surface response. Every one of these is live. */
  water: {

    /** Sun-glitter strength, 0 disables the speckle. */
    sparkle: number

    /**
     * What the moon's own reflection is worth against the sun's.
     *
     * The switch for the moon track, and the only one: 0 is the sea this scape
     * had before it, whose specular lobe was pointed at whichever body the key
     * light was coming from and multiplied by a term that went to zero the
     * moment the sun set. Nothing here touches daylight — the moonlight it
     * scales is zero at every hour the sun is up — and `daylight.moonStrength`
     * at 0 still takes the track away with the light, because what this
     * multiplies is the light the moon is actually putting on the coast.
     *
     * Well above one, and that is not a fudge. `DaylightState.moon` is light
     * *falling on the ground*, in shares of a noon sun, and a reflected disc is
     * not in those units at all: the track is as bright as the moon's face,
     * which is the same face at midnight as at noon. There is no adaptation
     * anywhere in this pipeline to stand in for a pupil that has been open for
     * an hour, so the eye's half of it is spent here — and the glitter term it
     * scales is worth nineteen levels of 255 at its own ceiling, so a budget
     * held at a full sun's would hold the moon at a sheen. See `trackAmount`.
     */
    moonTrack: number

    /**
     * How brightly the broken water burns on a dark night, 0..1.
     *
     * The switch for the sea fire, and the only one. What is *alight* on any
     * given night is not here: the glow is gated on astronomical twilight and
     * quenched by whatever moonlight is on the water, so a midsummer midnight
     * at this latitude has none of it and a full moon near transit has none of
     * it, without a second knob saying so. See `phosphorAmount` in
     * `landscape/water-night.ts`.
     *
     * It is deliberately not a share of {@link surf}. The surf decides how much
     * water is torn and this decides how hard what is torn glows, they are lit
     * by nothing and by the sky respectively, and a scape that tuned them
     * together could never have a quiet sea burning under a black sky.
     */
    phosphor: number

    /** Swell amplitude in metres. */
    waveHeight: number

    /**
     * How fast the swell runs, as a share of its own dispersion speed.
     *
     * The switch for the sea's *motion*, and the reason this exists at all:
     * the surface used to advance on raw elapsed seconds, so the only thing in
     * the config that could hold it still was `waveHeight` — and `STILL`
     * duly held it there. **Every capture this repository has ever taken was a
     * photograph of a dead flat sea**, in a scape whose whole coast is water.
     * A rate that reaches zero is what lets a still have a swell in it, the
     * same argument `beck.flow` and `force.flow` are in that list for.
     *
     * 1 is the speed a wave of {@link swellLength} actually travels at — see
     * `swellRate` in `landscape/swell.ts` — rather than a number anybody chose.
     */
    waveSpeed: number

    /**
     * The swell's wavelength in deep water, in metres.
     *
     * **Metres, and they stay metres.** Crest to crest is a fact about the
     * water and the fetch behind it, not about how wide the world is or how
     * far the camera is pulled out, so a wider archipelago must not scale it.
     * What it *does* set, through the deep-water dispersion, is how fast the
     * sea runs: `ω = sqrt(g k)`, so a longer swell is a slower one.
     */
    swellLength: number

    /**
     * How far the three trains are fanned either side of the wind, in radians.
     *
     * 0 is perfectly long-crested — an ocean swell arriving after a thousand
     * miles of sorting — rather than a sea switched off, and there is no flag
     * beside it for the same reason there is no flag beside {@link surf}. Wide
     * is a wind sea with no direction left in it.
     *
     * Dimensionless and therefore neither world-sized nor frame-sized: how
     * sorted the sea is, rather than how far the sorting reaches.
     */
    swellSpread: number

    /**
     * How hard a bank stands the swell up as it crosses, 0..1.
     *
     * 0 takes the shoaling away and leaves a sea of even height from the
     * horizon in to the breaking band, which is what this scape had. It does
     * not hand back the band itself — a wave cannot be taller than the water
     * under it whether or not anybody shoaled it. 1 is Green's law run to its
     * cap. Like
     * {@link surfDepth} and {@link causticDepth}, what it scales with is the
     * ground rather than anything authored: the bathymetry mask saturates at
     * 3.2 m, so the shelf it lifts over is wherever the ground comes up inside
     * that — a drowned bank, a shoal, a bar, the last few metres of every
     * beach — and none of those had to be listed. See `shoalGain` in
     * `landscape/swell.ts`.
     */
    swellShoal: number

    /** Ripple normal perturbation. */
    rippleStrength: number

    /** Analytic foam/ripple strength behind moving boats. 0 removes their wakes. */
    wakeStrength: number

    /**
     * How hard it breaks on the shore the swell is running into, 0..1.
     *
     * The switch for the surf, and the only one: 0 leaves every coast with the
     * thin foam trim it had before there was any weather side to be on. Lifted
     * by `wind.strength`, so a gust whitens the coast without this being
     * touched — and a still day leaves a wash rather than nothing, because a
     * surf that a capture could zero by accident is a surf nobody photographs.
     */
    surf: number

    /**
     * Metres of water depth the breakers reach out over.
     *
     * **Metres, and they stay metres.** A wave feels the bottom at a depth set
     * by the wave, not by how wide the world is or how far the camera is pulled
     * out — so this is neither world-sized nor frame-sized, and a wider
     * archipelago must not scale it. What it *does* scale with is the ground:
     * the white water is as wide as the shelf is, so a shallow bay foams far
     * out and a rock that falls away sheer barely foams at all, and neither of
     * those had to be authored.
     */
    surfDepth: number

    /**
     * How strongly the weather shore is favoured over the lee, 0..1.
     *
     * 0 breaks the same all the way round an island, which is the coastline the
     * scape had; 1 gives the lee nothing at all. In between is a coast whose
     * sheltered side still works, which is what a real one does.
     */
    surfExposure: number

    /**
     * How much white the open sound carries when it is blowing, 0..1.
     *
     * The switch for the whitecaps, and the only one: 0 is the unbroken sheet
     * of blue this scape had between its islands in a flat calm and in a near
     * gale alike, which was the one thing the wind never touched. It is a
     * *coverage* rather than a brightness — the white itself is `palette.foam`,
     * the same white the surf and the wakes are drawn in, because a whitecap
     * and a breaker are the same substance and a second white would be a second
     * answer to a settled question.
     *
     * Deliberately not a share of {@link surf}. The surf says how hard the
     * swell trips when it feels the bottom, and this says how much of the sea
     * that never feels it is torn — one is a fact about the shelf and the other
     * a fact about the wind, and a scape that tuned them together could never
     * have a sheltered coast under a hard blow.
     */
    whitecap: number

    /**
     * The wind strength at which the whole open sound is breaking.
     *
     * Dimensionless, in `wind.strength`'s own units, and it is what makes a
     * gust visible on the water. A sea does not whiten evenly from a calm — it
     * holds, starts breaking somewhere around force four, and then whitens
     * fast — so the curve below this number is where every gust in the scape
     * lives and above it a harder wind adds nothing.
     *
     * **It is measured against the *gusted* strength, not the authored one**,
     * and that is the trap this number fell into once already. `wind.strength`
     * in the config is the wind at rest; what reaches `capsAmount` is
     * `WindState.strength`, which is that times the front — up to
     * `1 + wind.gust`. At 1.25 against an authored 0.9 the arithmetic looked
     * right and the sea was saturated before the front arrived: `--poses blow`
     * came out **identical to the byte** at 0.9 and at 2.4. It has to clear
     * `wind.strength * (1 + wind.gust)` with room left over, which 2.2 against
     * 1.31 does.
     *
     * At 0 the sea is fully capped at every wind, which is the honest reading
     * of "there is no threshold" rather than a special case.
     */
    whitecapOnset: number

    /**
     * How much of the open sound's white a fully sheltered sea is spared, 0..1.
     *
     * The strength of the lee on the caps, and nothing about how far the lee
     * reaches: *that* is the shelter map's two reaches, in `shelter.reach` and
     * `shelter.swellReach`, and it is measured rather than authored. 0 breaks
     * the same all round an island, which is the sound this scape had; 1 leaves
     * the water behind every headland and every breakwater perfectly unbroken.
     *
     * It used to be read off the bathymetry mask's own seaward bearing, which
     * only knows which way the bank *here* faces — so the lee stopped a texel
     * or two off the shore and the sound behind an island broke exactly like
     * the sound in front of it. It now reads `scapeShelterLee`, which is a fact
     * about what is four hundred metres upwind. The knob is the same knob and
     * the number has not moved; what it multiplies has.
     *
     * Dimensionless and therefore neither world-sized nor frame-sized. See
     * `landscape/shelter.ts` and `landscape/water-caps.ts`.
     */
    whitecapLee: number

    /**
     * What a fully sheltered sea keeps of the open swell's height, 0..1.
     *
     * The same shape as {@link swash.lee} and `surfExposure` — a share kept
     * rather than a strength applied — and it works on the wave itself rather
     * than on the white: the displacement in the vertex stage, the faces the
     * fragment shades it by, and therefore the sheen and the gleam that stand
     * on those faces. 1 is the sea this scape had, which raised the same swell
     * inside a harbour as outside it.
     *
     * Held well above zero on purpose. A swell is the memory of a wind that
     * blew somewhere else, and what arrives in a lee has bent round the land
     * rather than been stopped by it — a harbour on a day with a sea running
     * outside is never glass. 0 would be a mill pond behind every rock in the
     * archipelago.
     *
     * Dimensionless: a gain on `waveHeight`, which is the metre.
     */
    swellLee: number

    /**
     * Specular spread. Low values concentrate the sun into a lobe narrow
     * enough to flare the whole lake white at the angle that catches it.
     */
    roughness: number

    /**
     * How brightly the sun draws its net on the bottom, 0..1.
     *
     * The switch for the caustics, and the only one: 0 is a sea the light goes
     * straight through. What is *on* any given day is not here — the net is
     * scaled by how high the sun is standing, so a midwinter noon at this
     * latitude has none of it and a polar night has none of it either, without
     * a second knob saying so. See `causticStrength` in `landscape/water.ts`.
     *
     * It is deliberately not a share of {@link sparkle}. Glitter is the sun
     * seen *off* the surface and caustics are the sun seen *through* it: the
     * one is killed by a chop that the other only softens, they live at
     * opposite ends of the depth range, and a scape that tuned them together
     * could never have a bright bottom under a dull surface.
     */
    caustics: number

    /**
     * Metres of water depth the net fades out over.
     *
     * **Metres, and they stay metres.** Light is absorbed by the water it
     * passes through at a rate set by the water, not by how wide the world is
     * or how far the camera is pulled out — so this is neither world-sized nor
     * frame-sized, and a wider archipelago must not scale it. Like
     * {@link surfDepth}, what it *does* scale with is the ground: a shelving
     * bay carries the net a long way out and a rock that falls away sheer
     * carries it barely at all, and neither of those had to be authored.
     */
    causticDepth: number

    /**
     * Metres between the cells of the net.
     *
     * Metres for the same reason {@link causticDepth} is: a cell is the size
     * the swell above it makes it, which is a fact about water rather than
     * about the frame. The net is *hidden* rather than shrunk once a cell no
     * longer covers a pixel — see `WATER_CAUSTIC_GLSL` — so this stays put at
     * every zoom and the far view simply loses a detail it could not resolve.
     */
    causticScale: number

    /**
     * How far out of the shallows the winter ice carries, 0..1.
     *
     * 0 freezes the open sea as readily as the bank, which is a lake rather
     * than a coast; 1 confines the ice to water shallow enough to lose its
     * heat in a season. See `season.ice` for whether it freezes at all.
     */
    iceReach: number

    /**
     * How ragged the ice edge is, 0..1.
     *
     * The ice front follows depth, and depth alone draws a contour line around
     * the island. This is what breaks that line into floes — and at 0 the
     * winter sea reads as a bathymetry chart with the ice-fill turned on.
     */
    iceBreak: number
  }

  /**
   * The tide.
   *
   * Not a clock of its own: the hour and the week already make a month between
   * them (see `daylight.moonPhase`), and the tide is that month read from
   * underneath. Everything here is metres and hours — a tide is a real-world
   * quantity, so none of it scales with `archipelago.worldSize`.
   *
   * What moves is what is drawn: the lake's own plane and every depth it reads,
   * and the boats floating on it. What does not move is anything that was
   * *solved* — the jetty, the routes, the beacon's freeboard and the littoral
   * band are all surveyed against mean water, and a survey that moved twice a
   * cycle would be a scape that rebuilt itself twice a cycle.
   */
  tide: {

    /**
     * Metres between low and high water at springs.
     *
     * The switch, and the only one: 0 is a tideless coast, the sea this scape
     * had before this section existed. Bounded from above by `boats.clearance`
     * — half of this is how far the sea drops below the depth every waterway
     * was routed to keep, so a range past twice that clearance is a fleet
     * aground at low water. `tide.test.ts` states that as a fact.
     */
    range: number

    /**
     * How much the month swings the range, 0..1.
     *
     * 0 is a coast whose every tide is the same size; 1 is one whose neaps go
     * flat. In between, springs at new and full moon and neaps at the quarters,
     * which is the sun's tide arriving with the moon's or across it.
     */
    spring: number

    /**
     * Hours high water lags the moon's transit — the establishment of the port.
     *
     * A tide is a wave crossing a shelf, not a bulge standing under the moon,
     * so the water arrives late and how late is a property of the coast. It is
     * also the handle a capture uses: turning it by half a cycle puts the same
     * hour's light on the opposite state of the sea.
     */
    lag: number
  }
}

export const SCAPE_SEA: SeaConfig = {
  // 2.4 m of surf depth is where a swell of this size actually trips: at this
  // coast's shore band that is a broad wash off a beach and a narrow collar
  // round a granite face, which is the contrast the band exists for — the width
  // of the white water is the width of the shelf, and neither was authored per
  // island. 0.72 of exposure
  // leaves the lee about a quarter of the weather side's break — sheltered
  // rather than glassy, which is what a sound between islands actually looks
  // like on a day with a sea running.
  //
  // 2.8 m of caustic reach stands a little *past* the surf's 2.4 m shelf, which
  // is the right relationship rather than a coincidence: a swell trips as soon
  // as it feels the bottom, and light in clear northern water gives up a good
  // deal further down than that. So the net runs out under the breakers and
  // keeps going a few metres beyond them. 2.6 m between cells is what a swell
  // of this height focuses to — big enough to read as a net at the shallows
  // poses and small enough that one bay carries several dozen of them.
  water: {
    sparkle:        0.5,
    // 10 against the 0.128 of a noon sun a waning gibbous 35° up actually puts
    // on this coast is 1.28 — half again a full sun's own path, which is what
    // it takes for the water to gleam rather than to lighten. Read it off the
    // `track` field of `scape:map --stats`, which is where that figure comes
    // from, and against `nightsea-none` in `--poses nightsea`, which is the
    // same sea with the term switched off.
    moonTrack:      10,
    phosphor:       0.5,
    waveHeight:     0.55,
    waveSpeed:      1,
    swellLength:    70,
    swellSpread:    0.42,
    swellShoal:     0.85,
    rippleStrength: 0.2,
    wakeStrength:   0.78,
    roughness:      0.62,
    iceReach:       0.62,
    iceBreak:       0.5,
    surf:           1,
    surfDepth:      2.4,
    surfExposure:   0.72,

    // 0.28 of coverage is a sound that reads as broken rather than as washed,
    // and it was read off the picture rather than derived: `scapeCaps` cuts a
    // threshold into a sum of rotated sine octaves, which is a distribution
    // nobody can integrate in their head, so the knob is a dial and the only
    // honest reading of it is `--poses blow`. At 0.28 the sea at the authored
    // wind carries white in torn streaks with dark water between them; by about
    // 0.45 the streaks join up and the sound reads as shoal water rather than
    // as a blow.
    //
    // The onset is set *above* the authored `wind.strength` of 0.9 on purpose,
    // and that ordering is the section's argument rather than a coincidence of
    // two numbers: at 1.25 the resting sea is four fifths of the way up the
    // curve with room left in it, so the gust front — which lifts the strength
    // by up to `wind.gust` — has somewhere to go and can be *seen* crossing the
    // water. Set it under 0.9 and the sound is saturated at rest and the front
    // passes over a sea that cannot answer it.
    //
    // The lee is set harder than the surf's 0.72 exposure, and the asymmetry is
    // the point rather than an oversight: a swell refracting round a headland
    // still breaks a little in its lee, and a wind that has just crossed a hill
    // has raised no sea at all behind it. 0.85 leaves sheltered water about a
    // seventh of the open sound's white, which reads as a slick rather than as
    // a hole cut in the water.
    whitecap:      0.28,
    whitecapOnset: 2.2,
    whitecapLee:   0.85,

    // The swell's share, and the one number here that is set by what a harbour
    // looks like rather than by what the sound does. Just under a half: enough
    // that the water inside the mole is visibly flatter than the water outside
    // it at every zoom the camera has, and far enough from zero that the lee of
    // a skerry is calmer water rather than a hole in the sea. The `shelter`
    // line of `scape:map --stats` is where the share it actually reaches is
    // reported, because a gain on a mean is not a share of the water.
    swellLee:     0.45,
    caustics:     1,
    causticDepth: 2.8,
    causticScale: 2.6,
  },

  // The metre class, and it stays metres at any world size. The range is set
  // against `boats.clearance` at 0.42: half of 0.8 is 0.4, so the lowest spring
  // tide of the year still leaves two centimetres of water under the shallowest
  // leg the router would accept. It is also most of the way through the wrack
  // band `littoral` holds — a tide that cannot reach the weed is a tide that
  // cannot be seen.
  tide: {
    range:  0.8,
    spring: 0.55,
    lag:    2.4,
  },
}
