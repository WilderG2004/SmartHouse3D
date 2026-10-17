import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { DOOR_OPEN_ANGLE } from '../config/house.config'
import { useHouseStore } from '../store/useHouseStore'
import type { DoorRigs } from './doors'

/** Anima cada pivote hacia su estado (abierta/cerrada) con suavizado. */
export function DoorAnimator({ rigs }: { rigs: DoorRigs }) {
  useFrame((_, delta) => {
    const doors = useHouseStore.getState().doors
    rigs.forEach((rig) => {
      const target = doors[rig.def.id]?.open ? 1 : 0
      if (Math.abs(rig.value - target) < 0.0005 && rig.value === target) return
      rig.value = THREE.MathUtils.damp(rig.value, target, 4.5, Math.min(delta, 0.1))
      if (Math.abs(rig.value - target) < 0.0005) rig.value = target

      if (rig.def.kind === 'swing') {
        rig.pivot.rotation.y = (rig.def.dir ?? 1) * DOOR_OPEN_ANGLE * rig.value
      } else {
        rig.pivot.position.y = rig.baseY + rig.travel * rig.value
      }
    })
  })
  return null
}
