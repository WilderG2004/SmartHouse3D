/**
 * Choques para caminar: la persona es un circulo (visto desde arriba) y las paredes son segmentos de recta.
 * Si el circulo toca un segmento, se empuja hacia afuera; por eso al caminar en diagonal contra una pared
 * "resbalas" a lo largo de ella en vez de quedarte pegado.
 *
 * Los segmentos fijos (paredes, muebles) se guardan en una cuadricula para no revisar todos en cada paso.
 * Los segmentos que cambian (las hojas de las puertas) se pasan aparte en cada llamada.
 */

const CELL = 4

export class Collider {
  private readonly segs: Float32Array
  private readonly grid = new Map<number, number[]>()
  private readonly seen: Int32Array
  private stamp = 0

  constructor(segs: Float32Array) {
    this.segs = segs
    this.seen = new Int32Array(segs.length / 4)
    for (let i = 0; i < segs.length; i += 4) {
      const x0 = Math.floor(Math.min(segs[i], segs[i + 2]) / CELL)
      const x1 = Math.floor(Math.max(segs[i], segs[i + 2]) / CELL)
      const z0 = Math.floor(Math.min(segs[i + 1], segs[i + 3]) / CELL)
      const z1 = Math.floor(Math.max(segs[i + 1], segs[i + 3]) / CELL)
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const key = this.key(cx, cz)
          const list = this.grid.get(key)
          if (list) list.push(i / 4)
          else this.grid.set(key, [i / 4])
        }
      }
    }
  }

  private key(cx: number, cz: number) {
    return (cx + 4096) * 8192 + (cz + 4096)
  }

  /** Empuja (x, z) fuera de los segmentos que toca un circulo de radio `r`. `extra` = segmentos que se mueven. */
  resolve(p: { x: number; z: number }, r: number, extra?: ArrayLike<number>) {
    for (let pass = 0; pass < 6; pass++) {
      let pushed = false
      this.stamp++
      const x0 = Math.floor((p.x - r) / CELL)
      const x1 = Math.floor((p.x + r) / CELL)
      const z0 = Math.floor((p.z - r) / CELL)
      const z1 = Math.floor((p.z + r) / CELL)
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const list = this.grid.get(this.key(cx, cz))
          if (!list) continue
          for (const id of list) {
            if (this.seen[id] === this.stamp) continue
            this.seen[id] = this.stamp
            const i = id * 4
            if (pushOut(p, this.segs[i], this.segs[i + 1], this.segs[i + 2], this.segs[i + 3], r)) pushed = true
          }
        }
      }
      if (extra) {
        for (let i = 0; i + 3 < extra.length; i += 4) {
          if (pushOut(p, extra[i], extra[i + 1], extra[i + 2], extra[i + 3], r)) pushed = true
        }
      }
      if (!pushed) return
    }
  }

  /** true si un circulo de radio `r` en (x, z) no toca nada */
  isFree(x: number, z: number, r: number, extra?: ArrayLike<number>) {
    const p = { x, z }
    this.resolve(p, r, extra)
    return Math.abs(p.x - x) < 1e-6 && Math.abs(p.z - z) < 1e-6
  }

  /** Cuanto se puede avanzar en linea recta desde (x, z) hacia (dx, dz) sin chocar (hasta `max`). */
  freeRun(x: number, z: number, dx: number, dz: number, r: number, max: number, extra?: ArrayLike<number>) {
    const STEP = 0.5
    let d = 0
    while (d + STEP <= max && this.isFree(x + dx * (d + STEP), z + dz * (d + STEP), r, extra)) d += STEP
    return d
  }

  /**
   * El punto con mas espacio libre alrededor, cerca de (x, z). Sirve para "Ir a la cocina": el centro de la habitacion a
   * veces queda pegado a un mueble, y es mejor aparecer en un lugar despejado. `ok` descarta puntos (por ejemplo, los de otra habitacion).
   */
  roomiest(x: number, z: number, r: number, extra?: ArrayLike<number>, ok?: (x: number, z: number) => boolean) {
    const RINGS = [1.0, 1.6, 2.2, 2.8]
    let best = { x, z }
    let bestScore = -Infinity
    for (let ix = -5; ix <= 5; ix++) {
      for (let iz = -5; iz <= 5; iz++) {
        const px = x + ix * 0.7
        const pz = z + iz * 0.7
        if (ok && !ok(px, pz)) continue
        if (!this.isFree(px, pz, r, extra)) continue
        let clear = r
        for (const rr of RINGS) {
          if (!this.isFree(px, pz, rr, extra)) break
          clear = rr
        }
        const score = clear - 0.12 * Math.hypot(px - x, pz - z)
        if (score > bestScore) {
          bestScore = score
          best = { x: px, z: pz }
        }
      }
    }
    return best
  }

  /** El lugar libre mas cercano a (x, z), buscando en circulos cada vez mas grandes. */
  nearestFree(x: number, z: number, r: number, extra?: ArrayLike<number>) {
    if (this.isFree(x, z, r, extra)) return { x, z }
    for (let ring = 1; ring <= 40; ring++) {
      const d = ring * 0.5
      const steps = Math.max(8, Math.round(ring * 6))
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2
        const px = x + Math.cos(a) * d
        const pz = z + Math.sin(a) * d
        if (this.isFree(px, pz, r, extra)) return { x: px, z: pz }
      }
    }
    return { x, z }
  }
}

function pushOut(p: { x: number; z: number }, ax: number, az: number, bx: number, bz: number, r: number) {
  const abx = bx - ax
  const abz = bz - az
  const len2 = abx * abx + abz * abz
  if (len2 < 1e-12) return false
  let t = ((p.x - ax) * abx + (p.z - az) * abz) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const dx = p.x - (ax + abx * t)
  const dz = p.z - (az + abz * t)
  const d2 = dx * dx + dz * dz
  if (d2 >= r * r) return false
  const d = Math.sqrt(d2)
  if (d < 1e-6) {
    // Justo encima del segmento: se empuja hacia un lado
    const len = Math.sqrt(len2)
    p.x += (-abz / len) * r
    p.z += (abx / len) * r
  } else {
    const k = (r - d) / d
    p.x += dx * k
    p.z += dz * k
  }
  return true
}

/**
 * Mapa de "por donde se puede llegar caminando desde `start`" (sin contar las hojas de las puertas, que se abren).
 * Devuelve una funcion que lleva cualquier punto al lugar alcanzable mas cercano: asi "ir a la cocina" nunca te deja
 * metido dentro de un mueble ni en un rincon al que no se puede llegar.
 */
export function makeSnapper(
  collider: Collider,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  start: { x: number; z: number },
  r: number,
) {
  const STEP = 0.5
  const x0 = bounds.minX - 8
  const z0 = bounds.minZ - 8
  const W = Math.ceil((bounds.maxX - bounds.minX + 16) / STEP)
  const H = Math.ceil((bounds.maxZ - bounds.minZ + 16) / STEP)
  const seen = new Uint8Array(W * H)
  const cellX = (x: number) => Math.round((x - x0) / STEP)
  const cellZ = (z: number) => Math.round((z - z0) / STEP)

  const s = collider.nearestFree(start.x, start.z, r)
  const stack: number[] = [cellX(s.x) + cellZ(s.z) * W]
  seen[stack[0]] = 1
  while (stack.length) {
    const c = stack.pop()!
    const i = c % W
    const j = (c - i) / W
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue
      const n = ni + nj * W
      if (seen[n]) continue
      if (!collider.isFree(x0 + ni * STEP, z0 + nj * STEP, r)) continue
      seen[n] = 1
      stack.push(n)
    }
  }

  const reachable = (x: number, z: number) => {
    const i = cellX(x)
    const j = cellZ(z)
    return i >= 0 && j >= 0 && i < W && j < H && seen[i + j * W] === 1
  }

  return (x: number, z: number) => {
    if (reachable(x, z) && collider.isFree(x, z, r)) return { x, z }
    for (let ring = 1; ring <= 60; ring++) {
      const d = ring * STEP
      const steps = Math.max(8, ring * 6)
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2
        const px = x + Math.cos(a) * d
        const pz = z + Math.sin(a) * d
        if (reachable(px, pz)) return { x: px, z: pz }
      }
    }
    return { x, z }
  }
}
