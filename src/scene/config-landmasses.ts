import type { LandmassSpec } from './config.ts'


/**
 * The five holdings, as data rather than as part of the schema.
 *
 * Lifted out of `config.ts` when that module reached its enforced line limit
 * with six lines to spare, and lifted out *here* rather than anywhere else
 * because this is the one part of the default config that is a table: five
 * records of the same shape, no logic, and the only section that grows every
 * time the world does. Everything else in the defaults is one number on a line
 * beside the interface field that documents it, and separating those two would
 * be the split that makes the config harder to read rather than easier.
 *
 * The dependency is a type in one direction and a value in the other, so the
 * two modules never form a cycle at runtime: the schema is erased, and only
 * this table survives into the bundle.
 */
export const SCAPE_LANDMASSES: readonly LandmassSpec[] = [
  // No `terrain` and no `layout`: the home island *is* the default, and the
  // `terrain` and `layout` sections of `SCAPE_CONFIG` are where its eleven
  // numbers live. Restating them here
  // is what this spec used to do, and it meant every one of them existed in
  // two places that nothing checked against each other.
  {
    id:         'home',
    profile:    'home',
    origin:     [ 0, 0 ],
    seedOffset: 0,
    satellites: 'home',
  },
  {
    id:         'ridge',
    profile:    'ridge',
    origin:     [ -178, 128 ],
    seedOffset: 20_311,
    satellites: 'none',
    terrain:    {
      size:        144,
      height:      14.8,
      shoreBand:   0.9,
      islandInner: 0.5,
      islandOuter: 0.69,
    },
    layout: {
      yardRadius:    14,
      trackWidth:    2.7,
      plotCount:     2,
      forestBias:    0.92,
      harbourSpread: -46,
      pastureRadius: 5,
    },
  },
  {
    id:         'meadow',
    profile:    'meadow',
    origin:     [ 178, 128 ],
    seedOffset: 40_927,
    satellites: 'none',
    terrain:    {
      size:        144,
      height:      7.6,
      shoreBand:   1.45,
      islandInner: 0.58,
      islandOuter: 0.73,
    },
    layout: {
      yardRadius:    14,
      trackWidth:    2.9,
      plotCount:     3,
      forestBias:    0.34,
      harbourSpread: 44,
      pastureRadius: 5,
    },
  },

  // The southern pair, and the reason the world is three times the span it
  // was. Each is ten times the *area* of the two outer holdings above —
  // 455 m across against 144 — which is a different kind of place rather
  // than a bigger version of the same one: a farm on either of these is a
  // holding on a landmass, with fell and forest it will never touch.
  //
  // Their patches sit 600 m apart on x and their coastlines about 300 m,
  // which is the water the strand crosses. Both clear `halfWorld` at 760
  // with 52 m to spare, and neither overlaps anything: `assertSeparate`
  // checks both rules and `archipelago.test.ts` states them as facts.
  //
  // `detail` at 0.45 is the whole affordability of this. Left at 1 the two
  // of them would take `areaScale` from 2.08 to 12.9 — every scatter budget
  // sixfold, and a placement solver that is O(claims) per attempt — and the
  // terrain patches would be 483 segments a side apiece. At 0.45 they are
  // drawn at about 1.4 m to a quad and dressed at half the farm's density,
  // which is what an uninhabited fell looks like anyway.
  {
    id:         'sound',
    profile:    'sound',
    origin:     [ -300, -480 ],
    seedOffset: 61_403,
    satellites: 'none',
    detail:     0.45,
    terrain:    {
      size:        455,
      height:      16.4,
      shoreBand:   1.2,
      islandInner: 0.5,
      islandOuter: 0.66,

      // The one island the ice reached, and the one whose name asked for it.
      // 115 m of inlet from a mouth 164 m out puts the head about 49 m from
      // the island's middle — a third of the way across a landmass 300 m of
      // dry ground wide, which is a fjord rather than a nick in the coast
      // and still leaves the farm the whole of the ground behind it.
      //
      // The length is the one number here that was measured rather than
      // chosen. This island's harbour bank sits 43 m out on the same side,
      // and the smokehouse standing on it needs half a metre of dry ground
      // under all four corners of its footing: an inlet reaching past about
      // 125 m cuts into that bank, the harbour shifts a metre, and the sound
      // loses its smokehouse. At 115 the whole of the existing composition —
      // jetty, harbour, smokehouse, mill, pasture, chapel — is exactly where
      // it was, and `smokehouse.test.ts` is what says so.
      //
      // It opens at 90°, toward `+z`, which is the side facing the middle of
      // the archipelago: the basin is in frame at every pose the tour takes
      // of the whole world rather than hidden round the back of the island.
      //
      // 12.5 m of basin against a `seabedDrop` of 9 is the overdeepening —
      // the trench is deeper than the sea it opens into, which is what a
      // glacier does and a bay does not. The sill at a third of that leaves
      // about 5.5 m of water over the bar. Neither is a *look*: both are read
      // by `scape:map --stats` and by nothing the camera can see.
      fjord: {
        depth:   12.5,
        sill:    0.34,
        length:  115,
        width:   24,
        bearing: 90,
        bend:    0.55,
      },
    },
    layout: {
      yardRadius:    16,
      trackWidth:    2.8,
      plotCount:     2,
      forestBias:    0.84,
      harbourSpread: -40,
      pastureRadius: 7,
    },
  },
  {
    id:         'fell',
    profile:    'fell',
    origin:     [ 300, -480 ],
    seedOffset: 82_147,
    satellites: 'none',
    detail:     0.45,
    terrain:    {
      size:        455,
      height:      21.8,
      shoreBand:   0.95,
      islandInner: 0.47,
      islandOuter: 0.68,

      // The second inlet, and the reason the section is per-island rather
      // than per-archipelago: the same six numbers on a different coast are
      // a different fjord, and two of them make the pair of great southern
      // landmasses read as one glaciated coast rather than as one island
      // with a bay in it.
      //
      // It opens at 135°, which is the corner of this island facing the
      // middle of the archipelago and 45° clear of both the strand's
      // landfall to the west and the harbour bank to the north-east. The
      // bend is turned the other way from the sound's on purpose — two
      // inlets curving the same way read as one shape stamped twice.
      //
      // 115 m here for the sound's reason rather than by copying it: this
      // island's landing search walks out from the yard for the nearest bank
      // with navigable water off it, and an inlet reaching much further
      // inland becomes that bank — which moves the jetty into the fjord and
      // the harbour, the gull ring and a ferry leg with it. At 115 the
      // trench stops short of the ground the search prefers, and the whole
      // of this island's composition stays where it was.
      fjord: {
        depth:   12.5,
        sill:    0.34,
        length:  115,
        width:   22,
        bearing: 135,
        bend:    -0.55,
      },
    },
    layout: {
      yardRadius:    15,
      trackWidth:    2.6,
      plotCount:     2,
      forestBias:    0.66,
      harbourSpread: 42,
      pastureRadius: 8,
    },
  },
]
