/** Enchufes inteligentes: disco clicable + etiqueta con el consumo en vivo. */
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { DEVICE_Y, PLUGS, type PlugDef } from '../config/house.config'
import { commands } from '../hooks/useTelemetry'
import { PLUG_ICONS } from '../lib/icons'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import type { Markers } from './markers'
import { NearHtml } from './NearHtml'
import { deviceAnchor } from './roomPositions'

function PlugNode({ def, position }: { def: PlugDef; position: THREE.Vector3 }) {
  const visible = useUiStore((s) => s.layers.plugs)
  const plug = useHouseStore((s) => s.plugs[def.id])
  const mesh = useRef<THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>>(null)
  const Icon = PLUG_ICONS[def.icon]

  useFrame(({ clock }) => {
    const st = useHouseStore.getState().plugs[def.id]
    const m = mesh.current
    if (!st || !m) return
    m.material.color.set(st.on ? '#2fa56f' : '#9fb0aa')
    m.scale.setScalar(st.on ? 1 + 0.12 * Math.sin(clock.elapsedTime * 4) : 1)
  })

  if (!plug) return null
  const toggle = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    commands.setPlug(def.id, !useHouseStore.getState().plugs[def.id]?.on)
  }

  return (
    <group position={position} visible={visible}>
      <mesh
        ref={mesh}
        onClick={toggle}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <cylinderGeometry args={[0.55, 0.55, 0.3, 24]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>
      {visible && (
        <NearHtml position={[0, 0.9, 0]} center zIndexRange={[17, 0]} style={{ pointerEvents: 'none' }}>
          <div
            className={`tag3d ${plug.on ? '!border-ok' : '!px-2 text-mute'}`}
            title={def.label}
          >
            <Icon size={13} className={plug.on ? 'text-ok-strong' : ''} />
            {plug.on && `${plug.watts} W`}
          </div>
        </NearHtml>
      )}
    </group>
  )
}

export function PlugLayer({ markers }: { markers: Markers }) {
  return (
    <>
      {PLUGS.map((def) => {
        const pos = deviceAnchor(markers, def, DEVICE_Y.plug)
        return pos ? <PlugNode key={def.id} def={def} position={pos} /> : null
      })}
    </>
  )
}
