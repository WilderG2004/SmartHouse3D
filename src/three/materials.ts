/**
 * Pintura de la casa.
 *
 * Problema de origen: el .glb exportado desde Blender trae
 *   - 2 materiales con nombre (verde = muros, magenta = marcos), y
 *   - 83 mallas SIN material -> three.js les asigna uno por defecto
 *     (blanco, metalness = 1, roughness = 1) que sin mapa de entorno se ve NEGRO.
 *
 * Solucion: recorremos (`traverse`) todas las mallas y les ponemos un
 * MeshStandardMaterial nuevo, SOLIDO y con la paleta de house.config.ts:
 *   transparent = false · opacity = 1 · side = DoubleSide · depthWrite = true
 *
 * Importante: React.StrictMode ejecuta este codigo DOS veces en desarrollo. La segunda vez los materiales
 * originales ya no estan (los cambiamos en la primera), asi que cada malla recuerda su clasificacion en
 * `userData.surface` y no se vuelve a clasificar. Sin esto los muros pasaban a ser "muebles" de colores al azar.
 */
import * as THREE from 'three'
import {
  DOORS,
  KEEP_ORIGINAL_COLORS,
  MATERIAL_ROLES,
  PALETTE,
  SURFACE_FINISH,
  type SurfaceKind,
} from '../config/house.config'

const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

const DOOR_MESHES = new Set(DOORS.map((d) => d.mesh))

function classify(mesh: THREE.Mesh, original?: THREE.Material): SurfaceKind {
  if (DOOR_MESHES.has(mesh.name)) return 'door'
  const byMaterial = original?.name ? MATERIAL_ROLES[original.name] : undefined
  if (byMaterial) return byMaterial

  // Sin material con nombre: decidimos por la forma (medida en el mundo).
  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3())
  const area = size.x * size.z
  if (size.y < 0.05 && area > 50) return 'floor' // planos del piso
  if (size.y <= 2.0 && area > 70) return 'wall' // zocalos y losas grandes que forman la base de los muros
  return 'furniture'
}

export function applySolidMaterials(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const cache = new Map<string, THREE.MeshStandardMaterial>()
  const counts: Record<SurfaceKind, number> = { floor: 0, wall: 0, frame: 0, door: 0, furniture: 0 }

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return

    const original = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
      | THREE.MeshStandardMaterial
      | undefined

    // Ya pintada en una pasada anterior: se respeta su clasificacion.
    let kind = mesh.userData.surface as SurfaceKind | undefined
    if (!kind) {
      kind = classify(mesh, original)
      mesh.userData.surface = kind
      mesh.userData.originalColor = original?.name && original.color ? original.color.getHex() : undefined
    }
    counts[kind]++

    const palette = PALETTE[kind]
    const color =
      KEEP_ORIGINAL_COLORS && mesh.userData.originalColor !== undefined
        ? new THREE.Color(mesh.userData.originalColor as number)
        : new THREE.Color(palette[hash(mesh.name) % palette.length])

    const key = `${kind}|${color.getHexString()}`
    let mat = cache.get(key)
    if (!mat) {
      const finish = SURFACE_FINISH[kind]
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: finish.roughness,
        metalness: 0,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: true,
      })
      cache.set(key, mat)
    }
    mesh.material = mat
    mesh.castShadow = true
    mesh.receiveShadow = true

    // Sin normales el sombreado sale plano/negro.
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals()
  })

  console.info('[Iot_Casa.glb] materiales solidos aplicados:', counts)
}
