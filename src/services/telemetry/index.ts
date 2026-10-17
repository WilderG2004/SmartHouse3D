import { SimulatedAdapter } from './SimulatedAdapter'
import type { TelemetryAdapter } from './TelemetryAdapter'
import { WebSocketAdapter } from './WebSocketAdapter'

/**
 * Fábrica del adaptador según VITE_TELEMETRY_MODE.
 *   simulated               → solo desarrollo SIN Node-RED (los datos los genera la app; la interfaz lo avisa)
 *   websocket               → Node-RED: genera TODOS los datos, los guarda en InfluxDB y los consulta (por defecto)
 *
 * (Se eliminó el adaptador MQTT directo: era un segundo canal de control sin la validación de Node-RED.)
 */
function createAdapter(): TelemetryAdapter {
  switch (import.meta.env.VITE_TELEMETRY_MODE) {
    case 'simulated':
      return new SimulatedAdapter()
    default:
      return new WebSocketAdapter() // por defecto: Node-RED
  }
}

/** Instancia única compartida por toda la app. */
export const telemetry: TelemetryAdapter = createAdapter()
export type { TelemetryAdapter } from './TelemetryAdapter'
