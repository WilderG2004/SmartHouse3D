#!/usr/bin/env node
/**
 * Verifica la INTEGRIDAD DEL HISTÓRICO guardado en InfluxDB.
 *
 *   Node-RED, cada 5 minutos, escribe una huella por bloque de datos en el bucket de integridad:
 *     hash = HMAC( clave de integridad,  prev : bloque : cantidad : SHA256(huellas de los puntos ordenadas) )
 *   y cada huella incluye la anterior (cadena). Este script vuelve a calcular todo a partir de lo que HOY hay
 *   en InfluxDB y lo compara con esas huellas. Detecta:
 *     ALTERADO     un punto del bloque cambió de valor (misma cantidad, otro contenido) o la huella fue editada
 *     FALTAN       se borraron N puntos del bloque
 *     SOBRAN       aparecieron N puntos que Node-RED nunca validó (inyección directa en InfluxDB)
 *     CADENA_ROTA  falta una huella intermedia (o se reordenó): alguien borró un bloque entero de huellas
 *     SIN_HUELLA   hay datos en un bloque ya cerrado sin huella (normal en el bloque del arranque de Node-RED;
 *                  sospechoso si se borraron las huellas del final)
 *
 *   Uso:
 *     CASA_DEVICE_KEY=… INFLUX_TOKEN_READ=… node infra/verificar-integridad.mjs [opciones]
 *       --ultimas 6h        ventana a revisar (30m, 6h, 2d). Por defecto 6h
 *       --desde ISO --hasta ISO   ventana exacta (alternativa a --ultimas)
 *       --estricto          SIN_HUELLA también cuenta como fallo (exit 1)
 *       --json archivo      guarda el resultado completo
 *   Variables: INFLUX_URL (http://localhost:8086) · INFLUX_ORG (casa) · INFLUX_BUCKET (casa_iot)
 *              INFLUX_INTEGRITY_BUCKET (casa_iot_integridad) · INFLUX_TOKEN_READ (solo lectura, ambos buckets)
 *              CASA_DEVICE_KEY (la misma de Node-RED: sin ella no se puede recalcular la huella)
 *
 *   Límites honestos:
 *     - La huella dice QUE un bloque cambió, no CUÁL punto: no guarda las huellas individuales.
 *     - Quien conozca CASA_DEVICE_KEY puede fabricar huellas válidas. Y como Node-RED firma y valida, un Node-RED
 *       comprometido también puede escribir datos falsos con huella correcta: esto detecta manipulación DEL
 *       ALMACÉN (InfluxDB), no de la fuente.
 *     - La cadena empieza de nuevo (prev = GENESIS) cada vez que se reinicia Node-RED.
 *     - Los datos fuera de la retención de InfluxDB desaparecen legítimamente: no revises más atrás de la retención.
 */
import { createHash, createHmac } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/* ───────── configuración ───────── */
const env = process.env
const URL_BASE = (env.INFLUX_URL || 'http://localhost:8086').replace(/\/+$/, '')
const ORG = env.INFLUX_ORG || 'casa'
const BUCKET = env.INFLUX_BUCKET || 'casa_iot'
const BUCKET_INT = env.INFLUX_INTEGRITY_BUCKET || 'casa_iot_integridad'
const TOKEN = env.INFLUX_TOKEN_READ || ''
const MASTER = env.CASA_DEVICE_KEY || ''
const EXCLUIDAS = ['audit', 'quarantine'] // mediciones que escribe Node-RED pero que no entran en las huellas
const GRACIA_MS = 60_000

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
const flag = (n) => args.includes(n)

function duracion(txt) {
  const m = /^(\d+)\s*(m|h|d)$/i.exec(String(txt || '').trim())
  if (!m) throw new Error('Duración no válida: ' + txt + ' (usa 30m, 6h o 2d)')
  return Number(m[1]) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase()]
}

/* ───────── cálculo (idéntico al de Node-RED: ver 87-validar-telemetria.js y el helper «crypto» de build-flows.mts) ───────── */
const sha256Hex = (d) => createHash('sha256').update(d).digest('hex')
const hmacHex = (k, d) => createHmac('sha256', k).update(d).digest('hex')
const sortedPairs = (o) => Object.keys(o || {}).sort().map((k) => [k, o[k]])
const canon = (m, tags, f, ts) => JSON.stringify([m, sortedPairs(tags), sortedPairs(f), ts])
const huellaPunto = (p) => sha256Hex(canon(p.m, p.tags, p.f, p.ts))
const claveIntegridad = () => createHmac('sha256', Buffer.from(MASTER, 'utf8')).update('casa-iot/integrity/v1').digest()
const huellaBloque = (prev, k, hashes) => hmacHex(claveIntegridad(), [prev, k, hashes.length, sha256Hex([...hashes].sort().join(''))].join(':'))

/* ───────── lectura de InfluxDB (Flux → CSV anotado) ───────── */
function parseLinea(linea) {
  const out = []
  let cur = '', q = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (q) { if (c === '"') { if (linea[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

/** CSV anotado de InfluxDB → filas {_time, _value, _field, _measurement, …etiquetas} con el tipo de _value ya convertido. */
export function parseCsv(texto) {
  const filas = []
  let tipos = null, cab = null
  for (const crudo of texto.split(/\r?\n/)) {
    if (!crudo.trim()) { tipos = null; cab = null; continue }
    const c = parseLinea(crudo)
    if (c[0] === '#datatype') { tipos = c; continue }
    if (c[0].startsWith('#')) continue
    if (!cab) { cab = c; continue }
    const fila = {}
    cab.forEach((nombre, i) => {
      if (!nombre || nombre === 'result' || nombre === 'table') return
      fila[nombre] = c[i]
    })
    const iv = cab.indexOf('_value')
    const t = tipos ? tipos[iv] : 'string'
    if (iv >= 0) {
      const v = c[iv]
      fila._value = t === 'double' || t === 'long' || t === 'unsignedLong' ? Number(v) : t === 'boolean' ? v === 'true' : v
    }
    filas.push(fila)
  }
  return filas
}

async function flux(consulta) {
  const r = await fetch(`${URL_BASE}/api/v2/query?org=${encodeURIComponent(ORG)}`, {
    method: 'POST',
    headers: { Authorization: 'Token ' + TOKEN, 'Content-Type': 'application/vnd.flux', Accept: 'application/csv' },
    body: consulta,
  })
  if (!r.ok) throw new Error('InfluxDB respondió HTTP ' + r.status + ' a la consulta: ' + (await r.text()).slice(0, 200))
  return parseCsv(await r.text())
}

const COLUMNAS_SISTEMA = new Set(['_start', '_stop', '_time', '_value', '_field', '_measurement', ''])

/** Agrupa las filas (una por campo) en puntos {m, tags, f, ts}. */
export function agruparPuntos(filas) {
  const mapa = new Map()
  for (const fila of filas) {
    const tags = {}
    for (const [k, v] of Object.entries(fila)) if (!COLUMNAS_SISTEMA.has(k) && !k.startsWith('_') && v !== '') tags[k] = v
    const ts = Date.parse(fila._time)
    const clave = fila._measurement + '|' + JSON.stringify(sortedPairs(tags)) + '|' + ts
    let p = mapa.get(clave)
    if (!p) mapa.set(clave, (p = { m: fila._measurement, tags, f: {}, ts }))
    p.f[fila._field] = fila._value
  }
  return [...mapa.values()]
}

const iso = (ms) => new Date(ms).toISOString()
async function puntosDe(desde, hasta) {
  const filtro = EXCLUIDAS.map((m) => `r._measurement != "${m}"`).join(' and ')
  const filas = await flux(`from(bucket: "${BUCKET}")\n  |> range(start: ${iso(desde)}, stop: ${iso(hasta)})\n  |> filter(fn: (r) => ${filtro})`)
  return agruparPuntos(filas)
}
async function huellasDe(desde, hasta) {
  const filas = await flux(`from(bucket: "${BUCKET_INT}")\n  |> range(start: ${iso(desde)}, stop: ${iso(hasta)})\n  |> filter(fn: (r) => r._measurement == "integrity")`)
  const porTs = new Map()
  for (const f of filas) {
    const ts = Date.parse(f._time)
    const d = porTs.get(ts) || porTs.set(ts, { ts }).get(ts)
    d[f._field] = f._value
  }
  return [...porTs.values()].filter((d) => typeof d.hash === 'string' && typeof d.prev === 'string').sort((a, b) => a.ts - b.ts)
}

/* ───────── verificación ───────── */
export function verificar({ digests, puntos, ahora, bloqueMs }) {
  const porBloque = new Map()
  for (const p of puntos) {
    const k = Math.floor(p.ts / bloqueMs)
    ;(porBloque.get(k) || porBloque.set(k, []).get(k)).push(p)
  }
  const resultados = []
  const conHuella = new Set()
  let anterior = null
  for (const d of digests) {
    const bms = Number(d.block_ms) || bloqueMs
    const k = Math.round(Number(d.block_start) / bms)
    conHuella.add(k)
    const pts = porBloque.get(k) || []
    const hashes = pts.map(huellaPunto)
    const esperadaCount = Number(d.count)
    const calculada = huellaBloque(d.prev, k, hashes)
    const r = { bloque: iso(k * bms), puntos: pts.length, huella_puntos: esperadaCount, estado: 'OK', detalle: '' }
    if (calculada !== d.hash) {
      if (pts.length < esperadaCount) { r.estado = 'FALTAN'; r.detalle = `faltan ${esperadaCount - pts.length} punto(s) (había ${esperadaCount}, quedan ${pts.length})` }
      else if (pts.length > esperadaCount) { r.estado = 'SOBRAN'; r.detalle = `sobran ${pts.length - esperadaCount} punto(s) que Node-RED nunca validó` }
      else { r.estado = 'ALTERADO'; r.detalle = 'misma cantidad de puntos pero el contenido no coincide (valor modificado o huella editada)' }
    }
    // cadena: cada huella debe apuntar a la anterior, salvo si empieza una cadena nueva (prev = GENESIS tras un reinicio)
    if (d.prev !== 'GENESIS' && anterior && anterior.hash !== d.prev && r.estado === 'OK') { r.estado = 'CADENA_ROTA'; r.detalle = 'la huella anterior no coincide: falta o se cambió una huella intermedia' }
    else if (d.prev !== 'GENESIS' && !anterior && r.estado === 'OK') r.detalle = 'primera huella de la ventana: no se puede comprobar su enlace con la anterior'
    resultados.push(r)
    anterior = d
  }
  for (const [k, pts] of [...porBloque.entries()].sort((a, b) => a[0] - b[0])) {
    if (conHuella.has(k)) continue
    const cerrado = (k + 1) * bloqueMs + GRACIA_MS <= ahora
    resultados.push({ bloque: iso(k * bloqueMs), puntos: pts.length, huella_puntos: null, estado: cerrado ? 'SIN_HUELLA' : 'ABIERTO', detalle: cerrado ? 'bloque cerrado sin huella (normal solo en el bloque del arranque de Node-RED; si no, alguien borró la huella)' : 'bloque en curso: aún no se firma' })
  }
  return resultados.sort((a, b) => a.bloque.localeCompare(b.bloque))
}

/* ───────── programa principal ───────── */
async function main() {
  if (!TOKEN) throw new Error('Falta INFLUX_TOKEN_READ (token de SOLO lectura de ambos buckets).')
  if (MASTER.length < 12) throw new Error('Falta CASA_DEVICE_KEY (la misma que usa Node-RED; sin ella no se puede recalcular la huella).')
  const ahora = Date.now()
  const hasta = opt('--hasta') ? Date.parse(opt('--hasta')) : ahora + 1000
  const desde = opt('--desde') ? Date.parse(opt('--desde')) : hasta - duracion(opt('--ultimas') || '6h')
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde >= hasta) throw new Error('Ventana de tiempo no válida.')

  const digests = await huellasDe(desde, hasta)
  const bloqueMs = digests.length ? Number(digests[0].block_ms) || 300_000 : 300_000
  // se alinea la ventana a bloques completos (un bloque a medias daría falsos «faltan»)
  const d0 = Math.ceil(desde / bloqueMs) * bloqueMs
  const puntos = []
  for (let t = d0; t < hasta; t += 3_600_000) puntos.push(...(await puntosDe(t, Math.min(t + 3_600_000, hasta))))
  const res = verificar({ digests: digests.filter((d) => d.ts >= d0), puntos: puntos.filter((p) => p.ts >= d0), ahora, bloqueMs })

  const cuenta = {}
  for (const r of res) cuenta[r.estado] = (cuenta[r.estado] || 0) + 1
  console.log(`Verificación de integridad · ${URL_BASE} · ${BUCKET} (huellas en ${BUCKET_INT})`)
  console.log(`Ventana: ${iso(d0)} → ${iso(hasta)} · ${digests.length} huella(s) · ${puntos.length} punto(s)\n`)
  for (const r of res) console.log(`  ${r.estado === 'OK' ? '✔' : r.estado === 'ABIERTO' || r.estado === 'SIN_HUELLA' ? '·' : '✘'} ${r.bloque}  ${r.estado.padEnd(11)} ${String(r.puntos).padStart(6)} pts  ${r.detalle}`)
  console.log('\nResumen: ' + (Object.entries(cuenta).map(([k, v]) => `${v} ${k}`).join(' · ') || 'sin bloques en la ventana'))
  const malos = (cuenta.ALTERADO || 0) + (cuenta.FALTAN || 0) + (cuenta.SOBRAN || 0) + (cuenta.CADENA_ROTA || 0) + (flag('--estricto') ? cuenta.SIN_HUELLA || 0 : 0)
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify({ ventana: { desde: iso(d0), hasta: iso(hasta) }, resumen: cuenta, bloques: res }, null, 2))
  process.exit(malos ? 1 : 0)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => { console.error('Error: ' + e.message); process.exit(2) })
}
