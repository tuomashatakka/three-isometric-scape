/**
 * The fog that fills the low ground and leaves the tops standing.
 *
 * The tenth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling,
 * the wreck and the shoal are: a subject, moved whole.
 *
 * It is the scape's third fog and the first one with a *ceiling* on it.
 * `atmosphere.mistAmount` is haze you are standing in, thickest over the island
 * and gone by the time the eye is out at sea; `season.seaSmoke` is water
 * steaming into colder air, and stands over open water and nowhere else. This
 * is neither. A radiation fog is air that has been cooled from below until it
 * gave its water up, and air cooled from below pools: it fills the sound and
 * the hollows to a level and it stops, and whatever ground stands over that
 * level stands in clear air with the whole archipelago drowned beneath it.
 *
 * ### there is no mask on it
 *
 * The other two families bake a mask into their vertex colours — radial in
 * toward the islands for the mist, radial out away from them for the smoke —
 * because each is a statement about *where* on the map its fog belongs. This
 * one is a statement about *how high*, and a level needs no mask: what is under
 * `top` is in the bank and what is over it is not, the
 * terrain writes depth, and the depth buffer has already answered the question
 * for every pixel of every island at every zoom. The only thing baked into this
 * family's geometry is the radial fade that keeps the quad's own straight edge
 * out of the frame.
 *
 * That is also why the shape of the coast is nowhere in here. A bank does not
 * know which island it is lying on.
 *
 * ### the scale classes
 *
 * **`top` and `depth` are metres and
 * stay metres.** How deep a night's cooling reaches is a fact about air, not
 * about how wide the archipelago is or how far the camera is pulled out — a
 * world twice the size gets twice as much fog and not a fog twice as deep. The
 * rest is dimensionless.
 */
export interface HaarConfig {
  haar: {

    /**
     * How thick the bank lies at its worst, 0..1.
     *
     * The switch, and the only one: 0 is the clear night this scape had before
     * this section existed. There is no boolean beside it saying the same thing
     * again.
     *
     * What is *out* on any given night is not here. The bank is gated on the
     * hour, on the week the hour falls in, on the wind and on what the last
     * shower left in the ground — see `haarAmount` — so a midsummer
     * midnight at this latitude has none of it and a hard blow has none of it,
     * without a second knob saying so.
     */
    strength: number

    /**
     * Metres over mean water the inversion stands at.
     *
     * The one number that decides what the picture is, because it decides what
     * is left above it. At 3.4 m against a home island that peaks at 8.6 the
     * farm's own shoulder, the chapel knoll, the mill and every crag in the
     * archipelago stand clear while the yard, the harbour, the tidal flats and
     * the whole of the sound go under — which is the reading a night inversion
     * actually gives a coast this shape.
     *
     * Raise it past the highest ground and the archipelago disappears, which is
     * a white-out and not a bug: a real fog does that too. Lower it under the
     * waterline and there is nothing left to fill.
     */
    top: number

    /**
     * Metres of fog hanging under that top.
     *
     * The sheets are dealt evenly through this band, densest at the bottom, and
     * the band is what gives the bank an *edge* rather than a cut: a single
     * sheet meeting a hillside draws one contour line, and five sheets at five
     * heights draw five staggered ones that read as a slope disappearing into
     * fog. Held off the sea surface by a hand's breadth whatever this is set to,
     * because a sheet lying exactly on the water is a sheet fighting it for the
     * same pixels.
     */
    depth: number

    /**
     * How hard the wind pushes the bank along, dimensionless.
     *
     * The same response `atmosphere.mistDrag` is, and deliberately its own
     * number rather than a share of it: a bank in a calm still creeps, where the
     * haze above it is being carried, and the two have never moved together on
     * any coast. 0 pins the field to the world and is what a capture of a
     * *shape* wants; nothing in `STILL` touches it, because the travel it
     * multiplies is the wind's own and the wind is already stopped there.
     */
    drag: number

    /**
     * The wind strength that clears the bank entirely.
     *
     * Dimensionless, in `wind.strength`'s own units, and it is measured against
     * the **gusted** strength rather than the authored one — the same trap
     * `water.whitecapOnset` fell into once already. What reaches
     * `haarAmount` is `WindState.strength`, which is the authored wind
     * times the front, up to `1 + wind.gust`. At 1.9 against an authored 0.9
     * gusting to about 1.2 the bank is roughly half out at rest and thins
     * visibly as each front crosses, which is what a fog in a rising wind does.
     *
     * Set at or under the authored wind and there is never any fog at all
     * except in a capture, because `STILL` zeroes the wind and every still this
     * scape takes is therefore taken in a dead calm — a failure with no symptom
     * in any picture. The `haar` line of `scape:map --stats` is what catches it:
     * it prints the bank at the still, at rest and in the gust.
     *
     * At 0 any breath of air takes it, which is the honest reading of "there is
     * no threshold" rather than a special case.
     */
    scour: number

    /**
     * How fast the sun burns it off, as an exponent on the night.
     *
     * A fog does not thin in proportion to the light on it — it holds through
     * the first of the morning and then goes in minutes — so the night term is
     * raised to a power rather than scaled. At 1 it fades with the daylight
     * exactly, and at 0 it stands at noon, which is a sea fret rather than a
     * lie. Over 1 is the real curve, and it is where the whole of the seasonal
     * response lives as well: at 2, against a `day` that at latitude 68 is a
     * fact about the week as much as the hour, a midsummer midnight with better
     * than half a noon's sun in it keeps a sixth of the bank while a midwinter
     * afternoon with none of it keeps half.
     */
    burn: number

    /**
     * How much of the bank the last shower is responsible for, 0..1.
     *
     * The ground has to have water in it to give any up. 0 is a coast that fogs
     * the same on the dry side of the front as on the wet, and 1 is one that
     * fogs only where it has just rained — which is too strong for a maritime
     * coast, where the air is never dry and the shower only deepens what was
     * going to happen anyway. At 0.4 a clear calm night at the back of a front
     * is two thirds again the bank of one on the dry side of it.
     *
     * Read off `WeatherState.wet` rather than `fall`, and the difference is the
     * whole point: it does not fog while it is raining, it fogs on the still
     * hours afterward, and `wet` is already the fall with an hour of drying
     * behind it.
     */
    damp: number
  }
}


export const SCAPE_HAAR: HaarConfig = {
  haar: {

    // Swept against the six islands' own relief and read off the `haar` line of
    // `scape:map --stats`, which reports what share of each island's land the
    // bank covers. At 3.4 m it takes a little over half the home island — the
    // yard, the harbour, the beck's whole lower course and every one of the
    // tidal flats — and leaves all six peaks, the chapel knoll and every crag in
    // the archipelago standing out of it. Past about 5 m the ridge goes under
    // whole and the frame is a white sheet with two hills in it.
    top:   3.4,
    depth: 2.8,

    // Strong enough that the sound reads as filled rather than hazed, and short
    // of the white-out the same sheets give at 1. The stack composites and the
    // field it is drawn with is torn, so what this actually produces on a dark
    // calm night is about six tenths of cover where the fog is solid and a
    // quarter where a lane runs through it.
    strength: 0.85,

    // Slower than the haze above it. A bank sits in the air it cooled in; what
    // moves it is the weak drainage wind that made it rather than the gradient
    // wind overhead, and `atmosphere.mistDrag` is at 0.6 for the latter.
    drag: 0.4,

    // Clear of the authored 0.9 and clear of the 1.2 it gusts to, with enough
    // room left that the front is visible in the bank rather than sweeping it
    // away twice a cycle. See the trap in the doc comment.
    scour: 1.9,

    burn: 2,
    damp: 0.4,
  },
}
