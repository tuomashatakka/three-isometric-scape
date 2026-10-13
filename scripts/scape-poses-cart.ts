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

/** The yard end of the same road, which is where both ends of the day are spent. */
const YARD = [ 'camera.focusX=-19', 'camera.focusZ=-1' ]

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
   * and `cart-dusk` are the two ends of the working window, on the yard end of
   * the same road at 34 m: the cart is at the door at both, going out at one
   * and come home at the other, and between them they are what says the window
   * is centred on the sun rather than authored. Both land exactly on the
   * boundary phase, which is deliberate — it is the one hour the arithmetic can
   * get wrong, and it did until `carter.ts` grew an `EDGE`.
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
    { name: 'cart-dawn', zoom: 20, time: 0.19, set: YARD },
    { name: 'cart-dusk', zoom: 20, time: 0.81, set: YARD },
    { name: 'cart-winter', zoom: 25, season: 0.02, set: TRACK },
  ],
}
