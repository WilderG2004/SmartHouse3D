/**
 * Hook centralizado de telemetría: conecta el adaptador activo con los stores.
 * Se monta UNA sola vez (en App). Devuelve helpers de comandos para la UI.
 *
 * Los mensajes del adaptador se reparten en dos: los DATOS de la casa van a useHouseStore y los mensajes de la
 * SESIÓN (rol, código de confirmación, rechazo) a useSessionStore.
 */
import { useEffect } from 'react'
import { COMMAND_MIN_ROLE, canRole, ROLE_LABEL } from '../config/security.config'
import { fetchHistorySeed } from '../services/history/historyApi'
import { telemetry } from '../services/telemetry'
import { useHouseStore } from '../store/useHouseStore'
import { useSessionStore } from '../store/useSessionStore'
import type { DeviceCommand } from '../types/iot'

export function useTelemetry() {
  useEffect(() => {
    const { apply, seedHistory } = useHouseStore.getState()
    const session = useSessionStore.getState()
    const unsubscribe = telemetry.subscribe((msg) => {
      if (msg.type === 'session' || msg.type === 'confirm' || msg.type === 'reject') session.handle(msg)
      else {
        apply(msg)
        // Sin conexión no hay sesión: al volver, el servidor la reanuda con la clave guardada en esta pestaña
        if (msg.type === 'connection' && msg.status !== 'connected') session.reset()
      }
    })
    telemetry.connect()

    // Con Node-RED: precarga las gráficas con el historial guardado en InfluxDB.
    // En modo simulado devuelve vacío (ver historyApi.ts).
    fetchHistorySeed().then(seedHistory).catch((err) => {
      console.warn('[historial] no disponible:', err)
    })

    return () => {
      unsubscribe()
      telemetry.disconnect()
    }
  }, [])
}

/**
 * Envía una orden. Si la sesión actual no alcanza el rol mínimo, ni siquiera sale: se avisa en pantalla.
 * (Es solo comodidad: aunque se saltara esta comprobación, Node-RED volvería a rechazarla.)
 */
function send(command: DeviceCommand) {
  if (telemetry.enforcesSessions) {
    const { role, notify } = useSessionStore.getState()
    const need = COMMAND_MIN_ROLE[command.kind]
    if (!canRole(role, need)) {
      notify('warn', `Esta acción necesita rol ${ROLE_LABEL[need]}. Empareja la sesión con la clave (botón «${ROLE_LABEL.lector}» arriba).`)
      return
    }
  }
  telemetry.send(command)
}

/** Atajos tipados para enviar comandos desde cualquier componente. */
export const commands = {
  setLight: (id: string, patch: Extract<DeviceCommand, { kind: 'light.set' }>['patch']) =>
    send({ kind: 'light.set', id, patch }),
  setSmokeLeak: (active: boolean) => send({ kind: 'smoke.simulate', active }),
  simulatePir: (id: string) => send({ kind: 'pir.simulate', id }),
  simulateHeat: () => send({ kind: 'heat.simulate', active: true }),
  simulateHumidity: () => send({ kind: 'humidity.simulate', active: true }),
  setDoor: (id: string, open: boolean) => send({ kind: 'door.set', id, open }),
  setAc: (id: string, patch: Extract<DeviceCommand, { kind: 'ac.set' }>['patch']) =>
    send({ kind: 'ac.set', id, patch }),
  setPlug: (id: string, on: boolean) => send({ kind: 'plug.set', id, on }),
  setSecurity: (mode: Extract<DeviceCommand, { kind: 'security.set' }>['mode']) =>
    send({ kind: 'security.set', mode }),
  simulateIntrusion: () => send({ kind: 'security.simulateIntrusion' }),
  applyScene: (id: string) => send({ kind: 'scene.apply', id }),
  /** null → hora real */
  setHour: (hour: number | null) => send({ kind: 'world.setHour', hour }),
}
