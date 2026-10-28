/**
 * Materiales PBR de la casa, por colección de Blender.
 *
 * Problema de origen: el .glb trae solo 2 materiales (verde = muros, magenta = marcos) y 83 mallas SIN material
 * (three.js les da uno blanco metálico que sin mapa de entorno se ve NEGRO). Además el exportador aplanó las
 * colecciones. Aquí se reconstruye la colección de cada malla por su NOMBRE (`COLLECTIONS` en house.config.ts) y se le
 * pone el acabado que le toca (`FINISHES`): muros marfil mate, piso de roble con tablas, vidrio con transmisión,
 * puertas de nogal, chapas de acero, textiles, cerámica y acero inoxidable.
 *
 * Rendimiento: un material por acabado, compartido por todas sus mallas (las hojas de puerta tienen el suyo para
 * poder iluminarse al pasar el mouse). La textura del piso se dibuja una vez en un <canvas>: no se descarga nada.
 *
 * Es idempotente (React.StrictMode lo ejecuta dos veces): la segunda vez devuelve lo ya preparado.
 */
import * as THREE from 'three'
import {
  COLLECTIONS,
  COLLECTION_FINISH,
  DOORS,
  FINISHES,
  MESH_FINISH,
  WALL_CUT_HEIGHT,
  type CollectionId,
  type FinishId,
  type SurfaceKind,
} from '../config/house.config'

const DOOR_MESHES = new Set(DOORS.map((d) => d.mesh))

const COLLECTION_OF = new Map<string, CollectionId>()
for (const [id, c] of Object.entries(COLLECTIONS) as [CollectionId, (typeof COLLECTIONS)[CollectionId]][]) {
  for (const m of c.meshes) COLLECTION_OF.set(m, id)
}

const SURFACE_OF: Partial<Record<CollectionId, SurfaceKind>> = { paredes: 'wall', piso: 'floor', ventanas: 'frame', puertas: 'frame', chapas: 'frame' }

/** Tablas de 0,55 u de ancho; la textura repite cada 8 tablas a lo ancho y ~3 a lo largo */
const PLANK_TILE = { x: 4.4, z: 7.5 }

export interface HouseMaterials {
  /** Materiales de cada colección (para rayos X, muros cortados y muebles fantasma) */
  byCollection: Map<CollectionId, Set<THREE.MeshStandardMaterial>>
  meshesByCollection: Map<CollectionId, THREE.Mesh[]>
  wallClip: THREE.Plane
}

export type WallMode = 'solid' | 'cut' | 'xray'

export interface ViewMode {
  walls: WallMode
  furniture: boolean
  /** Destacar sensores y luces: muros en rayos X y muebles translúcidos */
  focus: boolean
}

/* ───────────── Textura de piso de madera (canvas, determinista) ───────────── */

function woodPlanksTexture(): THREE.CanvasTexture {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const planks = 8
  const w = size / planks

  for (let i = 0; i < planks; i++) {
    let y = -rnd() * 400
    while (y < size) {
      const len = 360 + rnd() * 260
      const tone = 0.88 + rnd() * 0.2
      g.fillStyle = `rgb(${Math.round(200 * tone)}, ${Math.round(160 * tone)}, ${Math.round(118 * tone)})`
      g.fillRect(i * w, y, w, len)
      // Vetas: curvas finas y suaves a lo largo de la tabla
      for (let k = 0; k < 16; k++) {
        const x = i * w + 4 + rnd() * (w - 8)
        g.strokeStyle = `rgba(92, 58, 30, ${0.05 + rnd() * 0.09})`
        g.lineWidth = 0.8 + rnd() * 1.8
        g.beginPath()
        g.moveTo(x, y)
        g.bezierCurveTo(x + rnd() * 8 - 4, y + len / 3, x + rnd() * 8 - 4, y + (2 * len) / 3, x + rnd() * 6 - 3, y + len)
        g.stroke()
      }
      g.fillStyle = 'rgba(70, 44, 24, 0.45)' // junta entre tablas
      g.fillRect(i * w, y, w, 2)
      y += len
    }
    g.fillStyle = 'rgba(70, 44, 24, 0.4)'
    g.fillRect(i * w, 0, 2, size)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** Coordenadas de textura según la posición en el mundo: las tablas tienen el mismo tamaño en las 4 losas del piso. */
function worldPlanarUvs(mesh: THREE.Mesh) {
  const pos = mesh.geometry.getAttribute('position')
  if (!pos) return
  const uv = new Float32Array(pos.count * 2)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
    uv[i * 2] = v.x / PLANK_TILE.x
    uv[i * 2 + 1] = v.z / PLANK_TILE.z
  }
  mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/* ───────────── Materiales ───────────── */

function makeMaterial(id: FinishId, wood: () => THREE.Texture): THREE.MeshStandardMaterial {
  const f = FINISHES[id]
  const base = {
    color: new THREE.Color(f.color),
    roughness: f.roughness,
    metalness: f.metalness ?? 0,
    side: THREE.DoubleSide,
    map: f.woodPlanks ? wood() : null,
  }
  const mat = f.physical
    ? new THREE.MeshPhysicalMaterial({
        ...base,
        ...f.physical,
        // Vidrio: transparente pero con opacidad 1; la transmisión hace el resto (refleja el entorno y deja ver detrás)
        ...(f.physical.transmission ? { transparent: true, opacity: 1 } : {}),
      })
    : new THREE.MeshStandardMaterial(base)
  mat.name = `casa:${id}`
  mat.userData.finish = id
  return mat
}

export function applyHouseMaterials(root: THREE.Object3D): HouseMaterials {
  const done = root.userData.houseMaterials as HouseMaterials | undefined
  if (done) return done

  root.updateMatrixWorld(true)
  let woodTex: THREE.Texture | null = null
  const wood = () => (woodTex ??= woodPlanksTexture())
  const cache = new Map<FinishId, THREE.MeshStandardMaterial>()
  const shared = (id: FinishId) => {
    let m = cache.get(id)
    if (!m) cache.set(id, (m = makeMaterial(id, wood)))
    return m
  }

  const byCollection = new Map<CollectionId, Set<THREE.MeshStandardMaterial>>()
  const meshesByCollection = new Map<CollectionId, THREE.Mesh[]>()
  const unknown: string[] = []

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return

    let collection = COLLECTION_OF.get(mesh.name)
    if (!collection) {
      unknown.push(mesh.name)
      collection = 'mesasSillasSofas'
    }
    const isLeaf = DOOR_MESHES.has(mesh.name)
    const finish: FinishId = isLeaf ? 'doorWalnut' : (MESH_FINISH[mesh.name] ?? COLLECTION_FINISH[collection])
    // Cada hoja de puerta tiene su propio material: se ilumina sola al pasar el mouse o al quedar abierta
    const mat = isLeaf ? makeMaterial(finish, wood) : shared(finish)

    if (collection === 'piso') worldPlanarUvs(mesh)
    mesh.material = mat
    mesh.userData.collection = collection
    mesh.userData.surface = isLeaf ? 'door' : (SURFACE_OF[collection] ?? 'furniture')
    // El vidrio no tapa el sol; el resto proyecta y recibe sombra
    mesh.castShadow = !(mat as THREE.MeshPhysicalMaterial).transmission
    mesh.receiveShadow = true
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals() // sin normales el sombreado sale negro

    if (!byCollection.has(collection)) byCollection.set(collection, new Set())
    byCollection.get(collection)!.add(mat)
    if (!meshesByCollection.has(collection)) meshesByCollection.set(collection, [])
    meshesByCollection.get(collection)!.push(mesh)
  })

  if (unknown.length) console.warn('[Iot_Casa.glb] Mallas sin colección en house.config.ts (se pintan como muebles):', unknown)
  console.info(
    '[Iot_Casa.glb] materiales por colección:',
    Object.fromEntries([...meshesByCollection].map(([k, v]) => [k, v.length])),
  )

  const result: HouseMaterials = {
    byCollection,
    meshesByCollection,
    wallClip: new THREE.Plane(new THREE.Vector3(0, -1, 0), WALL_CUT_HEIGHT),
  }
  root.userData.houseMaterials = result
  return result
}

/* ───────────── Modos de vista: muros sólidos / cortados / rayos X, muebles ───────────── */

function setGhost(mat: THREE.MeshStandardMaterial, opacity: number | null) {
  if ((mat as THREE.MeshPhysicalMaterial).transmission) return // el vidrio ya es transparente
  const ghost = opacity !== null
  if (mat.transparent !== ghost) {
    mat.transparent = ghost
    mat.needsUpdate = true
  }
  mat.opacity = ghost ? opacity : 1
  mat.depthWrite = !ghost
}

export function applyViewMode(house: HouseMaterials, mode: ViewMode) {
  const walls: WallMode = mode.focus ? 'xray' : mode.walls

  for (const mat of house.byCollection.get('paredes') ?? []) {
    setGhost(mat, walls === 'xray' ? 0.14 : null)
    const clip = walls === 'cut' ? [house.wallClip] : null
    if ((mat.clippingPlanes?.length ?? 0) !== (clip?.length ?? 0)) {
      mat.clippingPlanes = clip
      mat.clipShadows = true
      mat.needsUpdate = true
    }
  }
  for (const mesh of house.meshesByCollection.get('paredes') ?? []) mesh.castShadow = walls !== 'xray'

  for (const [id, c] of Object.entries(COLLECTIONS) as [CollectionId, (typeof COLLECTIONS)[CollectionId]][]) {
    if (!c.furniture) continue
    for (const mesh of house.meshesByCollection.get(id) ?? []) mesh.visible = mode.furniture
    for (const mat of house.byCollection.get(id) ?? []) setGhost(mat, mode.focus ? 0.28 : null)
  }
}
