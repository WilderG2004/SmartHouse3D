/**
 * Control del HANDSHAKE del WebSocket (se ejecuta ANTES de que el cliente pueda enviar un solo mensaje).
 *
 * Node-RED llama a RED.settings.webSocketNodeVerifyClient(info, cb) en cada intento de conexión al nodo
 * «websocket in». settings.js lo conecta aquí. Lo que hace:
 *
 *   1. Origin permitido  → solo las páginas servidas desde los orígenes de CASA_ALLOWED_ORIGINS pueden abrir el socket.
 *                          LÍMITE HONESTO: la cabecera Origin la pone el NAVEGADOR. Un script (Node, curl, Python…)
 *                          puede escribir la que quiera, así que esto frena a otras PÁGINAS WEB que intenten usar tu
 *                          backend, no a un atacante con herramientas. Quien realmente decide qué puede hacer una
 *                          conexión es la clave de emparejamiento (ver «Autorizar sesión y validar comando»).
 *   2. Conexiones simultáneas por IP (CASA_WS_MAX_PER_IP, por defecto 10).
 *   3. Intentos de conexión por minuto y por IP (CASA_WS_HANDSHAKES_PER_MIN, por defecto 30).
 *
 * Qué NO puede hacer (y por qué):
 *   - Node-RED no limita el tamaño de un mensaje WebSocket (la librería ws acepta hasta 100 MiB por trama y el nodo
 *     no deja cambiarlo). El tope de 2 KB se aplica DESPUÉS de recibirlo, en el flujo. Lo que contiene el daño es el
 *     límite de memoria del contenedor (ver despliegue/docker-compose.prod.yml) y la tasa por IP del proxy.
 *   - La IP real solo se conoce aquí (en el flujo no existe). Detrás de un proxy hay que activar CASA_TRUST_PROXY=on
 *     para leer la IP que el proxy escribió en X-Forwarded-For; si no, todos los clientes parecen venir del proxy.
 *
 * Variables de entorno (ninguna es un secreto):
 *   CASA_ALLOWED_ORIGINS        lista separada por comas, p. ej. https://casa-iot.vercel.app
 *   CASA_WS_REQUIRE_ORIGIN      on|off  (on: rechaza conexiones SIN cabecera Origin; recomendado en producción)
 *   CASA_WS_MAX_PER_IP          conexiones simultáneas por IP
 *   CASA_WS_HANDSHAKES_PER_MIN  intentos de conexión por minuto y por IP
 *   CASA_TRUST_PROXY            on|off  (on: la IP es el ÚLTIMO valor de X-Forwarded-For, el que añadió tu proxy)
 */
'use strict'

const ORIGENES_LOCALES = [
  'http://localhost:5173', 'http://127.0.0.1:5173', // vite dev
  'http://localhost:4173', 'http://127.0.0.1:4173', // vite preview
]

const entero = (v, def) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : def }
const activo = (v) => /^(on|true|1|si|sí)$/i.test(String(v || '').trim())

/** Orígenes de CASA_ALLOWED_ORIGINS (o los de desarrollo local si no hay lista). Lo usan el WebSocket y el CORS de la API. */
function origenesPermitidos(env = process.env) {
  const lista = String(env.CASA_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
  return new Set(lista.length ? lista : ORIGENES_LOCALES)
}

function crearVerificador(env = process.env, log = console.warn, ahora = Date.now) {
  const permitidos = origenesPermitidos(env)
  const exigirOrigin = activo(env.CASA_WS_REQUIRE_ORIGIN)
  const maxPorIp = entero(env.CASA_WS_MAX_PER_IP, 10)
  const maxPorMin = entero(env.CASA_WS_HANDSHAKES_PER_MIN, 30)
  const confiarProxy = activo(env.CASA_TRUST_PROXY)

  const conexiones = new Map() // ip → conexiones abiertas
  const intentos = new Map() // ip → marcas de tiempo del último minuto
  const avisos = new Map() // motivo → último aviso (para no llenar el registro)
  const contadores = { aceptadas: 0, origen: 0, sinOrigen: 0, limiteIp: 0, tasa: 0 }

  const avisar = (motivo, texto) => {
    const t = ahora()
    if (t - (avisos.get(motivo) || 0) < 10_000) return
    avisos.set(motivo, t)
    log('[seguridad-ws] ' + texto)
  }

  function ipDe(req) {
    const directa = (req.socket && req.socket.remoteAddress) || 'desconocida'
    if (!confiarProxy) return directa
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean)
    // El valor ÚTIL es el último: lo añadió NUESTRO proxy. Los anteriores los pudo escribir el cliente.
    return xff.length ? xff[xff.length - 1] : directa
  }

  // Limpieza ocasional para que los mapas no crezcan sin fin
  const limpiar = setInterval(() => {
    const corte = ahora() - 60_000
    for (const [ip, marcas] of intentos) { const v = marcas.filter((t) => t > corte); if (v.length) intentos.set(ip, v); else intentos.delete(ip) }
  }, 60_000)
  if (limpiar.unref) limpiar.unref()

  function verificar(info, cb) {
    const req = info.req
    const ip = ipDe(req)
    const origin = String(info.origin || req.headers.origin || '').replace(/\/+$/, '')
    const rechazar = (motivo, texto) => { avisar(motivo, texto); cb(false, 403, 'Forbidden') }

    if (origin) {
      if (!permitidos.has(origin)) { contadores.origen++; return rechazar('origin', 'Origin no permitido «' + origin.slice(0, 80) + '» desde ' + ip) }
    } else if (exigirOrigin) {
      contadores.sinOrigen++
      return rechazar('sinorigin', 'Conexión sin cabecera Origin rechazada (CASA_WS_REQUIRE_ORIGIN=on) desde ' + ip)
    }

    const t = ahora()
    const marcas = (intentos.get(ip) || []).filter((x) => x > t - 60_000)
    marcas.push(t)
    intentos.set(ip, marcas)
    if (marcas.length > maxPorMin) { contadores.tasa++; return rechazar('tasa', 'Demasiados intentos de conexión por minuto desde ' + ip) }

    const abiertas = conexiones.get(ip) || 0
    if (abiertas >= maxPorIp) { contadores.limiteIp++; return rechazar('ip', 'Más de ' + maxPorIp + ' conexiones simultáneas desde ' + ip) }
    conexiones.set(ip, abiertas + 1)
    // El socket TCP se cierra siempre al terminar la conexión (también si el handshake fallara después)
    req.socket.once('close', () => { const n = (conexiones.get(ip) || 1) - 1; if (n > 0) conexiones.set(ip, n); else conexiones.delete(ip) })
    contadores.aceptadas++
    cb(true)
  }

  verificar.contadores = contadores
  verificar.config = { permitidos: [...permitidos], exigirOrigin, maxPorIp, maxPorMin, confiarProxy }
  return verificar
}

module.exports = { crearVerificador, origenesPermitidos, ORIGENES_LOCALES }
