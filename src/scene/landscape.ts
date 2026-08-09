import {
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Fog,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  StaticDrawUsage,
  Vector3,
} from 'three'
import type { Material, Object3D, Scene } from 'three'
import { createSeededRng, defineModule } from 'threejs-scene'
import type { AppModule } from 'threejs-scene'
import type { ScapeConfig } from './config.ts'
import { sampleHeight } from './noise.ts'


export interface Landscape {
  module:   AppModule<Record<string, never>>
  surfaces: Object3D[]
  heightAt(x: number, z: number): number
}

const UP = new Vector3(0, 1, 0)

function terrainColor (
  height: number,
  config: ScapeConfig,
  lowland: Color,
  highland: Color,
  target: Color,
): Color {
  const water = config.terrain.waterLevel
  const span  = Math.max(1, config.terrain.height - water)
  const mix   = Math.min(1, Math.max(0, (height - water) / span))
  return target.copy(lowland).lerp(highland, mix)
}

function createTerrain (config: ScapeConfig): Mesh {
  const { size, segments, height: amplitude } = config.terrain
  const geometry                              = new PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const positions = geometry.getAttribute('position')
  const colors    = new Float32Array(positions.count * 3)
  const lowland   = new Color(config.palette.lowland)
  const highland  = new Color(config.palette.highland)
  const color     = new Color()

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const y = sampleHeight(x, z, config.seed, amplitude)

    positions.setY(index, y)
    terrainColor(y, config, lowland, highland, color).toArray(colors, index * 3)
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.computeVertexNormals()

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness:    0.94,
    metalness:    0,
    flatShading:  true,
  })
  const terrain         = new Mesh(geometry, material)
  terrain.name          = 'terrain'
  terrain.receiveShadow = true
  return terrain
}

function createWater (config: ScapeConfig): Mesh {
  const geometry = new PlaneGeometry(config.terrain.size * 1.04, config.terrain.size * 1.04)
  geometry.rotateX(-Math.PI / 2)

  const material = new MeshStandardMaterial({
    color:       config.palette.water,
    transparent: true,
    opacity:     0.8,
    roughness:   0.28,
    metalness:   0.05,
    depthWrite:  false,
  })
  const water         = new Mesh(geometry, material)
  water.name          = 'water'
  water.position.y    = config.terrain.waterLevel
  water.receiveShadow = true
  return water
}

function configureInstances (mesh: InstancedMesh, name: string): void {
  mesh.name          = name
  mesh.castShadow    = true
  mesh.receiveShadow = true
  mesh.instanceMatrix.setUsage(StaticDrawUsage)
}

function createTrees (config: ScapeConfig, group: Group, heightAt: Landscape['heightAt'], rngSeed: number): void {
  const trunkGeometry = new CylinderGeometry(0.22, 0.3, 1, 6)
  const crownGeometry = new ConeGeometry(1, 2.4, 7)
  const trunkMaterial = new MeshStandardMaterial({ color: config.palette.trunk, roughness: 1 })
  const crownMaterial = new MeshStandardMaterial({ color: config.palette.tree, roughness: 0.92 })

  const trunks = new InstancedMesh(trunkGeometry, trunkMaterial, config.dressing.treeCount)
  const crowns = new InstancedMesh(crownGeometry, crownMaterial, config.dressing.treeCount)
  configureInstances(trunks, 'tree-trunks')
  configureInstances(crowns, 'tree-crowns')

  const rng      = createSeededRng(rngSeed)
  const position = new Vector3()
  const scale    = new Vector3()
  const rotation = new Quaternion()
  const matrix   = new Matrix4()
  const half     = config.terrain.size * 0.47
  let count = 0

  for (let attempt = 0; attempt < config.dressing.treeCount * 6 && count < config.dressing.treeCount; attempt += 1) {
    const x = (rng.next() * 2 - 1) * half
    const z = (rng.next() * 2 - 1) * half
    const y = heightAt(x, z)

    if (y < config.terrain.waterLevel + 0.55 || y > config.terrain.height * 0.74)
      continue

    const size = 0.7 + rng.next() * 0.9
    rotation.setFromAxisAngle(UP, rng.next() * Math.PI * 2)

    position.set(x, y + size * 0.6, z)
    scale.set(size * 0.36, size * 1.2, size * 0.36)
    matrix.compose(position, rotation, scale)
    trunks.setMatrixAt(count, matrix)

    position.y = y + size * 1.75
    scale.set(size, size, size)
    matrix.compose(position, rotation, scale)
    crowns.setMatrixAt(count, matrix)
    count += 1
  }

  trunks.count                      = count
  crowns.count                      = count
  trunks.instanceMatrix.needsUpdate = true
  crowns.instanceMatrix.needsUpdate = true
  group.add(trunks, crowns)
}

function createRocks (config: ScapeConfig, group: Group, heightAt: Landscape['heightAt'], rngSeed: number): void {
  const geometry = new DodecahedronGeometry(0.65, 0)
  const material = new MeshStandardMaterial({ color: config.palette.rock, roughness: 0.96 })
  const rocks    = new InstancedMesh(geometry, material, config.dressing.rockCount)
  configureInstances(rocks, 'rocks')

  const rng      = createSeededRng(rngSeed)
  const position = new Vector3()
  const scale    = new Vector3()
  const rotation = new Quaternion()
  const matrix   = new Matrix4()
  const half     = config.terrain.size * 0.48
  let count = 0

  for (let attempt = 0; attempt < config.dressing.rockCount * 5 && count < config.dressing.rockCount; attempt += 1) {
    const x = (rng.next() * 2 - 1) * half
    const z = (rng.next() * 2 - 1) * half
    const y = heightAt(x, z)

    if (y < config.terrain.waterLevel + 0.14)
      continue

    const size = 0.35 + rng.next() * 0.72
    position.set(x, y + size * 0.34, z)
    rotation.setFromAxisAngle(UP, rng.next() * Math.PI * 2)
    scale.set(size * (0.75 + rng.next() * 0.5), size * (0.45 + rng.next() * 0.45), size)
    matrix.compose(position, rotation, scale)
    rocks.setMatrixAt(count, matrix)
    count += 1
  }

  rocks.count                      = count
  rocks.instanceMatrix.needsUpdate = true
  group.add(rocks)
}

function disposeRoot (root: Group): void {
  root.traverse(object => {
    const mesh = object as Mesh
    mesh.geometry?.dispose()

    if (Array.isArray(mesh.material))
      mesh.material.forEach((material: Material) => material.dispose())
    else
      mesh.material?.dispose()
  })
}

export function createLandscape (config: ScapeConfig): Landscape {
  const surfaces: Object3D[] = []
  let root: Group | null       = null
  let ownerScene: Scene | null = null
  let sceneFog: Fog | null     = null

  const heightAt = (x: number, z: number): number =>
    sampleHeight(x, z, config.seed, config.terrain.height)

  const module = defineModule<Record<string, never>>({
    name: 'isometric-landscape',

    build (ctx) {
      root = new Group()
      ownerScene = ctx.scene
      root.name = 'isometric-scape'

      const terrain = createTerrain(config)
      const water   = createWater(config)
      surfaces.push(terrain, water)
      root.add(terrain, water)

      createTrees(config, root, heightAt, config.seed ^ 0x7a31)
      createRocks(config, root, heightAt, config.seed ^ 0xb40d)

      sceneFog = new Fog(config.palette.fog, 64, 144)
      ctx.scene.fog = sceneFog
      ctx.scene.add(root)
    },

    dispose () {
      if (root) {
        root.removeFromParent()
        disposeRoot(root)
      }
      if (ownerScene?.fog === sceneFog)
        ownerScene.fog = null
      surfaces.length = 0
      sceneFog = null
      ownerScene = null
      root = null
    },
  })

  return { module, surfaces, heightAt }
}

// perf: terrain and water use two meshes; every tree is folded into two
// instanced draws and every rock into one. generation allocates only at build.
