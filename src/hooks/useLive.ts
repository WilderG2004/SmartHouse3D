/**
 * Igual que useHouseStore(selector), pero mientras recorres la casa en primera persona se actualiza solo cada 5 segundos.
 *
 * Por que: cada segundo llegan datos nuevos y React vuelve a dibujar las graficas y el registro de eventos. Eso ocupa el
 * mismo "hilo" que anima el 3D, y se nota como un tironcito cada segundo al caminar. Mientras caminas esas piezas ni se ven
 * (estan mas abajo en la pagina), asi que se dibujan menos. El 3D, el panel de la derecha y el mini-mapa NO usan esto:
 * siguen en vivo. Fuera del recorrido todo se actualiza cada segundo, como siempre.
 *
 * `key` sirve cuando el selector depende de algo que cambia (por ejemplo la habitacion elegida): al cambiar la clave se
 * recalcula de inmediato.
 */
import { useRef } from 'react'
import { useHouseStore } from '../store/useHouseStore'
import { useUiStore } from '../store/useUiStore'

type HouseState = ReturnType<typeof useHouseStore.getState>

const SLOW_MS = 5000

export function useLive<T>(selector: (s: HouseState) => T, key = ''): T {
  const last = useRef<{ v: T; at: number; key: string } | null>(null)
  return useHouseStore((s) => {
    const c = last.current
    if (c && c.key === key && useUiStore.getState().walking && performance.now() - c.at < SLOW_MS) return c.v
    const v = selector(s)
    last.current = { v, at: performance.now(), key }
    return v
  })
}
