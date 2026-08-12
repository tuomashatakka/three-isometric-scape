import type { GradeName, ScapeConfig } from '../scene/config.ts'
import type { AtmosphereQuality } from '../scene/quality.ts'


/** A continuous knob. `get`/`set` read and write the config directly. */
export interface RangeControl {
  kind:  'range'
  id:    string
  label: string
  min:   number
  max:   number
  step:  number

  /** Unavailable knobs still render, greyed, so the tier is visible rather than mysterious. */
  available?: boolean
  get(): number
  set(value: number): void
}

export interface SelectControl {
  kind:    'select'
  id:      string
  label:   string
  options: readonly string[]
  get(): string
  set(value: string): void
}

/**
 * An effect switch, with the knobs it owns nested underneath.
 *
 * There is no separate "enabled" flag anywhere in the config — an effect is off
 * when its strength is zero. So the switch remembers the strength it turned off
 * at and restores it, which is what makes toggling non-destructive.
 */
export interface ToggleControl {
  kind:       'toggle'
  id:         string
  label:      string
  available?: boolean
  children:   RangeControl[]
  get(): boolean
  set(value: boolean): void
}

export type ScapeControl = RangeControl | SelectControl | ToggleControl

export interface ControlSection {
  title:    string
  controls: ScapeControl[]
}

const GRADES: readonly GradeName[] = [
  'nordic', 'natural', 'cinematic', 'warm', 'cool', 'noir', 'dream',
]

function range (
  id: string,
  label: string,
  min: number,
  max: number,
  step: number,
  get: () => number,
  set: (value: number) => void,
  available = true,
): RangeControl {
  return { kind: 'range', id, label, min, max, step, get, set, available }
}

/**
 * Wrap a strength knob in an on/off switch.
 *
 * `restore` is the value to come back to when the effect is switched on from a
 * config that was authored at zero — without it, flipping the switch would look
 * broken, because turning something on and seeing nothing change is worse than
 * not offering the switch at all.
 */
function toggled (
  id: string,
  label: string,
  strength: RangeControl,
  restore: number,
  extra: RangeControl[] = [],
): ToggleControl {
  let remembered = strength.get() || restore

  return {
    kind:      'toggle',
    id,
    label,
    available: strength.available,
    children:  [ strength, ...extra ],
    get:       () => strength.get() > 0,

    set (value) {
      if (value) {
        strength.set(remembered || restore)
        return
      }

      remembered = strength.get() || remembered
      strength.set(0)
    },
  }
}

/**
 * The tunable surface, as sections.
 *
 * Everything here writes straight into the config object the scene modules
 * already read every frame, so there is no second source of truth to keep in
 * sync — the panel is a view of `config`, not a copy of it.
 */
export function createScapeControls (
  config:  ScapeConfig,
  quality: AtmosphereQuality,
): ControlSection[] {
  const { look, atmosphere, terrain, water, wind, camera } = config

  return [
    {
      title:    'optics',
      controls: [
        {
          kind:    'select',
          id:      'grade',
          label:   'colour grade',
          options: GRADES,
          get:     () => look.grade,
          set:     value => {
            look.grade = value as GradeName
          },
        },
        range('intensity', 'grade strength', 0, 1, 0.01, () => look.intensity, v => {
          look.intensity = v
        }),
        toggled(
          'bloom',
          'bloom',
          range('bloom-strength', 'strength', 0, 1.5, 0.01, () => look.bloom, v => {
            look.bloom = v
          }, quality.bloom),
          0.34,
        ),
        toggled(
          'vignette',
          'vignette',
          range('vignette-amount', 'amount', 0, 1, 0.01, () => look.vignette, v => {
            look.vignette = v
          }),
          0.34,
        ),
        toggled(
          'grain',
          'film grain',
          range('grain-amount', 'amount', 0, 1, 0.01, () => look.grain, v => {
            look.grain = v
          }, quality.grain),
          0.16,
        ),
        toggled(
          'tilt-shift',
          'tilt-shift',
          range('tilt-amount', 'blur', 0, 2, 0.01, () => look.tiltShift, v => {
            look.tiltShift = v
          }),
          0.88,
        ),
        toggled(
          'god-rays',
          'sun shafts',
          range('rays-amount', 'strength', 0, 1, 0.01, () => look.godRays, v => {
            look.godRays = v
          }, quality.godRays),
          0.26,
        ),
      ],
    },
    {
      title:    'atmosphere',
      controls: [
        range('fog', 'fog density', 0, 0.9, 0.01, () => atmosphere.fogDensity, v => {
          atmosphere.fogDensity = v
        }),
        range('fog-breath', 'fog breath', 0, 0.4, 0.01, () => atmosphere.fogBreath, v => {
          atmosphere.fogBreath = v
        }),
        range('cloud-shadow', 'cloud shadow', 0, 1, 0.01, () => atmosphere.cloudShadow, v => {
          atmosphere.cloudShadow = v
        }),
        range('cloud-speed', 'cloud drift', 0, 3, 0.01, () => atmosphere.cloudSpeed, v => {
          atmosphere.cloudSpeed = v
        }),
      ],
    },
    {
      title:    'mist',
      controls: [
        toggled(
          'mist',
          'ground mist',
          range('mist-amount', 'density', 0, 1, 0.01, () => atmosphere.mistAmount, v => {
            atmosphere.mistAmount = v
          }),
          0.34,
          [ range('mist-wind', 'drift', 0, 1.5, 0.01, () => atmosphere.mistWind, v => {
            atmosphere.mistWind = v
          }) ],
        ),
      ],
    },
    {
      title:    'water',
      controls: [
        toggled(
          'sparkle',
          'sun glitter',
          range('sparkle-amount', 'strength', 0, 1.5, 0.01, () => water.sparkle, v => {
            water.sparkle = v
          }),
          0.5,
        ),
        range('waves', 'swell', 0, 0.4, 0.005, () => water.waveHeight, v => {
          water.waveHeight = v
        }),
        range('ripple', 'ripple', 0, 0.6, 0.01, () => water.rippleStrength, v => {
          water.rippleStrength = v
        }),
        range('water-rough', 'roughness', 0.05, 1, 0.01, () => water.roughness, v => {
          water.roughness = v
        }),
      ],
    },
    {
      title:    'ground',
      controls: [
        range('soil', 'soil grain', 0, 1, 0.01, () => terrain.detailGrain, v => {
          terrain.detailGrain = v
        }),
        range('soil-scale', 'grain scale', 1, 24, 0.5, () => terrain.detailScale, v => {
          terrain.detailScale = v
        }),
        range('wind', 'wind strength', 0, 3, 0.01, () => wind.strength, v => {
          wind.strength = v
        }),
        range('wind-speed', 'wind speed', 0, 4, 0.01, () => wind.speed, v => {
          wind.speed = v
        }),
      ],
    },
    {
      title:    'camera',
      controls: [
        range('tilt-near', 'tilt zoomed in', 8, 60, 1, () => camera.tiltNear, v => {
          camera.tiltNear = v
        }),
        range('tilt-far', 'tilt zoomed out', 8, 70, 1, () => camera.tiltFar, v => {
          camera.tiltFar = v
        }),
      ],
    },
  ]
}
