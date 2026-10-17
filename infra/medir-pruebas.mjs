#!/usr/bin/env node
/**
 * Mide, contra TU Node-RED, los numeros que pide el documento (seccion "Resultados"):
 *   - tiempo en recibir el estado completo al conectar
 *   - tiempo entre una orden y su confirmacion (luces)
 *   - cuantos mensajes por segundo llegan de cada tipo
 *   - tiempo de respuesta de la API REST (/api/health y /api/history/power)
 *
 * Uso:   CASA_PAIRING_KEY=<clave de Operador> node infra/medir-pruebas.mjs [--nodered http://localhost:1880] [--ordenes 40] [--segundos 20]
 *        (las órdenes de luces exigen una sesión emparejada: la clave es la misma que usa Node-RED, ver .env.example)
 * Necesita Node.js 22 o mas (trae WebSocket incluido). Solo LEE y manda ordenes de luces; deja la luz como estaba.
 */
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
const BASE = arg('nodered', 'http://localhost:1880').replace(/\/$/, '')
const ORDENES = Number(arg('ordenes', 40))
const SEGUNDOS = Number(arg('segundos', 20))
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws/casa-iot'
const CLAVE = arg('clave', process.env.CASA_PAIRING_KEY || '')
if (!CLAVE) {
  console.error('Falta la clave de emparejamiento (rol Operador): CASA_PAIRING_KEY=… node infra/medir-pruebas.mjs')
  console.error('Sin ella Node-RED rechaza las órdenes (la sesión es de solo lectura). Si arrancaste Node-RED sin claves, mira en su registro la clave temporal.')
  process.exit(1)
}

if (typeof WebSocket === 'undefined') {
  console.error('Este script necesita Node.js 22 o mas (WebSocket incluido). Version actual: ' + process.version)
  process.exit(1)
}

const now = () => performance.now()
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] }
const resumen = (arr) => ({ n: arr.length, min: +Math.min(...arr).toFixed(1), mediana: +pct(arr, 50).toFixed(1), p95: +pct(arr, 95).toFixed(1), max: +Math.max(...arr).toFixed(1) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const out = { fecha: new Date().toISOString(), nodered: BASE, node: process.version }

// 1) Conexion + estado completo
const t0 = now()
const ws = new WebSocket(WS_URL)
const counts = {}
let onMsg = () => {}
let snapshot = null
let tSnapshot = null
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data))
  counts[m.type] = (counts[m.type] || 0) + 1
  if (m.type === 'snapshot' && !snapshot) { snapshot = m.state; tSnapshot = now() - t0 }
  onMsg(m)
}
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('No se pudo conectar a ' + WS_URL)) })
const tOpen = now() - t0
// Emparejar la sesión con la clave de Operador (sin esto las órdenes se rechazan con «forbidden»)
let rol = null
onMsg = (m) => { if (m.type === 'session') rol = m.role }
ws.send(JSON.stringify({ kind: 'session.hello', key: CLAVE }))
ws.send(JSON.stringify({ kind: 'snapshot.request' }))
for (let i = 0; i < 100 && !snapshot; i++) await sleep(50)
for (let i = 0; i < 40 && !rol; i++) await sleep(50)
if (rol !== 'operador' && rol !== 'administrador') { console.error('Node-RED no aceptó la clave de emparejamiento (rol obtenido: ' + (rol ?? 'ninguno') + ').'); process.exit(3) }
if (!snapshot) { console.error('Node-RED no envio el estado completo'); process.exit(2) }
out.conexion_ms = +tOpen.toFixed(1)
out.estado_completo_ms = +(tSnapshot ?? now() - t0).toFixed(1)

// 2) Orden -> confirmacion (se alterna una luz y se vuelve al estado inicial)
const luzId = Object.keys(snapshot.lights)[0]
const inicial = snapshot.lights[luzId].on
let estado = inicial
const lat = []
for (let i = 0; i < ORDENES; i++) {
  estado = !estado
  const t = now()
  const conf = new Promise((res) => { onMsg = (m) => { if (m.type === 'light' && m.id === luzId && m.patch?.on === estado) res(now() - t) } })
  ws.send(JSON.stringify({ kind: 'light.set', id: luzId, patch: { on: estado } }))
  const r = await Promise.race([conf, sleep(3000).then(() => null)])
  if (r !== null) lat.push(r)
  await sleep(40)
}
onMsg = () => {}
if (estado !== inicial) ws.send(JSON.stringify({ kind: 'light.set', id: luzId, patch: { on: inicial } }))
out.orden_confirmacion_ms = lat.length ? { ...resumen(lat), enviadas: ORDENES } : { enviadas: ORDENES, n: 0 }

// 3) Mensajes por segundo (ventana limpia)
for (const k of Object.keys(counts)) counts[k] = 0
await sleep(SEGUNDOS * 1000)
out.mensajes_por_segundo = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, +(v / SEGUNDOS).toFixed(2)]))
ws.close()

// 4) API REST
async function medirGet(ruta, veces = 15) {
  const t = []
  let ultimo = null
  for (let i = 0; i < veces; i++) {
    const a = now()
    try { const r = await fetch(BASE + ruta); ultimo = r.status; await r.text() } catch { ultimo = 'sin respuesta' }
    t.push(now() - a)
    await sleep(100)
  }
  return { ...resumen(t), http: ultimo }
}
const to = Date.now()
out.api_health_ms = await medirGet('/api/health')
out.api_history_power_15min_ms = await medirGet(`/api/history/power?from=${to - 15 * 60000}&to=${to}&bucket=3`)

console.log(JSON.stringify(out, null, 2))
