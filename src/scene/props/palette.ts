/** The nordic farmstead colour vocabulary. Every prop builder paints from here. */
export const NORDIC_PALETTE = {
  faluRed:     '#8c3a2b',
  faluDark:    '#6f2c21',
  faluWorn:    '#9a4835',
  trimWhite:   '#e8e3d6',
  trimShadow:  '#cfc8b8',
  tarWood:     '#4a3a2c',
  wood:        '#7a5c3e',
  woodDark:    '#5c452f',
  woodLight:   '#96754e',
  plank:       '#8a6b47',
  shingle:     '#4f4741',
  shingleWorn: '#5d554d',
  birchBark:   '#e4e0d4',
  birchScar:   '#3a3630',
  bark:        '#4d4038',
  barkDark:    '#3a3129',
  spruce:      '#26402c',
  spruceDeep:  '#1b2f22',
  spruceLight: '#33512f',
  pine:        '#38512f',

  /** Juniper needle — the cool, dusty blue-green that sets it apart from the spruce. */
  juniper: '#4a5f52',

  /** A juniper berry — the frosted blue-black of the ripe cone. */
  juniperBerry:  '#3a4653',
  deadWood:      '#7d7466',
  granite:       '#7d7a72',
  graniteDark:   '#62605a',
  graniteWarm:   '#8b8478',
  driftwood:     '#a89e88',
  driftwoodDark: '#7c7362',
  lichen:        '#8f9179',
  lichenRust:    '#9a7f52',
  moss:          '#4a5c3a',

  // The tidal band. Olive-brown rather than the green anything landward is
  // painted: bladderwrack out of the water is nearly black, and a weed that
  // borrowed `moss` would read as grass growing in the sea.
  wrack:     '#4a4526',
  wrackDeep: '#332f1a',
  heather:   '#6b5f72',
  grass:     '#5d6b3c',
  grassDry:  '#8f8a51',
  rye:       '#b9a25e',
  hay:       '#c2a760',
  hayDark:   '#9d8546',
  sand:      '#a9977a',
  soil:      '#6d5a44',
  lakeSlate: '#4d5a5e',
  glass:     '#2b3238',
  iron:      '#43474a',
  ironRust:  '#7d4a33',
  canvas:    '#9a8c6b',

  // The flock. A fleece off the hill is not white — it is a dirty cream that
  // has stood in a year of rain — and `trimWhite` would have made the sheep the
  // brightest thing in the scape after the chapel's limewash.
  fleece:      '#ded7c3',
  fleeceShade: '#b7ae99',

  /** Face, ears and legs — the dark points a landrace ewe carries. */
  hide: '#33302c',

  /** A burning wick behind glass — the lamp in the lantern room, and its beams. */
  lampWarm: '#ffdca8',
  flagBlue: '#2f5d8f',
} as const

/** Name of a {@link NORDIC_PALETTE} entry. */
export type NordicColor = keyof typeof NORDIC_PALETTE

/** A palette with per-build overrides applied. */
export type NordicPalette = Record<NordicColor, string>

export function resolvePalette (overrides?: Partial<Record<NordicColor, string>>): NordicPalette {
  return overrides
    ? { ...NORDIC_PALETTE, ...overrides }
    : { ...NORDIC_PALETTE }
}
