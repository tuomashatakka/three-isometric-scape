import { Vector3 } from 'three'
import { aimIsoCamera, createApp, createIsoCamera } from 'threejs-scene'
import { standardLighting } from 'threejs-scene/modules/lighting'
import type { ScapeConfig } from './config.ts'
import { createCameraControls } from './camera-controls.ts'
import { createLandscape } from './landscape.ts'


export interface IsometricScape {
  dispose(): void
}

export interface IsometricScapeOptions {
  reducedMotion: boolean
  onFocus(point: Vector3): void
  onManualControl(): void
}

export function createIsometricScape (
  canvas: HTMLCanvasElement,
  config: ScapeConfig,
  options: IsometricScapeOptions,
): IsometricScape {
  const aspect = canvas.clientWidth / canvas.clientHeight || 1
  const camera = createIsoCamera(aspect, {
    viewSize: config.camera.viewSize,
    flavor:   'dimetric',
    rotation: config.camera.rotation,
    near:     0.1,
    far:      320,
  })
  aimIsoCamera(camera, { tilt: config.camera.tilt })

  const landscape = createLandscape(config)
  const controls  = createCameraControls({
    camera,
    canvas,
    landscape,
    minViewSize:     config.camera.minViewSize,
    maxViewSize:     config.camera.maxViewSize,
    maxFocus:        config.terrain.size * 0.48,
    reducedMotion:   options.reducedMotion,
    onFocus:         options.onFocus,
    onManualControl: options.onManualControl,
  })

  const app = createApp<Record<string, never>>(canvas, {
    state:    {},
    seed:     config.seed,
    camera,
    renderer: {
      antialias:           true,
      pixelRatioMax:       2,
      shadows:             true,
      toneMappingExposure: 0.92,
    },
    scene: {
      background: config.palette.sky,
    },
    use: [
      standardLighting({
        sun: {
          color:         0xffe4aa,
          intensity:     2.7,
          position:      [ -24, 36, -18 ],
          shadowMapSize: 2048,
          shadowFrustum: 48,
          shadowFar:     120,
        },
        hemi: {
          skyColor:    0xd9d8bd,
          groundColor: 0x4c4936,
          intensity:   0.65,
        },
        env: {
          intensity: 0.72,
        },
      }),
      landscape.module,
      controls,
    ],
  })

  app.ctx.renderer.domElement.addEventListener('webglcontextlost', () => {
    app.stop()
  })
  app.start()

  return {
    dispose () {
      app.dispose()
    },
  }
}

// perf: createApp owns the only render loop, resize observer, renderer and
// teardown path. scene modules share that lifecycle rather than adding raf work.
