import { CLIMATE } from '../config/house.config'

type RGB = [number, number, number]
type Stops = [number, RGB][]

/** Gradiente frio -> calido para temperaturas (°C). Colores vivos: sirven para puntos, mapa de calor y rellenos. */
const STOPS: Stops = [
  [18, [74, 144, 255]],
  [22, [93, 205, 255]],
  [25, [110, 231, 168]],
  [28, [255, 181, 71]],
  [33, [255, 93, 82]],
]

/** Mismo gradiente pero oscuro: sirve para TEXTO sobre fondo claro (contraste suficiente). */
const STOPS_INK: Stops = [
  [18, [29, 90, 190]],
  [22, [8, 112, 160]],
  [25, [20, 122, 80]],
  [28, [160, 90, 6]],
  [33, [190, 36, 28]],
]

const rgb = (c: RGB) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`

function ramp(stops: Stops, t: number): string {
  if (t <= stops[0][0]) return rgb(stops[0][1])
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i]
    const [t0, c0] = stops[i - 1]
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0)
      return rgb(c0.map((v, j) => Math.round(v + (c1[j] - v) * k)) as RGB)
    }
  }
  return rgb(stops[stops.length - 1][1])
}

export const tempColor = (t: number): string => ramp(STOPS, t)
export const tempInk = (t: number): string => ramp(STOPS_INK, t)

export function comfortLabel(t: number): string {
  if (t < CLIMATE.comfortMin) return 'Fresco'
  if (t <= CLIMATE.comfortMax) return 'Confort'
  if (t <= CLIMATE.comfortMax + 3) return 'Cálido'
  return 'Caluroso'
}

/** Luz diurna 0 (noche) … 1 (mediodía), con amanecer/atardecer suaves. */
export function daylight(hour: number): number {
  const x = Math.sin(((hour - 6) / 12) * Math.PI)
  return Math.max(0, Math.min(1, x * 1.6))
}

export function fmtHour(hour: number): string {
  const h = Math.floor(hour) % 24
  const m = Math.floor((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
