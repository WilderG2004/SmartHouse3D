#!/usr/bin/env node
/**
 * Aplica la RETENCIÓN (cuánto tiempo guarda InfluxDB los datos) a los buckets de Casa IoT que YA existen.
 * Guardar solo lo necesario es parte de la privacidad: el historial de consumo, puertas y movimiento dice cuándo hay
 * alguien en casa.
 *
 *   npm run seguridad:retencion                         (equivale a:  node infra/aplicar-retencion.mjs)
 *   node infra/aplicar-retencion.mjs --dry-run          muestra el plan sin cambiar nada
 *
 * Por defecto:  datos (y auditoría, que vive en el mismo bucket)  30 días  ·  huellas de integridad  90 días
 *
 * Opciones (o variables de entorno entre paréntesis):
 *   --influx-token      token con permiso para modificar buckets (All Access)   (INFLUX_ADMIN_TOKEN)
 *                       Se pide en pantalla si no está. Ponlo en la terminal ($env:INFLUX_ADMIN_TOKEN), no en un archivo.
 *   --influx-url        (INFLUX_URL)    · --org (INFLUX_ORG)
 *   --bucket            (INFLUX_BUCKET) · --integrity-bucket (INFLUX_INTEGRITY_BUCKET)
 *   --dias 30           (INFLUX_RETENTION_DAYS)            0 = sin límite
 *   --dias-huellas 90   (INFLUX_INTEGRITY_RETENTION_DAYS)  0 = sin límite
 * Lo que no se indique se toma del flujo instalado en tu Node-RED local (infra/nodered-local/flows.json: URL, org y
 * buckets de verdad) y, si no hay, de infra/.env.
 *
 * ⚠ Bajar la retención BORRA en InfluxDB los datos más viejos que el nuevo límite (eso es lo que se busca).
 * InfluxDB Cloud gratuito permite como máximo 30 días: si pides más, el script lo explica y no cambia ese bucket.
 * Nunca imprime el token.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'
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
const DRY = !!args['dry-run']
const envFile = leer(join(here, '.env')).valores
// Lo que ya está instalado en tu Node-RED local manda sobre infra/.env (que trae los valores del InfluxDB de Docker)
const instalado = (() => {
  try {
    const flows = JSON.parse(readFileSync(join(here, 'nodered-local', 'flows.json'), 'utf8'))
    const cfg = flows.find((n) => n.type === 'influxdb' && n.id === 'cfg_influx')
    const datos = flows.find((n) => n.type === 'influxdb batch' && !String(n.id).endsWith('_int'))
    const huellas = flows.find((n) => n.type === 'influxdb batch' && String(n.id).endsWith('_int'))
    return { INFLUX_URL: cfg?.url, INFLUX_ORG: datos?.org, INFLUX_BUCKET: datos?.bucket, INFLUX_INTEGRITY_BUCKET: huellas?.bucket }
  } catch { return {} }
})()
const opt = (name, env, def) => (typeof args[name] === 'string' ? args[name] : process.env[env] || instalado[env] || envFile[env] || def)

const URL_BASE = String(opt('influx-url', 'INFLUX_URL', 'http://localhost:8086')).replace(/\/+$/, '')
const ORG = opt('org', 'INFLUX_ORG', '')
const BUCKET = opt('bucket', 'INFLUX_BUCKET', 'casa_iot')
const BUCKET_INT = opt('integrity-bucket', 'INFLUX_INTEGRITY_BUCKET', `${BUCKET}_integridad`)
const DIAS = Number(opt('dias', 'INFLUX_RETENTION_DAYS', '30'))
const DIAS_INT = Number(opt('dias-huellas', 'INFLUX_INTEGRITY_RETENTION_DAYS', '90'))

const die = (m, h) => { console.error('\n  ✘ ' + m); for (const l of [].concat(h || [])) console.error('    ' + l); process.exit(1) }
if (![DIAS, DIAS_INT].every((d) => Number.isInteger(d) && d >= 0)) die('Los días deben ser enteros ≥ 0 (0 = sin límite).')

let token = typeof args['influx-token'] === 'string' ? args['influx-token'] : process.env.INFLUX_ADMIN_TOKEN || envFile.INFLUX_ADMIN_TOKEN || ''
if (!token && process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  token = (await rl.question('    Pega un token de InfluxDB con permiso sobre los buckets (All Access): ')).trim()
  rl.close()
}
if (!token) die('Falta el token de InfluxDB.', ['En PowerShell:  $env:INFLUX_ADMIN_TOKEN = "<token>"; npm run seguridad:retencion', 'Después:        Remove-Item Env:INFLUX_ADMIN_TOKEN'])

async function api(ruta, { method = 'GET', body } = {}) {
  try {
    const r = await fetch(URL_BASE + ruta, { method, headers: { Authorization: 'Token ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const t = await r.text()
    let j = null; try { j = JSON.parse(t) } catch { /* sin cuerpo */ }
    return { ok: r.ok, status: r.status, json: j, text: t }
  } catch (e) { return { ok: false, status: 0, json: null, text: String(e?.cause?.code ?? e?.message ?? e) } }
}

const texto = (s) => (s > 0 ? `${Math.round(s / 86400 * 10) / 10} días` : 'sin límite')
console.log(`Casa IoT · retención de InfluxDB${DRY ? '  (dry-run: no se cambia nada)' : ''}\n  ${URL_BASE}`)

const orgs = await api('/api/v2/orgs')
if (orgs.status === 0) die(`No hay respuesta de InfluxDB en ${URL_BASE}`, `(detalle: ${orgs.text})`)
if (orgs.status === 401 || orgs.status === 403) die('InfluxDB rechazó el token.', 'Usa un token All Access de esa organización.')
const lista = orgs.json?.orgs ?? []
const org = ORG ? lista.find((o) => o.name === ORG) : lista.length === 1 ? lista[0] : null
if (!org) die(ORG ? `No existe la organización «${ORG}».` : 'Hay varias organizaciones: indica cuál con --org.', `Existentes: ${lista.map((o) => o.name).join(', ') || '(ninguna)'}`)

let fallos = 0
for (const [nombre, dias] of [[BUCKET, DIAS], [BUCKET_INT, DIAS_INT]]) {
  const r = await api(`/api/v2/buckets?name=${encodeURIComponent(nombre)}&orgID=${org.id}`)
  const b = r.json?.buckets?.[0]
  if (!b) { console.log(`  ⚠ El bucket «${nombre}» no existe en «${org.name}»: se omite.`); continue }
  const actual = b.retentionRules?.find((x) => x.type === 'expire')?.everySeconds ?? 0
  const nuevo = dias * 86400
  if (actual === nuevo) { console.log(`  ✔ «${nombre}»: ya tiene ${texto(actual)}`); continue }
  if (DRY) { console.log(`  · «${nombre}»: ${texto(actual)} → ${texto(nuevo)} (dry-run)`); continue }
  const p = await api(`/api/v2/buckets/${b.id}`, { method: 'PATCH', body: { retentionRules: nuevo > 0 ? [{ type: 'expire', everySeconds: nuevo }] : [] } })
  if (p.ok) { console.log(`  ✔ «${nombre}»: ${texto(actual)} → ${texto(nuevo)}`); continue }
  fallos++
  const detalle = String(p.json?.message ?? p.text).slice(0, 200)
  console.log(`  ✘ «${nombre}»: InfluxDB no aceptó ${texto(nuevo)} (HTTP ${p.status}): ${detalle}`)
  if (/retention|exceed|max/i.test(detalle)) console.log('    Tu plan de InfluxDB tiene un máximo de retención (Cloud gratuito: 30 días). Usa --dias-huellas 30 o un plan de pago.')
}
// exitCode en vez de process.exit(): en Windows, salir a la fuerza con conexiones abiertas hace fallar a Node (UV_HANDLE_CLOSING)
process.exitCode = fallos ? 1 : 0
