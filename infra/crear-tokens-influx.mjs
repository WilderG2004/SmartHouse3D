#!/usr/bin/env node
/**
 * Crea en InfluxDB los DOS tokens que usa el backend y los guarda en  infra/.env :
 *
 *   INFLUX_TOKEN_WRITE   SOLO escribe  → lo usa Node-RED para guardar telemetría y huellas
 *   INFLUX_TOKEN_READ    SOLO lee      → lo usan las consultas del historial, Grafana e infra/verificar-integridad.mjs
 *
 * Así, quien robe el token de lectura no puede alterar datos, y quien robe el de escritura no puede leer el historial.
 * El token de administrador (INFLUX_ADMIN_TOKEN) solo se usa aquí, para crear buckets y tokens: después ya no lo
 * necesita ningún servicio (bórralo de .env si quieres, o rótalo con generar-secretos.mjs --rotar).
 *
 *   node infra/crear-tokens-influx.mjs [--archivo infra/.env] [--influx-url http://localhost:8086] [--rotar]
 *
 * --rotar: crea tokens nuevos y REVOCA los anteriores (después reinicia Node-RED y Grafana para que usen los nuevos).
 * Nunca imprime los tokens.
 */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leer, escribir } from './lib/envfile.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const archivo = resolve(opt('--archivo', join(here, '.env')))
const ROTAR = argv.includes('--rotar')
const { valores: v } = leer(archivo)

const URL_BASE = String(opt('--influx-url', process.env.INFLUX_URL || 'http://localhost:8086')).replace(/\/+$/, '')
const ADMIN = v.INFLUX_ADMIN_TOKEN || ''
const ORG = v.INFLUX_ORG || 'casa'
const BUCKET = v.INFLUX_BUCKET || 'casa_iot'
const BUCKET_INT = v.INFLUX_INTEGRITY_BUCKET || BUCKET + '_integridad'
const RETENCION_DIAS = Number(v.INFLUX_RETENTION_DAYS || 30)
const DESC_W = `Node-RED escritura · ${BUCKET}`
const DESC_R = `Node-RED lectura · ${BUCKET}`

const die = (m, h) => { console.error('\n  ✘ ' + m); for (const l of [].concat(h || [])) console.error('    ' + l); process.exit(1) }
if (!ADMIN) die(`No encuentro INFLUX_ADMIN_TOKEN en ${archivo}.`, 'Genera los secretos primero:  npm run seguridad:secretos')

async function api(ruta, { method = 'GET', body } = {}) {
  try {
    const r = await fetch(URL_BASE + ruta, { method, headers: { Authorization: 'Token ' + ADMIN, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const t = await r.text()
    let j = null; try { j = JSON.parse(t) } catch { /* sin cuerpo */ }
    return { ok: r.ok, status: r.status, json: j, text: t }
  } catch (e) { return { ok: false, status: 0, json: null, text: String(e?.cause?.code ?? e?.message ?? e) } }
}

const health = await api('/health')
if (health.status === 0) die(`No hay respuesta de InfluxDB en ${URL_BASE}`, ['¿Está arriba?  docker compose -f infra/docker-compose.yml up -d influxdb', `(detalle: ${health.text})`])
const orgs = await api('/api/v2/orgs')
if (orgs.status === 401 || orgs.status === 403) die('InfluxDB rechazó INFLUX_ADMIN_TOKEN.', 'Debe ser el mismo con el que se creó InfluxDB (DOCKER_INFLUXDB_INIT_ADMIN_TOKEN). Si cambiaste el .env después del primer arranque, borra el volumen influxdb-data o crea el token a mano.')
const org = orgs.json?.orgs?.find((o) => o.name === ORG)
if (!org) die(`No existe la organización «${ORG}» en InfluxDB.`, `Existentes: ${(orgs.json?.orgs || []).map((o) => o.name).join(', ') || '(ninguna)'}`)

async function asegurarBucket(nombre, dias) {
  const r = await api(`/api/v2/buckets?name=${encodeURIComponent(nombre)}&orgID=${org.id}`)
  if (r.ok && r.json?.buckets?.length) { console.log(`  ✔ bucket «${nombre}» ya existe`); return r.json.buckets[0].id }
  const c = await api('/api/v2/buckets', { method: 'POST', body: { orgID: org.id, name: nombre, retentionRules: dias > 0 ? [{ type: 'expire', everySeconds: dias * 86400 }] : [] } })
  if (!c.ok) die(`No se pudo crear el bucket «${nombre}» (HTTP ${c.status}).`, c.text.slice(0, 200))
  console.log(`  ✔ bucket «${nombre}» creado (retención ${dias > 0 ? dias + ' días' : 'sin límite'})`)
  return c.json.id
}
const idDatos = await asegurarBucket(BUCKET, RETENCION_DIAS)
// las huellas viven más que los datos: se puede comprobar qué pasó aunque los datos viejos ya hayan expirado
const idHuellas = await asegurarBucket(BUCKET_INT, RETENCION_DIAS > 0 ? RETENCION_DIAS * 3 : 0)

const existentes = (await api(`/api/v2/authorizations?orgID=${org.id}`)).json?.authorizations || []
async function crear(desc, accion) {
  for (const a of existentes.filter((x) => x.description === desc)) {
    const d = await api('/api/v2/authorizations/' + a.id, { method: 'DELETE' })
    if (d.ok) console.log(`  ✔ token anterior «${desc}» revocado`)
  }
  const perm = (id) => ({ action: accion, resource: { type: 'buckets', id, orgID: org.id } })
  const r = await api('/api/v2/authorizations', { method: 'POST', body: { orgID: org.id, description: desc, permissions: [perm(idDatos), perm(idHuellas)] } })
  if (!r.ok || !r.json?.token) die(`No se pudo crear el token «${desc}» (HTTP ${r.status}).`, r.text.slice(0, 200))
  console.log(`  ✔ token «${desc}» creado: solo ${accion === 'write' ? 'ESCRIBE' : 'LEE'} en «${BUCKET}» y «${BUCKET_INT}»`)
  return r.json.token
}

const cambios = {}
if (ROTAR || !v.INFLUX_TOKEN_WRITE) cambios.INFLUX_TOKEN_WRITE = await crear(DESC_W, 'write')
else console.log('  · INFLUX_TOKEN_WRITE ya está en el .env (usa --rotar para cambiarlo)')
if (ROTAR || !v.INFLUX_TOKEN_READ) cambios.INFLUX_TOKEN_READ = await crear(DESC_R, 'read')
else console.log('  · INFLUX_TOKEN_READ ya está en el .env (usa --rotar para cambiarlo)')

if (Object.keys(cambios).length) {
  escribir(archivo, cambios)
  console.log(`\n  Guardados en ${archivo}. Reinicia lo que los usa:\n    docker compose -f infra/docker-compose.yml up -d --force-recreate nodered grafana`)
}
