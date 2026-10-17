/**
 * Marcadores 3D + etiquetas flotantes (<Html> de drei) de los sensores.
 * Las etiquetas son de tamaño fijo en pantalla (sin distanceFactor) para que
 * siempre se lean, y se pueden ocultar desde la barra del visor.
 */
import { useFrame } from '@react-three/fiber'
import { DoorClosed, DoorOpen, Flame, Radar, Zap } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { DOORS, METER, PIRS, SMOKE, type PirDef } from '../config/house.config'
import { fmtNumber } from '../lib/format'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import type { Markers } from './markers'
import { NearHtml } from './NearHtml'

type Vec = THREE.Vector3

const LABEL_LIFT: [number, number, number] = [0, 1.7, 0]

function Label({ children, show }: { children: ReactNode; show: boolean }) {
  if (!show) return null
  return (
    <NearHtml position={LABEL_LIFT} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      {children}
    </NearHtml>
  )
}

/** Etiqueta base (ver .tag3d en index.css): pastilla blanca con sombra suave. Las variantes solo cambian color. */
const pill = 'tag3d'

/* ───────────────────────────── Humo ───────────────────────────── */

function SmokeSensor({ position, showLabel }: { position: Vec; showLabel: boolean }) {
  const { ppm, alarm } = useHouseStore((s) => s.smoke)
  const haloRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const halo = haloRef.current
    if (!halo) return
    halo.visible = alarm
    if (alarm) halo.scale.setScalar(2.2 + Math.sin(clock.elapsedTime * 6) * 0.9)
  })

  return (
    <group position={position}>
      <mesh>
        <octahedronGeometry args={[0.6]} />
        <meshBasicMaterial color={alarm ? '#d9382c' : '#2fa56f'} toneMapped={false} />
      </mesh>
      {/* Halo de alarma (efecto, no parte de la casa) */}
      <mesh ref={haloRef} visible={false}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial color="#ff2a2a" transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>
      <Label show={showLabel}>
        <div
          className={`${pill} ${
            alarm ? 'alarm-pulse border-bad bg-bad text-white' : ''
          }`}
        >
          <Flame size={14} className={alarm ? 'text-white' : 'text-ok-strong'} />
          <span>{fmtNumber(ppm)} ppm</span>
          <span className={alarm ? 'text-white' : 'text-ok-strong'}>{alarm ? 'Crítico' : 'Normal'}</span>
        </div>
      </Label>
    </group>
  )
}

/* ───────────────────────────── PIR ───────────────────────────── */

function PirSensor({ def, position, showLabel }: { def: PirDef; position: Vec; showLabel: boolean }) {
  const motion = useHouseStore((s) => s.pir[def.id]?.motion ?? false)
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    meshRef.current?.scale.setScalar(motion ? 1.3 + Math.sin(clock.elapsedTime * 8) * 0.25 : 1)
  })

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <octahedronGeometry args={[0.5]} />
        <meshBasicMaterial color={motion ? '#2b9bd6' : '#9fb0aa'} toneMapped={false} />
      </mesh>
      <Label show={showLabel}>
        {def.primary ? (
          <div className={`${pill} ${motion ? 'border-cool-strong bg-cool-strong text-white' : ''}`}>
            <Radar size={14} className={motion ? '' : 'text-mute'} />
            {motion ? 'Movimiento detectado' : 'Sin movimiento'}
          </div>
        ) : (
          <div
            className={`${pill} !px-2 ${motion ? 'border-cool-strong bg-cool-strong text-white' : 'text-mute'}`}
            title={def.label}
          >
            <Radar size={14} />
            {motion && 'Movimiento'}
          </div>
        )}
      </Label>
    </group>
  )
}

/* ───────────────────────────── Puertas ───────────────────────────── */

function DoorSensor({ id, position, showLabel }: { id: string; position: Vec; showLabel: boolean }) {
  const open = useHouseStore((s) => s.doors[id]?.open ?? false)
  return (
    <group position={position}>
      <mesh>
        <octahedronGeometry args={[0.5]} />
        <meshBasicMaterial color={open ? '#f4a21d' : '#9fb0aa'} toneMapped={false} />
      </mesh>
      <Label show={showLabel}>
        <div className={`${pill} ${open ? 'border-warm bg-warm-soft text-warm-strong' : '!px-2 text-mute'}`}>
          {open ? <DoorOpen size={14} /> : <DoorClosed size={14} />}
          {open && 'Abierta'}
        </div>
      </Label>
    </group>
  )
}

/* ───────────────────────────── Medidor ───────────────────────────── */

function Meter({ position, showLabel }: { position: Vec; showLabel: boolean }) {
  const watts = useHouseStore((s) => s.power.watts)
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshBasicMaterial color="#f4a21d" toneMapped={false} />
      </mesh>
      <Label show={showLabel}>
        <div className={pill}>
          <Zap size={14} className="text-warm-strong" />
          {fmtNumber(watts)} W
        </div>
      </Label>
    </group>
  )
}

/* ───────────────────────────── Capa completa ───────────────────────────── */

export function SensorLayer({ markers }: { markers: Markers }) {
  const showLabels = useUiStore((s) => s.layers.sensors)
  const smokePos = markers.get(SMOKE.id)
  const meterPos = markers.get(METER.id)

  return (
    <>
      {smokePos && <SmokeSensor position={smokePos} showLabel={showLabels} />}
      {meterPos && <Meter position={meterPos} showLabel={showLabels} />}
      {PIRS.map((def) => {
        const pos = markers.get(def.id)
        return pos ? <PirSensor key={def.id} def={def} position={pos} showLabel={showLabels} /> : null
      })}
      {DOORS.map((def) => {
        const pos = markers.get(def.id)
        return pos ? <DoorSensor key={def.id} id={def.id} position={pos} showLabel={showLabels} /> : null
      })}
    </>
  )
}
