export type GradeName = 'natural' | 'cinematic' | 'warm' | 'cool' | 'noir' | 'dream'

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
  atmosphere: {
    fogDensity:   number
    fogBreath:    number
    mistAmount:   number
    mistWind:     number
    skyTop:       number
    sunColor:     number
    sunStrength:  number
    sunDirection: readonly [number, number, number]
    hemiSky:      number
    hemiGround:   number
    hemiStrength: number
  }
  look: {
    grade:     GradeName
    intensity: number
    vignette:  number
    grain:     number
    bloom:     number
    tiltShift: number
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
  atmosphere: {
    fogDensity:   0.52,
    fogBreath:    0.08,
    mistAmount:   0.42,
    mistWind:     0.36,
    skyTop:       0x647c86,
    sunColor:     0xffdda0,
    sunStrength:  2.65,
    sunDirection: [ -0.5, 0.76, -0.42 ],
    hemiSky:      0xcbd3c1,
    hemiGround:   0x454633,
    hemiStrength: 0.68,
  },
  look: {
    grade:     'cinematic',
    intensity: 0.82,
    vignette:  0.34,
    grain:     0.16,
    bloom:     0.48,
    tiltShift: 0.88,
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
