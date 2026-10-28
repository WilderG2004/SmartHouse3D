/**
 * Centros de las zonas de cámara (Sala / TV, Habitaciones, Cocina, Baños, Lavandería): el promedio de las luces de sus
 * habitaciones, a la altura de los muebles. Se calculan una vez al cargar el modelo y los lee la cámara al pedir una vista.
 */
import * as THREE from 'three'
import { CAMERA_ZONES, LIGHTS, VIEW, type CameraZoneId } from '../config/house.config'
import type { Markers } from './markers'

export const zoneTargets = new Map<CameraZoneId, THREE.Vector3>()

/** Dirección desde la que se mira cada zona: la misma diagonal de la vista general, un poco más alta */
export const ZONE_DIR = new THREE.Vector3(VIEW.iso[0], VIEW.iso[1] * 1.15, VIEW.iso[2]).normalize()

export function computeZoneTargets(markers: Markers) {
  for (const z of CAMERA_ZONES) {
    const rooms: readonly string[] = z.rooms
    const pts = LIGHTS.filter((l) => rooms.includes(l.room))
      .map((l) => markers.get(l.id))
      .filter((v): v is THREE.Vector3 => !!v)
    if (!pts.length) continue
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length)
    c.y = 1.5
    zoneTargets.set(z.id, c)
  }
}
