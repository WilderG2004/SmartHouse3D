/**
 * POLÍTICA DE SEGURIDAD del canal (se genera una sola vez y la usan los nodos de Node-RED).
 *
 *   build-flows.mts  →  buildSecurityPolicy(cfg)  →  se inyecta en «Configuración y estado inicial» (global «sec»)
 *
 * Aquí viven TODAS las reglas que se pueden cambiar sin tocar código:
 *   - qué rol puede enviar cada tipo de mensaje (capacidades del canal, no cuentas de usuario)
 *   - cuáles órdenes piden confirmación en dos pasos
 *   - límites (tamaño, frecuencia, intentos de emparejamiento)
 *   - dispositivos simulados que existen y el esquema/rango de cada medición
 *
 * Los ids de dispositivos, habitaciones y escenas salen de src/config/house.config.ts (misma fuente que usa la interfaz).
 * Nada de esto es un secreto: las CLAVES nunca están aquí (viven en variables de entorno, ver .env.example).
 */

/** Roles del taller (Administrador / Operador / Lector) convertidos en capacidades del canal. El número es el rango. */
export const ROLES = ['lector', 'operador', 'administrador'] as const

type Rule =
  | { t: 'num'; min: number; max: number }
  | { t: 'bool' }
  | { t: 'str'; max: number }
  | { t: 'enum'; v: string[] }
  | { t: 'hex' }

const num = (min: number, max: number): Rule => ({ t: 'num', min, max })
const bool: Rule = { t: 'bool' }
const str = (max: number): Rule => ({ t: 'str', max })
const oneOf = (...v: string[]): Rule => ({ t: 'enum', v })
const hex: Rule = { t: 'hex' }

export function buildSecurityPolicy(cfg: any) {
  const sp = cfg.CLIMATE
  const acRoom = (a: any) => String(a.room)
  const ids = {
    light: cfg.LIGHTS.map((l: any) => l.id),
    ac: cfg.AIR_CONDITIONERS.map((a: any) => a.id),
    plug: cfg.PLUGS.map((p: any) => p.id),
    door: cfg.DOORS.map((d: any) => d.id),
    doorExterior: cfg.DOORS.filter((d: any) => d.sensor).map((d: any) => d.id), // puertas del perímetro (con sensor)
    pir: cfg.PIRS.map((p: any) => p.id),
    scene: cfg.SCENES.map((s: any) => s.id),
    sceneDisarms: cfg.SCENES.filter((s: any) => s.security === 'disarmed').map((s: any) => s.id),
  }

  /** Mensajes que puede enviar un cliente por el WebSocket. role = rango mínimo; keys = ÚNICAS claves aceptadas. */
  const kinds: Record<string, { role: number; keys: string[]; note: string }> = {
    'snapshot.request': { role: 0, keys: ['kind'], note: 'Pide el estado completo (lo usa la interfaz al conectar)' },
    'session.hello': { role: 0, keys: ['kind', 'key'], note: 'Empareja la sesión con una clave (Operador o Administrador)' },
    'session.logout': { role: 0, keys: ['kind'], note: 'Vuelve a solo lectura' },
    confirm: { role: 0, keys: ['kind', 'code'], note: 'Segundo paso de una acción sensible (código de un solo uso)' },
    'light.set': { role: 1, keys: ['kind', 'id', 'patch'], note: 'Luces: encender, intensidad y color' },
    'ac.set': { role: 1, keys: ['kind', 'id', 'patch'], note: 'Aire acondicionado' },
    'plug.set': { role: 1, keys: ['kind', 'id', 'on'], note: 'Enchufes inteligentes' },
    'door.set': { role: 1, keys: ['kind', 'id', 'open'], note: 'Puertas (abrir una puerta del perímetro pide confirmación)' },
    'scene.apply': { role: 1, keys: ['kind', 'id'], note: 'Escenas (las que desarman la alarma piden confirmación)' },
    'security.set': { role: 1, keys: ['kind', 'mode'], note: 'Alarma: armar, o desarmar (esto pide confirmación)' },
    'security.simulateIntrusion': { role: 2, keys: ['kind'], note: 'Simula una intrusión (demostración)' },
    'smoke.simulate': { role: 2, keys: ['kind', 'active'], note: 'Simula fuga de humo' },
    'heat.simulate': { role: 2, keys: ['kind', 'active'], note: 'Simula calor en la cocina' },
    'humidity.simulate': { role: 2, keys: ['kind', 'active'], note: 'Simula humedad en el baño' },
    'pir.simulate': { role: 2, keys: ['kind', 'id'], note: 'Simula movimiento en un detector' },
    'world.setHour': { role: 2, keys: ['kind', 'hour'], note: 'Cambia la hora simulada' },
    'admin.revoke': { role: 2, keys: ['kind'], note: 'Revoca todas las demás sesiones de control y congela el emparejamiento unos minutos' },
  }

  /* ───────── dispositivos simulados (identidad de DISPOSITIVO) ───────── */
  type Dev = { dev: string; m: string; tags: Record<string, string> | null; ingest: boolean }
  const devices: Dev[] = []
  const D = (dev: string, m: string, tags: Record<string, string> | null, ingest = false) => devices.push({ dev, m, tags, ingest })
  for (const l of cfg.LIGHTS) D('light:' + l.id, 'light', { id: l.id })
  for (const d of cfg.DOORS) D('door:' + d.id, 'door', { id: d.id })
  for (const p of cfg.PIRS) D('pir:' + p.id, 'pir', { id: p.id })
  for (const a of cfg.AIR_CONDITIONERS) D('ac:' + a.id, 'ac', { id: a.id, room: acRoom(a) })
  for (const p of cfg.PLUGS) D('plug:' + p.id, 'plug', { id: p.id, room: String(p.room) })
  for (const r of cfg.ROOMS) D('sensor:DHT22-' + r.id, 'env', { room: r.id, sensor: 'DHT22-' + r.id })
  D('sensor:exterior', 'env', { room: 'exterior', sensor: 'exterior' })
  D('sensor:' + cfg.SMOKE.id, 'smoke', { sensor: cfg.SMOKE.id })
  D('meter:Medidor_General', 'power', { meter: 'Medidor_General' })
  D('core:security', 'security', {})
  D('core:alerts', 'alerts', null)
  D('core:events', 'events', null)
  // Dispositivo externo de prueba: es el ÚNICO que acepta POST /api/ingest (sirve para probar firmas y, más adelante, un ESP32 real)
  D('sensor:PRUEBA-ingesta', 'env', { room: 'prueba', sensor: 'PRUEBA-ingesta' }, true)

  /* ───────── esquema estricto por medición (lo que se escribe en InfluxDB) ───────── */
  const schema: Record<string, { tags: string[]; fields: Record<string, Rule> }> = {
    power: { tags: ['meter'], fields: { watts: num(0, 50000), kwh: num(0, 1e9), base: num(0, 50000), lights: num(0, 50000), ac: num(0, 50000), plugs: num(0, 50000) } },
    smoke: { tags: ['sensor'], fields: { ppm: num(0, 10000), alarm: bool, simulating: bool } },
    env: { tags: ['room', 'sensor'], fields: { temperature: num(-30, 70), humidity: num(0, 100), lux: num(0, 200000) } },
    ac: { tags: ['id', 'room'], fields: { on: bool, mode: oneOf('cool', 'fan'), setpoint: num(sp.acSetpointMin, sp.acSetpointMax), running: bool, watts: num(0, 10000) } },
    plug: { tags: ['id', 'room'], fields: { on: bool, watts: num(0, 10000), kwh: num(0, 1e9) } },
    light: { tags: ['id'], fields: { on: bool, intensity: num(0, 100), color: hex } },
    door: { tags: ['id'], fields: { open: bool } },
    pir: { tags: ['id'], fields: { motion: bool } },
    security: { tags: [], fields: { mode: oneOf('disarmed', 'home', 'away'), alarm: bool, cause: str(120) } },
    alerts: { tags: ['id', 'level'], fields: { active: bool, message: str(240) } },
    events: { tags: ['level', 'source'], fields: { message: str(400), id: str(80) } },
  }

  return {
    version: 1,
    roles: [...ROLES],
    kinds,
    ids,
    ranges: {
      intensity: [0, 100],
      setpoint: [sp.acSetpointMin, sp.acSetpointMax],
      hour: [0, 23.99],
    },
    limits: {
      maxMsgBytes: 2048, // un comando legítimo pesa < 300 bytes
      readBucket: { cap: 10, refillPerSec: 2 }, // sesión de solo lectura: casi nunca manda nada
      controlBucket: { cap: 120, refillPerSec: 60 }, // control: aguanta un deslizador arrastrado, no una inundación
      helloFailMax: 5, // intentos de clave fallidos por sesión antes de bloquearla
      helloLockMs: 60_000,
      helloGlobalMax: 30, // intentos fallidos entre TODAS las sesiones por ventana
      helloGlobalWindowMs: 60_000,
      confirmTtlMs: 15_000, // vigencia del código de un solo uso
      maxPendingPerSession: 8,
      freezeMs: 5 * 60_000, // admin.revoke: tiempo sin poder emparejar
      auditBucket: { cap: 40, refillPerSec: 20 }, // tope de puntos de auditoría por segundo hacia InfluxDB
      noticeEveryMs: 10_000, // un aviso en el registro de eventos por motivo, como máximo cada 10 s
      ingestMaxMsgs: 20,
      ingestMaxBytes: 8192,
    },
    telemetry: {
      windowMs: 30_000, // un mensaje firmado más viejo (o más futuro) que esto se rechaza
      // huella (hash) por bloque de tiempo: 5 minutos por defecto; para bloques de una hora, CASA_INTEGRITY_BLOCK_MS=3600000 al generar el flujo
      blockMs: Math.max(30_000, Number(process.env.CASA_INTEGRITY_BLOCK_MS) || 5 * 60_000),
      graceMs: 60_000, // espera antes de cerrar un bloque
      // saltos entre dos lecturas consecutivas del mismo sensor que no son físicamente posibles
      // (el reloj simulado puede mover la temperatura exterior hasta ~10 °C de golpe: el tope queda por encima)
      maxJump: { temperature: 12, humidity: 40, ppm: 1500 } as Record<string, number>,
      jumpMaxGapMs: 15_000, // solo se compara si las dos lecturas están así de cerca en el tiempo
      devices,
      schema,
    },
  }
}
