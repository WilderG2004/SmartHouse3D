#!/usr/bin/env node
/**
 * Deja listo TU Node-RED local (sin Docker) con el flujo «Casa IoT · Gemelo digital».
 *
 *   node infra/setup-local.mjs --influx-token <TOKEN_ADMIN>
 *
 * Qué hace, en orden:
 *   1. Comprueba InfluxDB 2.x y el token.
 *   2. Crea los buckets (si no existen): el de datos y uno APARTE para las huellas de integridad, y DOS tokens:
 *        - escritura (SOLO escribe)  → lo usa el nodo que guarda en InfluxDB
 *        - lectura   (SOLO lee)      → lo usan las consultas del historial y infra/verificar-integridad.mjs
 *   3. Comprueba Node-RED e instala el nodo node-red-contrib-influxdb si falta.
 *   4. Despliega el flujo con URL, org, bucket y token ya puestos. NO borra tus otros flujos
 *      (guarda antes una copia de seguridad).
 *   5. Verifica que llegan datos a InfluxDB.
 *
 * Opciones (o variables de entorno entre paréntesis):
 *   --influx-token   token con permisos de administrador / All Access   (INFLUX_ADMIN_TOKEN)  ← lo único obligatorio
 *   --influx-url     https://us-east-1-1.aws.cloud2.influxdata.com (tu InfluxDB Cloud)   (INFLUX_URL)
 *                    para un InfluxDB local:  --influx-url http://localhost:8086
 *   --org            nombre de la organización (si solo hay una, se detecta) (INFLUX_ORG)
 *   --bucket         Casa_IoT  (distingue mayúsculas y minúsculas)       (INFLUX_BUCKET)
 *   --integrity-bucket  <bucket>_integridad  (huellas de integridad)      (INFLUX_INTEGRITY_BUCKET)
 *   --retention-days 30 (0 = sin límite)
 *   --nodered        http://localhost:1880                               (NODERED_URL)
 *   --nodered-user / --nodered-pass   usuario y contraseña del EDITOR (adminAuth). Con el settings.js endurecido del
 *                    proyecto son obligatorios (NODERED_USER / NODERED_PASS); el usuario por defecto es «admin»
 *   --no-create-token  usa el token administrador tal cual en Node-RED (MENOS seguro: un solo token con todos los permisos)
 *   --dry-run          solo comprueba y cuenta qué haría; no cambia nada
 *
 * Requiere Node.js 18 o superior. No usa dependencias externas y nunca imprime los tokens.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'

const here = dirname(fileURLToPath(import.meta.url))

/* ───────────── argumentos ───────────── */
const args = {}
{
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) args[key] = true
    else { args[key] = next; i++ }
  }
}
const opt = (name, env, def) => (typeof args[name] === 'string' ? args[name] : process.env[env] ?? def)

const INFLUX_URL = opt('influx-url', 'INFLUX_URL', 'https://us-east-1-1.aws.cloud2.influxdata.com').replace(/\/$/, '')
const NR_URL = opt('nodered', 'NODERED_URL', 'http://localhost:1880').replace(/\/$/, '')
const BUCKET = opt('bucket', 'INFLUX_BUCKET', 'Casa_IoT')
const RETENTION_DAYS = Number(opt('retention-days', 'INFLUX_RETENTION_DAYS', '30'))
const DRY = !!args['dry-run']
const VERIFY_ONLY = !!args['verify-only']
const VERIFY_TIMEOUT_S = Number(opt('verify-timeout', 'VERIFY_TIMEOUT_S', '60'))
const INTEGRITY_BUCKET = opt('integrity-bucket', 'INFLUX_INTEGRITY_BUCKET', `${BUCKET}_integridad`)
// Antes había UN token de lectura+escritura («Node-RED · bucket»). Ahora son dos, cada uno con un solo permiso.
const TOKEN_DESC_LEGACY = `Node-RED · ${BUCKET}`
const TOKEN_DESC_W = `Node-RED escritura · ${BUCKET}`
const TOKEN_DESC_R = `Node-RED lectura · ${BUCKET}`
const FLOWS_PATH = opt('flows', 'FLOWS_FILE', join(here, 'nodered', 'flows.local.json'))
const TAB_LABEL = 'Casa IoT · Gemelo digital'
const OUR_IDS = new Set(['tab_casa', 'cfg_influx', 'cfg_influx_read', 'cfg_ws'])

/* ───────────── salida ───────────── */
const say = (m = '') => console.log(m)
const ok = (m) => say(`  ✔ ${m}`)
const warn = (m) => say(`  ⚠ ${m}`)
const note = (m) => say(`    ${m}`)
const step = (m) => say(`\n${m}`)
function die(msg, hint) {
  console.error(`\n  ✘ ${msg}`)
  if (hint) for (const l of [].concat(hint)) console.error(`    ${l}`)
  process.exit(1)
}

if (Number(process.versions.node.split('.')[0]) < 18) die('Hace falta Node.js 18 o superior.', `Tienes ${process.version}.`)

/* ───────────── HTTP ───────────── */
async function http(url, { method = 'GET', headers = {}, body, timeout = 20000 } = {}) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeout)
  try {
    const res = await fetch(url, { method, headers, body, signal: ctl.signal })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* no es JSON */ }
    return { status: res.status, ok: res.ok, text, json, headers: res.headers }
  } catch (e) {
    return { status: 0, ok: false, text: String(e?.cause?.code ?? e?.message ?? e), json: null }
  } finally {
    clearTimeout(t)
  }
}

let adminToken = opt('influx-token', 'INFLUX_ADMIN_TOKEN', '')
let nrBearer = ''
const influx = (path, o = {}) => http(INFLUX_URL + path, { ...o, headers: { Authorization: `Token ${o.token ?? adminToken}`, ...(o.headers ?? {}) } })
const nr = (path, o = {}) => http(NR_URL + path, { ...o, headers: { ...(nrBearer ? { Authorization: `Bearer ${nrBearer}` } : {}), ...(o.headers ?? {}) } })
const jsonBody = (o) => ({ body: JSON.stringify(o), headers: { 'Content-Type': 'application/json' } })

say('Casa IoT · preparar tu Node-RED local' + (DRY ? '  (modo --dry-run: no se cambia nada)' : ''))

/* ───────────── 1. InfluxDB ───────────── */
step('1/5  Comprobaciones (todavía no se cambia nada)')
if (!adminToken && process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  adminToken = (await rl.question('    Pega tu token de administrador de InfluxDB (All Access): ')).trim()
  rl.close()
}
if (!adminToken) die('Falta el token de administrador de InfluxDB.', ['Crea uno en InfluxDB ▸ Load Data ▸ API Tokens ▸ Generate ▸ All Access Token,', 'y ejecuta:  node infra/setup-local.mjs --influx-token <TOKEN>'])

const health = await http(INFLUX_URL + '/health')
if (health.status === 0) die(`No hay respuesta de InfluxDB en ${INFLUX_URL}`, ['¿Está iniciado? Si usa otro puerto: --influx-url http://localhost:PUERTO', `(detalle: ${health.text})`])
const version = String(health.json?.version ?? '')
if (/^v?1\./.test(version)) die(`Tu InfluxDB es ${version} (1.x). Este flujo usa InfluxDB 2.x (token, organización y bucket).`, 'Avísame y lo adaptamos a 1.x.')
ok(`InfluxDB ${version || '2.x'} responde en ${INFLUX_URL}`)
{
  // Si el reloj del PC está desfasado, los datos se guardan con la hora equivocada y «no aparecen»
  const srv = Date.parse(health.headers?.get?.('date') ?? '')
  if (Number.isFinite(srv) && Math.abs(srv - Date.now()) > 2 * 60 * 1000) {
    warn(`El reloj de tu PC difiere ${Math.round((Date.now() - srv) / 60000)} min del de InfluxDB: los datos se guardarían con la hora equivocada. Corrige la fecha y hora de Windows.`)
  }
}

const orgsRes = await influx('/api/v2/orgs')
if (orgsRes.status === 401 || orgsRes.status === 403) die(`InfluxDB rechazó el token (HTTP ${orgsRes.status}): es inválido, está desactivado o no tiene permisos suficientes.`, ['Debe ser un token All Access (InfluxDB ▸ Load Data ▸ API Tokens ▸ Generate ▸ All Access Token),', 'copiado completo y sin espacios. Si lo pegaste en un chat, revócalo y crea otro.'])
if (!orgsRes.ok) die(`No se pudieron leer las organizaciones (HTTP ${orgsRes.status}).`, orgsRes.text.slice(0, 200))
const orgs = orgsRes.json?.orgs ?? []
const wanted = opt('org', 'INFLUX_ORG', '')
let org = orgs.find((o) => o.name === wanted) ?? (wanted ? null : orgs.length === 1 ? orgs[0] : null)
if (!org) die(wanted ? `No existe la organización «${wanted}».` : 'Hay varias organizaciones: indica cuál con --org.', `Disponibles: ${orgs.map((o) => o.name).join(', ') || '(ninguna)'}`)
ok(`Organización: ${org.name}`)

/* ───────────── Node-RED (comprobación; no cambia nada) ───────────── */
{
  const probe = await http(NR_URL + '/auth/login')
  if (probe.status === 0) die(`No hay respuesta de Node-RED en ${NR_URL}`, ['¿Está iniciado? (comando: node-red). Si usa otro puerto: --nodered http://localhost:PUERTO', `(detalle: ${probe.text})`])
  if (probe.json?.type === 'credentials') {
    const user = opt('nodered-user', 'NODERED_USER', 'admin'), pass = opt('nodered-pass', 'NODERED_PASS', '')
    if (!user || !pass) die('Tu Node-RED pide usuario y contraseña (adminAuth).', 'Ejecuta con --nodered-user <usuario> --nodered-pass <contraseña>')
    const body = new URLSearchParams({ client_id: 'node-red-admin', grant_type: 'password', scope: '*', username: user, password: pass })
    const r = await http(NR_URL + '/auth/token', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    if (!r.json?.access_token) die('Node-RED rechazó el usuario o la contraseña.')
    nrBearer = r.json.access_token
  }
}
const settings = await nr('/settings')
if (!settings.ok) die(`Node-RED no dejó leer su configuración (HTTP ${settings.status}).`, settings.status === 404 ? ['El editor y la API de administración están apagados (settings.js endurecido sin NODERED_ADMIN_HASH).', 'Define NODERED_ADMIN_HASH (npm run seguridad:secretos) o, solo en tu equipo, NODERED_EDITOR=open, y reinicia Node-RED.'] : undefined)
const httpNodeRoot = (settings.json?.httpNodeRoot ?? '/').replace(/\/$/, '')
ok(`Node-RED ${settings.json?.version ?? ''} responde en ${NR_URL}`)


if (VERIFY_ONLY) {
  // Solo verificar (no crea ni despliega nada): reutiliza el token propio ya creado, si existe
  const list = await influx(`/api/v2/authorizations?orgID=${org.id}`)
  const existing = list.json?.authorizations?.find((a) => a.description === TOKEN_DESC_W && a.status === 'active' && a.token)
  if (!existing) warn(`No encontré el token «${TOKEN_DESC_W}»: la prueba de escritura usará el de administrador.`)
  await verify(existing?.token ?? adminToken)
}
if (!VERIFY_ONLY) {

/* ───────────── 2. buckets y tokens ───────────── */
step(`2/5  Buckets «${BUCKET}» y «${INTEGRITY_BUCKET}», y tokens separados`)
async function asegurarBucket(nombre, retencionDias) {
  const r = await influx(`/api/v2/buckets?name=${encodeURIComponent(nombre)}&orgID=${org.id}`)
  if (r.ok && r.json?.buckets?.length) { ok(`El bucket «${nombre}» ya existe`); return r.json.buckets[0].id }
  if (r.status !== 404 && !r.ok) die(`No se pudo consultar el bucket «${nombre}» (HTTP ${r.status}).`, r.text.slice(0, 200))
  if (DRY) { note(`(dry-run) crearía el bucket «${nombre}» con retención de ${retencionDias || '∞'} días`); return null }
  const c = await influx('/api/v2/buckets', {
    method: 'POST',
    ...jsonBody({ orgID: org.id, name: nombre, retentionRules: retencionDias > 0 ? [{ type: 'expire', everySeconds: retencionDias * 86400 }] : [] }),
  })
  if (c.status === 401 || c.status === 403) die('Ese token no puede crear buckets.', 'Usa un token All Access, o crea el bucket a mano en la web y vuelve a ejecutar.')
  if (!c.ok) die(`No se pudo crear el bucket «${nombre}» (HTTP ${c.status}).`, c.text.slice(0, 200))
  ok(`Bucket «${nombre}» creado (retención ${retencionDias > 0 ? retencionDias + ' días' : 'sin límite'})`)
  return c.json.id
}
const bucketId = await asegurarBucket(BUCKET, RETENTION_DAYS)
// las huellas viven más que los datos: así se puede comprobar qué pasó aunque los datos viejos ya hayan expirado
const integrityId = await asegurarBucket(INTEGRITY_BUCKET, RETENTION_DAYS > 0 ? RETENTION_DAYS * 3 : 0)

let writeToken = adminToken
let readToken = adminToken
if (args['no-create-token']) {
  warn('Se usará el token de administrador dentro de Node-RED (--no-create-token): un solo token con todos los permisos.')
} else if (DRY) {
  note('(dry-run) crearía un token de SOLO escritura y otro de SOLO lectura sobre esos dos buckets')
} else {
  const list = await influx(`/api/v2/authorizations?orgID=${org.id}`)
  const todos = list.json?.authorizations ?? []
  const activo = (desc) => todos.find((a) => a.description === desc && a.status === 'active' && a.token)
  const perm = (action, id) => ({ action, resource: { type: 'buckets', id, orgID: org.id } })
  const ids = [bucketId, integrityId].filter(Boolean)
  async function asegurarToken(desc, action) {
    const e = activo(desc)
    if (e) { ok(`Se reutiliza el token «${desc}» (ya existía)`); return e.token }
    const r = await influx('/api/v2/authorizations', { method: 'POST', ...jsonBody({ orgID: org.id, description: desc, permissions: ids.map((id) => perm(action, id)) }) })
    if (r.ok && r.json?.token) { ok(`Token «${desc}» creado: solo ${action === 'write' ? 'escribe' : 'lee'} en «${BUCKET}» y «${INTEGRITY_BUCKET}»`); return r.json.token }
    warn(`No se pudo crear el token «${desc}» (HTTP ${r.status}); se usará el de administrador.`)
    return adminToken
  }
  writeToken = await asegurarToken(TOKEN_DESC_W, 'write')
  readToken = await asegurarToken(TOKEN_DESC_R, 'read')
  if (activo(TOKEN_DESC_LEGACY)) warn(`Existe el token antiguo «${TOKEN_DESC_LEGACY}» (lectura Y escritura). Ya no se usa: REVÓCALO en InfluxDB ▸ API Tokens.`)
}
const nrToken = writeToken // (la prueba de escritura de la verificación usa el token de escritura)

/* ───────────── 3. nodo de InfluxDB en la paleta ───────────── */
step('3/5  Nodo de InfluxDB en Node-RED')
const sets = await nr('/nodes', { headers: { Accept: 'application/json' } })
const hasInflux = Array.isArray(sets.json) && sets.json.some((s) => s.module === 'node-red-contrib-influxdb' && s.enabled !== false)
if (hasInflux) ok('El nodo node-red-contrib-influxdb ya está instalado')
else if (DRY) note('(dry-run) instalaría node-red-contrib-influxdb desde la paleta')
else {
  note('Instalando node-red-contrib-influxdb (puede tardar un minuto)…')
  const r = await nr('/nodes', { method: 'POST', ...jsonBody({ module: 'node-red-contrib-influxdb' }), timeout: 240000 })
  if (!r.ok) die('No se pudo instalar el nodo de InfluxDB desde Node-RED.', ['Hazlo a mano:  cd ~/.node-red  &&  npm install node-red-contrib-influxdb   y reinicia Node-RED.', `(HTTP ${r.status}: ${r.text.slice(0, 160)})`])
  ok('Nodo node-red-contrib-influxdb instalado')
}

/* ───────────── 4. flujo ───────────── */
step('4/5  Flujo')
let ours
try { ours = JSON.parse(readFileSync(FLOWS_PATH, 'utf8')) } catch (e) { die(`No se pudo leer el flujo ${FLOWS_PATH}`, String(e.message)) }

// Ajustes de InfluxDB dentro del flujo: DOS servidores de configuración, cada uno con su token
const configurar = (id, token, sufijo) => {
  const c = ours.find((n) => n.id === id)
  if (!c) die(`El flujo no tiene el nodo de configuración «${id}» (¿flows.local.json desactualizado? ejecuta: FLOWS_FILE=flows.local.json NO_CRED=1 npm run nodered:build).`)
  c.url = INFLUX_URL
  c.influxdbVersion = '2.0'
  // El editor de Node-RED marca el servidor como inválido (triángulo rojo) si «database» está vacío, aunque sea InfluxDB 2.x
  c.database = c.database || 'database'
  // Con HTTPS (InfluxDB Cloud) se valida el certificado del servidor; en http local no aplica
  c.rejectUnauthorized = INFLUX_URL.startsWith('https://')
  c.name = `InfluxDB · ${BUCKET} · ${sufijo}`
  c.credentials = { token }
}
configurar('cfg_influx', writeToken, 'escritura')
configurar('cfg_influx_read', readToken, 'lectura')
for (const n of ours) {
  if (n.type === 'influxdb batch') {
    const esHuella = n.id.endsWith('_int')
    n.org = org.name; n.bucket = esHuella ? INTEGRITY_BUCKET : BUCKET
    n.name = esHuella ? `Huellas de integridad · ${INTEGRITY_BUCKET}` : `Guardar en InfluxDB · ${BUCKET}`
  }
  if (n.type === 'influxdb in') n.org = org.name
}
// La configuración embebida en «Configuración y estado inicial» (la API de historial usa el bucket)
const initFn = ours.find((n) => n.type === 'function' && typeof n.func === 'string' && n.func.includes('"INFLUX"'))
if (!initFn) die('El flujo no tiene el nodo de configuración esperado (¿flows.local.json modificado?).')
// (el bucket de huellas va en el nodo «Huellas de integridad», ya ajustado arriba)
const patched = initFn.func.replace(/("INFLUX": \{\s*"org": )"[^"]*"(,\s*"bucket": )"[^"]*"/, `$1${JSON.stringify(org.name)}$2${JSON.stringify(BUCKET)}`)
if (patched === initFn.func && !initFn.func.includes(`"bucket": ${JSON.stringify(BUCKET)}`)) die('No se pudo ajustar el bucket dentro del flujo.')
initFn.func = patched

const cur = await nr('/flows')
if (!cur.ok || !Array.isArray(cur.json)) die(`No se pudieron leer tus flujos actuales (HTTP ${cur.status}).`)
let flows = cur.json

// Si ya existía una copia (importada a mano o de una ejecución anterior), se reemplaza para no duplicar la simulación
const oldTabs = flows.filter((n) => n.type === 'tab' && (n.id === 'tab_casa' || n.label === TAB_LABEL)).map((n) => n.id)
const removedIds = new Set([...OUR_IDS, ...oldTabs])
flows = flows.filter((n) => !(OUR_IDS.has(n.id) || oldTabs.includes(n.z)))
flows = flows.filter((n) => !(n.type === 'tab' && oldTabs.includes(n.id)))
// config huérfanos de una importación anterior (mismo WebSocket / servidor InfluxDB «InfluxDB · …»)
const stillUsed = (id) => flows.some((n) => JSON.stringify(n).includes(`"${id}"`))
flows = flows.filter((n) => {
  const ours_ = (n.type === 'websocket-listener' && n.path === '/ws/casa-iot') || (n.type === 'influxdb' && String(n.name ?? '').startsWith('InfluxDB · '))
  return !(ours_ && !stillUsed(n.id))
})
const kept = flows.filter((n) => n.type !== 'tab').length
if (oldTabs.length) note(`Se reemplaza la copia anterior del flujo (${oldTabs.length} pestaña)`)

if (DRY) {
  note(`(dry-run) añadiría la pestaña «${TAB_LABEL}» (${ours.filter((n) => n.z === 'tab_casa').length} nodos) y dejaría intactos tus ${kept} nodos actuales`)
} else {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dir = join(process.cwd(), 'nodered-backups')
  mkdirSync(dir, { recursive: true })
  const backup = join(dir, `flows-antes-${stamp}.json`)
  writeFileSync(backup, JSON.stringify(cur.json, null, 2))
  ok(`Copia de seguridad de tus flujos: ${backup}`)

  const r = await nr('/flows', { method: 'POST', body: JSON.stringify([...flows, ...ours]), headers: { 'Content-Type': 'application/json', 'Node-RED-Deployment-Type': 'full' }, timeout: 60000 })
  if (!(r.status === 204 || r.status === 200)) die(`Node-RED no aceptó el despliegue (HTTP ${r.status}).`, [r.text.slice(0, 300), `Tus flujos originales están en ${backup}`])
  ok(`Flujo «${TAB_LABEL}» desplegado · tus otros ${kept} nodos quedaron intactos`)
}

/* ───────────── 5. verificación ───────────── */
if (DRY) {
  step('5/5  Verificación')
  note('(dry-run) terminado: no se cambió nada.')
} else {
await verify(nrToken)

say(`
Listo. Siguiente:
  • Editor de Node-RED:  ${NR_URL}   (pestaña «${TAB_LABEL}»)
  • Frontend:  en .env pon  VITE_TELEMETRY_MODE=websocket  y ejecuta  npm run dev
  • Para deshacer: importa de nuevo tu copia de seguridad (carpeta nodered-backups/).
  • Para volver a verificar sin tocar nada:  node infra/setup-local.mjs --verify-only`)
}
} // fin de «if (!VERIFY_ONLY)»

/* ───────────── verificación (función) ───────────── */
async function verify(tokenForNodeRed) {
  step(VERIFY_ONLY ? 'Verificación' : '5/5  Verificación')
  await new Promise((r) => setTimeout(r, VERIFY_ONLY ? 0 : 6000))

  const hh = await http(`${NR_URL}${httpNodeRoot}/api/health`)
  if (hh.ok && hh.json?.status === 'ok') ok(`API del flujo: ${NR_URL}${httpNodeRoot}/api/health → simulación ${hh.json.simulation ? 'viva' : 'sin inicializar'}`)
  else warn(`/api/health no respondió (HTTP ${hh.status}). Mira el editor de Node-RED: ¿algún nodo con triángulo rojo?`)

  // Cuenta lecturas de potencia en un rango (InfluxDB devuelve CSV anotado)
  const countPoints = async (range) => {
    const flux = `from(bucket: "${BUCKET}") |> range(start: ${range}) |> filter(fn: (r) => r._measurement == "power" and r._field == "watts") |> count()`
    const q = await influx(`/api/v2/query?orgID=${org.id}`, { method: 'POST', ...jsonBody({ query: flux, type: 'flux' }), headers: { 'Content-Type': 'application/json', Accept: 'application/csv' } })
    return { ok: q.ok, status: q.status, text: q.text, count: q.ok ? sumarValor(q.text) : 0 }
  }
  // Suma la columna «_value» del CSV anotado. La columna se localiza por el encabezado (no por su posición) y se ignoran
  // las líneas de anotación (#…); así no depende del orden de columnas ni de los saltos de línea de Windows (\r\n).
  const sumarValor = (csv) => {
    let col = -1, total = 0
    for (const raw of csv.split(/\r?\n/)) {
      if (!raw || raw.startsWith('#')) continue
      const c = raw.split(',')
      if (c.includes('_value') && c.includes('table')) { col = c.indexOf('_value'); continue } // encabezado (se repite por cada tabla distinta)
      const v = col >= 0 ? (c[col] ?? '').trim() : ''
      if (/^\d+$/.test(v)) total += Number(v)
    }
    return total
  }
  // Lo que Node-RED cuenta de sus propias escrituras (lotes enviados y errores de InfluxDB). Usa la API de administración:
  // GET /context/flow/<pestaña>/state.pipe. Devuelve null si no se puede leer.
  const estadoNodeRED = async () => {
    const r = await nr('/context/flow/tab_casa/state.pipe')
    if (!r.ok) return null
    try { return JSON.parse(r.json?.msg ?? 'null') } catch { return null }
  }
  const esperar = async (segundos) => {
    const limite = Date.now() + segundos * 1000
    let r = await countPoints('-5m')
    while (r.count === 0 && Date.now() < limite) {
      await new Promise((ok_) => setTimeout(ok_, 5000))
      r = await countPoints('-5m')
    }
    return r
  }

  note(`Esperando datos en InfluxDB (hasta ${VERIFY_TIMEOUT_S} s)…`)
  let res = await esperar(VERIFY_TIMEOUT_S)
  if (res.count === 0 && res.ok) {
    // InfluxDB Cloud puede tardar en mostrar lo recién escrito. Si Node-RED dice que ya envió lotes y no hubo errores, se espera un poco más.
    const p0 = await estadoNodeRED()
    if (p0 && p0.batches > 0 && !p0.errors) {
      note(`Node-RED ya envió ${p0.batches} lotes sin errores; InfluxDB aún no los muestra. Espero 45 s más…`)
      res = await esperar(45)
    }
  }
  if (res.count > 0) {
    ok(`InfluxDB ya recibió ${res.count} lecturas de potencia en los últimos 5 minutos`)
    return true
  }

  warn('No llegaron datos a InfluxDB. Diagnóstico:')
  if (!res.ok) note(`• La consulta de verificación falló (HTTP ${res.status}): ${res.text.slice(0, 160)}`)

  // Prueba de escritura directa con el MISMO token que usa Node-RED (deja un punto «setup_test»; es inofensivo)
  const w = await http(`${INFLUX_URL}/api/v2/write?org=${encodeURIComponent(org.name)}&bucket=${encodeURIComponent(BUCKET)}&precision=ms`, {
    method: 'POST',
    headers: { Authorization: `Token ${tokenForNodeRed}`, 'Content-Type': 'text/plain; charset=utf-8' },
    body: `setup_test,origen=setup-local ok=1i ${Date.now()}`,
  })
  if (w.ok) note('• El token de escritura SÍ funciona contra InfluxDB: no es un problema de permisos.')
  else if (w.status === 401) note('• El token de Node-RED es inválido (HTTP 401).')
  else if (w.status === 403) note('• El token de Node-RED no tiene permiso de escritura sobre el bucket (HTTP 403).')
  else if (w.status === 404) note(`• InfluxDB no encuentra la organización «${org.name}» o el bucket «${BUCKET}» (HTTP 404). Revisa el nombre exacto: distingue mayúsculas.`)
  else if (w.status === 429) note('• InfluxDB limitó las escrituras (HTTP 429): suele ser el límite del plan gratuito. Espera unos minutos y vuelve a verificar.')
  else note(`• La escritura de prueba falló (HTTP ${w.status}): ${w.text.slice(0, 160)}`)

  const old = await countPoints('-24h')
  if (old.count > 0) note(`• Hay ${old.count} lecturas de las últimas 24 h pero ninguna de los últimos 5 min: el flujo dejó de escribir, o el reloj de tu PC está desfasado.`)

  // Lo que ve Node-RED por su lado: es la pista más útil para saber dónde se pierden los datos
  const p = await estadoNodeRED()
  if (!p) note('• No pude leer el estado interno de Node-RED (¿el flujo se desplegó en la pestaña «Casa IoT · Gemelo digital»?).')
  else if (p.errors > 0) note(`• Node-RED cuenta ${p.errors} escrituras rechazadas por InfluxDB. Último error: ${p.lastError ?? '(sin detalle)'}`)
  else if (p.batches > 0) note(`• Node-RED ya envió ${p.batches} lotes (${p.points} puntos) y InfluxDB no devolvió ningún error. Lo más probable es que solo tarde en mostrarlos: espera 1–2 min y ejecuta  node infra/setup-local.mjs --verify-only  (o mira InfluxDB ▸ Data Explorer ▸ bucket «${BUCKET}», rango «Past 15m»).`)
  else note('• Node-RED todavía no ha preparado ningún lote para InfluxDB: revisa que la simulación esté en marcha (el panel de depuración y los triángulos rojos del editor).')

  note('• En el editor de Node-RED (pestaña «Casa IoT · Gemelo digital»):')
  note('    – ¿«Guardar en InfluxDB» tiene un triángulo rojo? Pasa el ratón por encima: muestra el error.')
  note('    – Abre el panel de depuración (icono del bicho, arriba a la derecha): ahí salen los errores.')
  note('    – Si habla de 401/403, abre el nodo de configuración «InfluxDB · …», pega el token «' + TOKEN_DESC_W + '» (escritura) o «' + TOKEN_DESC_R + '» (lectura) de InfluxDB ▸ API Tokens y pulsa Deploy.')
  note('• Cuando lo arregles:  node infra/setup-local.mjs --verify-only')
  return false
}
