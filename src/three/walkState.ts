/**
 * Datos del recorrido que cambian muchas veces por segundo (posicion, mirada, puertas).
 * No van en el store de React porque cambiarian la pantalla 60 veces por segundo: el mini-mapa los lee a su ritmo.
 * Los escribe `three/WalkMode.tsx` y los lee `components/WalkHud.tsx`.
 */
import type { FloorPlan } from './floorplan'

export interface WalkDoorShape {
  id: string
  /** 4 esquinas de la hoja vistas desde arriba: [x0, z0, x1, z1, x2, z2, x3, z3] */
  pts: number[]
}

export const walkState = {
  /** Posicion de la persona (vista desde arriba) */
  x: 0,
  z: 0,
  /** Hacia donde mira (radianes; 0 = hacia -Z) */
  yaw: 0,
  plan: null as FloorPlan | null,
  /** Posicion de cada luz, para dibujarlas en el mini-mapa */
  lights: [] as { id: string; x: number; z: number }[],
  /** Las hojas de las puertas con la posicion que tienen ahora */
  doors: [] as WalkDoorShape[],
}
