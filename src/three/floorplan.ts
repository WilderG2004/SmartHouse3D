/**
 * Plano de la casa, sacado del propio modelo 3D (sin tocar Blender).
 *
 * Idea: se "corta" la casa con un plano horizontal a una altura (como cortar una torta) y se guardan las lineas donde
 * el corte toca las paredes y los muebles. Eso da:
 *   - los segmentos para dibujar el mini-mapa (corte a la altura de los ojos), y
 *   - los segmentos contra los que choca la persona al caminar (cortes a 3 alturas: rodillas, cintura y pecho).
 *
 * Las hojas de las puertas NO entran aqui: se mueven (abren y cierran) y se tratan aparte en WalkMode.
 */
import * as THREE from 'three'
import { WALK_THROUGH } from '../config/house.config'

export interface Box2 {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface FloorPlan {
  /** Segmentos [x1, z1, x2, z2, ...] del corte a la altura de los ojos (para dibujar el mini-mapa) */
  drawSegs: Float32Array
  /** Segmentos [x1, z1, x2, z2, ...] de los cortes a varias alturas (para chocar) */
  collisionSegs: Float32Array
  /** Rectangulos de piso (por dentro de la casa) */
  floors: Box2[]
  /** Caja que contiene toda la casa */
  bounds: Box2
  /** Altura (Y) del piso */
  floorY: number
}

/** Alturas de corte (en unidades del modelo, sobre el piso): rodillas, cintura, pecho */
const COLLISION_CUTS = [0.9, 2.0, 3.3]
/** Altura del corte que se dibuja en el mini-mapa */
const DRAW_CUT = 2.4

function sliceInto(root: THREE.Object3D, y: number, out: number[], skip?: ReadonlySet<string>) {
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    if (mesh.userData.doorId) return // las hojas de puerta se mueven: se tratan aparte
    if (mesh.userData.surface === 'floor') return
    if (skip?.has(mesh.name)) return
    const pos = mesh.geometry.getAttribute('position')
    if (!pos) return
    const index = mesh.geometry.index
    const triCount = (index ? index.count : pos.count) / 3
    const m = mesh.matrixWorld
    const vert = (i: number, into: THREE.Vector3) => into.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(m)

    // Un corte horizontal solo toca los triangulos que cruzan la altura `y`
    const pts: number[] = []
    for (let t = 0; t < triCount; t++) {
      vert(t * 3, a)
      vert(t * 3 + 1, b)
      vert(t * 3 + 2, c)
      const da = a.y - y
      const db = b.y - y
      const dc = c.y - y
      if ((da > 0 && db > 0 && dc > 0) || (da <= 0 && db <= 0 && dc <= 0)) continue
      pts.length = 0
      const edge = (p: THREE.Vector3, q: THREE.Vector3, dp: number, dq: number) => {
        if (dp > 0 === dq > 0) return
        const k = dp / (dp - dq)
        pts.push(p.x + (q.x - p.x) * k, p.z + (q.z - p.z) * k)
      }
      edge(a, b, da, db)
      edge(b, c, db, dc)
      edge(c, a, dc, da)
      if (pts.length >= 4) {
        const dx = pts[2] - pts[0]
        const dz = pts[3] - pts[1]
        if (dx * dx + dz * dz > 1e-8) out.push(pts[0], pts[1], pts[2], pts[3])
      }
    }
  })
}

export function buildFloorplan(scene: THREE.Object3D): FloorPlan {
  const cached = scene.userData.floorplan as FloorPlan | undefined
  if (cached) return cached

  scene.updateMatrixWorld(true)

  // Pisos: sus rectangulos dicen que es "dentro de la casa" y a que altura se camina
  const floors: Box2[] = []
  let floorY = 0.12
  let floorCount = 0
  const box = new THREE.Box3()
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.surface !== 'floor') return
    box.setFromObject(mesh)
    floors.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z })
    floorY = floorCount === 0 ? box.max.y : Math.max(floorY, box.max.y)
    floorCount++
  })

  const bounds: Box2 = floors.length
    ? {
        minX: Math.min(...floors.map((f) => f.minX)),
        maxX: Math.max(...floors.map((f) => f.maxX)),
        minZ: Math.min(...floors.map((f) => f.minZ)),
        maxZ: Math.max(...floors.map((f) => f.maxZ)),
      }
    : { minX: -15, maxX: 33, minZ: -42, maxZ: 21 }

  const draw: number[] = []
  sliceInto(scene, floorY + DRAW_CUT, draw)
  const col: number[] = []
  const passable = new Set(WALK_THROUGH)
  for (const h of COLLISION_CUTS) sliceInto(scene, floorY + h, col, passable)

  const plan: FloorPlan = {
    drawSegs: new Float32Array(draw),
    collisionSegs: new Float32Array(col),
    floors,
    bounds,
    floorY,
  }
  scene.userData.floorplan = plan
  console.info(
    `[recorrido] plano listo: ${draw.length / 4} lineas para el mapa, ${col.length / 4} para chocar, ${floors.length} pisos`,
  )
  return plan
}
