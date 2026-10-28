/**
 * Recorrido en primera persona: la camara entra a la casa y se mueve como una persona.
 *
 *   W A S D o flechas = caminar · arrastrar con el mouse = mirar · Shift = correr · E = abrir/cerrar la puerta que miras · Esc = salir
 *
 * Todo sale del modelo que ya existe (sin tocar Blender):
 *   - Las paredes y los muebles frenan a la persona (ver floorplan.ts y collider.ts).
 *   - Las puertas cerradas tambien frenan; abiertas se puede pasar. Se abren desde el panel, con la tecla E o con un clic.
 *   - Las luces y las puertas siguen siendo las de siempre: el panel de la derecha las controla mientras caminas.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DOORS, LIGHTS, ROOMS, VIEW } from '../config/house.config'
import { commands } from '../hooks/useTelemetry'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import { Collider, makeSnapper } from './collider'
import type { DoorRigs } from './doors'
import { buildFloorplan } from './floorplan'
import type { Markers } from './markers'
import { roomCenter } from './roomPositions'
import { walkState } from './walkState'

const EYE = 3.6 // altura de los ojos sobre el piso (unas 1,6 m: la puerta mide 4,7 y una persona cabe de sobra)
const RADIUS = 0.6 // "grosor" de la persona (la puerta mas angosta mide 2,5)
const SPEED = 7
const RUN_SPEED = 13
const FOV_WALK = 70
const NEAR_WALK = 0.1
const MAX_FROM_HOUSE = 75 // mas lejos que esto no se puede ir
const LOOK_SPEED = 0.0045 // radianes por pixel al arrastrar
const TURN_SPEED = 1.9 // radianes por segundo con las flechas
const SPAWN = { x: 27.5, z: -13.5, yaw: Math.PI / 2 } // dentro, junto a la puerta de entrada, mirando hacia la casa

type Keys = Record<'forward' | 'back' | 'left' | 'right' | 'turnLeft' | 'turnRight' | 'run', boolean>
const NO_KEYS: Keys = { forward: false, back: false, left: false, right: false, turnLeft: false, turnRight: false, run: false }

const KEY_MAP: Record<string, keyof Keys> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ArrowLeft: 'turnLeft',
  ArrowRight: 'turnRight',
  ShiftLeft: 'run',
  ShiftRight: 'run',
}

/** ¿El foco esta en algo donde se escribe? Entonces las teclas no son para caminar. */
function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (!t) return false
  if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true
  if (t.tagName !== 'INPUT') return false
  const type = (t as HTMLInputElement).type
  // En un deslizador (hora, brillo, intensidad) las flechas lo mueven a el; las letras si sirven para caminar
  return type !== 'range' && type !== 'checkbox' && type !== 'radio' && type !== 'button'
}

interface OrbitLike {
  target: THREE.Vector3
  update: () => void
}

export function WalkMode({ scene, rigs, markers }: { scene: THREE.Object3D; rigs: DoorRigs; markers: Markers }) {
  const walking = useUiStore((s) => s.walking)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null

  /* ── Datos fijos de la casa (se calculan una vez por modelo) ── */
  const plan = useMemo(() => buildFloorplan(scene), [scene])
  const collider = useMemo(() => new Collider(plan.collisionSegs), [plan])
  const snap = useMemo(() => makeSnapper(collider, plan.bounds, SPAWN, RADIUS), [collider, plan])
  const centers = useMemo(
    () =>
      ROOMS.map((r) => {
        const c = roomCenter(r.id, markers)
        return c ? { id: r.id, x: c.x, z: c.z } : null
      }).filter((c): c is { id: string; x: number; z: number } => !!c),
    [markers],
  )
  const leaves = useMemo(
    () =>
      [...rigs.values()].map((rig) => {
        const mesh = rig.leaf
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        const bb = mesh.geometry.boundingBox!
        // Las 4 esquinas de abajo de la hoja (en su propio sistema); con el pivote se mueven al abrir
        const corners = [
          new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z),
          new THREE.Vector3(bb.max.x, bb.min.y, bb.min.z),
          new THREE.Vector3(bb.max.x, bb.min.y, bb.max.z),
          new THREE.Vector3(bb.min.x, bb.min.y, bb.max.z),
        ]
        return { rig, mesh, corners }
      }),
    [rigs],
  )
  const leafMeshes = useMemo(() => leaves.map((l) => l.mesh), [leaves])
  const doorSegs = useMemo(() => new Float32Array(leaves.length * 16), [leaves])

  useEffect(() => {
    walkState.plan = plan
    walkState.lights = LIGHTS.map((l) => {
      const p = markers.get(l.id)
      return p ? { id: l.id, x: p.x, z: p.z } : null
    }).filter((l): l is { id: string; x: number; z: number } => !!l)
    walkState.doors = leaves.map((l) => ({ id: l.rig.def.id, pts: [0, 0, 0, 0, 0, 0, 0, 0] }))
  }, [plan, markers, leaves])

  /* ── Estado de la persona ── */
  const me = useRef({ x: SPAWN.x, z: SPAWN.z, yaw: SPAWN.yaw, pitch: 0, vx: 0, vz: 0, placed: false })
  const keys = useRef<Keys>({ ...NO_KEYS })
  const saved = useRef<{ pos: THREE.Vector3; quat: THREE.Quaternion; fov: number; near: number; target: THREE.Vector3 | null } | null>(null)
  const trans = useRef<{ t: number; pos: THREE.Vector3; quat: THREE.Quaternion; fov: number } | null>(null)
  const walkingRef = useRef(false)
  walkingRef.current = walking
  const tick = useRef(0)
  const hintId = useRef<string | null>(null)
  const tmp = useMemo(
    () => ({ v: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(0, 0, 0, 'YXZ'), ray: new THREE.Raycaster(), c: new THREE.Vector2(0, 0) }),
    [],
  )

  /** Actualiza las hojas de las puertas: donde estan ahora (para chocar y para el mini-mapa) */
  const updateDoors = () => {
    leaves.forEach((l, i) => {
      l.mesh.updateWorldMatrix(true, false)
      const shape = walkState.doors[i]
      if (!shape) return
      for (let k = 0; k < 4; k++) {
        tmp.v.copy(l.corners[k]).applyMatrix4(l.mesh.matrixWorld)
        shape.pts[k * 2] = tmp.v.x
        shape.pts[k * 2 + 1] = tmp.v.z
      }
      // El porton del garaje, una vez levantado, deja pasar
      const passable = l.rig.def.kind === 'slide' && l.rig.value > 0.7
      for (let k = 0; k < 4; k++) {
        const n = (k + 1) % 4
        const o = i * 16 + k * 4
        doorSegs[o] = passable ? 0 : shape.pts[k * 2]
        doorSegs[o + 1] = passable ? 0 : shape.pts[k * 2 + 1]
        doorSegs[o + 2] = passable ? 0 : shape.pts[n * 2]
        doorSegs[o + 3] = passable ? 0 : shape.pts[n * 2 + 1]
      }
    })
  }

  /** Pone a la persona en (x, z) (o en el lugar libre mas cercano al que se puede llegar) */
  const place = (x: number, z: number) => {
    updateDoors()
    const s = snap(x, z)
    const p = collider.nearestFree(s.x, s.z, RADIUS, doorSegs)
    me.current.x = p.x
    me.current.z = p.z
    me.current.vx = 0
    me.current.vz = 0
  }

  /* ── Entrar y salir del recorrido ── */
  useEffect(() => {
    if (!walking) return
    const el = gl.domElement
    const m = me.current

    saved.current = {
      pos: camera.position.clone(),
      quat: camera.quaternion.clone(),
      fov: camera.fov,
      near: camera.near,
      target: controls ? controls.target.clone() : null,
    }
    trans.current = { t: 0, pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov }
    camera.near = NEAR_WALK
    camera.updateProjectionMatrix()
    if (!m.placed) {
      m.placed = true
      m.yaw = SPAWN.yaw
      m.pitch = 0
      place(SPAWN.x, SPAWN.z)
    } else {
      place(m.x, m.z)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'Escape') {
        useUiStore.getState().setWalking(false)
        return
      }
      if (typing(e)) return
      const k = KEY_MAP[e.code]
      if (k) {
        keys.current[k] = true
        if (e.code.startsWith('Arrow')) e.preventDefault() // que la pagina no se desplace
      } else if (e.code === 'KeyE' && !e.repeat && hintId.current) {
        const id = hintId.current
        commands.setDoor(id, !useHouseStore.getState().doors[id]?.open)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const k = KEY_MAP[e.code]
      if (k) keys.current[k] = false
    }
    const onBlur = () => {
      keys.current = { ...NO_KEYS }
    }

    // Arrastrar para mirar (el cursor queda libre: asi el panel de la derecha se usa con el mouse mientras caminas)
    let dragging = false
    let lx = 0
    let ly = 0
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      dragging = true
      lx = e.clientX
      ly = e.clientY
      el.setPointerCapture?.(e.pointerId)
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      m.yaw -= (e.clientX - lx) * LOOK_SPEED
      m.pitch = THREE.MathUtils.clamp(m.pitch - (e.clientY - ly) * LOOK_SPEED, -1.3, 1.3)
      lx = e.clientX
      ly = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      el.releasePointerCapture?.(e.pointerId)
      el.style.cursor = 'grab'
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.style.touchAction = 'none'
    el.style.cursor = 'grab'

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.style.touchAction = ''
      el.style.cursor = ''
      keys.current = { ...NO_KEYS }
      hintId.current = null
      trans.current = null

      // Vuelve a la vista de afuera donde estaba
      const s = saved.current
      if (s) {
        camera.position.copy(s.pos)
        camera.quaternion.copy(s.quat)
        camera.fov = s.fov
        camera.near = s.near
        camera.updateProjectionMatrix()
        if (controls && s.target) {
          controls.target.copy(s.target)
          controls.update()
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walking])

  /* ── "Llévame a…" (chips de habitaciones y clic en el mini-mapa) ── */
  const request = useUiStore((s) => s.walkRequest)
  useEffect(() => {
    if (request.nonce === 0 || !walkingRef.current) return
    if (request.roomId) {
      const c = centers.find((r) => r.id === request.roomId)
      if (c) {
        // Aparece en el lugar mas despejado de la habitacion y mirando hacia donde hay mas espacio (no pegado a un mueble)
        updateDoors()
        const s = snap(c.x, c.z)
        const inRoom = (px: number, pz: number) => {
          let near = c
          let d2 = (c.x - px) ** 2 + (c.z - pz) ** 2
          for (const o of centers) {
            const d = (o.x - px) ** 2 + (o.z - pz) ** 2
            if (d < d2) {
              d2 = d
              near = o
            }
          }
          return near === c
        }
        const spot = collider.roomiest(s.x, s.z, RADIUS, doorSegs, inRoom)
        place(spot.x, spot.z)
        let bestRun = -1
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2
          const run = collider.freeRun(me.current.x, me.current.z, -Math.sin(a), -Math.cos(a), RADIUS, 12, doorSegs)
          if (run > bestRun + 0.01) {
            bestRun = run
            me.current.yaw = a
          }
        }
        me.current.pitch = 0
      }
    } else if (request.x !== undefined && request.z !== undefined) {
      place(request.x, request.z)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  /* ── Cada cuadro: mover, chocar y poner la camara ── */
  useFrame((_, dtRaw) => {
    if (!walkingRef.current) return
    const dt = Math.min(dtRaw, 0.05)
    const m = me.current
    const k = keys.current
    const busy = !!trans.current // durante la entrada la camara viaja sola

    if (!busy) {
      m.yaw += ((k.turnLeft ? 1 : 0) - (k.turnRight ? 1 : 0)) * TURN_SPEED * dt
      const fwd = (k.forward ? 1 : 0) - (k.back ? 1 : 0)
      const str = (k.right ? 1 : 0) - (k.left ? 1 : 0)
      const len = Math.hypot(fwd, str) || 1
      const speed = k.run ? RUN_SPEED : SPEED
      const sin = Math.sin(m.yaw)
      const cos = Math.cos(m.yaw)
      // adelante = (-sin, -cos) · derecha = (cos, -sin)
      const tx = ((-sin * fwd + cos * str) / len) * speed
      const tz = ((-cos * fwd - sin * str) / len) * speed
      const f = 1 - Math.exp(-12 * dt)
      m.vx += (tx - m.vx) * f
      m.vz += (tz - m.vz) * f

      updateDoors()
      const dist = Math.hypot(m.vx, m.vz) * dt
      const steps = Math.max(1, Math.ceil(dist / 0.25))
      const p = { x: m.x, z: m.z }
      for (let i = 0; i < steps; i++) {
        p.x += (m.vx * dt) / steps
        p.z += (m.vz * dt) / steps
        collider.resolve(p, RADIUS, doorSegs)
      }
      // Lejos de la casa no se puede ir
      const dx = p.x - VIEW.target[0]
      const dz = p.z - VIEW.target[2]
      const d = Math.hypot(dx, dz)
      if (d > MAX_FROM_HOUSE) {
        p.x = VIEW.target[0] + (dx / d) * MAX_FROM_HOUSE
        p.z = VIEW.target[2] + (dz / d) * MAX_FROM_HOUSE
      }
      m.x = p.x
      m.z = p.z
    } else {
      updateDoors()
    }

    // Camara
    const eyeY = plan.floorY + EYE
    tmp.e.set(m.pitch, m.yaw, 0, 'YXZ')
    tmp.q.setFromEuler(tmp.e)
    const tr = trans.current
    if (tr) {
      tr.t = Math.min(1, tr.t + Math.min(dtRaw, 0.5) / 0.9) // el viaje dura ~1 s de reloj aunque la pantalla vaya lenta
      const e = tr.t * tr.t * (3 - 2 * tr.t)
      camera.position.lerpVectors(tr.pos, tmp.v.set(m.x, eyeY, m.z), e)
      camera.quaternion.slerpQuaternions(tr.quat, tmp.q, e)
      camera.fov = THREE.MathUtils.lerp(tr.fov, FOV_WALK, e)
      camera.updateProjectionMatrix()
      if (tr.t >= 1) trans.current = null
    } else {
      camera.position.set(m.x, eyeY, m.z)
      camera.quaternion.copy(tmp.q)
      if (camera.fov !== FOV_WALK) {
        camera.fov = FOV_WALK
        camera.updateProjectionMatrix()
      }
    }

    walkState.x = m.x
    walkState.z = m.z
    walkState.yaw = m.yaw

    // Habitacion y puerta al frente: unas 8 veces por segundo
    tick.current += dt
    if (tick.current < 0.12) return
    tick.current = 0

    const ui = useUiStore.getState()
    const inside = plan.floors.some((f) => m.x >= f.minX && m.x <= f.maxX && m.z >= f.minZ && m.z <= f.maxZ)
    let room: string = 'exterior'
    if (inside) {
      let best = Infinity
      for (const c of centers) {
        const d2 = (c.x - m.x) ** 2 + (c.z - m.z) ** 2
        if (d2 < best) {
          best = d2
          room = c.id
        }
      }
    }
    if (ui.walkRoom !== room) ui.setWalkRoom(room)

    let found: string | null = null
    if (!trans.current) {
      tmp.ray.setFromCamera(tmp.c, camera)
      tmp.ray.far = 9
      const hit = tmp.ray.intersectObjects(leafMeshes, false)[0]
      if (hit) found = hit.object.userData.doorId as string
      if (!found) {
        // Si no apuntas justo a la hoja, sirve la puerta cercana que tienes mas o menos al frente
        let near = 5
        const fx = -Math.sin(m.yaw)
        const fz = -Math.cos(m.yaw)
        walkState.doors.forEach((dr) => {
          const cx = (dr.pts[0] + dr.pts[2] + dr.pts[4] + dr.pts[6]) / 4
          const cz = (dr.pts[1] + dr.pts[3] + dr.pts[5] + dr.pts[7]) / 4
          const d = Math.hypot(cx - m.x, cz - m.z)
          if (d < near && ((cx - m.x) * fx + (cz - m.z) * fz) / (d || 1) > 0.5) {
            near = d
            found = dr.id
          }
        })
      }
    }
    if (found !== hintId.current) {
      hintId.current = found
      const def = found ? DOORS.find((d) => d.id === found) : undefined
      ui.setWalkHint(found && def ? { id: found, label: def.label } : null)
    }
  })

  return null
}
