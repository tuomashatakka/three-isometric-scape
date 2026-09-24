/**
 * The ice that stands up out of the sound.
 *
 * The ninth section kept outside `config.ts`, and here for the reason the
 * guard, the treeline, the dunes, the kelp, the crag, the dyke, the shieling
 * and the ledges are: a subject, moved whole.
 *
 * The sea has frozen in this scape for a long time and it has never had any
 * *thickness*. `scapeIce` paints a fractured white sheet onto the water plane —
 * correct in where it is, correct in when it arrives, and flat, because it is a
 * colour on a surface. A frozen sound is not flat. First-year ice does not
 * grow as one pane and stay there: it makes, it breaks, and the wind shoves the
 * pieces into each other until they raft, so what you look at is a field of
 * plates with edges you can see, standing a hand's breadth or two over the water
 * between them, each throwing a shadow across its neighbour.
 *
 * That is the whole of what this section buys: the edges and the shadows. The
 * front itself is not restated here — where the pack stands and which week it
 * arrives are read from `landscape/water-ice.ts`, the same arithmetic the
 * surface paints with, because a pack that decided for itself where the sea was
 * frozen would be a plate of ice standing on open water at the one place anyone
 * is looking.
 *
 * **Build-time except for the last two, and out of the tuning overlay for the
 * reason `dyke` is.** Where the plates are is settled during the survey and
 * stamped into one instanced draw; nothing but {@link PackIceConfig.pack.cover}
 * and {@link PackIceConfig.pack.working} can move without the scape being
 * generated again, and a slider that needs a rebuild to be seen lies about what
 * a slider does.
 *
 * **Every length in it is metres and stays metres.** A floe is the size a floe
 * is: a world that grew again puts more sea between its islands and does not
 * breed larger ice on it.
 */
export interface PackIceConfig {
  pack: {

    /**
     * Metres between one candidate seat and the next, before anything refuses.
     *
     * The grid the search walks, and the one number here that is about the
     * *survey* rather than about ice. Fine enough that the pack reads as a field
     * rather than as a row, coarse enough that the whole world is a few
     * thousand probes of the height field rather than a hundred thousand: the
     * archipelago is 1520 m across, so 40 m is about 1500 probes, of which
     * a little over 600 are water a plate can stand on, and the whole search is
     * about thirty milliseconds of build. It is also, with {@link plate}, what
     * sets how *dense* the pack is: a spacing under the plate size deals ice
     * that overlaps, which is what rafting looks like and is the intended
     * state, and a spacing well over it deals a scatter of rafts on open water.
     */
    spacing: number

    /**
     * How closed the sheet under a seat has to be before a plate stands on it,
     * 0..1.
     *
     * The gate, and the whole of the agreement with the surface. It is read
     * through `iceCover` — the cpu mirror of the shader's own `scapeIce` — so a
     * seat is offered a floe exactly when the water there is drawn as ice and
     * not one week before. 1 is a pack that never forms, because the front
     * never reaches a cover of one in water deep enough to float a plate; 0 is
     * ice standing on the open sea in August.
     */
    sheet: number

    /**
     * Metres of water a plate needs under it at mean water.
     *
     * A floe floats or it is not a floe. Below this the sheet is welded to the
     * bed — fast ice, which is what the beach and the flats already draw as a
     * white surface with no edge to it — so the geometry starts where the
     * grounding stops, and the shallow half of the front stays the surface's
     * business.
     */
    draught: number

    /** Mean metres across a plate. */
    plate: number

    /**
     * How unequal the plates are, 0..1.
     *
     * A floe field graded to one size is a tiling, and the eye finds a tiling
     * immediately. 0 is that tiling; 1 deals plates between a fifth of
     * {@link plate} and nearly twice it.
     */
    ragged: number

    /**
     * Metres a plate's deck stands over the water, per metre of its own width.
     *
     * The ridge riding on that deck stands half as much again — see
     * `props/ice.ts`, where the unit plate is authored.
     *
     * Rafting, and it is worth writing down what it is not. Level first-year
     * ice a metre thick floats with about a tenth of a metre of itself in the
     * air, which at this camera is nothing — a white surface with a white
     * surface on it. What is actually visible on a frozen sound is the ice that
     * has been *driven into itself*: a pack under pressure rides one plate up
     * over the next and stands a third of a metre and more out of the water
     * along the join. So this is a rafted stand rather than a freeboard, and it
     * scales with the plate because a bigger floe carries a bigger ridge.
     */
    rise: number

    /**
     * Metres of open lead kept either side of every ferry leg.
     *
     * The boats are the one thing in the archipelago that does not stop for the
     * winter, and a working sound is kept open by the hulls that use it. It is
     * also the honest answer to a fleet that would otherwise sail through a
     * field of ice: the route is surveyed at build and the pack is dealt around
     * it, which the test beside the search states as a fact about the data.
     */
    fairway: number

    /**
     * Share of the seats that carry a plate, 0..1, and the switch for the whole
     * system.
     *
     * Read per frame, so it belongs on the overlay. A share rather than a count
     * for the reason `haulout.ashore` is one: turning it down thins the pack the
     * same way every time instead of reshuffling which plates are there, and 0
     * is a sound that freezes as it always did — a flat white sheet with nothing
     * standing on it — rather than a boolean saying the same thing.
     */
    cover: number

    /**
     * Metres a plate works to and fro on the wind.
     *
     * Pack ice is never still: it breathes with the swell under it and grinds
     * along the leads. Small, bounded and carried on `wind.travel` rather than
     * on a clock — so it dies with `wind.speed` or `wind.strength` the way the
     * surf and the windrows do, and a still photograph of a frozen sound is the
     * same photograph twice. 0 is a pack frozen fast.
     */
    working: number
  }
}

/**
 * The pack, as tuned.
 *
 * `sheet` at 0.55 is a little over the halfway point of the surface's own
 * cover, which puts the outer plates where the sheet is visibly closing rather
 * than where it is first thinking about it — and leaves the ragged quarter of
 * the front, the part `water.iceBreak` tears holes in, as open water with
 * nothing standing on it. That edge is most of what a floe field reads as.
 *
 * `draught` at 1.1 m keeps the plates off everything the tide walks across:
 * the flats, the shingle, the causeway and the weir pound are all inside a
 * metre of water at mean, and a floe aground on a tidal flat is a white box in
 * a field.
 *
 * 30 m plates at 0.5 of raggedness deal ice between 15 and 45 m across, and
 * that size is a decision about *pixels* rather than about ice. A pack breaks
 * into everything from brash a metre across to floes half a kilometre wide; the
 * default frame is 1400 m over an 800 px capture, so anything under about ten
 * metres is a sub-pixel dither on the sound and anything the run is actually
 * about — the rafted ridge, the wet course, the shadow one plate throws on the
 * next — is invisible at every zoom the tour uses. At 40 m of spacing the full
 * field is 16 % of the world square in ice, which is a fifth of its water: a
 * sound with floes on it rather than a sound with a lid.
 *
 * `rise` at 0.015 stands a mean plate 0.45 m out of the water and the widest
 * 0.67 m. Over the 0.4 m a spring tide swings through, and deliberately so: a
 * ridge is where a pack has driven itself up over its own edge, and a pack that
 * never stood higher than its own tide would have nothing to throw a shadow
 * with.
 *
 * `fairway` at 9 m is two hulls and a little: `BOAT_HULL_RADIUS` is 1.85 m and
 * the waterways are surveyed with 0.54 m of clearance to spare, so a lead that
 * wide is one a boat visibly fits down rather than one it merely clears.
 */
export const SCAPE_PACK_ICE: PackIceConfig = {
  pack: {
    spacing: 40,
    sheet:   0.55,
    draught: 1.1,
    plate:   30,
    ragged:  0.5,
    rise:    0.015,
    fairway: 10,
    cover:   1,
    working: 0.5,
  },
}
