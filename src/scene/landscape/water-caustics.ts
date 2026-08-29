import { smoothstep } from 'threejs-scene'


/**
 * The light that reaches the bottom, and everything that decides how much of it
 * there is.
 *
 * Its own file rather than another chunk of `water.ts` for the reason
 * `mill-sails.ts` is its own file: the lake already carries the swell, the
 * freeze, the surf, the wakes and the reflection, and this is a sixth complete
 * idea — a shader chunk, one line of injection, a rate, and one pure function
 * that says how brightly the sun is drawing today. `water.ts` keeps the
 * uniforms, because the uniforms are the lake's.
 */

/**
 * The net the sun draws on the bottom.
 *
 * A wave is a lens. Every crest of the swell gathers the light that falls on it
 * and every trough spreads it, so the sunlight arriving at the seabed is not
 * even — it is a moving mesh of bright filaments with dim cells between them.
 * That is the one thing this scape's shallows have never had, and it is what
 * separates water you can see the bottom of from water that is merely a paler
 * blue.
 *
 * **It is drawn where the light is, not where the water is.** Three terms decide
 * that and each is a different fact:
 *
 * **the depth**, out to `uCausticDepth`. Light is absorbed by what it passes
 * through, so the net is brightest against the bank and gone by the time the
 * bottom is. Like the surf, this falls out of the bathymetry for free and had
 * not to be authored per island: a shelving bay carries the net a long way out
 * and a granite face carries it a metre.
 *
 * **the sun**, through `uCaustics`, which is already scaled by how high the sun
 * is standing before it reaches here — see `causticStrength`. A low sun refracts
 * into a long smear rather than a focus, and a sun under the horizon has nothing
 * to focus. That is what gives the midwinter frames none of this without a
 * second knob having to say so.
 *
 * **the pixel**, through `fwidth`. A cell is 2.6 m across, which is thirty
 * pixels at the coastal poses and two at the full zoom-out — and a procedural
 * net has no mipmap to fall back on, so at two pixels a cell it is not detail,
 * it is moiré marching across the whole sea. So the net measures its own
 * footprint and *hides* rather than shrinking. The cell size is metres and stays
 * metres at every zoom; what changes is whether the frame can hold it.
 *
 * The phase rides `wind.travel`, the same integrated distance the ripple map
 * scrolls on and the surf marches in on — not `uWaveTime`, which is raw elapsed
 * seconds and cannot be stopped. A net that drifted through a still would be
 * somewhere else in every frame of a capture, whatever the still put the rest of
 * the scape into.
 */
export const WATER_CAUSTIC_GLSL = /* glsl */`
  uniform float uCaustics;
  uniform float uCausticDepth;
  uniform float uCausticCells;
  uniform float uCausticPhase;

  /**
   * One sheet of the net: the zero set of three sines, ridged.
   *
   * One minus the absolute sum peaks where the three sines cancel, which is a
   * set of curved filaments rather than a grid — and raising that to a power is
   * what thins them until they read as focused light instead of as a plaid.
   */
  float causticSheet (vec2 q, float phase) {
    float ridge = sin(q.x + phase) +
      sin(q.y * 1.17 - phase * 0.83) +
      sin((q.x + q.y) * 0.71 + phase * 0.57);

    return pow(1.0 - clamp(abs(ridge) * 0.62, 0.0, 1.0), 5.0);
  }

  float scapeCaustics (vec2 ground, float depth) {
    if (uCaustics <= 0.001)
      return 0.0;

    vec2 q = ground * uCausticCells;

    // Radians of the net per pixel. Two sheets at incommensurate scales, so the
    // net never resolves into the one repeating cell a single sheet would.
    float footprint = 0.5 * (fwidth(q.x) + fwidth(q.y));
    float legible   = 1.0 - smoothstep(0.8, 2.0, footprint);

    if (legible <= 0.001)
      return 0.0;

    float net = causticSheet(q, uCausticPhase) +
      0.8 * causticSheet(q * 1.63 + 7.3, -uCausticPhase * 1.21);

    // The lip, for the reason the surf has one: nothing is drawn on the last
    // few centimetres of water, where the plane is already fading out against
    // the sand and a bright filament would read as light on dry ground.
    return smoothstep(0.0, 0.02, depth) *
      smoothstep(uCausticDepth, 0.0, depth) *
      min(net, 1.35) * legible * uCaustics;
  }
`

/**
 * The net, added to the body of the water and then covered by everything that
 * would hide it.
 *
 * It goes in *before* the foam, the breakers and the ice rather than after,
 * which is the whole of where it belongs in the stack: broken water is air in
 * water and you cannot see the bottom through it, and a frozen bay is the sea
 * under a lid. Mixing the white over the top afterwards takes the net away
 * exactly where those two are, for no arithmetic of its own — the ice is the one
 * that needs saying, because it is applied later still.
 *
 * Added rather than mixed, and in the sun's own colour, because this is light
 * arriving rather than a property of the surface: it warms with the low sun the
 * same way everything else the sun touches does. `diffuseColor` is still shaded
 * afterwards, so a cloud shadow or the terrain's own shadow puts the net out,
 * which is what a shadow on water actually does.
 */
export const WATER_CAUSTIC_FRAGMENT = /* glsl */`
  diffuseColor.rgb += uSunColor * scapeCaustics(vWaterGround, waterDepth) * (1.0 - iceCover);
`

/**
 * Radians the caustic net advances per metre of wind travel.
 *
 * A rate, and therefore one that has to be able to stop — the same argument
 * `SURGE_RATE` is written down for, and it is carried by the same integrated
 * distance. Faster than the surge because the net is driven by the small ripple
 * riding on the swell rather than by the swell itself, and slower than the
 * ripple map's scroll because a lens moves with the water and a texture is only
 * being dragged across it.
 */
export const CAUSTIC_RATE = 0.61

/**
 * Sine of the sun's elevation at which the net is fully drawn.
 *
 * About twenty degrees. Below that the light enters the water at a slant long
 * enough that a crest no longer focuses it onto the ground under itself, and the
 * net smears out into an even brightening — which is why this is a ramp rather
 * than a step at the horizon.
 */
const CAUSTIC_NOON = 0.34

/**
 * How much of the net a downpour takes away.
 *
 * Not all of it. Rain lands on the surface as a field of small craters, which is
 * a chop with no coherent lens in it — but the swell underneath is still there,
 * so a shower dims the net rather than switching it off. The same fall already
 * kills the glitter almost outright; a rain-struck surface stops reflecting a
 * sun lobe long before it stops transmitting one.
 */
const CAUSTIC_RAIN = 0.72

/**
 * How brightly the net is drawn, for a sun and a rainfall.
 *
 * Pure, and separated out from `update` for that reason: this is the whole of
 * what makes the caustics a *daylight* effect rather than a texture that is
 * always on, and it is the one part of them a headless test can state as a fact.
 * Everything else about the net lives in the fragment shader.
 *
 * @param caustics `water.caustics` — the authored strength, and the switch.
 * @param height Sine of the sun's elevation, as `sunHeight` returns it.
 * @param fall How hard it is coming down, 0..1.
 */
export function causticStrength (caustics: number, height: number, fall: number): number {
  if (caustics <= 0)
    return 0

  return caustics *
    smoothstep(0, CAUSTIC_NOON, height) *
    (1 - CAUSTIC_RAIN * Math.min(1, Math.max(0, fall)))
}
