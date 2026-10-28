import type { Pose } from './scape-poses.ts'


/**
 * The pose sets for what the settlement builds beside the boats.
 *
 * Its own file for the reason `scape-poses-rigs.ts` and `scape-poses-cart.ts`
 * are: `scape-poses.ts` sits a handful of lines under the 666-line ceiling, and
 * the thirty-third set squeezed in would take it over. The smokehouse's set
 * came out with it rather than a set picked at random, because the two subjects
 * are the same subject — a hut and a rack, both sited off the harbour bank,
 * both for keeping a catch — and a reviewer reading one wants the other.
 *
 * Folded back into `TOURS` at its definition, so `--poses hjell`,
 * `--poses kiln` and `--poses smokehouse` read exactly as every other set does.
 */

/**
 * The home island's kiln, with the weather held off it.
 *
 * `weather.time` is pinned for the reason the rotation set pins it: the default
 * phase parks a shower over the scape, and a three-metre drum at 15 m under
 * falling snow is a picture of a shower rather than of a kiln. The hour is left
 * alone, because the burn is a summer thing and the set is argued on what comes
 * off the rim rather than on the light.
 */
const AT_THE_KILN = [ 'camera.focusX=15', 'camera.focusZ=-11', 'weather.time=0.62' ]


export const HARBOUR_TOURS: Record<string, Pose[]> = {

  /**
   * The smokehouse, and the plume that is the whole point of it.
   *
   * Added for the reason `chapel` was, and it is the same reason again: the hut
   * is 3.4 m long against the chapel's fourteen, so at the tour's default frame
   * it is a smudge and at `near`'s ten metres the camera is standing beside it
   * facing the other way. A building this small is either photographed on
   * purpose or not photographed.
   *
   * `smokehouse` reads the building — turf roof, log courses, the billets
   * against the blind gable — and the cowl the smoke leaves through. `harbour`
   * pulls back to the claim the siting is actually about: the hut and the water
   * it works for in one frame, so a reviewer can see whether the search put it
   * with the boats or wandered off up the hill. `smokehouse-still` is the
   * same close frame on a windless day, because the plume is laid over by the
   * wind and a column that only reads when it is bent is a column that vanishes
   * the first calm morning.
   */
  smokehouse: [
    { name: 'smokehouse', zoom: 30, set: [ 'camera.focusX=-8.5', 'camera.focusZ=-10.3' ]},
    { name: 'harbour', zoom: 40, set: [ 'camera.focusX=-13', 'camera.focusZ=-21' ]},
    {
      name: 'smokehouse-still',
      zoom: 30,
      set:  [ 'camera.focusX=-8.5', 'camera.focusZ=-10.3', 'wind.strength=0' ],
    },
  ],

  /**
   * The drying racks above the harbour, loaded and bare.
   *
   * The thirty-third set, and the first whose whole subject is a *week of the
   * year* rather than a place. Five of these runs stand on five islands and
   * none of them is visible from the tour: a rack is fifteen metres of pole
   * fifty metres from the yard, which is a scratch at 1400 m and out of frame at
   * `near`'s ten. A structure photographed only from the default pose is a
   * structure nobody looked at.
   *
   * `hjell` reads the timber and the catch together at the week the racks are
   * fullest, and it is 13 m rather than the set's wider frames for a measured
   * reason: at 26 m a fish is a few pixels on a rail and the loaded week and the
   * bare one came back within a quarter of a percentage point of each other,
   * which is a pair of frames that cannot tell a reader what this feature does. `hjell-bare` is the same frame in autumn, and it is the half of
   * this that no other capture in the scape can reach — the claim the feature
   * makes is that the coast *empties*, and a set with only the loaded week in
   * it would show a decorated rack rather than a working one. `hjell-harbour`
   * pulls back to the claim the siting makes: the racks, the hut and the water
   * they both work for in one frame, so a reviewer can see whether the search
   * put the line in the weather or tucked it behind the bank. `hjell-winter`
   * is the control the ground supplies — the loading begins before the snow has
   * gone, so this is the one frame where the fish and the drift are in the same
   * picture, and a rack that failed to clear the snow line would show here and
   * nowhere else.
   */

  hjell: [
    { name: 'hjell', zoom: 13, season: 0.3, set: [ 'camera.focusX=-21', 'camera.focusZ=-4' ]},
    { name: 'hjell-bare', zoom: 13, season: 0.72, set: [ 'camera.focusX=-21', 'camera.focusZ=-4' ]},
    {
      name:   'hjell-harbour',
      zoom:   44,
      season: 0.3,
      set:    [ 'camera.focusX=-16', 'camera.focusZ=-12' ],
    },
    {
      name:   'hjell-winter',
      zoom:   26,
      season: 0.12,
      set:    [ 'camera.focusX=-21', 'camera.focusZ=-4' ],
    },
  ],

  /**
   * The lime kiln on the brae, burning and cold.
   *
   * The thirty-fourth set, and the second whose subject is a week of the year as
   * much as a place. It belongs in this file for the reason the racks do: a
   * kiln, a hut and a rack are three things the harbour built on one bank, and a
   * reviewer reading any of them wants the other two.
   *
   * `kiln` reads the stonework at the week the burn is fullest — the battered
   * drum, the draw arch, the quicklime heaped clear of it and the column coming
   * off the rim. 15 m rather than the set's wider frames for the reason the
   * racks are 13: the arch is a metre across, and at 30 m a mouth and a shadow
   * are the same handful of pixels. `kiln-cold` is the same frame at midwinter
   * and it is the half of this that nothing else in the scape can reach — the
   * claim the feature makes is that a kiln is *out* for most of the year, and a
   * set with only the burn in it would show a chimney rather than a kiln.
   * `kiln-bank` pulls back to the claim the siting makes: the kiln, the hut and
   * the water they both work for in one frame, so a reviewer can see whether the
   * search found a brae or walled a drum up against a flat shelf.
   * `kiln-blow` is the burning frame with the wind *put back*, and it is here
   * rather than a `-still` twin because of what the first cut of this set
   * measured. A still frame is what every capture in this scape already is —
   * `STILL` zeroes `wind.strength` — so `kiln` and `kiln-still` came back
   * identical to two decimal places, which is a pose that cannot tell a reader
   * anything. The column laid over by a real blow is the half of the plume no
   * other capture can reach.
   */
  kiln: [
    { name: 'kiln', rot: 225, zoom: 15, season: 0.62, set: AT_THE_KILN },
    { name: 'kiln-cold', rot: 225, zoom: 15, season: 0.1, set: AT_THE_KILN },
    {
      name:   'kiln-bank',
      rot:    225,
      zoom:   46,
      season: 0.62,
      set:    [ 'camera.focusX=2', 'camera.focusZ=-16', 'weather.time=0.62' ],
    },
    {
      name:   'kiln-blow',
      rot:    225,
      zoom:   15,
      season: 0.62,
      set:    [ ...AT_THE_KILN, 'wind.strength=2.4' ],
    },
  ],
}
