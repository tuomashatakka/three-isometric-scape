export interface ScapeConfig {
  seed:    number
  terrain: {
    size:       number
    segments:   number
    height:     number
    waterLevel: number
  }
  dressing: {
    treeCount: number
    rockCount: number
  }
  camera: {
    viewSize:    number
    minViewSize: number
    maxViewSize: number
    tilt:        number
    rotation:    number
  }
  palette: {
    sky:      number
    fog:      number
    lowland:  number
    highland: number
    water:    number
    tree:     number
    trunk:    number
    rock:     number
  }
}

export const SCAPE_CONFIG = {
  seed:    7_319,
  terrain: {
    size:       84,
    segments:   96,
    height:     8.2,
    waterLevel: -1.25,
  },
  dressing: {
    treeCount: 420,
    rockCount: 150,
  },
  camera: {
    viewSize:    54,
    minViewSize: 18,
    maxViewSize: 92,
    tilt:        30,
    rotation:    45,
  },
  palette: {
    sky:      0xc9b98c,
    fog:      0xc9b98c,
    lowland:  0x8d8c59,
    highland: 0xc0aa6f,
    water:    0x66736c,
    tree:     0x304a2f,
    trunk:    0x5a4931,
    rock:     0x7b7462,
  },
} satisfies ScapeConfig
