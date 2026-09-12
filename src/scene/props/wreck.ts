import type { BufferGeometry } from 'three'
import type { SeededRng } from 'threejs-scene'
import { box, deg, mergeParts, part } from 'threejs-scene/modules/assets'
import type { NordicPalette } from './palette.ts'


/**
 * The wreck — what is left of a hull that went onto a rock, lying where it
 * stopped.
 *
 * Every other built thing in this kit is a thing somebody put where they wanted
 * it. This one is the opposite, and that is the whole of its character: it is at
 * the one place on this coast nobody chose, lying at the angle the sea left it
 * at rather than at the angle it was built to float at. The lighthouse out on
 * the next rock exists because of this.
 *
 * So it is modelled *heeled*. A hull aground does not stand up — she falls over
 * onto the bilge the moment the water goes out from under her, and a wreck built
 * upright reads as a boat somebody parked. {@link HEEL} is baked into the
 * geometry rather than left to the placement for the reason the roof pitch of
 * every building here is: how far she lies over is a fact about her, and the
 * dressing has one yaw to give and no roll.
 *
 * What survives is the middle. She broke her back on the rock and the sea took
 * both ends, so this is seven metres of hull between two broken posts — which is
 * also what lets a boat that would be eleven metres afloat sit on a rock five
 * metres across.
 *
 * The two sides of her are two different things, and which is which follows from
 * the heel rather than from taste. The side that went *down* is in the water and
 * under the weed: its frames are stubs and what is left of them is holding the
 * last strakes on. The side that is *up* is the one standing in the air, and
 * those frames are the whole silhouette — a row of ribs with broken, uneven
 * tops, which is what says hull rather than jetty at forty metres. The first cut
 * of this had it the other way round, on the reasoning that the exposed side is
 * the side the sea works on; it is, and the result photographed as a pontoon
 * with sticks on it, because everything that stood up had been broken off.
 *
 * Pure like every other builder — base at `y = 0`, long axis on `x`, bow at
 * `+x`, no scene and no ground. See `landscape/wreck.ts` for the rock and
 * `props/wreck.test.ts` for the claims.
 */

/**
 * Half the surviving hull, in metres, and the frames standing in it.
 *
 * Exported because the test beside this file measures *amidships* — the two
 * broken posts at the ends are the only parts of her that rake, so a claim about
 * which side the ribs are on has to be made away from them.
 */
export const HALF_LENGTH = 3.5

const STATIONS    = 9

/**
 * How far she lies over, in radians, and which way.
 *
 * Positive rolls local `+z` *down* — see {@link heel} — so `+z` is the bedded
 * side, down in the water with the last of her planking on it, and `-z` is the
 * side standing in the air.
 *
 * Seventeen degrees, which is less than a first guess wants and the picture
 * insisted on. What reads as *fallen* is the asymmetry — one gunwale in the
 * water, the other standing — and that is there from about twelve. What a bigger
 * angle buys is not a more obviously heeled hull but a narrower one: the scape's
 * camera nearly always has her broadside, so a roll across the beam foreshortens
 * to almost nothing while the loss of apparent beam does not. At twenty-six she
 * photographed as a flat slab with a row of timbers along one edge.
 */
const HEEL = deg(17)

/**
 * The midship section, in two pieces: a quarter of an ellipse from the keel
 * round the turn of the bilge, and a straight flared topside above it.
 *
 * The first cut of this was one arc swept past the quarter turn, which is the
 * obvious way to draw a hull and the wrong one *for this camera*. An arc that
 * stops near the top of its own circle has a topside that is vertical to within
 * a couple of centimetres, and a vertical topside forty metres away under an
 * isometric tilt is a post. A row of them is a fence, and the picture that came
 * back was a jetty with a boat's outline under it.
 *
 * The flare is what fixes it, and it is also what a working boat has: the
 * topside leans outward about twenty-six degrees off vertical over the last
 * three quarters of a metre, so the standing frames *lean*, and the eye reads a
 * leaning row of timbers as a hull opening upward rather than as piles driven
 * into a bed.
 *
 * {@link BILGE} is where the arc hands over to the flare, as a share of the
 * section. Three chords is where the silhouette stops improving: the frames are
 * 13 cm timbers, and a fourth chord is 18 triangles nobody can resolve.
 */
const SECTION_RADIUS = 1.05
const SECTION_RISE   = 0.85
const SECTION_FLARE  = 0.42
const BILGE          = 0.72
const CHORDS         = 3

/** The moulded timber: a frame's siding and its thickness, in metres. */
const FRAME_SIDING = 0.13
const FRAME_THICK  = 0.11

/**
 * Heights up the section the surviving strakes are fastened at, 0..1.
 *
 * All three under {@link BEDDED_SIDE}, because a strake is fastened *to* a frame
 * and the frames on that side are stubs. A course above them is a plank floating
 * over the hull it came off.
 */
const STRAKES = [ 0.16, 0.38, 0.6 ] as const

/**
 * How much of her frames the sea has left on the standing side, as a share of
 * the full section.
 *
 * The low end is what makes the row read as broken rather than as sawn: a rib
 * that stands at half height beside one that stands at full is the difference
 * between a ribcage and a fence. The high end goes to 1 rather than to something
 * under it, because at least a few of them have to reach the sheer or there is
 * no sheer to read.
 */
const STANDING = [ 0.78, 1 ] as const

/**
 * How much of the section the bedded side still has, as a share of the standing
 * side's.
 *
 * The side in the water is the side that has been worked on for sixty winters
 * and ground into the ledge besides, so it is stubs — enough to hold the strakes
 * and not enough to close the section over her. A hull with both sides standing
 * is a boat, whatever angle it is drawn at.
 */
const BEDDED_SIDE = 0.78

/**
 * How far the geometry is bedded into the rock, in metres.
 *
 * Read by `dressing.ts` when she is raised, the same way `BEACON_SINK` and
 * `CROFT_SINK` are. Deeper than either, and for a reason neither has: those two
 * are buildings set on rock, and this is a hull that drove onto one. A third of
 * a metre is enough that the garboard disappears into the ledge rather than
 * resting on it, and — because the rock she is sited on is barely out of the
 * water — it is also what puts her keel inside the tide's own swing, so the sea
 * comes up her planking twice a cycle instead of running past underneath.
 */
export const WRECK_SINK = 0.34

/**
 * Roll one point of the upright section into the heeled frame.
 *
 * A rotation about `x`, which is the only axis anything in here turns on: the
 * frames arc in the `y`–`z` plane and the strakes lie along the arc, so every
 * part's own rotation and the heel are the same kind of angle and simply add.
 * That is why the heel is a helper of four lines rather than a matrix — the two
 * posts at the ends are the only parts that also rake, and a rake is about `z`.
 */
function heel (y: number, z: number): [ number, number ] {
  const cos = Math.cos(HEEL)
  const sin = Math.sin(HEEL)

  return [ y * cos - z * sin, y * sin + z * cos ]
}

/**
 * How much higher the section stands at the ends than amidships.
 *
 * The sheer, and the one thing in this geometry that reads from *broadside* —
 * which is the view the scape's camera almost always has of her. The flare in
 * the section leans the frames across the hull, and across the hull is toward
 * and away from an isometric camera looking at her side: it foreshortens to
 * nothing, and the row photographs as vertical posts however far it leans. What
 * does not foreshorten is height along her length. A hull is deeper at the ends
 * than amidships, so the line joining the tops of her frames is a curve that
 * rises at both ends — and a curve rising at both ends is the single shape that
 * says boat from a quarter of a mile away.
 */
const SHEER = 0.8

/** How much higher the section stands at a station, as a multiplier. */
function sheerAt (u: number): number {
  return 1 + SHEER * u * u
}

/**
 * How full the hull is at a station, 0..1.
 *
 * 1 amidships and fining toward both ends, which is the one thing that stops a
 * row of identical frames reading as a barrel cut in half. Floored rather than
 * run to zero: the end frames are the ones the posts fasten to, and a frame of
 * no width is a post standing on nothing.
 */
function fullness (u: number): number {
  return Math.max(0.18, (1 - Math.abs(u) ** 3.4) ** 0.62)
}

/** One point on a station's section, in the upright frame. */
interface Moulded { y: number, z: number }

/** A point on one half of a station's section, at `t` up from the keel. */
function sectionPoint (t: number, full: number, sheer = 1): Moulded {
  const radius = SECTION_RADIUS * (0.74 + 0.26 * full)

  if (t <= BILGE) {
    const theta = t / BILGE * Math.PI / 2

    return { y: radius * (1 - Math.cos(theta)) * sheer, z: radius * Math.sin(theta) * full }
  }

  const up = (t - BILGE) / (1 - BILGE)

  return {
    y: (radius + SECTION_RISE * up) * sheer,
    z: (radius + SECTION_FLARE * up) * full,
  }
}

/** One frame, from the keel out to wherever the sea stopped it. */
function frame (
  parts:   BufferGeometry[],
  rng:     SeededRng,
  palette: NordicPalette,
  x:       number,
  full:    number,
  sheer:   number,
  side:    number,
  top:     number,
): void {
  for (let chord = 0; chord < CHORDS; chord += 1) {
    const from     = sectionPoint(top * chord / CHORDS, full, sheer)
    const to       = sectionPoint(top * (chord + 1) / CHORDS, full, sheer)
    const dy       = to.y - from.y
    const dz       = (to.z - from.z) * side
    const span     = Math.hypot(dy, dz)
    const [ y, z ] = heel((from.y + to.y) / 2, (from.z + to.z) / 2 * side)

    parts.push(part(box(FRAME_SIDING, span * 1.12, FRAME_THICK), {
      at:     [ x, y, z ],
      rotate: [ Math.atan2(dz, dy) + HEEL, 0, 0 ],
      // The heads of the standing frames are bleached and the wood down in the
      // bilge is not, so the chord nearest the keel is the dark one.
      color:  chord === 0 ? palette.driftwoodDark : rng.pick([ palette.driftwood, palette.deadWood ]),
      jitter: 0.16,
      rng,
    }))
  }
}

/** One bay of the hull: where it is along her, how long it is, and how full. */
interface Bay { x: number, span: number, full: number, sheer: number }

/** The strakes still fastened to the bedded side, one bay of planking at a time. */
function planking (
  parts:   BufferGeometry[],
  rng:     SeededRng,
  palette: NordicPalette,
  bay:     Bay,
): void {
  for (const [ course, t ] of STRAKES.entries()) {
    // The sea works from the top down. A plank this high is there about half the
    // time, and the garboard below it is always there.
    if (course > 0 && rng.range(0, 1) > 0.82 - course * 0.22)
      continue

    const here     = sectionPoint(t, bay.full, bay.sheer)
    const next     = sectionPoint(t + 0.04, bay.full, bay.sheer)
    const tangent  = Math.hypot(next.y - here.y, next.z - here.z)
    const [ y, z ] = heel(here.y, here.z)

    parts.push(part(box(bay.span * 1.06, 0.06, 0.24), {
      at:     [ bay.x, y, z ],
      rotate: [ Math.atan2(-(next.y - here.y) / tangent, (next.z - here.z) / tangent) + HEEL, 0, 0 ],
      // The tide line is a fact about where she lies, not about her: the two
      // lower courses are inside the swing and carry weed, the top one is not.
      color:  course === 0
        ? rng.pick([ palette.wrackDeep, palette.wrack ])
        : course === 1 ? rng.pick([ palette.wrack, palette.driftwoodDark ]) : palette.driftwoodDark,
      jitter: 0.18,
      rng,
    }))
  }
}

/**
 * How much of a frame has to be left for the rail over it to still be there, and
 * how far up the section that rail runs.
 *
 * The gunwale, in the pieces the sea has left of it. A rail is fastened to the
 * heads of the frames, so wherever two neighbours both still reach the sheer the
 * length between them is still on, and where one of them has gone the rail went
 * with it — which is why the line is broken rather than continuous, and why it
 * is not a constant.
 *
 * It is a detail rather than the thing that carries the read: what makes her a
 * hull at forty metres is {@link SHEER}, and the rail is what makes the rise in
 * it a *line* for the bay or two where it survives. At 0.9 against a break of
 * 0.78 that is one or two bays out of eight, which is about right — a wreck with
 * her whole gunwale still on is a boat somebody left out.
 */
const RAIL_HOLDS = 0.9
const RAIL_AT    = 0.97

export function buildWreck (rng: SeededRng, palette: NordicPalette): BufferGeometry {
  const parts: BufferGeometry[] = []
  const station                 = (index: number): number =>
    -HALF_LENGTH + index * (HALF_LENGTH * 2) / (STATIONS - 1)

  // The backbone, and the one part of her the sea has not got into. Bedded in
  // the rock by `WRECK_SINK`, so what shows of it is the top two thirds.
  const [ keelY, keelZ ] = heel(0.18, 0)

  parts.push(part(box(HALF_LENGTH * 2 + 0.4, 0.3, 0.34), {
    at: [ 0, keelY, keelZ ], rotate: [ HEEL, 0, 0 ], color: palette.tarWood, jitter: 0.1, rng,
  }))

  // Rolled once and kept, because the rail above has to know which frames are
  // still holding it up — a second roll would be a second wreck.
  const left = Array.from({ length: STATIONS }, () => rng.range(STANDING[0], STANDING[1]))

  for (let index = 0; index < STATIONS; index += 1) {
    const x    = station(index)
    const full = fullness(x / HALF_LENGTH)

    for (const side of [ -1, 1 ])
      frame(
        parts, rng, palette, x, full, sheerAt(x / HALF_LENGTH),
        side, side > 0 ? left[index] * BEDDED_SIDE : left[index],
      )
  }

  // The sheer rail, on whichever bays still have two frames under it.
  for (let index = 0; index < STATIONS - 1; index += 1) {
    if (Math.min(left[index], left[index + 1]) < RAIL_HOLDS)
      continue

    const from     = station(index)
    const to       = station(index + 1)
    const at       = sectionPoint(RAIL_AT, fullness((from + to) / 2 / HALF_LENGTH))
    const [ y, z ] = heel(at.y, -at.z)

    parts.push(part(box(to - from, 0.12, 0.16), {
      at:     [ (from + to) / 2, y, z ],
      rotate: [ HEEL, 0, 0 ],
      color:  palette.driftwood,
      jitter: 0.14,
      rng,
    }))
  }

  for (let index = 0; index < STATIONS - 1; index += 1) {
    const from = station(index)
    const to   = station(index + 1)

    planking(parts, rng, palette, {
      x:     (from + to) / 2,
      span:  to - from,
      full:  fullness((from + to) / 2 / HALF_LENGTH),
      sheer: sheerAt((from + to) / 2 / HALF_LENGTH),
    })
  }

  // The stem, raked forward, and the stern post behind it. Both broken off — the
  // ends of her are somewhere else — but the stem is left the taller of the two,
  // because a bow is the one part of a hull that still reads as a bow when there
  // is nothing else left of her.
  const [ stemY, stemZ ] = heel(1.55, 0)

  parts.push(part(box(0.26, 2.5, 0.28), {
    at:     [ HALF_LENGTH - 0.02, stemY, stemZ ],
    rotate: [ HEEL, 0, deg(-19) ],
    color:  palette.tarWood,
    jitter: 0.12,
    rng,
  }))

  const [ sternY, sternZ ] = heel(1.05, 0)

  parts.push(part(box(0.3, 1.7, 0.32), {
    at:     [ -HALF_LENGTH + 0.04, sternY, sternZ ],
    rotate: [ HEEL, 0, deg(13) ],
    color:  palette.tarWood,
    jitter: 0.12,
    rng,
  }))

  // A couple of her own timbers, down across the frames where they fell. On the
  // bedded side, because that is where a thing that came off her would have
  // slid to.
  for (let piece = 0; piece < 3; piece += 1) {
    const along    = rng.range(-HALF_LENGTH * 0.7, HALF_LENGTH * 0.7)
    const at       = sectionPoint(rng.range(0.25, 0.5), fullness(along / HALF_LENGTH))
    const [ y, z ] = heel(at.y, at.z)

    parts.push(part(box(rng.range(1.1, 2.2), 0.12, 0.18), {
      at:     [ along, y + 0.08, z ],
      rotate: [ HEEL + deg(rng.range(-25, 25)), deg(rng.range(-20, 20)), 0 ],
      color:  rng.pick([ palette.driftwood, palette.driftwoodDark, palette.deadWood ]),
      jitter: 0.2,
      rng,
    }))
  }

  const geometry = mergeParts(parts, { grime: 1.3, grimeFloor: 0.46 })

  // Heeling rotates about the keel, which puts the bedded bilge under `y = 0`.
  // Every other builder here reaches its base by construction; this one is the
  // one shape whose base is not known until the roll is applied, so it is
  // measured and dropped onto the ground rather than guessed at. Grime is
  // unaffected — it is resolved off the merged bounds either way.
  geometry.computeBoundingBox()
  geometry.translate(0, -(geometry.boundingBox?.min.y ?? 0), 0)

  return geometry
}
