import type { Pose } from './scape-poses.ts'


/**
 * The pose sets for what the deck overhead does, and the three ways of seeing
 * it.
 *
 * Split off `scape-poses.ts` when that file went back past the 666-line
 * ceiling, and the seam is a real one rather than a line count — the same seam
 * `scape-poses-coast.ts` was cut on. These three sets are one subject read
 * three ways: the shadow a cloud lays on the ground, the light that gets past
 * the same cloud and stands in the air under it, and the fog that fills the low
 * ground once the sky has cleared and the night has taken the heat out of it.
 * The first two share a texture, a cut, a drift and a projection; all three are
 * arguments about a sky the tour can photograph but cannot interrogate.
 *
 * They are folded back into `TOURS` at its definition, so `--poses shade` reads
 * exactly as it did before.
 */
export const SKY_TOURS: Record<string, Pose[]> = {

  /**
   * The shadow the deck lays, and the four ways of having none.
   *
   * A 520 m frame over the home island and the sound around it, which is the
   * only framing that can hold the claim: the archipelago is 19 % land, so the
   * water is better than four fifths of what a wide frame of this scape is
   * made of, and it is the part the shadow never used to reach. A closer pose
   * would be a picture of a hillside, which is the half that already worked.
   *
   * `shade-none` is the switch and the control — `atmosphere.cloudShadow=0`,
   * the flat sea and the flat ground this scape had. `shade-clear` is the
   * *second* control and the more interesting one: a sky with no cloud in it at
   * the authored darkness, which used to dapple the whole archipelago anyway
   * and must now be identical to `shade-none` rather than merely close to it.
   *
   * `shade-low` is the projection. The same frame with the sun down at the
   * bottom of its arc, where a 34 m deck throws its shadow the better part of
   * two hundred metres downsun — so the dapple is somewhere else entirely, and
   * `shade` against `shade-low` is the difference between a shadow and a noise
   * texture read off world `xz`.
   *
   * `shade-night` is a moonless midnight: the cover is up and the darkness is
   * authored, and there is no light for a cloud to take away.
   */
  /**
   * The night bank, and the three ways it can fail to be one.
   *
   * The tour can nearly see this system and that is exactly the problem: two of
   * its six poses are dark enough for the bank to be out, and neither is aimed
   * at what the bank *claims*. The claim is about a top — the low ground goes
   * under and the tops do not — and a frame that only shows fog cannot tell a
   * bank from the ground mist that was already there.
   *
   * So `haar` is the home island at a view wide enough to hold the whole of it,
   * where the hills standing out of the fog are the picture, and `haar-far` is
   * the same instant at 540, which is the only frame in this scape that shows
   * six islands as six tops in one sheet of fog.
   *
   * The last three are the controls, and each one takes a different gate away.
   * `haar-none` is the switch at zero: the identical frame with the bank gone,
   * which must be the coast this scape had before any of this and must be
   * identical to the reference build wherever the run did not also touch the
   * mist. `haar-blow` is the *wind's* half — `STILL` has zeroed the wind, so
   * every other frame here is taken in a dead calm and the scour is invisible in
   * all of them — at a strength well past `haar.scour`, where the bank must be
   * gone and the night must otherwise be unchanged. `haar-day` is the sun's
   * half, the same week at noon, and it is the pose that catches a burn-off set
   * to nothing: a fog still lying over the farm at midday is a sea fret and this
   * system is not one.
   */
  haar: [
    { name: 'haar', zoom: 160, time: 0.02, season: 0.78 },
    { name: 'haar-far', zoom: 540, time: 0.02, season: 0.78 },
    { name: 'haar-none', zoom: 160, time: 0.02, season: 0.78, set: [ 'haar.strength=0' ]},
    { name: 'haar-blow', zoom: 160, time: 0.02, season: 0.78, set: [ 'wind.strength=2.4' ]},
    { name: 'haar-day', zoom: 160, time: 0.5, season: 0.78 },
  ],

  /**
   * The beams, and the two opposite skies that have none.
   *
   * The tour sees this one — four of its six poses are daylit and the default
   * cover is exactly the sky the beams are strongest under — so what this set
   * is for is what the tour cannot separate, and there are two of those.
   *
   * The first is the *zoom*, and it is a fact about the subject rather than a
   * framing preference. A hole in the deck is about ninety metres across at
   * `atmosphere.cloudScale`, and the beam through it leans thirty-two metres
   * over the column it falls through. At 520 that is soft patches of light on
   * the sound, which is what midday sun through broken cloud actually does; at
   * 200 it is a beam standing over the farm. Both are the system, and a run
   * that judged it at one of them would retune it for the other.
   *
   * The second is the *hour*. The lean is the throw, the throw is the tangent
   * of the sun's elevation, and `daylight.ts` holds that elevation at
   * `KEY_FLOOR` — so at the parked hour a beam leans about its own height and
   * near the horizon it leans six times that. `shafts-low` is the frame where
   * the shafts lie flat across the sound rather than standing over it, and
   * nothing in the tour is taken at an hour that shows it.
   *
   * The last three are controls, and two of them are each other's opposite —
   * which is the entire reason this section is not the cloud shadow with its
   * sign flipped. `shafts-none` is the switch at zero. `shafts-clear` is a sky
   * with no cloud in it to cut the light into beams and `shafts-overcast` is a
   * sky with no holes left in it for the light to come through, and **the
   * shafts must be equally gone from both**: a term that is nothing at one end
   * of the cover and something at the other is the linear weight the shadow
   * uses, and it is the wrong one here.
   */
  shafts: [
    { name: 'shafts', zoom: 200 },
    { name: 'shafts-far', zoom: 520 },
    { name: 'shafts-low', zoom: 200, time: 0.3, season: 0.78 },
    { name: 'shafts-none', zoom: 200, set: [ 'shafts.strength=0' ]},
    { name: 'shafts-clear', zoom: 200, set: [ 'atmosphere.cloudCover=0' ]},
    { name: 'shafts-overcast', zoom: 200, set: [ 'atmosphere.cloudCover=1' ]},
  ],

  shade: [
    { name: 'shade', zoom: 520 },
    { name: 'shade-none', zoom: 520, set: [ 'atmosphere.cloudShadow=0' ]},
    { name: 'shade-clear', zoom: 520, set: [ 'atmosphere.cloudCover=0' ]},
    { name: 'shade-low', zoom: 520, time: 0.78 },
    { name: 'shade-night', zoom: 520, time: 0.02, season: 10 / 12.368 },
  ],
}
