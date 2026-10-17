/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  PATRÓN ADAPTER — única frontera entre la UI y "el mundo real"   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 *   UI / Escena 3D ──(DeviceCommand)──▶ adapter ──▶ simulador | Node-RED
 *   UI / Escena 3D ◀─(TelemetryMessage)─ adapter ◀── simulador | Node-RED
 *
 * Ningún componente conoce WebSockets ni el simulador: solo hablan
 * con esta interfaz. Cambiar de fuente de datos = cambiar VITE_TELEMETRY_MODE.
 *
 * Regla de oro: la UI NO modifica su estado al enviar un comando. Espera el
 * mensaje de vuelta (eco/confirmación). Así el estado mostrado siempre es el
 * del dispositivo, igual que ocurrirá con Node-RED.
 */
import type { DeviceCommand, SessionMessage, TelemetryMessage } from '../../types/iot'

/** Lo que el adaptador entrega: datos de la casa + mensajes de la SESIÓN (rol, confirmaciones, rechazos). */
export type AdapterMessage = TelemetryMessage | SessionMessage
export type TelemetryListener = (msg: AdapterMessage) => void

export interface TelemetryAdapter {
  readonly mode: 'simulated' | 'websocket'
  /** Texto corto para la cabecera */
  readonly label: string
  /**
   * true → el servidor (Node-RED) decide qué puede hacer cada sesión; la interfaz solo lo refleja.
   * false → modo simulado local: no hay servidor ni sesiones y todo está permitido.
   */
  readonly enforcesSessions: boolean
  /** Canal cifrado (wss://) o no. null si no aplica (simulado). */
  readonly secureTransport: boolean | null
  connect(): void
  disconnect(): void
  subscribe(listener: TelemetryListener): () => void
  send(command: DeviceCommand): void
  /** Empareja ESTA sesión con una clave (rol Operador o Administrador). Solo con enforcesSessions. */
  pair(key: string): void
  /** Vuelve a solo lectura y olvida la clave de esta pestaña. */
  unpair(): void
  /** Segundo paso de una acción sensible: devuelve el código de un solo uso que dio el servidor. */
  confirm(code: string): void
  /** Solo Administrador: baja a «solo lectura» a todas las demás sesiones de control y congela el emparejamiento unos minutos. */
  revokeOthers(): void
}

export abstract class BaseAdapter implements TelemetryAdapter {
  abstract readonly mode: TelemetryAdapter['mode']
  abstract readonly label: string
  readonly enforcesSessions: boolean = false
  readonly secureTransport: boolean | null = null
  private listeners = new Set<TelemetryListener>()

  abstract connect(): void
  abstract disconnect(): void
  abstract send(command: DeviceCommand): void
  pair(_key: string): void {}
  unpair(): void {}
  confirm(_code: string): void {}
  revokeOthers(): void {}

  subscribe(listener: TelemetryListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  protected emit(msg: AdapterMessage) {
    this.listeners.forEach((l) => l(msg))
  }
}
