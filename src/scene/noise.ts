import { hash2, smoothstep } from 'threejs-scene'


function valueNoise (x: number, z: number, seed: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const tx = smoothstep(0, 1, x - x0)
  const tz = smoothstep(0, 1, z - z0)

  const a = hash2(x0 + seed * 0.013, z0 - seed * 0.017)
  const b = hash2(x0 + 1 + seed * 0.013, z0 - seed * 0.017)
  const c = hash2(x0 + seed * 0.013, z0 + 1 - seed * 0.017)
  const d = hash2(x0 + 1 + seed * 0.013, z0 + 1 - seed * 0.017)

  const top    = a + (b - a) * tx
  const bottom = c + (d - c) * tx
  return top + (bottom - top) * tz
}

export function sampleHeight (x: number, z: number, seed: number, amplitude: number): number {
  let frequency   = 0.055
  let weight      = 1
  let total       = 0
  let weightTotal = 0

  for (let octave = 0; octave < 4; octave += 1) {
    total += valueNoise(x * frequency, z * frequency, seed + octave * 97) * weight
    weightTotal += weight
    frequency *= 2.04
    weight *= 0.48
  }

  const radialLift = Math.max(0, 1 - Math.hypot(x, z) / 58) * 0.16
  return (total / weightTotal * 2 - 1 + radialLift) * amplitude
}
