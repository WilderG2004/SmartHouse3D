/**
 * Reglas de SEGURIDAD que conoce la interfaz (solo para mostrar y evitar órdenes inútiles).
 *
 * ⚠ Esto NO es un control. El que decide es Node-RED (infra/nodered/src/06-sesion-autorizar.js): aunque alguien
 *   modifique este archivo en su navegador o abra el WebSocket con otra herramienta, el servidor rechaza lo que
 *   la sesión no puede hacer. Aquí solo se copia la tabla para que la pantalla no ofrezca botones que van a fallar.
 *   La tabla autoritativa es `kinds` en infra/nodered/tools/security-policy.mts: si la cambias allí, cámbiala aquí.
 */
import type { DeviceCommand, SessionRole } from '../types/iot'

export const ROLE_RANK: Record<SessionRole, number> = { lector: 0, operador: 1, administrador: 2 }

export const ROLE_LABEL: Record<SessionRole, string> = {
  lector: 'Solo lectura',
  operador: 'Operador',
  administrador: 'Administrador',
}

export const ROLE_HELP: Record<SessionRole, string> = {
  lector: 'Puedes ver todo, pero no dar órdenes.',
  operador: 'Luces, aires, enchufes, puertas, escenas y alarma (las acciones sensibles piden confirmación).',
  administrador: 'Todo lo del operador, más simulaciones, hora simulada y revocar sesiones.',
}

/** Rol mínimo de cada orden (capacidades del canal por tipo de mensaje). */
export const COMMAND_MIN_ROLE: Record<DeviceCommand['kind'], SessionRole> = {
  'light.set': 'operador',
  'ac.set': 'operador',
  'plug.set': 'operador',
  'door.set': 'operador',
  'scene.apply': 'operador',
  'security.set': 'operador',
  'security.simulateIntrusion': 'administrador',
  'smoke.simulate': 'administrador',
  'heat.simulate': 'administrador',
  'humidity.simulate': 'administrador',
  'pir.simulate': 'administrador',
  'world.setHour': 'administrador',
}

export const canRole = (role: SessionRole, need: SessionRole) => ROLE_RANK[role] >= ROLE_RANK[need]

/** Texto para el usuario de cada motivo de rechazo que devuelve el servidor. */
export const REJECT_TEXT: Record<string, string> = {
  forbidden: 'Esta sesión no tiene permiso para esa acción.',
  unknown_kind: 'El servidor no reconoce esa orden.',
  no_json: 'El mensaje no era válido.',
  too_large: 'El mensaje era demasiado grande.',
  schema: 'La orden no tiene el formato esperado.',
  range: 'El valor está fuera del rango permitido.',
  unknown_id: 'Ese dispositivo no existe.',
  bad_key: 'La clave no es correcta.',
  locked: 'Demasiados intentos con clave incorrecta: espera un minuto.',
  frozen: 'Un administrador congeló el emparejamiento por unos minutos.',
  bad_confirm: 'El código de confirmación no es válido.',
  expired: 'El código de confirmación caducó. Repite la acción.',
  not_ready: 'El servidor todavía se está iniciando.',
  rate_limit: 'Demasiados mensajes seguidos: espera unos segundos e inténtalo de nuevo.',
  // Los dos siguientes los genera la propia pantalla (el servidor no llegó a contestar)
  no_connection: 'Sin conexión con Node-RED. Espera a que el chip de arriba diga «En línea» (o recarga la pestaña con F5) e inténtalo de nuevo.',
  timeout: 'Node-RED no respondió. Comprueba que siga encendido y que el chip de arriba diga «En línea»; recarga la pestaña (F5) y vuelve a intentarlo.',
}
