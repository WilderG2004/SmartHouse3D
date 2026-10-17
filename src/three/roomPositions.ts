/**
 * Posiciones de los dispositivos "virtuales" (clima, A/C, enchufes).
 *
 * El modelo no trae Empties para ellos, así que se calculan a partir del centro de cada
 * habitación (promedio de sus luces). Si algún día añades un Empty en Blender con el mismo
 * `id` (p. ej. "AC_Sala_Principal" o "Enchufe_TV_Sala"), el dispositivo se coloca ahí.
 */
import * as THREE from 'three'
import { LIGHTS, ROOMS } from '../config/house.config'
import type { Markers } from './markers'

const cache = new WeakMap<Markers, Map<string, THREE.Vector3>>()

export function roomCenter(roomId: string, markers: Markers): THREE.Vector3 | null {
  let byRoom = cache.get(markers)
  if (!byRoom) cache.set(markers, (byRoom = new Map()))
  const hit = byRoom.get(roomId)
  if (hit) return hit.clone()

  const room = ROOMS.find((r) => r.id === roomId)
  if (!room) return null
  const pts = LIGHTS.filter((l) => l.room === room.label)
    .map((l) => markers.get(l.id))
    .filter((v): v is THREE.Vector3 => !!v)
  if (!pts.length) return null

  const c = new THREE.Vector3()
  pts.forEach((p) => c.add(p))
  c.divideScalar(pts.length)
  byRoom.set(roomId, c)
  return c.clone()
}

export function deviceAnchor(
  markers: Markers,
  def: { id: string; room: string; offset: [number, number] },
  y: number,
): THREE.Vector3 | null {
  const own = markers.get(def.id)
  if (own) return own.clone()
  const c = roomCenter(def.room, markers)
  if (!c) return null
  return new THREE.Vector3(c.x + def.offset[0], y, c.z + def.offset[1])
}
