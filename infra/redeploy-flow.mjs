#!/usr/bin/env node
/**
 * Cambia el flujo «Casa IoT · Gemelo digital» de tu Node-RED por la versión del proyecto
 * SIN necesitar ningún token de InfluxDB: reutiliza el servidor InfluxDB (URL, organización, bucket y token)
 * que ya dejó configurado  node infra/setup-local.mjs.
 *
 *   node infra/redeploy-flow.mjs [--flows infra/nodered/flows.local.json] [--nodered http://localhost:1880]
 *                                [--nodered-user U --nodered-pass P]   (editor protegido con adminAuth; usuario por defecto «admin»)
 *                                [--integrity-bucket B]   (bucket de las huellas; por defecto el que ya tenga o <bucket>_integridad)
 *                                [--dry-run]
 *
 * Qué hace: lee tu instalación actual, ajusta el flujo nuevo a tu URL/org/bucket, guarda una copia de seguridad
 * en ./nodered-backups/, reemplaza SOLO la pestaña «Casa IoT · Gemelo digital» (tus otros flujos quedan intactos)
 * y comprueba que el historial responde. Nunca imprime ni necesita tokens.
 * Si es la primera instalación (no hay nada previo), usa  node infra/setup-local.mjs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leer } from './lib/envfile.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = {}
{
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) args[argv[i].slice(2)] = true
    else { args[argv[i].slice(2)] = next; i++ }
  }
}
const opt = (name, env, def) => (typeof args[name] === 'string' ? args[name] : process.env[env] ?? def)
const NR = opt('nodered', 'NODERED_URL', 'http://localhost:1880').replace(/\/$/, '')
const FLOWS_PATH = opt('flows', 'FLOWS_FILE', join(here, 'nodered', 'flows.local.json'))
const DRY = !!args['dry-run']
const INT_ARG = typeof args['integrity-bucket'] === 'string' ? args['integrity-bucket'] : ''
const TAB_LABEL = 'Casa IoT · Gemelo digital'
const OUR_IDS = new Set(['tab_casa', 'cfg_influx', 'cfg_influx_read', 'cfg_ws'])

const say = (m = '') => console.log(m)
const ok = (m) => say(`  ✔ ${m}`)
const warn = (m) => say(`  ⚠ ${m}`)
const note = (m) => say(`    ${m}`)
function die(msg, hint) { console.error(`\n  ✘ ${msg}`); for (const l of [].concat(hint ?? [])) console.error(`    ${l}`); process.exit(1) }
if (Number(process.versions.node.split('.')[0]) < 18) die('Hace falta Node.js 18 o superior.', `Tienes ${process.version}.`)

let bearer = ''
async function http(url, { method = 'GET', headers = {}, body, timeout = 20000 } = {}) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeout)
  try {
    const res = await fetch(url, { method, headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...headers }, body, signal: ctl.signal })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* no es JSON */ }
    return { status: res.status, ok: res.ok, text, json }
  } catch (e) {
    return { status: 0, ok: false, text: String(e?.cause?.code ?? e?.message ?? e), json: null }
  } finally { clearTimeout(t) }
}

say('Casa IoT · cambiar el flujo de tu Node-RED' + (DRY ? '  (modo --dry-run: no se cambia nada)' : ''))

/* ───────── 1. Node-RED ───────── */
say('\n1/3  Node-RED')
const probe = await http(NR + '/auth/login')
if (probe.status === 0) die(`No hay respuesta de Node-RED en ${NR}`, ['¿Está iniciado? Si usa otro puerto: --nodered http://localhost:PUERTO', `(detalle: ${probe.text})`])
if (probe.json?.type === 'credentials') {
  const user = opt('nodered-user', 'NODERED_USER', 'admin'), pass = opt('nodered-pass', 'NODERED_PASS', '')
  if (!user || !pass) die('Tu Node-RED pide usuario y contraseña (adminAuth).', 'Ejecuta con --nodered-user <usuario> --nodered-pass <contraseña>')
  const r = await http(NR + '/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: 'node-red-admin', grant_type: 'password', scope: '*', username: user, password: pass }) })
  if (!r.json?.access_token) die('Node-RED rechazó el usuario o la contraseña.')
  bearer = r.json.access_token
}
const settings = await http(NR + '/settings')
if (!settings.ok) die(`Node-RED no dejó leer su configuración (HTTP ${settings.status}).`, settings.status === 404 ? ['El editor y la API de administración están apagados (settings.js endurecido sin NODERED_ADMIN_HASH).', 'Define NODERED_ADMIN_HASH (npm run seguridad:secretos) o, solo en tu equipo, NODERED_EDITOR=open, y reinicia Node-RED.'] : undefined)
const root = (settings.json?.httpNodeRoot ?? '/').replace(/\/$/, '')
ok(`Node-RED ${settings.json?.version ?? ''} responde en ${NR}`)

const cur = await http(NR + '/flows')
if (!cur.ok || !Array.isArray(cur.json)) die(`No se pudieron leer tus flujos actuales (HTTP ${cur.status}).`)
const oldCfg = cur.json.find((n) => n.type === 'influxdb' && n.id === 'cfg_influx')
const oldBatch = cur.json.find((n) => n.type === 'influxdb batch' && !String(n.id).endsWith('_int')) // el de datos, no el de huellas
if (!oldCfg || !oldBatch) {
  die('No encuentro una instalación previa de Casa IoT en tu Node-RED.', ['Es la primera vez: usa  node infra/setup-local.mjs  (necesita un token All Access de InfluxDB).',
    'Si importaste el flujo a mano, repite con setup-local.mjs para que quede con el servidor «cfg_influx».'])
}
const { url, } = oldCfg
const { org, bucket } = oldBatch
ok(`Se reutiliza tu conexión a InfluxDB: ${url} · organización «${org}» · bucket «${bucket}» (el token queda como está)`)

/* ───────── 2. flujo nuevo ───────── */
say('\n2/3  Flujo')
let ours
try { ours = JSON.parse(readFileSync(FLOWS_PATH, 'utf8')) } catch (e) { die(`No se pudo leer el flujo ${FLOWS_PATH}`, String(e.message)) }
// Dos servidores de InfluxDB: «cfg_influx» (SOLO escribe) y «cfg_influx_read» (SOLO lee). Los tokens quedan como están.
const oldRead = cur.json.find((n) => n.type === 'influxdb' && n.id === 'cfg_influx_read')
const oldInt = cur.json.find((n) => n.type === 'influxdb batch' && String(n.id).endsWith('_int'))
const intBucket = INT_ARG || oldInt?.bucket || `${bucket}_integridad`
if (!INT_ARG && !oldInt) warn(`Es la primera vez que hay huellas de integridad: se guardarán en el bucket «${intBucket}». Debe existir (créalo con setup-local.mjs o en InfluxDB).`)
const configurar = (id, viejo, sufijo) => {
  const c = ours.find((n) => n.id === id)
  c.url = url
  c.influxdbVersion = '2.0'
  c.name = viejo?.name ?? `InfluxDB · ${bucket} · ${sufijo}`
  c.database = c.database || 'database'
  c.rejectUnauthorized = url.startsWith('https://')
  delete c.credentials // NO se envían credenciales: Node-RED conserva el token guardado para ese servidor
}
configurar('cfg_influx', oldCfg, 'escritura')
if (oldRead) configurar('cfg_influx_read', oldRead, 'lectura')
else {
  // Instalación anterior con UN solo token: las consultas usan el de escritura/lectura que ya existe hasta que ejecutes setup-local.mjs
  warn('Tu instalación tiene un solo token de InfluxDB (lectura y escritura). Las consultas lo seguirán usando.')
  note('Para separar permisos (uno solo escribe, otro solo lee) ejecuta  node infra/setup-local.mjs  una vez.')
  ours.splice(ours.findIndex((n) => n.id === 'cfg_influx_read'), 1)
  for (const n of ours) if (n.type === 'influxdb in') n.influxdb = 'cfg_influx'
}
for (const n of ours) {
  if (n.type === 'influxdb batch') {
    const esHuella = String(n.id).endsWith('_int')
    n.org = org; n.bucket = esHuella ? intBucket : bucket
    n.name = esHuella ? `Huellas de integridad · ${intBucket}` : `Guardar en InfluxDB · ${bucket}`
  }
  if (n.type === 'influxdb in') n.org = org
}
const initFn = ours.find((n) => n.type === 'function' && typeof n.func === 'string' && n.func.includes('"INFLUX"'))
if (!initFn) die('El flujo no tiene el nodo de configuración esperado.')
const patched = initFn.func.replace(/("INFLUX": \{\s*"org": )"[^"]*"(,\s*"bucket": )"[^"]*"/, `$1${JSON.stringify(org)}$2${JSON.stringify(bucket)}`)
if (patched === initFn.func && !initFn.func.includes(`"bucket": ${JSON.stringify(bucket)}`)) die('No se pudo ajustar el bucket dentro del flujo.')
initFn.func = patched

let flows = cur.json
const oldTabs = flows.filter((n) => n.type === 'tab' && (n.id === 'tab_casa' || n.label === TAB_LABEL)).map((n) => n.id)
const before = flows.filter((n) => oldTabs.includes(n.z)).length
flows = flows.filter((n) => !(OUR_IDS.has(n.id) || oldTabs.includes(n.z) || (n.type === 'tab' && oldTabs.includes(n.id))))
const kept = flows.filter((n) => n.type !== 'tab').length
const nuevos = ours.filter((n) => n.z === 'tab_casa').length
note(`Se reemplaza la pestaña «${TAB_LABEL}» (${before} nodos) por la nueva (${nuevos} nodos); tus otros ${kept} nodos quedan intactos`)

if (DRY) {
  note('(dry-run) terminado: no se cambió nada.')
} else {

const dir = join(process.cwd(), 'nodered-backups')
mkdirSync(dir, { recursive: true })
const backup = join(dir, `flows-antes-cambio-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(backup, JSON.stringify(cur.json, null, 2))
ok(`Copia de seguridad de tus flujos: ${backup}`)
const r = await http(NR + '/flows', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Node-RED-Deployment-Type': 'full' }, body: JSON.stringify([...flows, ...ours]), timeout: 60000 })
if (!(r.status === 204 || r.status === 200)) die(`Node-RED no aceptó el despliegue (HTTP ${r.status}).`, [r.text.slice(0, 300), `Tus flujos originales están en ${backup}`])
ok(`Flujo «${TAB_LABEL}» desplegado`)

/* ───────── 3. verificación (sin token: el historial lo consulta Node-RED con el suyo) ───────── */
say('\n3/3  Verificación')
await new Promise((r) => setTimeout(r, 8000))
const hh = await http(`${NR}${root}/api/health`)
if (hh.ok && hh.json?.status === 'ok') ok(`API del flujo: ${NR}${root}/api/health → simulación ${hh.json.simulation ? 'viva' : 'sin inicializar'}`)
else warn(`/api/health no respondió (HTTP ${hh.status}). Mira el editor de Node-RED: ¿algún nodo con triángulo rojo?`)

note('Comprobando que Node-RED guarda y lee de InfluxDB con su propio token (hasta 60 s)…')
// El historial exige la clave de un usuario: la de la terminal o la de infra/.env (nunca se imprime)
const envFile = leer(join(here, '.env')).valores
const claveApi = process.env.CASA_ADMIN_KEY || process.env.CASA_PAIRING_KEY || envFile.CASA_ADMIN_KEY || envFile.CASA_PAIRING_KEY || ''
let points = -1, last = null
const deadline = Date.now() + 60000
do {
  const to = Date.now()
  last = await http(`${NR}${root}/api/history/power?from=${to - 5 * 60000}&to=${to}&bucket=5`, { headers: claveApi ? { Authorization: `Bearer ${claveApi}` } : {} })
  if (last.status === 401) break
  points = last.ok && Array.isArray(last.json) ? last.json.length : -1
  if (points > 0) break
  await new Promise((r) => setTimeout(r, 5000))
} while (Date.now() < deadline)
if (points > 0) ok(`InfluxDB responde: ${points} lecturas de consumo en los últimos 5 minutos`)
else if (last?.status === 401) warn('El historial exige una clave (Authorization: Bearer). Define CASA_ADMIN_KEY en la terminal o en infra/.env para esta comprobación.')
else if (last?.status === 502) { warn('Node-RED no pudo consultar InfluxDB.'); note(`Detalle: ${String(last.json?.detail ?? last.text).slice(0, 160)}`); note('Abre el nodo «InfluxDB · … · lectura» en el editor y revisa que el token sea el de «Node-RED lectura · …».') }
else warn('Aún no hay lecturas en InfluxDB. Espera un minuto y abre  ' + `${NR}${root}/api/history/power?bucket=10`)

say(`
Listo.
  • Editor de Node-RED:  ${NR}   (pestaña «${TAB_LABEL}»; recarga con F5)
  • Para deshacer: importa tu copia de seguridad (carpeta nodered-backups/).`)
}
