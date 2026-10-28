/**
 * Monta un equipo de pared (los aires acondicionados) contra un MURO REAL del modelo.
 *
 * El modelo no trae marcas para los aires, así que se parte del centro de la habitación (roomPositions.ts) y se lanzan
 * rayos horizontales hacia las cuatro paredes. Un tramo de muro sirve si, a la altura del equipo, los rayos de sus dos
 * extremos y del centro (arriba y abajo) tocan el muro a la misma distancia y ninguno pasa antes por un obstáculo (ventana,
 * puerta o mueble alto). Si el tramo de enfrente está ocupado, se prueba deslizando el equipo a lo largo del mismo muro.
 *
 * Qué muro se elige: el que señala `offset` en house.config.ts (dirección preferida); si ahí no hay un tramo libre,
 * el muro libre más lejano (el equipo queda a la vista y «sopla» hacia la habitación).
 */
import * as THREE from 'three'

export interface WallMount {
  /** Centro del equipo, separado del muro la mitad de su fondo */
  position: THREE.Vector3
  /** Giro en Y para que el frente (+Z local) mire hacia la habitación */
  rotationY: number
}

interface Size {
  width: number
  height: number
  depth: number
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const SLIDES = [0, 1, -1, 2, -2, 3, -3]
const MAX_DIST = 16
const SAME_WALL = 0.35 // diferencia máxima entre rayos para considerar que es un mismo muro plano
const GAP = 0.04 // separación visible entre el equipo y el muro

export function mountOnWall(
  center: THREE.Vector3,
  y: number,
  preferred: [number, number],
  walls: THREE.Object3D[],
  blockers: THREE.Object3D[],
  size: Size,
): WallMount | null {
  const rc = new THREE.Raycaster()
  rc.far = MAX_DIST
  const origin = new THREE.Vector3()

  /** Distancia al muro desde `o` en `dir`, o null si antes hay una ventana o una puerta (o no hay muro) */
  const wallAt = (o: THREE.Vector3, dir: THREE.Vector3) => {
    rc.set(o, dir)
    const w = rc.intersectObjects(walls, false)[0]
    if (!w) return null
    const blocked = rc.intersectObjects(blockers, true).some((h) => h.distance < w.distance + 0.25)
    return blocked ? null : w.distance
  }

  /** Busca un tramo libre del muro en la dirección (dx, dz); devuelve la distancia y el desplazamiento lateral */
  const tryDir = (dx: number, dz: number) => {
    const dir = new THREE.Vector3(dx, 0, dz)
    const lat = new THREE.Vector3(-dz, 0, dx)
    const half = size.width / 2 + 0.1
    for (const s0 of SLIDES) {
      // El desplazamiento no puede atravesar un muro de la propia habitación
      if (s0 !== 0) {
        origin.set(center.x, y, center.z)
        rc.set(origin, lat.clone().multiplyScalar(Math.sign(s0)))
        const side = rc.intersectObjects(walls, false)[0]
        if (side && side.distance < Math.abs(s0) + half) continue
      }
      const ds: number[] = []
      for (const s of [-half, 0, half]) {
        for (const dy of [-size.height / 2, size.height / 2]) {
          origin.set(center.x, y + dy, center.z).addScaledVector(lat, s0 + s)
          const d = wallAt(origin, dir)
          if (d !== null) ds.push(d)
        }
      }
      if (ds.length < 6 || Math.max(...ds) - Math.min(...ds) > SAME_WALL) continue
      return { dir, lat, s0, d: Math.min(...ds) }
    }
    return null
  }

  const found = DIRS.map(([dx, dz]) => tryDir(dx, dz)).filter((f): f is NonNullable<typeof f> => !!f)
  if (!found.length) return null
  const [px, pz] = preferred
  const want = found.find((f) => f.dir.x * px + f.dir.z * pz > 0.7 * Math.hypot(px, pz))
  const pick = want ?? found.reduce((a, b) => (b.d > a.d ? b : a))

  const position = new THREE.Vector3(center.x, y, center.z)
    .addScaledVector(pick.lat, pick.s0)
    .addScaledVector(pick.dir, pick.d - size.depth / 2 - GAP)
  // El frente del equipo (+Z local) mira hacia el centro de la habitación, opuesto al muro
  const rotationY = Math.atan2(-pick.dir.x, -pick.dir.z)
  return { position, rotationY }
}
