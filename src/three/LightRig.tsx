/**
 * Un PointLight + plafón con bombillo emisivo y halo por cada Empty "Luz_*".
 *
 * Rendimiento: los PointLight NUNCA se montan/desmontan (cambiar el número de
 * luces obliga a recompilar todos los shaders). Apagar = intensity 0.
 * El estado se lee con getState() dentro de useFrame, sin re-renders de React.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  ALARM_FLASH_HZ,
  LIGHTS,
  LIGHT_DISTANCE,
  LIGHT_INTENSITY_AT_100,
  SMOKE,
  type LightDef,
} from '../config/house.config'
import { commands } from '../hooks/useTelemetry'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'
import type { Markers } from './markers'
import { glowTexture, skyState } from './skyState'

const BULB_OFF = new THREE.Color('#c3cdca')
const ALARM_RED = '#ff2a2a'

function LightNode({ def, position }: { def: LightDef; position: THREE.Vector3 }) {
  const lightRef = useRef<THREE.PointLight>(null)
  const bulbRef = useRef<THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>>(null)
  const glowRef = useRef<THREE.Sprite>(null)
  const tmp = useMemo(() => new THREE.Color(), [])
  const prev = useRef({ color: '', k: -1, night: -1 }) // lo ultimo que se aplico: si no cambio, no se repite el trabajo en cada cuadro
  const showBulbs = useUiStore((s) => s.layers.bulbs)
  const focus = useUiStore((s) => s.focus)

  useFrame(({ clock }) => {
    const st = useHouseStore.getState()
    const l = st.lights[def.id]
    const light = lightRef.current
    const bulb = bulbRef.current
    const glow = glowRef.current
    if (!l || !light || !bulb || !glow) return

    let color = l.color
    let k = l.on ? l.intensity / 100 : 0

    // Alarma de intrusión: toda la casa alterna rojo / azul (como una sirena)
    if (st.security.alarm) {
      color = Math.floor(clock.elapsedTime * 3) % 2 === 0 ? '#ff2a2a' : '#2a6bff'
      k = 1
    }

    // Alarma de humo: las luces de la cocina parpadean en rojo (aunque estuvieran apagadas).
    if (st.smoke.alarm && def.room === SMOKE.alarmRoom) {
      const flashOn = Math.floor(clock.elapsedTime * ALARM_FLASH_HZ * 2) % 2 === 0
      color = ALARM_RED
      k = flashOn ? 1 : 0
    }

    // De noche el resplandor del bombillo crece: las luces interiores son las protagonistas
    const night = Math.round((1 - skyState.daylight) * 50) / 50
    const p = prev.current
    if (color === p.color && k === p.k && night === p.night) return
    p.color = color
    p.k = k
    p.night = night

    light.color.set(color)
    light.intensity = k * LIGHT_INTENSITY_AT_100

    tmp.set(color)
    bulb.material.color.copy(BULB_OFF).lerp(tmp, k === 0 ? 0 : 0.35 + 0.65 * k)
    bulb.scale.setScalar(k === 0 ? 0.8 : 1 + 0.25 * k)
    glow.visible = k > 0
    glow.material.color.copy(tmp)
    glow.material.opacity = k * (0.25 + 0.6 * night)
    glow.scale.setScalar((2.2 + 2.8 * k) * (0.6 + 0.8 * night))
  })

  const toggle = (e: { stopPropagation: () => void }) => {
    e.stopPropagation()
    const cur = useHouseStore.getState().lights[def.id]
    if (cur) commands.setLight(def.id, { on: !cur.on })
  }

  // Sin sombras: 17 PointLight con sombra serían 102 pasadas extra por cuadro. La sombra la pone el sol / la luna.
  return (
    <group position={position}>
      <pointLight ref={lightRef} intensity={0} distance={LIGHT_DISTANCE} decay={2} />
      <group visible={showBulbs} scale={focus ? 1.5 : 1}>
        {/* Plafón: disco claro sobre el bombillo */}
        <mesh position={[0, 0.32, 0]} material={PLAFON}>
          <cylinderGeometry args={[0.8, 0.62, 0.16, 28]} />
        </mesh>
        <mesh
          ref={bulbRef}
          onClick={toggle}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = '')}
        >
          <sphereGeometry args={[0.42, 20, 20]} />
          <meshBasicMaterial toneMapped={false} />
        </mesh>
        <sprite ref={glowRef} visible={false}>
          <spriteMaterial
            map={glowTexture()}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </sprite>
      </group>
    </group>
  )
}

const PLAFON = new THREE.MeshStandardMaterial({ color: '#ece8df', roughness: 0.35, metalness: 0.25 })

export function LightRig({ markers }: { markers: Markers }) {
  return (
    <>
      {LIGHTS.map((def) => {
        const pos = markers.get(def.id)
        return pos ? <LightNode key={def.id} def={def} position={pos} /> : null
      })}
    </>
  )
}
