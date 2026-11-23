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
 * **Defocus only.** It also carried a screen-space contact occlusion in its
 * green channel: ten depth taps round every pixel, looking for a rise of 0.7 m.
 * At the archipelago frame that reach is a tenth of a pixel and the rise it
 * read was the depth buffer's quantisation step, which ruled the whole desktop
 * `default` frame in horizontal bands; at the yard it was an undenoised
 * per-pixel spiral, a screen door over everything with a pale rim round every
 * stone. `contact.ts` puts contact shade under every small solid on every tier
 * in the materials, so the screen-space copy went, and with it ten of the
 * pass's eleven fetches.
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
}

export interface FocalPass extends Pass {

  /** Red: the defocus, 0 on the focal plane and 1 at half a frame of ground off it. */
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
export function depthDefocus (viewHeight: number, tanElevation: number): number {
  return 2 * Math.max(0.05, tanElevation) / Math.max(1e-3, viewHeight)
}

const FRAGMENT = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec2  uFocus;
  uniform float uSpan, uPerMetre;

  varying vec2 vUv;

  float viewDepth (vec2 uv) { return textureLod(tDepth, uv, 0.0).x * uSpan; }

  void main () {
    float off = abs(viewDepth(vUv) - viewDepth(uFocus)) * uPerMetre;
    gl_FragColor = vec4(clamp(off, 0.0, 1.0), 0.0, 0.0, 1.0);
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

  constructor (depth: Texture) {
    super()
    this.needsSwap = false
    this.target    = new WebGLRenderTarget(1, 1, {
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

  aim ({ focus, perMetre, span }: FocalAim): void {
    const uniforms = this.material.uniforms;
    (uniforms.uFocus.value as Vector2).copy(focus)
    uniforms.uPerMetre.value = perMetre
    uniforms.uSpan.value     = span
  }

  override setSize (width: number, height: number): void {
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

/** The focal pass over the scene's depth texture. */
export function createFocalPass (depth: Texture): FocalPass {
  return new Focal(depth)
}
