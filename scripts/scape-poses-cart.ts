import type { Pose } from './scape-poses.ts'


/**
 * The pose set for the one thing on these islands that walks.
 *
 * Its own file for the reason `scape-poses-coast.ts` and `scape-poses-snow.ts`
 * are: `scape-poses.ts` sits a handful of lines under the 666-line ceiling, and
 * a twenty-ninth set that had to be squeezed in would take it over.
 *
 * Folded back into `TOURS` at its definition, so `--poses cart` reads exactly
 * as every other set does.
 */

/**
 * The home island's track, from the yard to the shore.
 *
 * The subject is 3.46 m long and 1.71 m tall, which is a tenth of what the
 * tour's closest pose can resolve and nothing at all at its widest — so like
 * the smokehouse and the chapel before it, this is a thing that is either
 * photographed on purpose or not photographed.
 *
 * `zoom` is `camera.viewSize`, and the *tilt is derived from it*, so a pulled
 * back frame sees far more ground than its own extent: at 60 the whole 196 m
 * island is in shot and the cart is four pixels of it. 25 is the frame that
 * holds the road.
 */
const TRACK = [ 'camera.focusX=-30', 'camera.focusZ=-1' ]

/**
 * The first stretch of road out of the yard, which both ends of the day cross.
 *
 * Not the yard itself, and the difference is occlusion rather than taste: the
 * cart is at the farmyard door at the exact phases the window opens and shuts,
 * and from this camera's azimuth the farmhouse stands between the eye and that
 * spot. Both frames came back with the road empty and the claim unphotographed.
 * A few metres out it is on open ground.
 */
const ROAD = [ 'camera.focusX=-23.5', 'camera.focusZ=-2.8' ]

export const CART_TOURS: Record<string, Pose[]> = {

  /**
   * One road, at four hours of one day and one hour of another.
   *
   * The set is the claim rather than any one frame, and the claim is that the
   * cart is *somewhere else* at every hour and *nowhere at all* for part of the
   * year — neither of which a single still can carry.
   *
   * `cart` is the default hour, with the cart on the homeward
   * leg of the first of the day's two loads, in a frame that holds the whole
   * road. `cart-near` is 18 m, and it names an hour
   * rather than taking the default one, because at this camera *which way the
   * cart is going* decides whether the prop is legible at all: the road runs
   * almost square away from the eye for most of its length, and a cart going
   * away projects its carter up the screen onto its own load — the first cut of
   * this frame read as somebody standing on a wheelbarrow. 0.46 is the homeward
   * leg on the straight above the yard, coming toward the camera, which is the
   * one bearing that puts the person in front of the cart where they belong. `cart-dawn`
   * and `cart-dusk` are the two ends of the working window on the first stretch
   * of road out of the yard: the same six metres of track at the same distance,
   * with the cart outbound at one and homeward at the other, which is what says
   * the window is centred on the sun rather than authored.
   *
   * They sit a little *inside* the window rather than exactly on it, and that
   * is a framing decision rather than a weakened claim. The cart is at the
   * farmyard door at the boundary phases themselves and the farmhouse stands
   * between that spot and this camera, so a frame pinned there photographs an
   * empty road whether the arithmetic is right or wrong. The boundary is the
   * one hour the arithmetic *can* get wrong — and did, until `carter.ts` grew
   * an `EDGE` — so it is stated where it can actually be checked, as two
   * assertions in `carter.test.ts`.
   *
   * `cart-winter` is the frame that has to be empty. At 68° the midwinter day
   * length is exactly zero, the window shuts, and the road is bare — which is
   * the one thing in this set that is a claim about the *absence* of geometry
   * and therefore the one frame that would silently stop being true.
   *
   * Nothing here is in `STILL`, and nothing needs to be: the cart integrates no
   * rate of its own, so `daylight.speed=0` holds it wherever the pose's own
   * hour puts it. Naming a time is the whole of the control, which is the same
   * arrangement the tide and the halo have.
   */
  cart: [
    { name: 'cart', zoom: 25, set: TRACK },
    {
      name: 'cart-near',
      zoom: 18,
      time: 0.46,
      set:  [ 'camera.focusX=-30', 'camera.focusZ=-4.7' ],
    },
    { name: 'cart-dawn', zoom: 20, time: 0.21, set: ROAD },
    { name: 'cart-dusk', zoom: 20, time: 0.79, set: ROAD },
    { name: 'cart-winter', zoom: 25, season: 0.02, set: TRACK },
  ],
}
