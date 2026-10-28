/**
 * Prepara las puertas del modelo para poder animarlas (sin tocar Blender).
 *
 * Por cada puerta:
 *   1. Mide su caja envolvente en el mundo (no confía en el origen del objeto).
 *   2. Crea un pivote (THREE.Group) en la bisagra: borde vertical de la hoja opuesto a la manija
 *      (o el extremo que diga `hinge`); o en el centro si es corrediza.
 *   3. Pasa la hoja y su manija al pivote con `attach()` (conservan su posición en el mundo).
 * Después basta con rotar el pivote en Y (o subirlo, en el garaje): la manija se mueve con la hoja.
 *
 * Es idempotente: si se llama dos veces con la misma escena (React.StrictMode)
 * devuelve lo ya creado.
 */
import * as THREE from 'three'
import { DOORS, type DoorDef } from '../config/house.config'

export interface DoorRig {
  def: DoorDef
  pivot: THREE.Group
  /** La hoja de la puerta (sin la manija): es la que choca al caminar */
  leaf: THREE.Mesh
  /** Posición Y del pivote con la puerta cerrada (para corredizas) */
  baseY: number
  /** Recorrido de la corrediza (m) */
  travel: number
  /** 0 = cerrada, 1 = abierta (valor animado) */
  value: number
}

export type DoorRigs = Map<string, DoorRig>

export function prepareDoors(scene: THREE.Object3D): DoorRigs {
  if (scene.userData.doorRigs) return scene.userData.doorRigs as DoorRigs

  scene.updateMatrixWorld(true)
  const rigs: DoorRigs = new Map()

  for (const def of DOORS) {
    const mesh = scene.getObjectByName(def.mesh) as THREE.Mesh | undefined
    if (!mesh) {
      console.warn(`[puertas] No existe la malla «${def.mesh}» para «${def.label}». Revisa house.config.ts`)
      continue
    }
    const handle = def.handle ? scene.getObjectByName(def.handle) : undefined
    if (def.handle && !handle) console.warn(`[puertas] No existe la manija «${def.handle}» de «${def.label}». Revisa house.config.ts`)

    const box = new THREE.Box3().setFromObject(mesh)
    const size = box.getSize(new THREE.Vector3())
    const hinge = box.getCenter(new THREE.Vector3())

    if (def.kind === 'swing') {
      const axis: 'x' | 'z' = size.x > size.z ? 'x' : 'z' // eje largo de la hoja
      let side = def.hinge
      if (!side && handle) {
        // La bisagra va en el borde contrario a la manija
        const handleAt = new THREE.Box3().setFromObject(handle).getCenter(new THREE.Vector3())[axis]
        side = handleAt < hinge[axis] ? 'max' : 'min'
      }
      hinge[axis] = side === 'max' ? box.max[axis] : box.min[axis]
      hinge.y = box.min.y
    }

    const pivot = new THREE.Group()
    pivot.name = `pivot_${def.id}`
    scene.worldToLocal(hinge)
    pivot.position.copy(hinge)
    scene.add(pivot)
    pivot.updateMatrixWorld(true)
    pivot.attach(mesh) // conserva la transformación mundial de la hoja
    mesh.userData.doorId = def.id
    if (handle) {
      pivot.attach(handle)
      handle.userData.doorId = def.id // clic en la manija = clic en la puerta; y no entra al plano fijo de muros
    }

    rigs.set(def.id, {
      def,
      pivot,
      leaf: mesh,
      baseY: pivot.position.y,
      travel: def.kind === 'slide' ? size.y * 0.96 : 0,
      value: 0,
    })
  }

  scene.userData.doorRigs = rigs
  console.info(`[puertas] ${rigs.size} de ${DOORS.length} puertas listas`)
  return rigs
}
