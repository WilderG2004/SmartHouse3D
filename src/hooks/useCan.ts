import { COMMAND_MIN_ROLE, canRole } from '../config/security.config'
import { telemetry } from '../services/telemetry'
import { useSessionStore } from '../store/useSessionStore'
import type { DeviceCommand, SessionRole } from '../types/iot'

/** ¿Puede la sesión actual dar este tipo de orden? (solo para habilitar o deshabilitar botones; el servidor decide de verdad). */
export function useCan(kind: DeviceCommand['kind']): boolean {
  const role = useSessionStore((s) => s.role)
  return !telemetry.enforcesSessions || canRole(role, COMMAND_MIN_ROLE[kind])
}

/** Rol actual y si esta pantalla está limitada a ver. En modo simulado no hay sesiones: nunca es solo lectura. */
export function useRole(): { role: SessionRole; readOnly: boolean; enforced: boolean } {
  const role = useSessionStore((s) => s.role)
  return { role, readOnly: telemetry.enforcesSessions && role === 'lector', enforced: telemetry.enforcesSessions }
}
