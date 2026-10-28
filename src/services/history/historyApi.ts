/**
 * Historial desde InfluxDB, a través de Node-RED (nunca directo desde el navegador:
 * expondría el token de la base de datos y habría que resolver CORS).
 *
 *   ► Base de la API:  VITE_API_URL  (por defecto http://localhost:1880/api)
 *   ► Autorización: /history/* exige «Authorization: Bearer <clave>», la misma con la que se emparejó esta pestaña
 *     (sessionStorage, ver services/telemetry/pairingKey.ts). Sin clave el historial no se pide: una pantalla anónima
 *     no puede descargar 31 días de consumo (delatan cuándo hay alguien en casa).
 *
 * Endpoints (implementados en el flujo de Node-RED, sección «E · API REST»; Flux sobre InfluxDB):
 *   GET {API}/history/power?from=<ms>&to=<ms>&bucket=<seg>
 *       → [{ ts, value, base, lights, ac, plugs }]            (W; value = total)
 *   GET {API}/history/smoke?from=<ms>&to=<ms>&bucket=<seg>
 *       → [{ ts, value }]                                      (ppm; máximo por ventana)
 *   GET {API}/history/climate?room=<id>&from=<ms>&to=<ms>&bucket=<seg>
 *       → [{ ts, value, outdoor }]                             (°C de la habitación y del exterior)
 *   GET {API}/health
 *
 * Esquema de InfluxDB (lo escribe Node-RED):
 *   power · meter        → watts, kwh, base, lights, ac, plugs
 *   smoke · sensor       → ppm, alarm, simulating
 *   env   · room, sensor → temperature, humidity            (sensor = «DHT22-<habitación>»; room «exterior»)
 *   ac    · id, room     → on, mode, setpoint, running, watts
 *   plug  · id, room     → on, watts, kwh
 *   light / door / pir / security / events  (cambios de estado y log)
 */
import type { ClimatePoint, PowerPoint, TimePoint } from '../../types/iot'
import { pairingKey } from '../telemetry/pairingKey'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:1880/api'

/** En modo simulado no hay base de datos que consultar. */
export const HISTORY_ENABLED = (import.meta.env.VITE_TELEMETRY_MODE ?? 'websocket') !== 'simulated'

export type HistoryRange = 'live' | '15m' | '1h' | '24h'
export const RANGE_LABEL: Record<HistoryRange, string> = { live: 'En vivo', '15m': '15 min', '1h': '1 h', '24h': '24 h' }
export const RANGE_MINUTES: Record<Exclude<HistoryRange, 'live'>, number> = { '15m': 15, '1h': 60, '24h': 1440 }

/** ≈300 puntos por gráfica, cualquiera sea el rango. */
const bucketFor = (minutes: number) => Math.max(1, Math.ceil((minutes * 60) / 300))

/** El historial necesita una pantalla emparejada (o la clave ya no vale). */
export class HistoryAuthError extends Error {}

async function getJson<T>(path: string, minutes: number, extra = ''): Promise<T> {
  const to = Date.now()
  const from = to - minutes * 60_000
  const key = pairingKey.get()
  if (!key) throw new HistoryAuthError('Empareja esta pantalla con tu clave para ver el historial.')
  const res = await fetch(`${API_URL}/history/${path}?from=${from}&to=${to}&bucket=${bucketFor(minutes)}${extra}`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (res.status === 401) throw new HistoryAuthError('La clave de esta pantalla ya no vale para el historial: vuelve a emparejar.')
  if (res.status === 429) throw new HistoryAuthError('Demasiados intentos con claves inválidas: espera un minuto.')
  if (!res.ok) throw new Error(`Historial ${path}: HTTP ${res.status}`)
  return (await res.json()) as T
}

const num = (v: number | null | undefined, fallback: number) => (typeof v === 'number' ? v : fallback)

export async function fetchPowerRange(minutes: number): Promise<PowerPoint[]> {
  const rows = await getJson<(TimePoint & Partial<PowerPoint>)[]>('power', minutes)
  return rows.map((r) => ({
    ts: r.ts,
    value: r.value,
    // Sin desglose, todo cuenta como carga base (igual que en vivo)
    base: num(r.base, r.value),
    lights: num(r.lights, 0),
    ac: num(r.ac, 0),
    plugs: num(r.plugs, 0),
  }))
}

export const fetchSmokeRange = (minutes: number) => getJson<TimePoint[]>('smoke', minutes)

export const fetchClimateRange = (room: string, minutes: number) =>
  getJson<ClimatePoint[]>('climate', minutes, `&room=${encodeURIComponent(room)}`)

/** Precarga las gráficas «en vivo» con los últimos minutos guardados. Devuelve vacío en modo simulado o sin emparejar. */
export async function fetchHistorySeed(minutes = 5) {
  if (!HISTORY_ENABLED || !pairingKey.get()) return { power: [] as PowerPoint[], smoke: [] as TimePoint[] }
  const [power, smoke] = await Promise.all([fetchPowerRange(minutes), fetchSmokeRange(minutes)])
  return { power, smoke }
}
