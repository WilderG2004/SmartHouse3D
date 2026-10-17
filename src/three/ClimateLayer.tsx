/**
 * Temperatura y humedad por habitación (etiquetas flotantes) + mapa de calor opcional.
 */
import { useFrame } from '@react-three/fiber'
import { Droplets, Sun } from 'lucide-react'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { DEVICE_Y, ROOMS, type RoomDef } from '../config/house.config'
import { comfortLabel, tempColor, tempInk } from '../lib/climate'
import { fmtNumber } from '../lib/format'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import type { Markers } from './markers'
import { NearHtml } from './NearHtml'
import { roomCenter } from './roomPositions'

function RoomLabel({ room, position }: { room: RoomDef; position: THREE.Vector3 }) {
  const c = useHouseStore((s) => s.climate[room.id])
  const selected = useUiStore((s) => s.selectedRoom === room.id)
  if (!c) return null
  const dot = tempColor(c.temperature)
  const ink = tempInk(c.temperature)

  return (
    <NearHtml position={position} center zIndexRange={[18, 0]} style={{ pointerEvents: 'none' }}>
      <div
        title={`${room.label} · ${comfortLabel(c.temperature)}`}
        className={`tag3d ${selected ? '!border-brand ring-2 ring-brand/40' : ''}`}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
        <span style={{ color: ink }}>{fmtNumber(c.temperature, 1)}°</span>
        <span className="flex items-center gap-0.5 font-medium text-mute">
          <Droplets size={11} />
          {c.humidity}%
        </span>
        {c.lux !== undefined && (
          <span className="flex items-center gap-0.5 font-medium text-mute">
            <Sun size={11} />
            {c.lux}
          </span>
        )}
      </div>
    </NearHtml>
  )
}

function makeGlow() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,0.95)')
  gr.addColorStop(0.55, 'rgba(255,255,255,0.4)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

/** Manchas de color sobre el piso: efecto decorativo, no parte de la casa. */
function HeatBlob({ room, position, glow }: { room: RoomDef; position: THREE.Vector3; glow: THREE.Texture }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const col = useMemo(() => new THREE.Color(), [])
  const visible = useUiStore((s) => s.layers.heat)

  useFrame(() => {
    const c = useHouseStore.getState().climate[room.id]
    if (c && mat.current) mat.current.color.copy(col.set(tempColor(c.temperature)))
  })

  return (
    <mesh position={[position.x, 0.45, position.z]} rotation={[-Math.PI / 2, 0, 0]} visible={visible} renderOrder={2}>
      <planeGeometry args={[room.radius * 2, room.radius * 2]} />
      <meshBasicMaterial ref={mat} map={glow} transparent opacity={0.6} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

export function ClimateLayer({ markers }: { markers: Markers }) {
  const showLabels = useUiStore((s) => s.layers.climate)
  const glow = useMemo(makeGlow, [])

  return (
    <>
      {ROOMS.map((room) => {
        const c = roomCenter(room.id, markers)
        if (!c) return null
        return (
          <group key={room.id}>
            <HeatBlob room={room} position={c} glow={glow} />
            {showLabels && <RoomLabel room={room} position={new THREE.Vector3(c.x, DEVICE_Y.climate, c.z)} />}
          </group>
        )
      })}
    </>
  )
}
