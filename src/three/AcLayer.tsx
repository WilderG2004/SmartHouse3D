/**
 * Unidades de aire acondicionado: equipo 3D clicable, rendija que cambia de color,
 * partículas de aire frío cuando el compresor trabaja y etiqueta con la consigna.
 * Cada equipo va montado contra un muro real de su habitación (wallMount.ts), mirando hacia dentro.
 */
import { useFrame } from '@react-three/fiber'
import { Fan, Snowflake } from 'lucide-react'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { AIR_CONDITIONERS, DEVICE_Y, type AcDef } from '../config/house.config'
import { commands } from '../hooks/useTelemetry'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import type { Markers } from './markers'
import type { HouseMaterials } from './materials'
import { NearHtml } from './NearHtml'
import { deviceAnchor, roomCenter } from './roomPositions'
import { mountOnWall, type WallMount } from './wallMount'

const N = 26
const DROP = 4.2
/** Medidas del equipo (unidades del modelo): ancho, alto y fondo de la caja */
const AC_SIZE = { width: 2.4, height: 0.8, depth: 0.8 }

/** Dónde va cada equipo: su marca en el .glb si existe; si no, contra un muro de su habitación; si no hay muro libre, junto al centro */
function placeAc(def: AcDef, markers: Markers, house: HouseMaterials): WallMount | null {
  if (markers.has(def.id)) return { position: markers.get(def.id)!.clone(), rotationY: 0 }
  const center = (def.anchor && markers.get(def.anchor)?.clone()) || roomCenter(def.room, markers)
  const walls = house.meshesByCollection.get('paredes') ?? []
  // Ventanas, puertas y muebles altos (un armario contra el muro): el equipo no se monta delante de ellos
  const blockers = [...house.meshesByCollection].filter(([id]) => id !== 'paredes' && id !== 'piso').flatMap(([, meshes]) => meshes)
  const mount = center && walls.length ? mountOnWall(center, DEVICE_Y.ac, def.offset, walls, blockers, AC_SIZE) : null
  if (mount) return mount
  const pos = deviceAnchor(markers, def, DEVICE_Y.ac)
  return pos ? { position: pos, rotationY: 0 } : null
}

function AcUnit({ def, mount }: { def: AcDef; mount: WallMount }) {
  const visible = useUiStore((s) => s.layers.ac)
  const ac = useHouseStore((s) => s.acs[def.id])
  const slit = useRef<THREE.MeshBasicMaterial>(null)
  const points = useRef<THREE.Points>(null)

  const { geometry, speeds } = useMemo(() => {
    const pos = new Float32Array(N * 3)
    const speeds = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 2
      pos[i * 3 + 1] = -Math.random() * DROP
      pos[i * 3 + 2] = Math.random() * 0.8
      speeds[i] = 0.9 + Math.random() * 0.9
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geometry: g, speeds }
  }, [])

  useFrame(({ clock }, dt) => {
    const st = useHouseStore.getState().acs[def.id]
    if (!st) return
    if (slit.current) {
      if (st.running) slit.current.color.set('#2bb3ea').multiplyScalar(0.8 + 0.2 * Math.sin(clock.elapsedTime * 6))
      else slit.current.color.set(st.on ? '#2fa56f' : '#6e7f7a')
    }
    const pts = points.current
    if (!pts) return
    pts.visible = st.running
    if (!st.running) return
    const arr = pts.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < N; i++) {
      let y = arr.getY(i) - speeds[i] * dt * (st.fan === 'high' ? 1.5 : st.fan === 'low' ? 0.8 : 1.1)
      if (y < -DROP) {
        y = -0.5
        arr.setX(i, (Math.random() - 0.5) * 2)
      }
      arr.setY(i, y)
    }
    arr.needsUpdate = true
  })

  if (!ac) return null
  const toggle = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    commands.setAc(def.id, { on: !useHouseStore.getState().acs[def.id]?.on })
  }

  return (
    <group position={mount.position} rotation-y={mount.rotationY} visible={visible}>
      <mesh
        onClick={toggle}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[AC_SIZE.width, AC_SIZE.height, AC_SIZE.depth]} />
        <meshBasicMaterial color={ac.on ? '#ffffff' : '#b4c0bd'} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.28, 0.41]}>
        <boxGeometry args={[2.0, 0.12, 0.05]} />
        <meshBasicMaterial ref={slit} color="#6e7f7a" toneMapped={false} />
      </mesh>
      <points ref={points} geometry={geometry} visible={false}>
        <pointsMaterial color="#6fcdf2" size={0.5} sizeAttenuation transparent opacity={0.85} depthWrite={false} />
      </points>
      {visible && (
        <NearHtml position={[0, 1.1, 0]} center zIndexRange={[19, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`tag3d ${ac.on ? '!border-cool' : '!px-2 text-mute'}`}
          >
            {ac.mode === 'fan' ? (
              <Fan size={13} className={ac.on ? 'text-ok-strong' : ''} />
            ) : (
              <Snowflake size={13} className={ac.on ? 'text-cool-strong' : ''} />
            )}
            {ac.on && (
              <>
                {ac.mode === 'cool' ? `${ac.setpoint}°` : 'Ventilador'}
                {ac.running && <span className="text-cool-strong">· enfriando</span>}
              </>
            )}
          </div>
        </NearHtml>
      )}
    </group>
  )
}

export function AcLayer({ markers, house }: { markers: Markers; house: HouseMaterials }) {
  // Se calcula una vez por modelo (rayos contra los muros): no depende del estado de los aires
  const mounts = useMemo(() => new Map(AIR_CONDITIONERS.map((def) => [def.id, placeAc(def, markers, house)])), [markers, house])
  // Vista pública: un aire encendido delata a la persona (el servidor ni siquiera manda su estado)
  const restricted = useHouseStore((s) => s.restricted)
  if (restricted) return null
  return (
    <>
      {AIR_CONDITIONERS.map((def) => {
        const mount = mounts.get(def.id)
        return mount ? <AcUnit key={def.id} def={def} mount={mount} /> : null
      })}
    </>
  )
}
