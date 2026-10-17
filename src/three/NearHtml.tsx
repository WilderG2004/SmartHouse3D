/**
 * Etiqueta flotante (<Html> de drei) que, mientras recorres la casa en primera persona, solo aparece cuando
 * estas cerca. Asi no se llena la pantalla con las etiquetas de todos los cuartos. Afuera del recorrido
 * se comporta igual que un <Html> normal.
 */
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState, type ComponentProps } from 'react'
import * as THREE from 'three'
import { useUiStore } from '../store/useUiStore'
import { walkState } from './walkState'

/** Distancia (en unidades del modelo, unos 4,5 m) hasta la que se ve la etiqueta al caminar */
const NEAR = 10

type Props = Omit<ComponentProps<typeof Html>, 'position' | 'ref'> & {
  position?: THREE.Vector3 | [number, number, number]
}

export function NearHtml({ position, children, ...rest }: Props) {
  const group = useRef<THREE.Group>(null)
  const state = useRef({ t: Math.random() * 0.25, near: true }) // el azar evita que todas se revisen en el mismo cuadro
  const [near, setNear] = useState(true)
  const v = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const s = state.current
    s.t += dt
    if (s.t < 0.25) return
    s.t = 0
    let n = true
    if (useUiStore.getState().walking && group.current) {
      group.current.getWorldPosition(v)
      n = Math.hypot(v.x - walkState.x, v.z - walkState.z) <= NEAR
    }
    if (n !== s.near) {
      s.near = n
      setNear(n)
    }
  })

  return (
    <group ref={group} position={position}>
      {/* El <Html> se queda montado (montarlo y desmontarlo seguido da errores en drei); lejos solo se vacia */}
      <Html {...rest}>{near ? children : null}</Html>
    </group>
  )
}
