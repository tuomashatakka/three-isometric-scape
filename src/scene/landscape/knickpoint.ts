/**
 * The step in the beck's long profile.
 *
 * A knickpoint is the geologist's word for it: the break in a river's profile
 * where the bed stops falling at the rate the reaches either side of it do and
 * drops instead. Its own module, and pure — no `three`, no config, no
 * neighbours — because `height.ts` folds it into the ground and
 * `landscape/force.ts` hangs water off what it made, and a shared piece of
 * arithmetic that both of those imported from each other would be a cycle.
 *
 * What it does is *rearrange* rather than add. `height.ts` smooths the beck's
 * long profile four times and then clamps it to fall the whole way, which is
 * exactly right for a channel that has to cut through a bar — and it is also
 * what guarantees the fall is spread evenly over every metre of the course. A
 * hill beck on this coast does not do that. It runs slack over the peat, meets a
 * band of rock that will not cut, and goes over it in one drop.
 *
 * So the total fall between the spring and the tideline is the same number
 * afterwards, and both ends of the profile come out exactly as they went in.
 * That is not politeness: the mouth's height is what the tidal dredge, the
 * bathymetry mask and every search that keeps its distance from the estuary are
 * written against, and a step that moved it would move all of them.
 */

/**
 * The most of a reach's fall one step may take.
 *
 * Never all of it. The reach above the lip has to keep enough grade to look like
 * a beck arriving rather than a canal ending, and the tail below it has to keep
 * enough to carry the water out of the plunge — a step that took the whole of a
 * window's fall would leave dead level channel on both sides of it, which the
 * running minimum downstream would be perfectly happy with and no one would
 * believe.
 */
const MAX_SHARE = 0.8

/** How tight the face may be squeezed inside its own interval. */
const MAX_TIGHTEN = 0.8

/**
 * How much of the channel's own incision the step may spend lifting its bed.
 *
 * Gathering a window's fall into one face necessarily *raises* the reach above
 * the face — that reach is now falling at the slack rate instead of at the
 * hill's — and the bed can only be raised as far as the ground it was cut into.
 * Past that, `height.ts` clamps the channel to the hillside, the lip quietly
 * stops being a lip, and the fall arrives at a third of the depth it was asked
 * for while every number here still says otherwise. It was 0.83 m of drop out of
 * a requested 1.9 on the sound before this was written down.
 *
 * Under one, because a channel raised to exactly the surrounding ground is a
 * beck with no banks left.
 */
const HEADROOM = 0.7

/** One step, as the long profile carries it. */
export interface Knickpoint {

  /** First index of the interval the face stands in. */
  index: number

  /** How many of the profile's intervals the step spans. */
  span: number

  /** Metres the profile drops across them. */
  drop: number

  /**
   * How much of the step's own run the face is squeezed into, 0..1.
   *
   * The long profile carries one level per point of the traced course, and those
   * points stand a couple of metres apart — so a step cannot be made shorter by
   * moving them. What this does instead is bias the interpolation *inside* the
   * interval, which is the only place a shorter face can come from. 0 is a
   * straight ramp between the two levels; 0.8 puts the whole drop into the
   * middle fifth of it.
   */
  tighten: number
}

/** A long profile with a step in it, and where the step is. */
export interface SteppedProfile {
  profile: number[]
  step:    Knickpoint | null
}

export interface StepOptions {

  /** Metres of fall to gather. 0 leaves the profile alone. */
  drop: number

  /** Metres of channel the face occupies. */
  run: number

  /** Metres of channel the fall is gathered from. */
  gather: number

  /** Metres of drop below which there is no step. */
  least: number

  /**
   * The world height the whole step has to stand above.
   *
   * The tideline, plus the depth the channel is cut to. Without it the search
   * finds the estuary every time and does so honestly: the mouth is dredged
   * several metres below the sea for the boats, so the steepest window in any of
   * these long profiles is the last one, and the step gets cut into ground that
   * is under water. A fall is a thing on a hillside.
   */
  above: number

  /** Metres of channel between two points of the profile. */
  spacing: number

  /**
   * Metres the channel is cut into the ground it runs through.
   *
   * What limits the step, and not obviously: see {@link HEADROOM}. A deeper
   * channel can carry a deeper fall, because there is more room to lift the
   * reach above it.
   */
  cut: number
}

/**
 * The last interval of a profile whose far end still stands over the water.
 *
 * Everything downstream of it is the dredged estuary, whose plunge to the mouth
 * depth is the steepest thing in every one of these long profiles and is not a
 * hillside.
 */
function dryEnd (profile: readonly number[], above: number): number {
  let dry = profile.length - 2

  while (dry > 0 && profile[dry] <= above)
    dry -= 1

  return dry
}

/**
 * Where the ground already refuses to grade.
 *
 * Measured over the face's own run rather than one interval at a time, so a long
 * face is chosen on its whole steepness rather than on its first metre.
 *
 * `lead` and `trail` are the intervals the window needs above and below the face
 * to exist at all, and they are the search's bounds rather than a clamp applied
 * afterwards. Clamped afterwards, a course whose steepest interval is its first
 * one gets a step at the very top of its window with no slack above it — which
 * is a lip with nothing arriving at it, and the one thing a hanging reach is for.
 */
function steepestAt (
  pitch: readonly number[],
  span:  number,
  dry:   number,
  lead:  number,
  trail: number,
): number {
  let index = -1
  let steep = 0

  for (let at = 1 + lead; at + span + trail <= dry; at += 1) {
    const grade = (pitch[at] - pitch[at + span]) / span

    if (grade > steep) {
      steep = grade
      index = at
    }
  }

  return index
}

/**
 * The most a face may take without lifting the reach above it out of its channel.
 *
 * Solved rather than iterated: the bed at the k-th interval above the face is
 * raised by whatever the ground fell there minus what the slack rate gives back,
 * and every one of those has to stay inside the cut. See {@link HEADROOM}.
 *
 * It is the common case rather than the whole invariant. The reach *below* the
 * face is lifted too whenever the ground there fell harder than the face takes,
 * and that one has no closed form worth writing — {@link withinCut} is what
 * actually guarantees the rule, and this is what keeps the answer a good one
 * instead of merely a refusal.
 */
function liftCeiling (
  profile: readonly number[],
  start:   number,
  face:    number,
  slack:   number,
  fall:    number,
  cut:     number,
): number {
  let ceiling = Infinity

  for (let up = 1; up <= face - start; up += 1)
    ceiling = Math.min(
      ceiling,
      fall - (profile[start] - profile[start + up] - cut * HEADROOM) * slack / up)

  return ceiling
}

/**
 * Whether a rewritten window stayed inside the channel it is cut into.
 *
 * The invariant, checked rather than derived. A bed raised past the ground it
 * was cut into is not a bed: `height.ts` clamps the channel to the hillside
 * there, the lip quietly stops being a lip, and every number this module returns
 * goes on describing a step that is not in the ground.
 */
function withinCut (
  levels:  readonly number[],
  profile: readonly number[],
  start:   number,
  window:  number,
  cut:     number,
): boolean {
  for (let at = start; at <= start + window; at += 1)
    if (levels[at] - profile[at] > cut * HEADROOM + 1e-9)
      return false

  return true
}

/**
 * Gather the fall around a long profile's steepest interval into one step.
 *
 * Every interval still falls or stays level, so a profile that was monotone
 * before is monotone after — see the module note for why that matters as much as
 * the endpoints do.
 *
 * The face is put where the ground is *already* steepest rather than where the
 * most fall could be found, and that is the difference between steepening a
 * knickpoint and inventing one somewhere else. The first version chose the
 * window with the greatest total fall, which on a hillside course is wherever
 * the profile happens to be longest and steepest at once — so on one island it
 * moved the fall thirty metres downstream, and on another it took the drop out
 * from under a face the ground already had and left it flat. A step belongs
 * where a band of harder rock is, and the only evidence of one of those this
 * profile carries is a reach that refused to grade.
 *
 * The window is kept one interval clear of each end, and clear of the water
 * altogether, so the spring and the tidal reach are never inside the face. A
 * fall out of the ground on the first metre of the course is a spring in a
 * cliff, and one on the last is a beck that ends by dropping into the sea —
 * both are real landforms and neither is this one.
 *
 * @returns The rearranged profile and the step, or the profile untouched and a
 *   null step when there is no reach steep enough to pay for one. That absence
 *   is a normal answer: a short even course simply has no fall on it.
 */
export function stepProfile (
  profile: readonly number[],
  pitch:   readonly number[],
  options: StepOptions,
): SteppedProfile {
  const { drop, run, gather, least, spacing, above, cut } = options
  const levels                                            = profile.slice()

  if (drop <= 0 || spacing <= 0 || profile.length < 5)
    return { profile: levels, step: null }

  const window = Math.min(Math.max(1, Math.round(gather / spacing)), profile.length - 3)
  const span   = Math.max(1, Math.min(window - 2, Math.round(run / spacing)))
  const slack  = window - span
  const lead   = Math.floor(slack / 2)
  const face   = steepestAt(pitch, span, dryEnd(profile, above), lead, slack - lead)

  if (face < 0)
    return { profile: levels, step: null }

  // The window, hung around the face. The search's own bounds are what make this
  // arithmetic rather than a clamp — see {@link steepestAt}.
  const start = face - lead
  const fall  = profile[start] - profile[start + window]
  const take  = Math.min(drop, fall * MAX_SHARE, liftCeiling(profile, start, face, slack, fall, cut))

  if (take < least)
    return { profile: levels, step: null }

  // What is left of the window's fall, spread evenly over the intervals that are
  // not the face. With no slack there is nothing to spread and the step is the
  // whole window, which only happens on a course too short to have one anyway.
  const rest = slack > 0 ? (fall - take) / slack : 0

  let level = profile[start]

  for (let at = start; at < start + window; at += 1) {
    const onFace = at >= face && at < face + span

    level -= onFace ? take / span : rest
    levels[at + 1] = level
  }

  // The window's far end, restored rather than accumulated: the loop above walks
  // it in `window` subtractions, and a profile whose mouth had drifted by a float
  // epsilon is a profile the running minimum downstream would quietly clamp.
  levels[start + window] = profile[start + window]

  if (!withinCut(levels, profile, start, window, cut))
    return { profile: profile.slice(), step: null }

  return {
    profile: levels,
    step:    {
      index:   face,
      span,
      drop:    take,
      tighten: Math.min(MAX_TIGHTEN, Math.max(0, 1 - run / (span * spacing))),
    },
  }
}

/**
 * Where inside an interval of the long profile the ground actually is.
 *
 * The identity everywhere except inside the face, which is what lets `height.ts`
 * call it unconditionally. Inside the face it squeezes the interpolation toward
 * the middle of the interval, so the drop happens over the run the config asked
 * for and the ground either side of it stands level — a lip and a foot rather
 * than a ramp with a lip's name on it.
 */
export function stepEase (step: Knickpoint | null, index: number, local: number): number {
  if (!step || index < step.index || index >= step.index + step.span)
    return local

  const edge = step.tighten * 0.5
  const face = Math.max(1e-4, 1 - step.tighten)

  return Math.min(1, Math.max(0, (local - edge) / face))
}
