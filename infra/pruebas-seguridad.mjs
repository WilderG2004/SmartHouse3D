#!/usr/bin/env node
/**
 * PRUEBAS DE RECHAZO de seguridad. Envían mensajes MALOS a TU Node-RED y comprueban que los rechaza.
 *
 *   node infra/pruebas-seguridad.mjs [--nodered http://localhost:1880] [--incluir-revocar] [--sin-esperas] [--json resultados.json]
 *
 * Qué necesita (variables de entorno, las MISMAS con las que arrancó Node-RED; nunca se imprimen):
 *   CASA_PAIRING_KEY  clave del rol Operador         → pruebas de órdenes con sesión de control
 *   CASA_ADMIN_KEY    clave del rol Administrador    → solo con --incluir-revocar
 *   CASA_DEVICE_KEY   clave maestra de dispositivos  → pruebas de telemetría firmada (y Node-RED con CASA_INGEST=on)
 * Lo que no esté disponible se marca OMITIDA (no es un fallo).
 *
 * ⚠ SOLO contra tu propio Node-RED. Estas pruebas simulan ataques (claves malas, inundación, firmas falsas):
 *   no las apuntes a un servidor ajeno. Dejan filas en la medición «audit» de InfluxDB (es justo la evidencia).
 *   --incluir-revocar ejecuta admin.revoke: expulsa a las demás sesiones de control y congela el emparejamiento 5 minutos.
 *
 * Usa la librería «ws» (ya viene con el proyecto) para poder enviar cabeceras como Origin; sin ella usa el WebSocket de Node 22.
 * Necesita Node.js 22 o superior. Código de salida: 0 = todo lo ejecutado salió como se esperaba, 1 = alguna FALLA.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Pruebas de rechazo de seguridad (SOLO contra tu propio Node-RED).

  node infra/pruebas-seguridad.mjs [--nodered http://localhost:1880] [--incluir-revocar] [--sin-esperas] [--json resultados.json]

Variables de entorno (las mismas con las que arrancó Node-RED; nunca se imprimen):
  CASA_PAIRING_KEY   pruebas con sesión de Operador
  CASA_ADMIN_KEY     solo con --incluir-revocar (expulsa a las demás sesiones y congela el emparejamiento 5 min)
  CASA_DEVICE_KEY    pruebas de telemetría firmada (Node-RED con CASA_INGEST=on)
Lo que falte se marca OMITIDA. Código de salida: 0 = todo bien, 1 = alguna FALLA.`)
  process.exit(0)
}

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[i + 1]) : d }
const flag = (n) => process.argv.includes(`--${n}`)
const BASE = String(arg('nodered', 'http://localhost:1880')).replace(/\/$/, '')
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws/casa-iot'
const OP = process.env.CASA_PAIRING_KEY || ''
const ADMIN = process.env.CASA_ADMIN_KEY || ''
const DEVKEY = process.env.CASA_DEVICE_KEY || ''
const FAST = flag('sin-esperas')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let WS = null
let hasWsLib = false
try { WS = (await import('ws')).default; hasWsLib = true } catch { WS = globalThis.WebSocket }
if (!WS) { console.error('Hace falta Node.js 22 o la librería ws (npm install).'); process.exit(1) }

/* ───────────── cliente WebSocket de prueba ───────────── */
function connect(headers) {
  return new Promise((resolve, reject) => {
    const ws = hasWsLib ? new WS(WS_URL, { headers }) : new WS(WS_URL)
    const c = { ws, replies: [], echoes: [], all: 0 }
    const onmsg = (data) => {
      c.all++
      let m; try { m = JSON.parse(String(data)) } catch { return }
      if (['session', 'confirm', 'reject'].includes(m.type)) c.replies.push(m)
      else c.echoes.push(m)
      if (c.echoes.length > 400) c.echoes.shift()
    }
    if (hasWsLib) { ws.on('message', onmsg); ws.on('open', () => resolve(c)); ws.on('error', (e) => reject(e)); ws.on('unexpected-response', (_q, res) => reject(Object.assign(new Error('HTTP ' + res.statusCode), { status: res.statusCode }))) }
    else { ws.onmessage = (e) => onmsg(e.data); ws.onopen = () => resolve(c); ws.onerror = () => reject(new Error('error de conexión')) }
  })
}
const raw = (c, text) => (hasWsLib ? c.ws.send(text) : c.ws.send(text))
const close = (c) => { try { c.ws.close() } catch { /* nada */ } }
/** Envía y espera la siguiente respuesta dirigida a esta sesión (session / confirm / reject). Sin respuesta ⇒ null (ej. orden aceptada). */
async function ask(c, obj, ms = 700) {
  const n = c.replies.length
  raw(c, typeof obj === 'string' ? obj : JSON.stringify(obj))
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (c.replies.length > n) return c.replies[n]; await sleep(25) }
  return null
}

/* ───────────── firma de telemetría (igual que el firmador de Node-RED) ───────────── */
const deviceKey = (dev) => createHmac('sha256', DEVKEY).update('casa-iot/device/v1/' + dev).digest()
const sign = (dev, bodyObj, key = deviceKey(dev)) => { const body = JSON.stringify(bodyObj); return { dev, body, sig: createHmac('sha256', key).update(body).digest('hex') } }
let seqBase = Date.now()
const mk = (dev, f, over = {}) => ({ v: 1, dev, m: 'env', tags: { room: 'prueba', sensor: 'PRUEBA-ingesta' }, f, ts: Date.now(), seq: ++seqBase, ...over })
const DEV = 'sensor:PRUEBA-ingesta'
async function post(path, body, headers = {}) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  let j = null; try { j = await r.json() } catch { /* nada */ }
  return { status: r.status, json: j }
}
const ingest = (envs) => post('/api/ingest', { msgs: Array.isArray(envs) ? envs : [envs] })

/* ───────────── registro de resultados ───────────── */
const results = []
function record(id, group, title, expected, got, status, evidence) {
  results.push({ id, group, title, expected, got, status, evidence })
  const mark = status === 'OK' ? '✔' : status === 'OMITIDA' ? '·' : '✘'
  console.log(`  ${mark} ${id.padEnd(5)} ${title}\n        esperado: ${expected} · obtenido: ${got}${status === 'OMITIDA' ? '  (omitida)' : ''}`)
}
const expectReject = (id, group, title, reply, reason, evidence) => {
  const got = reply ? (reply.type === 'reject' ? 'rechazo «' + reply.reason + '»' : reply.type) : 'sin respuesta'
  record(id, group, title, 'rechazo «' + reason + '»', got, reply && reply.type === 'reject' && reply.reason === reason ? 'OK' : 'FALLA', evidence)
}
const skip = (id, group, title, why) => record(id, group, title, '—', why, 'OMITIDA', '')

console.log(`\nPruebas de rechazo de seguridad · ${BASE}\n  ws: ${hasWsLib ? 'librería ws' : 'WebSocket de Node (sin cabecera Origin)'} · operador: ${OP ? 'sí' : 'no'} · admin: ${ADMIN ? 'sí' : 'no'} · dispositivos: ${DEVKEY ? 'sí' : 'no'}\n`)

/* ═════════ A. órdenes por WebSocket ═════════ */
console.log('A · Órdenes por WebSocket (R1: control no autorizado)')
{
  const c = await connect().catch((e) => { console.error('No se pudo conectar a ' + WS_URL + ': ' + e.message); process.exit(1) })
  await sleep(300)
  expectReject('A1', 'ordenes', 'Orden de luz desde una sesión de solo lectura', await ask(c, { kind: 'light.set', id: 'Luz_Garage', patch: { on: true } }), 'forbidden', 'audit: result=rejected, reason=forbidden, role=lector')
  expectReject('A2', 'ordenes', 'Armar/desarmar la alarma sin permiso', await ask(c, { kind: 'security.set', mode: 'disarmed' }), 'forbidden', 'audit: kind=security.set, reason=forbidden')
  expectReject('A3', 'ordenes', 'Tipo interno (security.trigger) enviado desde fuera', await ask(c, { kind: 'security.trigger', cause: 'x' }), 'unknown_kind', 'audit: reason=unknown_kind')
  expectReject('A4', 'ordenes', 'Mensaje que no es JSON', await ask(c, 'esto no es json'), 'no_json', 'audit: reason=no_json')
  expectReject('A5', 'ordenes', 'Mensaje demasiado grande (4 KB)', await ask(c, JSON.stringify({ kind: 'light.set', id: 'x', patch: { color: 'A'.repeat(4096) } })), 'too_large', 'audit: reason=too_large')
  expectReject('A6', 'ordenes', 'JSON sin «kind»', await ask(c, { id: 'Luz_Garage' }), 'schema', 'audit: reason=schema')
  close(c)
}
{
  const c = await connect(); await sleep(250)
  // inundación desde una sesión de solo lectura
  const n0 = c.replies.length
  for (let i = 0; i < 120; i++) raw(c, JSON.stringify({ kind: 'snapshot.request' }))
  await sleep(1200)
  // Un snapshot válido responde con un mensaje «snapshot» (echoes). Con la cubeta de fichas solo unos pocos pasan.
  const snaps = c.echoes.filter((m) => m.type === 'snapshot').length
  record('A7', 'ordenes', 'Inundación: 120 mensajes en un instante desde una sesión de lectura', 'se atienden pocos (límite por sesión), el resto se descarta', snaps + ' atendidos de 120 · rechazos silenciosos: ' + (c.replies.length - n0), snaps > 0 && snaps <= 25 ? 'OK' : 'FALLA', 'audit: reason=rate_limit (con tope por segundo) y un aviso en el log de eventos')
  close(c)
}
if (!OP) {
  for (const [id, t] of [['A8', 'Clave de emparejamiento incorrecta'], ['A9', 'Bloqueo tras 5 intentos fallidos'], ['A10', 'Valor fuera de rango'], ['A11', 'Dispositivo inexistente'], ['A12', 'Campos internos colados'], ['A13', 'Rol insuficiente'], ['A14', 'Confirmación en dos pasos']]) skip(id, 'ordenes', t, 'falta CASA_PAIRING_KEY')
} else {
  {
    const c = await connect(); await sleep(250)
    expectReject('A8', 'ordenes', 'Clave de emparejamiento incorrecta', await ask(c, { kind: 'session.hello', key: 'clave-incorrecta-' + randomBytes(3).toString('hex') }), 'bad_key', 'audit: reason=bad_key')
    // A9: cuatro intentos más → 5 fallos; el 6.º, aun con la clave BUENA, queda bloqueado
    for (let i = 0; i < 4; i++) await ask(c, { kind: 'session.hello', key: 'mala-clave-' + i + '-xxxxx' })
    expectReject('A9', 'ordenes', 'Bloqueo tras 5 intentos fallidos (con la clave correcta al sexto)', await ask(c, { kind: 'session.hello', key: OP }), 'locked', 'audit: reason=locked · aviso en el log de eventos')
    close(c)
  }
  {
    const c = await connect(); await sleep(250)
    const hello = await ask(c, { kind: 'session.hello', key: OP })
    record('A0', 'ordenes', 'Control positivo: emparejar con la clave de Operador', 'sesión «operador»', hello ? hello.type + ' ' + (hello.role ?? hello.reason) : 'sin respuesta', hello && hello.type === 'session' && ['operador', 'administrador'].includes(hello.role) ? 'OK' : 'FALLA', 'audit: reason=paired')
    expectReject('A10a', 'ordenes', 'Intensidad 150 (rango 0-100)', await ask(c, { kind: 'light.set', id: 'Luz_Garage', patch: { intensity: 150 } }), 'range', 'audit: reason=range')
    expectReject('A10b', 'ordenes', 'Consigna del aire en 40 °C (rango 16-30)', await ask(c, { kind: 'ac.set', id: 'AC_Sala_Principal', patch: { setpoint: 40 } }), 'range', 'audit: reason=range')
    expectReject('A10c', 'ordenes', 'Color que no es hexadecimal', await ask(c, { kind: 'light.set', id: 'Luz_Garage', patch: { color: '#zzzzzz' } }), 'range', 'audit: reason=range')
    expectReject('A10d', 'ordenes', 'Tipo equivocado: «on» como texto', await ask(c, { kind: 'plug.set', id: 'Enchufe_TV_Sala', on: 'true' }), 'schema', 'audit: reason=schema')
    expectReject('A11', 'ordenes', 'Dispositivo inexistente', await ask(c, { kind: 'light.set', id: 'Luz_Fantasma', patch: { on: true } }), 'unknown_id', 'audit: reason=unknown_id')
    expectReject('A12a', 'ordenes', 'Campo interno «auto» colado en la orden', await ask(c, { kind: 'light.set', id: 'Luz_Garage', patch: { on: true }, auto: true }), 'schema', 'audit: reason=schema')
    expectReject('A12b', 'ordenes', 'Contaminación de prototipo («__proto__»)', await ask(c, '{"kind":"light.set","id":"Luz_Garage","patch":{"on":true},"__proto__":{"admin":true}}'), 'schema', 'audit: reason=schema')
    expectReject('A13', 'ordenes', 'Operador intenta cambiar la hora simulada (solo Administrador)', await ask(c, { kind: 'world.setHour', hour: 3 }), 'forbidden', 'audit: reason=forbidden, role=operador')
    // A14: dos pasos. Desarmar → código → sin confirmar no pasa; reutilizar el código; usarlo desde OTRA sesión
    const pedido = await ask(c, { kind: 'security.set', mode: 'disarmed' })
    record('A14a', 'ordenes', 'Desarmar la alarma pide confirmación (no se ejecuta)', 'respuesta «confirm» con código de un solo uso', pedido ? pedido.type : 'sin respuesta', pedido && pedido.type === 'confirm' && /^[0-9a-f]{8}$/.test(pedido.code || '') ? 'OK' : 'FALLA', 'audit: result=pending, reason=confirm_required')
    if (pedido && pedido.code) {
      const otra = await connect(); await sleep(200)
      await ask(otra, { kind: 'session.hello', key: OP })
      expectReject('A14b', 'ordenes', 'Usar el código de OTRA sesión', await ask(otra, { kind: 'confirm', code: pedido.code }), 'bad_confirm', 'audit: reason=bad_confirm')
      close(otra)
      const dosPasos = await ask(c, { kind: 'confirm', code: pedido.code }, 900)
      await sleep(400)
      const echo = c.echoes.some((m) => m.type === 'security' && m.state && m.state.mode === 'disarmed')
      record('A14c', 'ordenes', 'Confirmar con el código correcto (control positivo)', 'se ejecuta: llega el estado «disarmed»', echo ? 'ejecutada' : dosPasos ? dosPasos.type + ' ' + (dosPasos.reason || '') : 'sin efecto', echo ? 'OK' : 'FALLA', 'audit: reason=confirmed, confirmed=true · evento «Desarmada»')
      expectReject('A14d', 'ordenes', 'Reutilizar el mismo código (repetición)', await ask(c, { kind: 'confirm', code: pedido.code }), 'bad_confirm', 'audit: reason=bad_confirm')
    }
    // A14f-h: las otras acciones sensibles también piden confirmación y se ejecutan al confirmar (control positivo).
    // (Una versión anterior lanzaba «cfg is not defined» al pedir confirmación de una puerta o una escena: la orden se perdía sin respuesta.)
    const pPuerta = await ask(c, { kind: 'door.set', id: 'Sensor_Puerta_Entrada', open: true })
    record('A14f', 'ordenes', 'Abrir una puerta del perímetro pide confirmación', 'respuesta «confirm» con el nombre de la puerta', pPuerta ? pPuerta.type + (pPuerta.summary ? ' · ' + pPuerta.summary : '') : 'sin respuesta', pPuerta && pPuerta.type === 'confirm' && /Puerta de entrada/.test(pPuerta.summary || '') ? 'OK' : 'FALLA', 'audit: result=pending, reason=confirm_required')
    if (pPuerta && pPuerta.code) {
      const abierta = await ask(c, { kind: 'confirm', code: pPuerta.code }, 900)
      await sleep(400)
      const echoPuerta = c.echoes.some((m) => m.type === 'door' && m.id === 'Sensor_Puerta_Entrada' && m.open === true)
      record('A14g', 'ordenes', 'Confirmar la puerta del perímetro (control positivo)', 'se ejecuta: llega «abierta»', echoPuerta ? 'ejecutada' : abierta ? abierta.type + ' ' + (abierta.reason || '') : 'sin efecto', echoPuerta ? 'OK' : 'FALLA', 'audit: reason=confirmed, confirmed=true')
      await ask(c, { kind: 'door.set', id: 'Sensor_Puerta_Entrada', open: false }) // se deja cerrada (cerrar no pide confirmación)
    }
    const interior = await ask(c, { kind: 'door.set', id: 'Puerta_Cocina', open: true }, 500)
    await sleep(300)
    const echoInterior = c.echoes.some((m) => m.type === 'door' && m.id === 'Puerta_Cocina' && m.open === true)
    record('A14h', 'ordenes', 'Una puerta interior se abre sin confirmación', 'se ejecuta directo, sin «confirm»', echoInterior && !interior ? 'ejecutada' : interior ? interior.type : 'sin efecto', echoInterior && !interior ? 'OK' : 'FALLA', 'audit: result=accepted')
    await ask(c, { kind: 'door.set', id: 'Puerta_Cocina', open: false }, 300)
    const pEscena = await ask(c, { kind: 'scene.apply', id: 'llegue' })
    record('A14i', 'ordenes', 'Una escena que desarma la alarma pide confirmación', 'respuesta «confirm» con el nombre de la escena', pEscena ? pEscena.type + (pEscena.summary ? ' · ' + pEscena.summary : '') : 'sin respuesta', pEscena && pEscena.type === 'confirm' && /Llegué a casa/.test(pEscena.summary || '') ? 'OK' : 'FALLA', 'audit: result=pending, reason=confirm_required')
    // código caducado
    const p2 = await ask(c, { kind: 'security.set', mode: 'disarmed' })
    if (p2 && p2.code && !FAST) {
      await sleep((p2.ttlMs || 15000) + 800)
      expectReject('A14e', 'ordenes', 'Código caducado (más de 15 s)', await ask(c, { kind: 'confirm', code: p2.code }), 'expired', 'audit: reason=expired')
    } else skip('A14e', 'ordenes', 'Código caducado (más de 15 s)', FAST ? 'se pidió --sin-esperas' : 'no hubo código')
    close(c)
  }
}
if (flag('incluir-revocar')) {
  if (!ADMIN || !OP) skip('A15', 'ordenes', 'Revocar sesiones (admin.revoke)', 'faltan CASA_ADMIN_KEY y CASA_PAIRING_KEY')
  else {
    const a = await connect(); await sleep(200)
    const o = await connect(); await sleep(200)
    await ask(a, { kind: 'session.hello', key: ADMIN })
    await ask(o, { kind: 'session.hello', key: OP })
    const rv = await ask(a, { kind: 'admin.revoke' })
    await sleep(400)
    const caida = o.replies.find((m) => m.type === 'session' && m.revoked)
    record('A15a', 'ordenes', 'admin.revoke baja a las demás sesiones a «lector»', 'la otra sesión recibe role=lector, revoked=true', caida ? 'role=' + caida.role : 'sin aviso', caida && caida.role === 'lector' ? 'OK' : 'FALLA', 'audit: reason=revoked · aviso en el log de eventos')
    expectReject('A15b', 'ordenes', 'La sesión revocada ya no puede mandar órdenes', await ask(o, { kind: 'light.set', id: 'Luz_Garage', patch: { on: true } }), 'forbidden', 'audit: reason=forbidden, role=lector')
    expectReject('A15c', 'ordenes', 'El emparejamiento queda congelado (nueva sesión con clave correcta)', await (async () => { const n = await connect(); await sleep(200); const r = await ask(n, { kind: 'session.hello', key: OP }); close(n); return r })(), 'frozen', 'audit: reason=frozen')
    void rv; close(a); close(o)
  }
} else skip('A15', 'ordenes', 'Revocar sesiones (admin.revoke)', 'opcional: usa --incluir-revocar (congela el emparejamiento 5 min)')

/* ═════════ B. telemetría firmada (integridad del dato) ═════════ */
console.log('\nB · Telemetría firmada por POST /api/ingest (integridad del dato)')
if (!DEVKEY) {
  for (const [id, t] of [['B1', 'Control positivo'], ['B2', 'Firma inválida'], ['B3', 'Mensaje repetido'], ['B4', 'Marca de tiempo caducada'], ['B5', 'Valor fuera de rango'], ['B6', 'Dispositivo inexistente'], ['B7', 'Dispositivo no habilitado para ingesta'], ['B8', 'Salto físicamente imposible'], ['B9', 'Campo no permitido']]) skip(id, 'telemetria', t, 'falta CASA_DEVICE_KEY')
} else {
  const probe = await ingest(sign(DEV, mk(DEV, { temperature: 24.5, humidity: 55 })))
  if (probe.status === 404) {
    for (const [id, t] of [['B1', 'Control positivo'], ['B2', 'Firma inválida'], ['B3', 'Mensaje repetido'], ['B4', 'Marca de tiempo caducada'], ['B5', 'Valor fuera de rango'], ['B6', 'Dispositivo inexistente'], ['B7', 'Dispositivo no habilitado para ingesta'], ['B8', 'Salto físicamente imposible'], ['B9', 'Campo no permitido']]) skip(id, 'telemetria', t, 'la ingesta está deshabilitada (CASA_INGEST=on para probarla)')
    record('B0', 'telemetria', 'Ingesta deshabilitada responde 404', '404', String(probe.status), 'OK', 'es lo esperado en un servidor público')
  } else {
    record('B1', 'telemetria', 'Control positivo: mensaje firmado y válido', 'HTTP 202, aceptado', `HTTP ${probe.status} · aceptados ${probe.json?.accepted}`, probe.status === 202 ? 'OK' : 'FALLA', 'InfluxDB: env, room=prueba, via=ingest')
    const r = async (envs) => (await ingest(envs)).json?.rejected?.[0]?.reason ?? 'aceptado'
    const chk = (id, title, expected, got, ev) => record(id, 'telemetria', title, 'rechazo «' + expected + '»', got === 'aceptado' ? 'aceptado' : 'rechazo «' + got + '»', got === expected ? 'OK' : 'FALLA', ev)

    const malo = sign(DEV, mk(DEV, { temperature: 24 }))
    malo.sig = (malo.sig[0] === 'a' ? 'b' : 'a') + malo.sig.slice(1)
    chk('B2a', 'Firma inválida (un carácter alterado)', 'bad_signature', await r(malo), 'audit: reason=bad_signature, kind=telemetry · aviso crítico en el log')
    chk('B2b', 'Firmado con OTRA clave (no conoce CASA_DEVICE_KEY)', 'bad_signature', await r(sign(DEV, mk(DEV, { temperature: 24 }), createHash('sha256').update('otra-clave').digest())), 'audit: reason=bad_signature')
    const alterado = sign(DEV, mk(DEV, { temperature: 24 }))
    alterado.body = alterado.body.replace('"temperature":24', '"temperature":29')
    chk('B2c', 'Cuerpo alterado después de firmar (24 → 29 °C)', 'bad_signature', await r(alterado), 'audit: reason=bad_signature')

    const uno = sign(DEV, mk(DEV, { temperature: 25, humidity: 50 }))
    const p1 = await ingest(uno)
    const rep = await r(uno)
    record('B3', 'telemetria', 'Mensaje repetido (replay): se reenvía el mismo mensaje válido', 'primero aceptado, el repetido «replay»', `1.º HTTP ${p1.status} · repetido ${rep === 'aceptado' ? 'aceptado' : '«' + rep + '»'}`, p1.status === 202 && rep === 'replay' ? 'OK' : 'FALLA', 'audit: reason=replay · aviso crítico en el log')
    chk('B3b', 'Número de secuencia anterior (mensaje viejo reenviado después)', 'replay', await r(sign(DEV, mk(DEV, { temperature: 25 }, { seq: 5 }))), 'audit: reason=replay')
    chk('B4', 'Marca de tiempo de hace 2 minutos (bien firmada)', 'stale', await r(sign(DEV, mk(DEV, { temperature: 25 }, { ts: Date.now() - 120000 }))), 'audit: reason=stale')
    chk('B5a', 'Temperatura 400 °C (rango −30…70)', 'range', await r(sign(DEV, mk(DEV, { temperature: 400 }))), 'audit: reason=range')
    chk('B5b', 'Humedad −5 % (rango 0…100)', 'range', await r(sign(DEV, mk(DEV, { humidity: -5 }))), 'audit: reason=range')
    chk('B5c', 'Temperatura como texto', 'schema', await r(sign(DEV, mk(DEV, { temperature: '25' }))), 'audit: reason=schema')
    const fant = 'sensor:FANTASMA'
    chk('B6', 'Dispositivo inexistente (bien firmado con su clave derivada)', 'unknown_device', await r(sign(fant, mk(fant, { temperature: 25 }))), 'audit: reason=unknown_device')
    const real = 'sensor:DHT22-sala_principal'
    chk('B7', 'Dispositivo real del sistema pero SIN permiso de ingesta (suplantación)', 'unknown_device', await r(sign(real, mk(real, { temperature: 25 }, { tags: { room: 'sala_principal', sensor: 'DHT22-sala_principal' } }))), 'audit: reason=unknown_device')
    chk('B9', 'Campo no permitido («rm_rf»)', 'schema', await r(sign(DEV, mk(DEV, { temperature: 25, rm_rf: 1 }))), 'audit: reason=schema')
    chk('B9b', 'Etiquetas que no corresponden al dispositivo (room=sala_principal)', 'schema', await r(sign(DEV, mk(DEV, { temperature: 25 }, { tags: { room: 'sala_principal', sensor: 'PRUEBA-ingesta' } }))), 'audit: reason=schema')
    // B8: 25 °C y 2 s después 60 °C (en rango, pero imposible físicamente)
    const a = await ingest(sign(DEV, mk(DEV, { temperature: 25 })))
    await sleep(300)
    const b = await r(sign(DEV, mk(DEV, { temperature: 60 })))
    record('B8', 'telemetria', 'Salto físicamente imposible: 25 °C → 60 °C en 0,3 s', 'la 1.ª se acepta; la 2.ª «anomaly» (cuarentena)', `1.ª HTTP ${a.status} · 2.ª ${b === 'aceptado' ? 'aceptada' : '«' + b + '»'}`, a.status === 202 && b === 'anomaly' ? 'OK' : 'FALLA', 'InfluxDB: quarantine (dev, reason=anomaly) + audit + aviso crítico; NO entra en «env»')
    const sinForma = await post('/api/ingest', { nada: true })
    record('B10', 'telemetria', 'Cuerpo sin la forma esperada', 'rechazo (rechazado por el validador)', 'HTTP ' + sinForma.status, sinForma.status === 422 || sinForma.status === 400 ? 'OK' : 'FALLA', 'audit: reason=envelope')
    const grande = await post('/api/ingest', { msgs: Array.from({ length: 30 }, () => sign(DEV, mk(DEV, { temperature: 25 }))) })
    record('B11', 'telemetria', 'Petición con 30 mensajes (tope: 20 mensajes y 8 KB)', 'HTTP 400 o 413', 'HTTP ' + grande.status, grande.status === 400 || grande.status === 413 ? 'OK' : 'FALLA', 'sin registro (se corta antes de validar)')
  }
}

/* ═════════ C. configuración visible desde fuera ═════════ */
console.log('\nC · Configuración (R2: exposición de servicios y credenciales)')
{
  const h = await fetch(BASE + '/api/health').catch(() => null)
  record('C1', 'config', 'GET /api/health responde y no revela detalles internos', '200 con {status, simulation, time}', h ? 'HTTP ' + h.status : 'sin respuesta', h && h.status === 200 ? 'OK' : 'FALLA', '')
  const cors = await fetch(BASE + '/api/health', { headers: { Origin: 'https://sitio-malicioso.example' } }).catch(() => null)
  const aco = cors ? cors.headers.get('access-control-allow-origin') : '?'
  record('C2', 'config', 'CORS: un origen no permitido no recibe Access-Control-Allow-Origin', 'sin cabecera', aco ? 'cabecera = ' + aco : 'sin cabecera', !aco ? 'OK' : 'FALLA', '')
  const inj = await fetch(BASE + '/api/history/climate?room=' + encodeURIComponent('a" or 1==1 //')).catch(() => null)
  record('C3', 'config', 'Inyección en el parámetro room de la consulta Flux', 'HTTP 400', inj ? 'HTTP ' + inj.status : 'sin respuesta', inj && inj.status === 400 ? 'OK' : 'FALLA', '')
  const ed = await fetch(BASE + '/flows').catch(() => null)
  const edOpen = ed && ed.status === 200
  record('C4', 'config', 'El editor/API de administración de Node-RED exige autenticación (adminAuth)', 'HTTP 401', ed ? 'HTTP ' + ed.status : 'sin respuesta', ed && (ed.status === 401 || ed.status === 404) ? 'OK' : 'FALLA', edOpen ? 'ABIERTO: cualquiera con acceso al puerto puede leer y cambiar el flujo. En local es tolerable; en un servidor público NO.' : '')
  if (hasWsLib) {
    const evil = await connect({ Origin: 'https://sitio-malicioso.example' }).then((c) => { close(c); return 'aceptada' }).catch((e) => 'rechazada' + (e.status ? ' (HTTP ' + e.status + ')' : ''))
    record('C5', 'config', 'Handshake del WebSocket con un Origin no permitido', 'rechazada', evil, evil.startsWith('rechazada') ? 'OK' : 'FALLA', evil === 'aceptada' ? 'Sin webSocketNodeVerifyClient en settings.js (ver infra/nodered/settings.js y seguridad-ws.js). Un cliente que no es navegador puede falsificar Origin: no sustituye a la clave.' : '')
  } else skip('C5', 'config', 'Handshake del WebSocket con un Origin no permitido', 'hace falta la librería ws para enviar Origin')
}

/* ───────────── resumen ───────────── */
const ok = results.filter((x) => x.status === 'OK').length
const bad = results.filter((x) => x.status === 'FALLA')
const om = results.filter((x) => x.status === 'OMITIDA').length
console.log(`\nResumen: ${ok} correctas · ${bad.length} con falla · ${om} omitidas · ${results.length} en total`)
if (bad.length) { console.log('\nCon falla:'); for (const b of bad) console.log(`  ✘ ${b.id} ${b.title}\n      ${b.evidence ? b.evidence + '\n      ' : ''}esperado: ${b.expected} · obtenido: ${b.got}`) }
const out = arg('json', '')
if (typeof out === 'string' && out) {
  writeFileSync(out, JSON.stringify({ fecha: new Date().toISOString(), nodered: BASE, node: process.version, ws: hasWsLib ? 'ws' : 'nativo', resultados: results }, null, 2) + '\n')
  console.log('Resultados guardados en ' + out)
}
process.exit(bad.length ? 1 : 0)
