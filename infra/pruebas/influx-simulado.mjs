#!/usr/bin/env node
/**
 * InfluxDB SIMULADO (en memoria) para probar la lógica de seguridad SIN Docker.
 *
 *   node infra/pruebas/influx-simulado.mjs [--puerto 8086]
 *
 * Qué hace:
 *   POST /api/v2/write   guarda líneas (line protocol) por bucket; une campos del mismo punto como InfluxDB
 *   POST /api/v2/query   responde SOLO las dos consultas de infra/verificar-integridad.mjs (CSV anotado)
 *   GET  /health         estado (versión 2.7 simulada)
 *   GET/POST /api/v2/orgs · /api/v2/buckets · /api/v2/authorizations   lo mínimo para ejecutar infra/setup-local.mjs
 *                        (crea buckets y tokens con permisos de escritura O de lectura, y se comprueban en cada llamada)
 *   POST /__demo/manipular   simula a un atacante con acceso directo al almacén:
 *        {"accion":"borrar"|"alterar"|"inyectar", "bucket":"casa_iot", "medicion":"env", "n":3}
 *   GET  /__demo/estado  cuántos puntos hay por bucket y medición
 *   GET  /__demo/puntos?bucket=casa_iot&medicion=audit&n=20   los últimos puntos de una medición
 *
 * Tokens (opcional, para probar la separación escritura / lectura):
 *   INFLUX_TOKEN_WRITE=… INFLUX_TOKEN_READ=…  → /write solo acepta el token de escritura y /query solo el de lectura
 *   INFLUX_ADMIN_TOKEN=…                      → token con todos los permisos (el de setup-local.mjs); los tokens creados
 *                                                con /api/v2/authorizations se validan por acción (read|write) y bucket
 *
 * LÍMITE HONESTO: esto NO es InfluxDB ni evalúa Flux. Interpreta con expresiones regulares las consultas del verificador
 * (bucket, range, filtro por _measurement). Sirve para demostrar y probar la lógica; la verificación contra un InfluxDB
 * real (y su Flux) está por hacer en tu entorno con Docker.
 */
import http from 'node:http'
import zlib from 'node:zlib'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const PUERTO = Number(arg('--puerto', process.env.PORT || 8086))
const TW = process.env.INFLUX_TOKEN_WRITE || ''
const TR = process.env.INFLUX_TOKEN_READ || ''
const TA = process.env.INFLUX_ADMIN_TOKEN || ''
const ORG = { id: 'org-simulada', name: process.env.INFLUX_ORG || 'casa' }
const bucketsMeta = [] // { id, name, orgID, retentionRules }
const tokensCreados = [] // { id, token, description, status, orgID, permissions }
const MAX_PUNTOS = 600_000

/** bucket → Map(clave → { m, tags, fields, ts }) */
const buckets = new Map()

/* ───────── line protocol ───────── */
function partir(txt, sep, { respetaComillas = false } = {}) {
  const out = []
  let cur = '', q = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (c === '\\' && i + 1 < txt.length) { cur += c + txt[++i]; continue }
    if (respetaComillas && c === '"') q = !q
    if (c === sep && !q) { out.push(cur); cur = '' } else cur += c
  }
  out.push(cur)
  return out
}
const desescapar = (s) => s.replace(/\\([ ,=\\"])/g, '$1')
function valor(v) {
  if (v.startsWith('"')) return v.slice(1, -1).replace(/\\(["\\])/g, '$1')
  if (/^(t|true)$/i.test(v)) return true
  if (/^(f|false)$/i.test(v)) return false
  if (/^-?\d+i$/.test(v)) return Number(v.slice(0, -1))
  return Number(v)
}
function leerLinea(l, precision) {
  const partes = partir(l, ' ', { respetaComillas: true })
  if (partes.length < 2) return null
  const [serie, campos, marca] = partes
  const [m, ...tg] = partir(serie, ',')
  const tags = {}
  for (const t of tg) { const [k, v] = partir(t, '='); tags[desescapar(k)] = desescapar(v) }
  const fields = {}
  for (const f of partir(campos, ',', { respetaComillas: true })) {
    const i = f.indexOf('=')
    fields[desescapar(f.slice(0, i))] = valor(f.slice(i + 1))
  }
  const factor = { ns: 1e-6, us: 1e-3, ms: 1, s: 1000 }[precision] ?? 1e-6
  const ts = marca ? Math.round(Number(marca) * factor) : Date.now()
  return { m: desescapar(m), tags, fields, ts }
}
const claveSerie = (p) => p.m + '|' + Object.keys(p.tags).sort().map((k) => k + '=' + p.tags[k]).join(',') + '|' + p.ts

/* ───────── consulta (CSV anotado) ───────── */
function consulta(q) {
  const bucket = /from\(bucket:\s*"([^"]+)"/.exec(q)?.[1]
  const r = /range\(start:\s*([^,\s]+),\s*stop:\s*([^)\s]+)\)/.exec(q)
  if (!bucket || !r) return null
  const ini = Date.parse(r[1]), fin = Date.parse(r[2])
  const excl = [...q.matchAll(/r\._measurement != "([^"]+)"/g)].map((x) => x[1])
  const incl = [...q.matchAll(/r\._measurement == "([^"]+)"/g)].map((x) => x[1])
  const pts = [...(buckets.get(bucket)?.values() || [])].filter((p) => p.ts >= ini && p.ts < fin && !excl.includes(p.m) && (!incl.length || incl.includes(p.m)))
  // una tabla por serie y campo, como InfluxDB
  const tablas = new Map()
  for (const p of pts) for (const [campo, v] of Object.entries(p.fields)) {
    const k = p.m + '|' + Object.keys(p.tags).sort().map((t) => t + '=' + p.tags[t]).join(',') + '|' + campo
    ;(tablas.get(k) || tablas.set(k, { m: p.m, tags: p.tags, campo, filas: [] }).get(k)).filas.push({ ts: p.ts, v })
  }
  const esc = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s))
  let out = ''
  let n = 0
  for (const t of tablas.values()) {
    const claves = Object.keys(t.tags).sort()
    const tipo = typeof t.filas[0].v === 'number' ? 'double' : typeof t.filas[0].v === 'boolean' ? 'boolean' : 'string'
    out += `#group,false,false,true,true,false,false,true,true${',true'.repeat(claves.length)}\r\n`
    out += `#datatype,string,long,dateTime:RFC3339,dateTime:RFC3339,dateTime:RFC3339,${tipo},string,string${',string'.repeat(claves.length)}\r\n`
    out += `#default,_result,,,,,,,${',' .repeat(claves.length)}\r\n`
    out += `,result,table,_start,_stop,_time,_value,_field,_measurement${claves.map((c) => ',' + c).join('')}\r\n`
    for (const f of t.filas.sort((a, b) => a.ts - b.ts)) {
      out += `,,${n},${new Date(ini).toISOString()},${new Date(fin).toISOString()},${new Date(f.ts).toISOString()},${esc(f.v)},${esc(t.campo)},${esc(t.m)}${claves.map((c) => ',' + esc(t.tags[c])).join('')}\r\n`
    }
    out += '\r\n'
    n++
  }
  return out || '\r\n'
}

/* ───────── servidor ───────── */
const token = (req) => /^Token\s+(.+)$/i.exec(req.headers.authorization || '')?.[1] || ''
/** ¿Este token puede hacer «accion» (read|write) sobre el bucket (nombre)? */
function permitido(tok, accion, bucketNombre) {
  const restringido = TW || TR || TA || tokensCreados.length
  if (!restringido) return true
  if (TA && tok === TA) return true
  if (accion === 'write' && TW && tok === TW) return true
  if (accion === 'read' && TR && tok === TR) return true
  const t = tokensCreados.find((x) => x.token === tok && x.status === 'active')
  if (!t) return false
  const meta = bucketsMeta.find((b) => b.name === bucketNombre)
  return t.permissions.some((p) => p.action === accion && p.resource.type === 'buckets' && (!meta || p.resource.id === meta.id))
}
function total() { let t = 0; for (const b of buckets.values()) t += b.size; return t }

http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const url = new URL(req.url, 'http://x')
    const json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)) }
    let raw = Buffer.concat(chunks)
    if (raw[0] === 0x1f && raw[1] === 0x8b) raw = zlib.gunzipSync(raw)
    const cuerpo = raw.toString('utf8')

    if (req.method === 'POST' && url.pathname === '/api/v2/write') {
      const bucket = url.searchParams.get('bucket') || ''
      if (!permitido(token(req), 'write', bucket)) return json(401, { code: 'unauthorized', message: 'el token no puede ESCRIBIR en el bucket «' + bucket + '»' })
      const prec = url.searchParams.get('precision') || 'ns'
      const b = buckets.get(bucket) || buckets.set(bucket, new Map()).get(bucket)
      for (const l of cuerpo.split('\n').filter(Boolean)) {
        const p = leerLinea(l, prec)
        if (!p) continue
        const k = claveSerie(p)
        const ya = b.get(k)
        if (ya) Object.assign(ya.fields, p.fields); else b.set(k, p)
      }
      while (total() > MAX_PUNTOS) { const b0 = buckets.values().next().value; b0.delete(b0.keys().next().value) }
      res.writeHead(204); return res.end()
    }
    if (req.method === 'POST' && url.pathname === '/api/v2/query') {
      let q = cuerpo
      try { if ((req.headers['content-type'] || '').includes('json')) q = JSON.parse(cuerpo).query } catch (e) { /* texto plano */ }
      const bq = /from\(bucket:\s*"([^"]+)"/.exec(q)?.[1] || ''
      if (!permitido(token(req), 'read', bq)) return json(401, { code: 'unauthorized', message: 'el token no puede LEER el bucket «' + bq + '»' })
      if (/count\(\)/.test(q)) { // consulta de verificación de setup-local.mjs: «¿llegaron datos de potencia?»
        const n = [...(buckets.get(bq)?.values() || [])].filter((p) => p.m === 'power' && p.ts > Date.now() - 300_000 && 'watts' in p.fields).length
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' })
        const t = new Date().toISOString()
        return res.end(`#datatype,string,long,dateTime:RFC3339,dateTime:RFC3339,string,string,long\r\n,result,table,_start,_stop,_field,_measurement,_value\r\n,_result,0,${t},${t},watts,power,${n}\r\n\r\n`)
      }
      const csv = consulta(q)
      if (csv === null) return json(400, { code: 'invalid', message: 'consulta no soportada por el simulador' })
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8' }); return res.end(csv)
    }
    if (url.pathname === '/health') return json(200, { status: 'pass', name: 'influx-simulado', version: 'v2.7.0-simulado' })
    // ── lo mínimo de la API de administración que usa infra/setup-local.mjs (solo con el token de administrador) ──
    if (url.pathname.startsWith('/api/v2/orgs') || url.pathname.startsWith('/api/v2/buckets') || url.pathname.startsWith('/api/v2/authorizations')) {
      if (TA && token(req) !== TA) return json(401, { code: 'unauthorized', message: 'se necesita el token de administrador' })
      if (url.pathname === '/api/v2/orgs') return json(200, { orgs: [ORG] })
      if (url.pathname === '/api/v2/buckets' && req.method === 'GET') { const n = url.searchParams.get('name'); return json(200, { buckets: bucketsMeta.filter((b) => !n || b.name === n) }) }
      if (url.pathname === '/api/v2/buckets' && req.method === 'POST') {
        const a = JSON.parse(cuerpo)
        const b = { id: 'bucket-' + (bucketsMeta.length + 1), name: a.name, orgID: a.orgID, retentionRules: a.retentionRules || [] }
        bucketsMeta.push(b); if (!buckets.has(b.name)) buckets.set(b.name, new Map())
        return json(201, b)
      }
      if (url.pathname === '/api/v2/authorizations' && req.method === 'GET') return json(200, { authorizations: tokensCreados })
      if (url.pathname.startsWith('/api/v2/authorizations/') && req.method === 'DELETE') {
        const i = tokensCreados.findIndex((t) => t.id === url.pathname.split('/').pop())
        if (i < 0) return json(404, { code: 'not found' })
        tokensCreados.splice(i, 1); res.writeHead(204); return res.end()
      }
      if (url.pathname === '/api/v2/authorizations' && req.method === 'POST') {
        const a = JSON.parse(cuerpo)
        const t = { id: 'auth-' + (tokensCreados.length + 1), token: 'tok-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), description: a.description, status: 'active', orgID: a.orgID, permissions: a.permissions }
        tokensCreados.push(t)
        return json(201, t)
      }
      return json(404, { code: 'not found' })
    }
    if (url.pathname === '/__demo/puntos') {
      const b = buckets.get(url.searchParams.get('bucket') || 'casa_iot')
      const med = url.searchParams.get('medicion')
      const n = Number(url.searchParams.get('n')) || 20
      return json(200, [...(b?.values() || [])].filter((p) => !med || p.m === med).sort((x, y) => y.ts - x.ts).slice(0, n))
    }
    if (url.pathname === '/__demo/estado') {
      const o = {}
      for (const [nom, b] of buckets) { o[nom] = {}; for (const p of b.values()) o[nom][p.m] = (o[nom][p.m] || 0) + 1 }
      return json(200, o)
    }
    if (req.method === 'POST' && url.pathname === '/__demo/manipular') {
      let a
      try { a = JSON.parse(cuerpo) } catch (e) { return json(400, { error: 'JSON' }) }
      const b = buckets.get(a.bucket || 'casa_iot')
      if (!b) return json(404, { error: 'bucket inexistente' })
      const n = Math.max(1, Number(a.n) || 1)
      const lista = [...b.entries()].filter(([, p]) => (!a.medicion || p.m === a.medicion) && (a.desde == null || p.ts >= Date.parse(a.desde)) && (a.hasta == null || p.ts < Date.parse(a.hasta)))
      if (a.accion === 'borrar') { lista.slice(0, n).forEach(([k]) => b.delete(k)); return json(200, { borrados: Math.min(n, lista.length) }) }
      if (a.accion === 'alterar') {
        let h = 0
        for (const [, p] of lista.slice(0, n)) for (const [c, v] of Object.entries(p.fields)) if (typeof v === 'number') { p.fields[c] = v + 1; h++; break }
        return json(200, { alterados: h })
      }
      if (a.accion === 'inyectar') {
        const base = lista[0]?.[1]
        if (!base) return json(404, { error: 'no hay punto base' })
        for (let i = 0; i < n; i++) { const p = { ...base, tags: { ...base.tags }, fields: { ...base.fields }, ts: base.ts + 1 + i }; b.set(claveSerie(p), p) }
        return json(200, { inyectados: n })
      }
      return json(400, { error: 'acción desconocida' })
    }
    res.writeHead(404); res.end()
  })
}).listen(PUERTO, '127.0.0.1', () => console.log(`influx simulado en http://127.0.0.1:${PUERTO}  (solo para pruebas · no es InfluxDB)`))
