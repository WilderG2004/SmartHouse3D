/**
 * Lee los Empties del .glb que sirven de marcadores (X, Y, Z) y avisa por
 * consola de cualquier nombre que no coincida con house.config.ts.
 */
import * as THREE from 'three'
import { DOORS, LIGHTS, METER, PIRS, SMOKE } from '../config/house.config'

export type Markers = Map<string, THREE.Vector3>

let logged = false

export function collectMarkers(scene: THREE.Object3D): Markers {
  scene.updateMatrixWorld(true)

  const all: { nombre: string; tipo: string; x: number; y: number; z: number }[] = []
  const markers: Markers = new Map()
  const tmp = new THREE.Vector3()

  scene.traverse((o) => {
    if (o === scene) return
    o.getWorldPosition(tmp)
    all.push({ nombre: o.name, tipo: o.type, x: +tmp.x.toFixed(2), y: +tmp.y.toFixed(2), z: +tmp.z.toFixed(2) })
    if (!(o as THREE.Mesh).isMesh) markers.set(o.name, tmp.clone())
  })

  if (!logged) {
    logged = true
    console.groupCollapsed(`[Iot_Casa.glb] ${all.length} nodos (clic para desplegar)`)
    console.table(all)
    console.groupEnd()

    const expected = [
      ...LIGHTS.map((l) => l.id),
      SMOKE.id,
      METER.id,
      ...PIRS.map((p) => p.id),
      // Solo las puertas con sensor tienen Empty; las demás son mallas (ver three/doors.ts)
      ...DOORS.filter((d) => d.sensor).map((d) => d.id),
    ]
    const missing = expected.filter((id) => !markers.has(id))
    if (missing.length) {
      console.warn(
        '[Iot_Casa.glb] Nodos configurados que NO existen en el modelo (corrige house.config.ts):',
        missing,
      )
    }
    const extra = [...markers.keys()].filter(
      (n) => /^(Luz_|Sensor_|Medidor_)/.test(n) && !expected.includes(n),
    )
    if (extra.length) {
      console.warn('[Iot_Casa.glb] Nodos del modelo que no están en house.config.ts:', extra)
    }
  }
  return markers
}
