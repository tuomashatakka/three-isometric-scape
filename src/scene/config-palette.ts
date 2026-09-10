/**
 * Every colour in the scape, in one list.
 *
 * The fifth section kept outside `config.ts`, and the first one moved for the
 * ceiling rather than for the subject — though it is a subject, and a whole
 * one. `config.ts`'s own note names this seam: a slice at a time, schema and
 * numbers together, spread back into `SCAPE_CONFIG` there. The palette is the
 * cleanest slice the document has, because nothing in here is a knob that
 * interacts with another section's arithmetic — it is a list of what things are
 * made of, and every entry earns its place by being a *substance* rather than a
 * shade of one already listed.
 *
 * That rule is the one thing to keep when adding to it. `wrack`, `moss`,
 * `peat`, `dune` and `seaRock` all have notes saying why they are not a darker
 * something else, and they all say the same thing: a second name for an
 * existing tone is how two surfaces in one scape drift apart on the first
 * retune.
 *
 * **Baked, not live.** The ground colours here are written into the terrain's
 * vertex colours at build and the prop colours into merged geometry, so none of
 * this is in the tuning overlay: a slider that needs a rebuild to be seen lies
 * about what a slider does.
 */
export interface ScapePalette {
  sky:          number
  fog:          number
  deepWater:    number
  shallowWater: number
  foam:         number
  silt:         number
  shore:        number

  /**
   * Blown shell sand — the belt on the weather shore, and nothing else.
   *
   * Its own entry rather than a lighter `shore`, and for the reason `wrack`
   * has one: sand the wind has sorted is a different substance from the
   * shingle the tide left, paler and greyer because what survives the trip up
   * the beach is the light fraction. A second name for an existing tone is how
   * two beaches in one scape drift apart on the first retune.
   */
  dune:     number
  meadow:   number
  dryGrass: number
  heath:    number
  scree:    number
  lichen:   number

  /**
   * Bladderwrack on wet stone — the tidal band on the rocks in the open sea.
   *
   * Olive-brown and very dark, because weed out of the water nearly is. Its
   * own entry rather than a reuse of `heath` or `streambed`: the band has to
   * read as a different substance from the rock it is on, and a second name
   * for an existing tone is how two rocks in one scape end up different
   * colours. See `ScapeConfig.littoral`.
   */
  wrack: number

  /**
   * Wet rock at the foot of a crag — the shore platform, and the scree on it.
   *
   * Its own entry rather than a darker `scree`, and for the reason `wrack`
   * has one: the platform is rock the sea washes over twice a day, and rock
   * that never dries is a different substance from the dry stone the scree
   * band paints on a hillside — darker, colder, and with none of the lichen
   * that makes `scree` warm. The face above it needs no colour of its own,
   * because seventy degrees of ground is already scree by the slope rule.
   */
  seaRock: number

  /**
   * Moss on the shaded side — the ground that never dries out.
   *
   * Its own entry rather than a darker `meadow`, and for the reason `wrack`
   * has one: moss is a different plant from grass, colder and bluer than any
   * amount of shade would make a sward, and a second name for an existing
   * tone is how two greens in one scape drift apart on the first retune. The
   * props already paint from a moss of their own in `props/palette.ts` — this
   * is the ground's, and the two are deliberately close.
   */
  moss: number

  /** Mown upland grass — the clearing inside the pasture wall. */
  pasture: number

  /** Wet gravel in the beck's channel, above and below the waterline alike. */
  streambed: number

  /**
   * Cut peat — the floor of the working, and the face standing over it.
   *
   * Its own entry rather than a darker `trodden`, and for the reason `wrack`
   * and `moss` have one: peat is a different substance from soil, nearly black
   * and faintly red where it has been turned, and no amount of darkening a
   * footpath produces it. It is also, deliberately, the darkest thing on the
   * island — which is what lets a rectangle of it read as a cutting from the
   * pulled-out zoom rather than as a shadow.
   */
  peat: number

  /**
   * Bare earth underfoot. Greyer and darker than `track`, because a cart road
   * is gravel laid down and a footpath is only the turf taken off.
   */
  trodden: number
  track:   number
  tilled:  number
  yard:    number

  /** Lying snow. The one colour the year adds that the scape has no other use for. */
  snow: number

  /** Turned leaf — what the year leans the straw toward in autumn. */
  autumn: number

  /**
   * Sea ice. Colder and greyer than lying snow on purpose — new ice is the
   * water seen through it, and it only goes white where it has been broken.
   */
  ice: number

  /**
   * Glacier ice, on the surface of a cap.
   *
   * Its own colour rather than `snow` reused, and the difference is the whole
   * reason the cap is visible in July. Lying snow is fresh and white; the
   * surface of an ice cap is old firn, denser and faintly blue, and it sits
   * beside a summer hillside rather than on top of a white one. Give it
   * `snow` and midsummer paints the ice the same colour as ground that has no
   * snow on it at all.
   */
  glacier: number

  /**
   * The blue inside a crevasse.
   *
   * Deep, and deliberately far from every other blue in the palette: this is
   * not water and not shadow but ice thick enough to have taken the red out
   * of what came back up. It is only ever a fraction of a vertex — the
   * fractures are lines a metre or two across — so a colour that reads as
   * blue at full strength reads as a hairline at the strength it is used at.
   */
  crevasse: number

  /**
   * A falling drop.
   *
   * Not the water's colour and not the fog's. A streak of rain seen against
   * dark ground is the sky it is falling out of, so this is a pale, slightly
   * blue grey — and the same streak is mixed toward `snow` as the year freezes
   * it, which is why there is no second colour for the snowfall.
   */
  rain: number

  /**
   * The cool end of the star field.
   *
   * One colour rather than two: the warm end of the field is the scape's own
   * `daylight.dusk` amber, so the sky's warm and its low sun stay in one
   * family and there is no second red that only the stars can be tuned by.
   */
  star: number

  /** The lit face of the moon. Paler and cooler than lying snow — it is a light, not a surface. */
  moon: number

  /**
   * Wood smoke, at the mouth of the flue.
   *
   * Neither the fog's grey nor the snow's white, and one colour rather than
   * two: a plume is dense and warm where it leaves the brick and pale where it
   * has spread, and the pale end is this same colour seen through less of it.
   * Browner than `fog` on purpose — birch smoke off a damp autumn fire is not
   * the sea haze it drifts into.
   */
  smoke: number

  /**
   * A gull, at its brightest.
   *
   * One colour rather than three, the way the star field carries one: a gull
   * is a white bird with a grey back and black tips, and both of those are
   * this white seen at a fraction of it. Three entries would be three things
   * to keep in one family by hand, and the first retune is when they stop
   * being in one.
   */
  gull: number

  /** The dense heart of an auroral curtain, where it is thick enough to be green. */
  aurora: number

  /** What the same curtain thins out to at its fringes and its crown. */
  auroraCrown: number }

type SCAPE_PALETTEType = { palette: ScapePalette }

export const SCAPE_PALETTE: SCAPE_PALETTEType = {
  palette: {
    sky:          0x9daaa2,
    fog:          0x8d9a93,
    deepWater:    0x263a3d,
    shallowWater: 0x44605a,
    foam:         0xd9e2da,
    silt:         0x565b4a,
    shore:        0xa9977a,
    dune:         0xd8d0b2,
    meadow:       0x5d6b3c,
    dryGrass:     0x8f8a51,
    heath:        0x6b6a52,
    scree:        0x7d7a72,
    lichen:       0x9aa088,
    wrack:        0x3f3a20,
    seaRock:      0x4b5150,
    moss:         0x3d5a30,
    pasture:      0x76803f,
    streambed:    0x585f57,
    peat:         0x342a20,
    trodden:      0x6c6049,
    track:        0x7d6a4f,
    tilled:       0x6d5a44,
    yard:         0x8a8560,
    snow:         0xe6ecf0,
    autumn:       0xb4762f,
    ice:          0xa8bcc0,
    glacier:      0xd8e6ee,
    crevasse:     0x3f6f96,
    rain:         0xc6d2d8,
    star:         0xdce8ff,
    moon:         0xe4e9e0,
    smoke:        0xb7b1a6,
    gull:         0xf2f4f1,
    aurora:       0x6df2a8,
    auroraCrown:  0x7a5bd6,
  },
}
