/**
 * Contrato de datos del gemelo digital.
 *
 * Este archivo es el "idioma común" entre:
 *   - Node-RED por WebSocket (la fuente de datos real),
 *   - el simulador local (solo para desarrollar sin Node-RED),
 *   - el store de React y la escena 3D.
 * Si el backend envía otro formato, se traduce en el adaptador, no aquí.
 */

export interface LightState {
  id: string
  on: boolean
  /** Dimmer 0–100 (%) */
  intensity: number
  /** Color CSS hex, p. ej. "#ffe2b0" */
  color: string
}

export interface SmokeState {
  ppm: number
  alarm: boolean
  /** true mientras la "fuga" simulada está activa (solo informativo) */
  simulating: boolean
}

export interface PirState {
  motion: boolean
  lastTriggerAt: number | null
}

export interface DoorState {
  open: boolean
}

export interface PowerBreakdown {
  /** Nevera + standby */
  base: number
  lights: number
  ac: number
  plugs: number
}

export interface PowerState {
  watts: number
  kwhTotal: number
  breakdown?: PowerBreakdown
}

/* ───────────── Clima ───────────── */

export interface RoomClimate {
  temperature: number
  /** Humedad relativa, % */
  humidity: number
  /** Luminosidad, lux (sensor de luz) */
  lux?: number
}

export type AcMode = 'cool' | 'fan'
export type AcFan = 'low' | 'mid' | 'high'

export interface AcState {
  id: string
  on: boolean
  mode: AcMode
  /** Temperatura objetivo, °C */
  setpoint: number
  fan: AcFan
  /** Compresor trabajando (solo en modo frío) */
  running: boolean
  /** Potencia instantánea, W */
  watts: number
}

export interface WorldState {
  /** Hora del día simulada, 0–24 */
  hour: number
  outdoorTemp: number
  /** true si el usuario fijó la hora a mano */
  hourOverride: boolean
}

/* ───────────── Enchufes inteligentes ───────────── */

export interface PlugState {
  id: string
  on: boolean
  watts: number
  kwh: number
}

/* ───────────── Seguridad ───────────── */

/** disarmed = desarmada · home = perímetro (puertas) · away = perímetro + movimiento */
/* ───────────── Pipeline IoT (transparencia) ───────────── */

export interface PipelineWrites {
  batches: number
  points: number
  lastBatchAt: number | null
  errors: number
  lastError?: string | null
  lastErrorAt?: number | null
}
export interface PipelineStore {
  ok: boolean
  points10m?: number
  lastPointAt?: number | null
  readMs?: number
  checkedAt?: number
  error?: string
}
export interface PipelineApi {
  requests: number
  errors: number
  lastRoute?: string | null
  lastMs?: number | null
  lastAt?: number | null
  lastPoints?: number | null
}
export interface PipelineState {
  writes?: PipelineWrites
  store?: PipelineStore | null
  api?: PipelineApi
}

export type SecurityMode = 'disarmed' | 'home' | 'away'

export interface SecurityState {
  mode: SecurityMode
  alarm: boolean
  cause: string | null
}

export type EventLevel = 'info' | 'warning' | 'critical'

export interface SystemEvent {
  id: string
  ts: number
  level: EventLevel
  source: string
  message: string
}

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export interface HouseSnapshot {
  lights: Record<string, LightState>
  smoke: SmokeState
  pir: Record<string, PirState>
  doors: Record<string, DoorState>
  power: PowerState
  climate: Record<string, RoomClimate>
  acs: Record<string, AcState>
  plugs: Record<string, PlugState>
  security: SecurityState
  world: WorldState
  /** Últimos eventos del log, más recientes primero (para quien abre la página después) */
  events?: SystemEvent[]
  alerts?: ActiveAlert[]
  pipeline?: PipelineState
}

/** Mensajes que fluyen backend → frontend. */
export type TelemetryMessage =
  | { type: 'snapshot'; state: HouseSnapshot }
  | { type: 'light'; id: string; patch: Partial<Omit<LightState, 'id'>> }
  /** `alarm` lo calcula Node-RED (con histéresis); en el modo de desarrollo lo calcula el simulador local */
  | { type: 'smoke'; ts: number; ppm: number; alarm?: boolean; simulating?: boolean }
  | { type: 'pir'; ts: number; id: string; motion: boolean }
  | { type: 'door'; ts: number; id: string; open: boolean }
  | { type: 'power'; ts: number; watts: number; kwhTotal: number; breakdown?: PowerBreakdown }
  | { type: 'climate'; ts: number; rooms: Record<string, RoomClimate>; world: WorldState }
  | { type: 'ac'; id: string; patch: Partial<Omit<AcState, 'id'>> }
  | { type: 'plug'; id: string; patch: Partial<Omit<PlugState, 'id'>> }
  | { type: 'security'; state: SecurityState }
  /** Estado del pipeline que Node-RED va publicando (guardado, verificación en InfluxDB, consultas del frontend) */
  | ({ type: 'pipeline'; ts: number } & PipelineState)
  /** Alerta levantada (active) o normalizada por quien las calcula (Node-RED) */
  | { type: 'alert'; ts: number; id: string; active: boolean; level: 'warning' | 'critical'; message: string }
  | { type: 'event'; event: SystemEvent }
  | { type: 'connection'; status: ConnectionStatus }

/* ───────────── Sesión del canal (qué puede hacer ESTA pantalla) ─────────────
 * Identidad de SESIÓN, no de persona: no hay usuarios ni contraseñas. Toda conexión nueva es «lector» (solo ve);
 * con la clave de emparejamiento pasa a «operador» o «administrador». El servidor lo decide siempre; la interfaz
 * solo lo refleja (ocultar o desactivar botones es comodidad, no un control). */
export type SessionRole = 'lector' | 'operador' | 'administrador'

/** Mensajes del servidor dirigidos SOLO a esta conexión (no son datos de la casa). */
export type SessionMessage =
  /** Rol vigente. `revoked`: un administrador revocó las sesiones de control. */
  | { type: 'session'; role: SessionRole; revoked?: boolean; note?: string }
  /** Acción sensible: el servidor espera que se devuelva `code` (un solo uso, `ttlMs` de vigencia) para ejecutarla. */
  | { type: 'confirm'; code: string; kind: string; summary: string; ttlMs: number }
  /** El servidor rechazó una orden. `reason` es un motivo corto (forbidden, range, schema, bad_key…). */
  | { type: 'reject'; kind: string; reason: string; need?: SessionRole }

/** Comandos que fluyen frontend → backend. */
export type DeviceCommand =
  | { kind: 'light.set'; id: string; patch: Partial<Omit<LightState, 'id'>> }
  | { kind: 'smoke.simulate'; active: boolean }
  | { kind: 'pir.simulate'; id: string }
  /** Eventos de sensores simulados (los genera la capa de sensores) */
  | { kind: 'heat.simulate'; active: boolean }
  | { kind: 'humidity.simulate'; active: boolean }
  | { kind: 'door.set'; id: string; open: boolean }
  | { kind: 'ac.set'; id: string; patch: Partial<Pick<AcState, 'on' | 'mode' | 'setpoint' | 'fan'>> }
  | { kind: 'plug.set'; id: string; on: boolean }
  | { kind: 'security.set'; mode: SecurityMode }
  | { kind: 'security.simulateIntrusion' }
  | { kind: 'scene.apply'; id: string }
  /** hour = null → vuelve a la hora real */
  | { kind: 'world.setHour'; hour: number | null }

export interface TimePoint {
  ts: number
  value: number
}

/** Punto de la curva de consumo: value = total; el resto, el desglose. */
export interface PowerPoint extends TimePoint {
  base: number
  lights: number
  ac: number
  plugs: number
}

/** Punto de la gráfica de temperatura de una habitación (historial): outdoor = exterior en el mismo instante. */
export interface ClimatePoint extends TimePoint {
  outdoor?: number | null
}

export interface ActiveAlert {
  id: string
  level: 'warning' | 'critical'
  message: string
  since: number
}
