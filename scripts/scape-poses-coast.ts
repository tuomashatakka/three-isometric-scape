import type { Pose } from './scape-poses.ts'


/**
 * The pose sets for the hard shore, and the three ages of one headland.
 *
 * Split off `scape-poses.ts` when that file went past the 666-line ceiling, and
 * the seam is a real one rather than a line count. These three sets are one
 * subject photographed at three stages — the cliff the sea cut, the hole it cut
 * through the spur behind it, and the pillar left where an older hole already
 * fell — they share one headland, one weakness field and one set of arguments
 * about why the tour cannot see any of it, and two of the three are aimed at
 * the same two points in the world.
 *
 * They are folded back into `TOURS` at its definition, so `--poses crag` reads
 * exactly as it did before.
 */

/**
 * The home island's sea stack, in world metres.
 *
 * Named rather than repeated — two frames aim at it — and rounded off the
 * `stack` line `scape:map --stats` prints rather than typed from a screenshot.
 * It is the one pillar in the archipelago on the same island as the camera's
 * own home pose.
 */
const OVER_STACK = [ 'camera.focusX=58', 'camera.focusZ=-35' ]

/**
 * The home island's sea arch, in world metres.
 *
 * Named for the stack's reason, and taken off the `arch` line `scape:map`
 * prints rather than typed from a still: the block reports the middle of the
 * portal, which is the one point in the landform worth aiming a camera at.
 */
const OVER_ARCH = [ 'camera.focusX=35', 'camera.focusZ=-40' ]

/** The middle of the home island's bird ledges, which is the middle of its crag. */
const ON_LEDGES = [ 'camera.focusX=37', 'camera.focusZ=-28' ]

/** The quarter the 322.5° headland's face is turned toward: off the water. */
const SEAWARD = 315


export const COAST_TOURS: Record<string, Pose[]> = {

  /**
   * The crag, from the water it stands over.
   *
   * The belt's arrangement and for its reason: a headland is a *coast*-scaled
   * subject — 45 m of the home island's shore and fifteen metres deep — and
   * every pose in `tour` is aimed at the middle of the archipelago, where that
   * is a dark notch a few pixels across.
   *
   * The home island's crag stands on the 322° bearing, which is world
   * (39, −30) — the far side of the island from the yard, and the opposite
   * shore from the sand. `crag` is that headland at 110 m, which holds the
   * face, the platform at the bottom of it and the ordinary shelving coast
   * either side; the contrast between the three *is* the landform. `crag-near`
   * is 38 m, the only frame where a talus block is more than a pixel and the
   * one that shows the platform as a surface rather than as a line. `crag-sea`
   * looks along the cliff line rather than at it, at the rotation that puts the
   * face side-on, because a cliff seen square is a dark band and a cliff seen
   * along is a profile — which is the view that says whether the lip wanders or
   * runs like masonry. `crag-bare` is the control and the one that carries the
   * claim: the *same* frame with `terrain.crag.height` at zero, which is the
   * coast this island had before the run — so the pair is the landform, and a
   * pair that came out alike would mean there is no landform.
   *
   * Nothing here is in {@link STILL}: rock does not move, and the sea against
   * the foot of it is the water's own clock.
   */
  crag: [
    { name: 'crag', zoom: 110, set: [ 'camera.focusX=39', 'camera.focusZ=-30' ]},
    { name: 'crag-near', zoom: 38, set: [ 'camera.focusX=39', 'camera.focusZ=-30' ]},
    {
      name: 'crag-sea',
      zoom: 70,
      rot:  135,
      set:  [ 'camera.focusX=39', 'camera.focusZ=-30' ],
    },
    {
      name: 'crag-bare',
      zoom: 110,
      set:  [ 'camera.focusX=39', 'camera.focusZ=-30', 'terrain.crag.height=0' ],
    },
  ],

  /**
   * The bird cliff, in the two halves of the year it has.
   *
   * On the crag's own headland at world (37, -28), and **off the default
   * heading**, which is the one decision in the set worth reading. the home
   * island's crag stands on the 322.5° bearing: at the camera's authored
   * rotation of 45 the face is the *far* side of the island, so the terrain
   * occludes it and a hundred and forty of the hundred and forty-eight birds on
   * it are behind the hill. measured rather than assumed — at rot 45 the whole
   * colony is 0.03 % of the frame and eight birds along the skyline, and from
   * the seaward quarter it is 7.3 %. a cliff is a thing you see from the water.
   *
   * `ledge` is the face at 28 m at midsummer, which is the frame the run was
   * for: four rows of birds on the rock and the whitewash they have left under
   * them. `ledge-near` is 12 m, the only frame in which a single bird is a
   * shape rather than a white mark. `ledge-winter` is the same 28 m at
   * midwinter and carries half the claim: the birds are at sea, the stain is
   * still on the rock, and the pair is what says the colony is an occupation
   * rather than a decoration. `ledge-bare` is the other half and the control —
   * the same frame with `ledges.stain` and `ledges.ashore` both at zero, which
   * is the headland this island had before the run.
   *
   * Nothing here is in {@link STILL} that is not already: the colony integrates
   * nothing and the birds stand still, so `season.speed=0` is the whole of it.
   */
  ledge: [
    { name: 'ledge', zoom: 28, rot: SEAWARD, set: ON_LEDGES },
    { name: 'ledge-near', zoom: 12, rot: SEAWARD, set: ON_LEDGES },
    { name: 'ledge-winter', zoom: 28, rot: SEAWARD, season: 0.02, set: ON_LEDGES },
    {
      name: 'ledge-bare',
      zoom: 28,
      rot:  SEAWARD,
      set:  [ ...ON_LEDGES, 'ledges.stain=0', 'ledges.ashore=0' ],
    },
  ],

  /**
   * The stack, and the water between it and the island.
   *
   * The crag's arrangement, one step further out to sea and for a sharper
   * version of the same reason. A pillar eleven metres across, sixty-seven
   * metres from the world origin, is four pixels at the tour's default zoom and
   * nothing at all once it is behind the headland it came out of: the run that
   * put it there moved every pose in `tour` by a hundredth of a per cent, and
   * the one number that says it is a stack at all — the gut of open water
   * behind it — is invisible from every pose this scape is ever drawn at.
   * `scape:map` measures that one; these four are what shows the rest.
   *
   * The home island's pillar stands on the 329° bearing, which is world
   * (58, −35), just outside the 322° headland's own platform. `stack` is both
   * at 90 m, where the cliff, the gap and the rock are three things rather than
   * one silhouette. `stack-near` is 26 m, the only frame in which the taper of
   * the sides and the blocks heaped round the foot are surfaces. `stack-sea` is
   * the same subject from the far quarter, where the pillar comes up against
   * open water instead of against its own headland — the view that says whether
   * it stands as its own thing or reads as a lump on the coast behind it.
   * `stack-bare` is the control and carries the claim: the same frame with
   * `terrain.stack.stature` at zero, which is the coast this archipelago had
   * before the run.
   *
   * Nothing here is in {@link STILL}, for the crag's reason: rock does not
   * move, and the sea round the foot of it is the water's own clock.
   */
  stack: [
    { name: 'stack', zoom: 90, set: OVER_STACK },
    { name: 'stack-near', zoom: 26, set: OVER_STACK },
    { name: 'stack-sea', zoom: 90, rot: 135, set: OVER_STACK },
    {
      name: 'stack-bare',
      zoom: 90,
      set:  [ ...OVER_STACK, 'terrain.stack.stature=0' ],
    },
  ],

  /**
   * The hole in the headland, and the daylight under it.
   *
   * The stack's arrangement, one stage earlier in the same sequence, and it
   * needs a set of its own for a reason the stack's does not quite cover. A
   * pillar at least *is* a silhouette at the far zoom; an arch at nine metres
   * across is the same silhouette as a lump of rock unless the frame is close
   * enough to resolve the opening, and the opening is the entire landform. The
   * numbers say whether there is a hole — `scape:map` reports the headroom and
   * the wetted floor — and these four are what shows it.
   *
   * The home island's arch is cut on the 311° bearing, world (35, −40), inside
   * the 322° headland's own arc and twenty-four metres off the pillar. `arch`
   * is 40 m, where the legs, the hole and the cliff behind are three things.
   * `arch-near` is 15 m, the only frame in which the soffit curve and the
   * courses of the legs are surfaces. `arch-reach` pulls back to 70 m, and it
   * is the frame the landform was added *for*: the headland, the hole cut
   * through its spur and the pillar left where an older hole already fell, all
   * three in one picture, which is the sequence this coast now has a middle of.
   * `arch-none` is the control and carries the claim — the same frame at
   * `terrain.arch.stature=0`, which is the coast this archipelago had before
   * the run.
   *
   * Nothing here is turned off the default heading, and that is deliberate
   * rather than an omission: `rot` does not carry `camera.focusX`/`focusZ`
   * with it, so a rotated frame on a subject fifty metres off the world origin
   * photographs the farmyard instead — which is what the first cut of this set
   * did.
   *
   * Nothing here is in {@link STILL}, for the stack's reason: rock does not
   * move, and the sea running through the hole is the water's own clock.
   */
  arch: [
    { name: 'arch', zoom: 40, set: OVER_ARCH },
    { name: 'arch-near', zoom: 15, set: OVER_ARCH },
    { name: 'arch-reach', zoom: 70, set: OVER_ARCH },
    {
      name: 'arch-none',
      zoom: 40,
      set:  [ ...OVER_ARCH, 'terrain.arch.stature=0' ],
    },
  ],
}
