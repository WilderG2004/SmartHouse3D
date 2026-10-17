import { create } from 'zustand'
import { AMBIENT_DEFAULT, ROOMS } from '../config/house.config'
import type { HistoryRange } from '../services/history/historyApi'

export type ViewPreset = 'iso' | 'top'

/** Capas que se pueden mostrar/ocultar en el visor 3D */
export type LayerKey = 'sensors' | 'bulbs' | 'climate' | 'ac' | 'plugs' | 'heat'

interface UiStore {
  layers: Record<LayerKey, boolean>
  ambient: number
  /** Habitación seleccionada para la gráfica de temperatura */
  selectedRoom: string
  /** Ventana de las gráficas: en vivo (memoria) o historial desde InfluxDB */
  historyRange: HistoryRange
  /** Sirena y voz de alarma (hay que activarlas con un clic: política de autoplay del navegador) */
  soundOn: boolean
  /** `nonce` cambia en cada petición para que repetir el mismo preset también anime la cámara */
  viewRequest: { preset: ViewPreset; nonce: number }
  /** Recorrido en primera persona (ver three/WalkMode.tsx) */
  walking: boolean
  /** Habitación donde está la persona ('exterior' si salió de la casa) */
  walkRoom: string | null
  /** Puerta que tiene al frente (tecla E para abrirla o cerrarla) */
  walkHint: { id: string; label: string } | null
  /** Petición de "llévame a…" (una habitación o un punto del mini-mapa) */
  walkRequest: { nonce: number; roomId?: string; x?: number; z?: number }
  setWalking: (v: boolean) => void
  setWalkRoom: (room: string | null) => void
  setWalkHint: (hint: { id: string; label: string } | null) => void
  requestWalkTo: (to: { roomId?: string; x?: number; z?: number }) => void
  setHistoryRange: (r: HistoryRange) => void
  toggleLayer: (k: LayerKey) => void
  setAmbient: (v: number) => void
  setSelectedRoom: (id: string) => void
  toggleSound: () => void
  requestView: (p: ViewPreset) => void
}

export const useUiStore = create<UiStore>((set) => ({
  layers: { sensors: true, bulbs: true, climate: true, ac: true, plugs: true, heat: false },
  ambient: AMBIENT_DEFAULT,
  selectedRoom: ROOMS[0].id,
  soundOn: false,
  historyRange: 'live',
  viewRequest: { preset: 'iso', nonce: 0 },
  walking: false,
  walkRoom: null,
  walkHint: null,
  walkRequest: { nonce: 0 },
  setWalking: (walking) => set(walking ? { walking } : { walking, walkHint: null, walkRoom: null }),
  setWalkRoom: (walkRoom) => set({ walkRoom }),
  setWalkHint: (walkHint) => set({ walkHint }),
  requestWalkTo: (to) => set((s) => ({ walkRequest: { ...to, nonce: s.walkRequest.nonce + 1 } })),
  setHistoryRange: (historyRange) => set({ historyRange }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setAmbient: (ambient) => set({ ambient }),
  setSelectedRoom: (selectedRoom) => set({ selectedRoom }),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
  requestView: (preset) => set((s) => ({ viewRequest: { preset, nonce: s.viewRequest.nonce + 1 } })),
}))
