#!/usr/bin/env node
/**
 * Quita el TRIÁNGULO ROJO de los nodos de InfluxDB en el editor de Node-RED.
 *
 *   node infra/fix-editor-warning.mjs [--nodered http://localhost:1880]
 *
 * Causa: el editor marca el servidor InfluxDB como inválido si su campo «database» está vacío (solo hace
 * falta en InfluxDB 1.x, pero el editor lo exige siempre). Los datos llegan igual: es solo un aviso visual.
 * Qué hace: pone «database» = "database" en el servidor, con copia de seguridad antes. No usa ningún token,
 * no toca tus credenciales ni tus otros flujos. Después recarga el editor con F5.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const i = process.argv.indexOf('--nodered')
const NR = (i > 0 ? process.argv[i + 1] : process.env.NODERED_URL ?? 'http://localhost:1880').replace(/\/$/, '')
const die = (m, h) => { console.error(`\n  ✘ ${m}`); if (h) console.error(`    ${h}`); process.exit(1) }

let res
try { res = await fetch(`${NR}/flows`) } catch (e) { die(`No hay respuesta de Node-RED en ${NR}`, '¿Está iniciado? Si usa otro puerto: --nodered http://localhost:PUERTO') }
if (res.status === 401) die('Tu Node-RED pide usuario y contraseña.', 'Usa el método manual del README (cambiar la versión a 1.x, escribir «database», volver a 2.0).')
if (!res.ok) die(`Node-RED no dejó leer los flujos (HTTP ${res.status}).`)
const flows = await res.json()

const targets = flows.filter((n) => n.type === 'influxdb' && !String(n.database ?? '').trim())
if (!targets.length) {
  console.log('  ✔ Nada que arreglar: ningún servidor InfluxDB tiene «database» vacío.')
  console.log('    Si el triángulo sigue, recarga el editor con F5.')
} else {

const dir = join(process.cwd(), 'nodered-backups')
mkdirSync(dir, { recursive: true })
const backup = join(dir, `flows-antes-arreglo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(backup, JSON.stringify(flows, null, 2))
console.log(`  ✔ Copia de seguridad: ${backup}`)

for (const n of targets) n.database = 'database'
const r = await fetch(`${NR}/flows`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Node-RED-Deployment-Type': 'nodes' }, body: JSON.stringify(flows) })
if (!(r.status === 204 || r.status === 200)) die(`Node-RED no aceptó el cambio (HTTP ${r.status}).`, `Tus flujos originales están en ${backup}`)
console.log(`  ✔ Corregido en ${targets.length} servidor(es) InfluxDB: ${targets.map((n) => n.name || n.id).join(', ')}`)
console.log('    Ahora recarga el editor con F5: los triángulos rojos deben desaparecer.')
}
