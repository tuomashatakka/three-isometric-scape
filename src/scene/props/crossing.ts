import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, createRockGeometry, mergeParts, part, spread } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * The plank bridge over the beck, built in world space across the gap the
 * survey measured.
 *
 * Not a roster prop, and for the pier's and the lade's reason: every builder in
 * `props/index.ts` is a pure `(rng, palette)` factory whose result is a fixed
 * shape standing on `y = 0`, and the one thing nobody gets to choose about a
 * bridge is how long it is. The home island's beck is two metres across where
 * the paths meet it and the sound's is five, so a baked deck would either hang
 * over the water at one end or stop short of the bank at the other.
 *
 * It is the smallest structure in the scape and it is built in the plainest
 * way: a level deck, because a beck two metres wide does not get an arch, and
 * because a level deck is the one shape whose underside can be proved clear of
 * the water in a test.
 *
 * @returns One merged, world-space, vertex-coloured geometry. The caller owns it.
 */
export interface FootbridgeOptions {

  /** The abutment on the near bank, in world space. */
  near: { x: number, z: number }

  /** The abutment on the far bank. */
  far: { x: number, z: number }

  /** World height of the top of the deck — level, end to end. */
  deck: number

  /** Width of the deck, in metres. */
  width: number

  /** How high the handrail stands over the deck. 0 builds a bare plank crossing. */
  rail: number

  /**
   * The longest stretch of deck that stands on nothing, in metres.
   *
   * Past this the run is divided into a whole number of bays and a trestle is
   * driven at each joint. It is what lets a bridge be nine or twelve metres
   * long without the beams under it being a lie: a sawn stringer carries about
   * four metres and then it carries a pier.
   */
  bay: number

  /** Deck boards per metre of span — the tier's handle. See `quality.pierBoards`. */
  boards: number

  /** The ground as drawn, sampled under each abutment. */
  heightAt(x: number, z: number): number

  rng:     SeededRng
  palette: NordicPalette
}

/** Depth of a stringer, in metres. What the deck's freeboard is measured from. */
const STRINGER = 0.16

/** Thickness of a deck board. */
const BOARD = 0.07

/** Metres between handrail posts. A rail is a thing you grab, not a fence. */
const POST_EVERY = 1.4

/** How far below its own abutment a stone pile reaches when the bank falls away. */
const ABUTMENT_FLOOR = 1.6

/** The same quarter turn the pier's `yawAlong` is, and it is here for its reason. */
const yawAlong = (bearing: number): number => Math.PI / 2 - bearing

export function buildFootbridge (options: FootbridgeOptions): BufferGeometry | null {
  const { near, far, deck, width, rng, palette } = options

  const span = Math.hypot(far.x - near.x, far.z - near.z)

  if (span < 0.6 || width <= 0)
    return null

  const along = Math.atan2(far.z - near.z, far.x - near.x)
  const yaw   = yawAlong(along)
  const cos   = Math.cos(along)
  const sin   = Math.sin(along)
  const midX  = (near.x + far.x) / 2
  const midZ  = (near.z + far.z) / 2

  const parts: BufferGeometry[] = []

  // Three stringers rather than two. A footbridge is read from above in this
  // camera and almost never from the side, so what carries the shape is the
  // line of the beams seen through the gaps between the boards — and two of
  // them under a 1.1 m deck leaves a hole down the middle the eye lands in.
  for (const hand of [ -1, 0, 1 ])
    parts.push(part(box(span + 0.1, STRINGER, 0.12), {
      at: [
        midX - sin * hand * (width / 2 - 0.1),
        deck - BOARD - STRINGER / 2,
        midZ + cos * hand * (width / 2 - 0.1),
      ],
      rotate: [ 0, yaw, 0 ],
      color:  palette.tarWood,
      jitter: 0.08,
      rng,
    }))

  layBoards(parts, options, { span, along, yaw, midX, midZ })
  standAbutments(parts, options, along)
  driveBents(parts, options, { span, along, yaw, midX, midZ })

  if (options.rail > 0)
    standRail(parts, options, { span, along, yaw, midX, midZ })

  // The same grime the pier's deck takes, a shade lighter: a bridge over fresh
  // water is wet rather than salted, and the boards keep more of their colour.
  return mergeParts(parts, { grime: 1.8, grimeFloor: 0.5 })
}

interface Run {
  span:  number
  along: number
  yaw:   number
  midX:  number
  midZ:  number
}

/** The deck, board by board across the run. */
function layBoards (parts: BufferGeometry[], options: FootbridgeOptions, run: Run): void {
  const { width, boards, rng, palette } = options
  const count                           = Math.max(3, Math.round(run.span * boards))
  const pitch                           = run.span / count

  for (const along of spread(count, run.span - pitch))
    parts.push(part(box(width, BOARD, pitch * 0.86), {
      at: [
        run.midX + Math.cos(run.along) * along,
        options.deck - BOARD / 2,
        run.midZ + Math.sin(run.along) * along,
      ],
      rotate: [ 0, run.yaw, 0 ],
      color:  rng.next() < 0.3 ? palette.wood : palette.plank,
      jitter: 0.16,
      rng,
    }))
}

/**
 * The trestles in the water, where the run is longer than a beam.
 *
 * The one part of this structure that is not on the bank, and the one that
 * decides whether a nine-metre crossing reads as a bridge or as a plank
 * levitating over an estuary. Each bent is a pair of piles driven to the bed
 * under it and a cap laid across them, which is exactly what the pier's bents
 * are — the difference being that a pier's march out to sea and a bridge's
 * stand in a stream that has two banks.
 *
 * Plumb rather than raked, like the lade's and the fence's, and for their
 * reason: a bent tilted to match its own patch of bed zig-zags against its
 * neighbours down a line the eye follows end to end.
 */
function driveBents (parts: BufferGeometry[], options: FootbridgeOptions, run: Run): void {
  const { deck, width, bay, heightAt, rng, palette } = options
  const bays                                         = Math.max(1, Math.ceil(run.span / bay))

  if (bays < 2)
    return

  const pitch  = run.span / bays
  const cos    = Math.cos(run.along)
  const sin    = Math.sin(run.along)
  const soffit = deck - BOARD - STRINGER

  for (let joint = 1; joint < bays; joint += 1) {
    const at = -run.span / 2 + joint * pitch
    const x  = run.midX + cos * at
    const z  = run.midZ + sin * at

    for (const hand of [ -1, 1 ]) {
      const lean = hand * (width / 2 - 0.12)
      const px   = x - sin * lean
      const pz   = z + cos * lean
      // The bed under this pile, and never above the soffit: a bent whose
      // ground has come back up through the deck is the one failure a trestle
      // in a stream can produce that a reader sees instantly.
      const foot = Math.min(heightAt(px, pz) - 0.25, soffit - 0.3)

      parts.push(part(box(0.14, soffit - foot, 0.14), {
        at:     [ px, (soffit + foot) / 2, pz ],
        color:  palette.tarWood,
        jitter: 0.09,
        rng,
      }))
    }

    parts.push(part(box(0.15, 0.13, width + 0.22), {
      at:     [ x, soffit - 0.06, z ],
      rotate: [ 0, run.yaw, 0 ],
      color:  palette.woodDark,
      jitter: 0.08,
      rng,
    }))
  }
}

/**
 * The stone at each end.
 *
 * What makes the thing read as built rather than laid down: a plank resting on
 * turf is a plank somebody dropped, and a plank resting on a course of set
 * stone is a bridge. Each pile is cut to the ground it finds, so the bank that
 * falls away under one end gets a taller abutment rather than a floating one —
 * the lade's bents make the same argument about the same kind of ground.
 */
function standAbutments (parts: BufferGeometry[], options: FootbridgeOptions, along: number): void {
  const { near, far, deck, width, heightAt, rng, palette } = options
  const cos                                                = Math.cos(along)
  const sin                                                = Math.sin(along)

  for (const [ end, into ] of [[ near, 1 ], [ far, -1 ]] as const) {
    const ground  = Math.min(heightAt(end.x, end.z), deck - 0.2)
    const courses = Math.max(1, Math.min(4, Math.round((deck - Math.max(ground, deck - ABUTMENT_FLOOR)) / 0.28)))
    const foot    = deck - BOARD - STRINGER - courses * 0.26

    for (let course = 0; course < courses; course += 1)
      for (const hand of [ -1, 1 ]) {
        const lean = hand * (width / 2 - 0.16)
        const back = into * (0.12 + course * 0.05)

        parts.push(part(
          createRockGeometry({ radius: 0.3, detail: 0, rng, roughness: 0.45, scale: [ 1.2, 0.7, 1.1 ]}),
          {
            at: [
              end.x - sin * lean + cos * back,
              foot + course * 0.26,
              end.z + cos * lean + sin * back,
            ],
            rotate: [ 0, -along + rng.range(-0.25, 0.25), 0 ],
            color:  rng.pick([ palette.granite, palette.graniteDark, palette.lichen ]),
            jitter: 0.18,
            rng,
          },
        ))
      }
  }
}

/**
 * The handrail, on one hand only.
 *
 * The downstream hand, and that is not a flourish: a person who goes off a
 * plank goes off the side the water is pushing them toward, so the rail that
 * does anything is the one below the crossing. Which hand that is comes out of
 * the survey's own bearing — the deck is squared across the channel and laid
 * from the near bank to the far one, so the stream runs over local `+z`.
 */
function standRail (parts: BufferGeometry[], options: FootbridgeOptions, run: Run): void {
  const { deck, width, rail, rng, palette } = options
  const posts                               = Math.max(2, Math.round(run.span / POST_EVERY) + 1)
  const lean                                = width / 2 - 0.08
  const sin                                 = Math.sin(run.along)
  const cos                                 = Math.cos(run.along)

  for (const along of spread(posts, run.span - 0.24)) {
    const x = run.midX + cos * along - sin * lean
    const z = run.midZ + sin * along + cos * lean

    parts.push(part(box(0.09, rail, 0.09), {
      at:     [ x, deck + rail / 2, z ],
      color:  palette.tarWood,
      jitter: 0.1,
      rng,
    }))
  }

  parts.push(part(box(run.span - 0.1, 0.08, 0.08), {
    at:     [ run.midX - sin * lean, deck + rail, run.midZ + cos * lean ],
    rotate: [ 0, run.yaw, 0 ],
    color:  palette.woodDark,
    jitter: 0.09,
    rng,
  }))
}

// perf: one merged geometry per bridge, folded into the steading's single hero
// draw. No draw call of its own and nothing per frame.
