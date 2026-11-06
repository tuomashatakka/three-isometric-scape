import { LinearFilter, ShaderMaterial, Vector2, WebGLRenderTarget } from 'three'
import type { Texture, WebGLRenderer } from 'three'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'


/**
 * The focal plane: how far off it every pixel is, read while the depth is
 * still the scene's.
 *
 * The lens used to defocus a horizontal band of the *screen*, which is the
 * focal plane for flat ground and wrong for anything standing up out of it — a
 * church tower in the focused band went soft by how tall it stood on screen,
 * not by how far it was from the plane. The depth buffer is the plane itself.
 *
 * **Why it is its own pass, right after the scene, and not a read in the lens.**
 * The composer's two targets share one depth texture, and under multisampling
 * every pass resolves its *own* depth renderbuffer into it — so by the end of
 * the chain the texture holds whatever the god-ray pass's never-written
 * renderbuffer held, which is one constant. three's `resolveDepthBuffer: false`
 * does not help: it *invalidates* the texture rather than leaving it alone. And
 * without multisampling the texture is the draw target's depth attachment, so
 * reading it from a pass drawing into that target is a feedback loop. So the
 * defocus is taken here, from a target of this pass's own, before anything
 * else has touched the depth, and handed to the lens as a texture.
 *
 * **Half resolution, eight bits.** A defocus disc is wider than a pixel by
 * definition, so the map that sizes it does not need every pixel: a quarter
 * of the fragments, one depth fetch each, plus a fetch at the focused point
 * that every fragment shares.
 */

export interface FocalAim {

  /** The focused point, in the frame's 0..1 uv. */
  focus: Vector2

  /** Defocus per metre of view depth off the focal plane — {@link depthDefocus}. */
  perMetre: number

  /** `camera.far - camera.near`: an orthographic depth buffer is linear in it. */
  span: number

  /** World height of the frame, so the occlusion's reach can be a length in metres. */
  viewHeight: number

  /** Metres of view depth per metre up the screen on level ground: `1 / tan(elevation)`. */
  slope: number
}

export interface FocalPass extends Pass {

  /**
   * Red: the defocus, 0 on the focal plane and 1 at half a frame of ground
   * off it. Green: contact occlusion, 0 in the open and 1 deep in a crease.
   */
  readonly map: Texture
  aim(aim: FocalAim): void
}

/**
 * Defocus per metre of view depth, calibrated so flat ground defocuses
 * exactly as the screen band did: fully at half a frame from the focus.
 *
 * Half a frame of height up the screen is `viewHeight / 2` along the view's up
 * vector, which on ground under a camera at elevation θ is
 * `viewHeight / (2 tan θ)` metres of depth.
 */
/** How far a surface's shadow reaches into the ground it stands on, in metres. */
export const CONTACT_REACH = 0.7

/** Taps of the occlusion ring — a golden-angle spiral, so none line up. */
export const CONTACT_TAPS = 10

/**
 * What one neighbour adds to the occlusion: its height above this fragment's
 * surface in metres (view depth, with level ground's own slope taken out).
 * Nothing for a neighbour at or below the surface, rising to full at one
 * reach and handed back to zero by three — a wall ten metres up is a
 * silhouette, not a crease, so it casts no halo.
 */
export function contactWeight (rise: number, reach = CONTACT_REACH): number {
  const up = Math.min(1, Math.max(0, rise / reach - 0.05))
  const t  = Math.min(1, Math.max(0, (rise / reach - 1) / 2))

  return up * (1 - t * t * (3 - 2 * t))
}

export function depthDefocus (viewHeight: number, tanElevation: number): number {
  return 2 * Math.max(0.05, tanElevation) / Math.max(1e-3, viewHeight)
}

const FRAGMENT = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2  uFocus;
  uniform float uSpan, uPerMetre, uSlope;
  uniform vec2  uReach;   // the occlusion's reach in uv, per axis

  const int TAPS = ${CONTACT_TAPS};

  varying vec2 vUv;

  // Orthographic: the stored depth is linear in view distance, no unprojection.
  float viewDepth (vec2 uv) { return textureLod(tDepth, uv, 0.0).x * uSpan; }

  float contactWeight (float rise) {
    float up = clamp(rise / ${CONTACT_REACH.toFixed(2)} - 0.05, 0.0, 1.0);
    float t  = clamp((rise / ${CONTACT_REACH.toFixed(2)} - 1.0) / 2.0, 0.0, 1.0);
    return up * (1.0 - t * t * (3.0 - 2.0 * t));
  }

  void main () {
    float here = viewDepth(vUv);
    float off  = abs(here - viewDepth(uFocus)) * uPerMetre;

    // Contact occlusion: a neighbour nearer the camera than this surface, once
    // level ground's own depth ramp up the screen is taken out, stands over it.
    float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
    float shut = 0.0;
    for (int i = 0; i < TAPS; i++) {
      float r = sqrt((float(i) + 0.5) / float(TAPS));
      float a = float(i) * 2.399963 + turn;
      vec2  o = vec2(cos(a), sin(a)) * r;
      float rise = here - viewDepth(vUv + o * uReach) + o.y * ${CONTACT_REACH.toFixed(2)} * uSlope;
      shut += contactWeight(rise);
    }
    gl_FragColor = vec4(clamp(off, 0.0, 1.0), clamp(shut / float(TAPS) * 2.0, 0.0, 1.0), 0.0, 1.0);
  }
`

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main () {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

class Focal extends Pass implements FocalPass {
  private readonly target:   WebGLRenderTarget
  private readonly material: ShaderMaterial
  private readonly quad:     FullScreenQuad
  private aspect = 1

  constructor (depth: Texture) {
    super()
    this.needsSwap = false
    // Eight bits rather than a half float: a defocus is 0..1 and 256 steps of
    // it are finer than a disc can show, and an rgba8 target is renderable on
    // every device without asking for an extension first.
    this.target = new WebGLRenderTarget(1, 1, {
      minFilter:       LinearFilter,
      magFilter:       LinearFilter,
      depthBuffer:     false,
      generateMipmaps: false,
    })
    this.material = new ShaderMaterial({
      uniforms: {
        tDepth:    { value: depth },
        uFocus:    { value: new Vector2(0.5, 0.5) },
        uSpan:     { value: 1 },
        uPerMetre: { value: 0 },
        uSlope:    { value: 1 },
        uReach:    { value: new Vector2() },
      },
      vertexShader:   VERTEX,
      fragmentShader: FRAGMENT,
      depthTest:      false,
      depthWrite:     false,
    })
    this.quad = new FullScreenQuad(this.material)
  }

  get map (): Texture {
    return this.target.texture
  }

  aim ({ focus, perMetre, span, viewHeight, slope }: FocalAim): void {
    const uniforms = this.material.uniforms;
    (uniforms.uFocus.value as Vector2).copy(focus)

    const height = Math.max(1e-3, viewHeight);
    (uniforms.uReach.value as Vector2).set(CONTACT_REACH / (height * this.aspect), CONTACT_REACH / height)
    uniforms.uSlope.value    = slope
    uniforms.uPerMetre.value = perMetre
    uniforms.uSpan.value     = span
  }

  override setSize (width: number, height: number): void {
    this.aspect = width / Math.max(1, height)
    this.target.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)))
  }

  override render (renderer: WebGLRenderer): void {
    renderer.setRenderTarget(this.target)
    this.quad.render(renderer)
  }

  override dispose (): void {
    this.target.dispose()
    this.material.dispose()
    this.quad.dispose()
  }
}

export function createFocalPass (depth: Texture): FocalPass {
  return new Focal(depth)
}

// perf: desktop and up only (the chain is off on mobile). A quarter of the
// frame's fragments, two depth fetches each and an eight-bit write, in exchange for a lens that focuses on the scene rather than on the
// screen.
