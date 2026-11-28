/**
 * Joints and crystal in every stone — the dyke courses, the field stones, the
 * erratics, the cairns, the crag and the outcrops in the turf.
 *
 * At the `near` frame a stone was a smooth, evenly lit blob with lichen on it:
 * no fracture, no grain, nothing at the scale between the lichen rosette and
 * the chisel's two joint planes. Real granite and gneiss on this coast are
 * broken by two or three *joint sets* — families of parallel fractures that
 * cross the whole outcrop — and every face between them is speckled with
 * crystal: dark mica, white quartz, pinkish feldspar a few centimetres across.
 *
 * Both are functions of the fragment's place in the world alone, so they live
 * in the stone block of `weatheringFragment` (the albedo already decides what
 * is stone, so there is no prop flag), on every tier, with no texture, uniform,
 * varying or program:
 *
 * - **joints**: two sets of world planes ({@link JOINTS}), each warped a hand's
 *   width so it is not ruled, each fracture broken into lengths by the *other*
 *   set's lattice so the cracks end in T-junctions rather than crossing as a
 *   grid. A fracture is a dark recess with a lip on each side that turns the
 *   normal toward it, so it is lit, not drawn;
 * - **crystal**: one hash per {@link CRYSTAL} metre cell of the world, dark or
 *   pale in its tails.
 *
 * Planes in three dimensions cut every face of every stone in lines, whichever
 * way it is turned, so nothing smears down a wall the way a projected texture
 * does. Each scale lets go by its own screen width (`fwidth`), standing in its
 * mean tone, so a wide frame keeps the stones' brightness and does not shimmer.
 */

/** One joint set: the plane's world normal (unit), its spacing in metres. */
export interface JointSet {
  normal:  readonly [ number, number, number ]
  spacing: number
}

const unit = (x: number, y: number, z: number): [ number, number, number ] => {
  const l = Math.sqrt(x * x + y * y + z * z)

  return [ x / l, y / l, z / l ]
}

/**
 * Two sets, steep and nearly at right angles, as granite sheets and jointing
 * break — a metre and more apart, so a boulder carries two or three fractures
 * and not a lattice. At half a metre with lit lips the sets drew a pale net
 * over every stone in the `near` frame.
 */
export const JOINTS: readonly JointSet[] = [
  { normal: unit(0.82, 0.24, 0.52), spacing: 1.15 },
  { normal: unit(-0.5, 0.35, 0.79), spacing: 1.7 },
]

/** The open width of a fracture, as a share of its set's spacing (each side of the plane). */
export const JOINT_WIDTH = 0.016

/** How far a fracture wanders off its plane, as a share of its spacing. */
export const JOINT_WANDER = 0.16

/** The share of a set's lengths that are open; the rest are tight and leave no line. */
export const JOINT_OPEN = 0.5

/** How dark the recess of an open fracture is. */
export const JOINT_DARK = 0.72

/** Metres a crystal spans, and how far its tails push the albedo. */
export const CRYSTAL      = 0.045
export const CRYSTAL_DARK = 0.5
export const CRYSTAL_PALE = 0.55

/** Cycles per pixel past which a scale has gone to its mean tone. */
export const FISSURE_FADE = [ 0.12, 0.35 ] as const
export const CRYSTAL_FADE = [ 0.35, 0.9 ] as const

const fract = (v: number): number => v - Math.floor(v)

/** The same sine-free hash the glsl inlines (Hoskins), on two lattice numbers. */
export function jointHash (x: number, y: number): number {
  let a = fract(x * 0.1031)
  let b = fract(y * 0.1031)
  let c = a
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33)
  a += d
  b += d
  c += d
  return fract((a + b) * c)
}

const dot = (n: readonly number[], x: number, y: number, z: number): number => n[0] * x + n[1] * y + n[2] * z

/** A set's coordinate at a world point, in spacings, wander included — the glsl's `c`. */
export function jointCoord (set: number, x: number, y: number, z: number): number {
  const { normal, spacing } = JOINTS[set]
  const along               = dot(normal, x, y, z) / spacing

  return along + JOINT_WANDER * Math.sin(x * 2.3 + z * 1.7 + set * 2.1) * Math.sin(y * 2.9 - x * 1.1)
}

/**
 * How open the fracture nearest a world point is, 0..1, unfaded: 1 inside an
 * open crack, 0 off it or on a tight length.
 */
export function fissureAt (x: number, y: number, z: number): number {
  let open = 0

  for (let set = 0; set < 2; set += 1) {
    const c      = jointCoord(set, x, y, z)
    const off    = Math.abs(c - Math.round(c))
    const length = Math.floor(jointCoord(1 - set, x, y, z) * 0.5)
    const live   = jointHash(Math.round(c) + set * 17, length) < JOINT_OPEN ? 1 : 0
    const line   = off < JOINT_WIDTH ? 1 : 0

    open = Math.max(open, line * live)
  }

  return open
}

const f   = (v: number): string => v.toFixed(4)
const v3  = (n: readonly number[]): string => `vec3(${n.map(f).join(', ')})`
const set = (index: number): string => {
  const { normal, spacing } = JOINTS[index]

  return `dot(jp, ${v3(normal)}) / ${f(spacing)} + ${f(JOINT_WANDER)} * sin(jp.x * 2.3 + jp.z * 1.7 + ${f(index * 2.1)}) * sin(jp.y * 2.9 - jp.x * 1.1)`
}

/**
 * The glsl, for the inside of the stone block of `weatheringFragment`, after
 * the strata and before the moss: reads `stone`, `alt`, `vScapeGround` and
 * `viewMatrix`. Writes `diffuseColor`, `normal` and `roughnessFactor`.
 */
export const FISSURE_GLSL = /* glsl */`
    {
      vec3 jp  = vec3(vScapeGround.x, alt, vScapeGround.y);
      vec2 jc  = vec2(${set(0)}, ${set(1)});
      vec2 jfw = max(fwidth(jc), vec2(1e-4));
      vec2 jk  = (1.0 - smoothstep(vec2(${f(FISSURE_FADE[0])}), vec2(${f(FISSURE_FADE[1])}), jfw)) * stone;

      if (jk.x + jk.y > 0.002) {
        vec2 jn   = floor(jc + 0.5);
        vec2 joff = jc - jn;
        vec2 jlen = floor(jc.yx * 0.5);
        vec3 ha = fract(vec3(jn.x, jlen.x, jn.x) * 0.1031);
        vec3 hb = fract(vec3(jn.y + 17.0, jlen.y, jn.y + 17.0) * 0.1031);
        ha += dot(ha, ha.yzx + 33.33);
        hb += dot(hb, hb.yzx + 33.33);
        vec2 jlive = step(vec2(fract((ha.x + ha.y) * ha.z), fract((hb.x + hb.y) * hb.z)), vec2(${f(JOINT_OPEN)}));

        // The recess, antialiased by its own width on screen; the lip, a band
        // twice as wide leaning toward the crack.
        vec2 jline = (1.0 - smoothstep(vec2(${f(JOINT_WIDTH)}), vec2(${f(JOINT_WIDTH)}) + jfw, abs(joff))) * jlive * jk;
        vec2 jlip  = (1.0 - smoothstep(vec2(${f(JOINT_WIDTH)}), vec2(${f(JOINT_WIDTH * 2.5)}) + jfw, abs(joff))) * jlive * jk;

        diffuseColor.rgb *= (1.0 - ${f(JOINT_DARK)} * jline.x) * (1.0 - ${f(JOINT_DARK)} * jline.y);
        roughnessFactor   = clamp(roughnessFactor + (jline.x + jline.y) * 0.15, 0.05, 1.0);
        vec3 jturn = ${v3(JOINTS[0].normal)} * sign(joff.x) * (jlip.x - jline.x) +
                     ${v3(JOINTS[1].normal)} * sign(joff.y) * (jlip.y - jline.y);
        normal = normalize(normal + mat3(viewMatrix) * jturn * 0.7);
      }

      // Crystal: a tone per world cell, in its tails only, faded by its width on screen.
      vec3 jcell = jp / ${f(CRYSTAL)};
      float jck  = (1.0 - smoothstep(${f(CRYSTAL_FADE[0])}, ${f(CRYSTAL_FADE[1])}, max(fwidth(jcell.x), fwidth(jcell.y)))) * stone;
      if (jck > 0.002) {
        vec3 hq = fract(floor(jcell) * 0.1031);
        hq += dot(hq, hq.yzx + 33.33);
        float grain = fract((hq.x + hq.y) * hq.z);
        float tone  = 1.0 - ${f(CRYSTAL_DARK)} * smoothstep(0.26, 0.06, grain) + ${f(CRYSTAL_PALE)} * smoothstep(0.76, 0.95, grain);
        diffuseColor.rgb *= mix(1.0, tone, jck);
        roughnessFactor   = clamp(roughnessFactor - jck * smoothstep(0.76, 0.95, grain) * 0.2, 0.05, 1.0);
      }
    }
`
