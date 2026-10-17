/**
 * Prepara las puertas del modelo para poder animarlas (sin tocar Blender).
 *
 * Por cada puerta:
 *   1. Mide su caja envolvente en el mundo (no confía en el origen del objeto).
 *   2. Crea un pivote (THREE.Group) en la bisagra: borde vertical del extremo
 *      elegido de la hoja; o en el centro si es corrediza.
 *   3. Pasa la malla al pivote con `attach()` (conserva su posición en el mundo).
 * Después basta con rotar el pivote en Y (o subirlo, en el garaje).
 *
 * Es idempotente: si se llama dos veces con la misma escena (React.StrictMode)
 * devuelve lo ya creado.
 */
import * as THREE from 'three'
import { DOORS, type DoorDef } from '../config/house.config'

export interface DoorRig {
  def: DoorDef
  pivot: THREE.Group
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
    const mesh = scene.getObjectByName(def.mesh)
    if (!mesh) {
      console.warn(`[puertas] No existe la malla «${def.mesh}» para «${def.label}». Revisa house.config.ts`)
      continue
    }

    const box = new THREE.Box3().setFromObject(mesh)
    const size = box.getSize(new THREE.Vector3())
    const hinge = box.getCenter(new THREE.Vector3())

    if (def.kind === 'swing') {
      const axis: 'x' | 'z' = size.x > size.z ? 'x' : 'z' // eje largo de la hoja
      hinge[axis] = def.hinge === 'max' ? box.max[axis] : box.min[axis]
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
    rigs.set(def.id, {
      def,
      pivot,
      baseY: pivot.position.y,
      travel: def.kind === 'slide' ? size.y * 0.96 : 0,
      value: 0,
    })
  }

  scene.userData.doorRigs = rigs
  console.info(`[puertas] ${rigs.size} de ${DOORS.length} puertas listas`)
  return rigs
}
