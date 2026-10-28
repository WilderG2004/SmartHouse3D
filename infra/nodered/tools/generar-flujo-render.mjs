#!/usr/bin/env node
/**
 * Genera infra/nodered/flows.render.json: el flujo que va DENTRO de la imagen de Render (Dockerfile.render).
 *
 *   npm run render:flujo
 *
 * Es el mismo flujo que corre en tu Node-RED local (mismas cajitas de src/ y misma política de seguridad), apuntando a
 * tu InfluxDB Cloud (org «Dev Teams», buckets Casa_IoT y Casa_IoT_integridad). Si cambias de org o de bucket, pásalos
 * por variables de entorno (INFLUX_URL, INFLUX_ORG, INFLUX_BUCKET, INFLUX_INTEGRITY_BUCKET), igual que en build-flows.mts.
 *
 * No escribe flows_cred.json (NO_CRED=1): la imagen usa el de siempre, que solo trae referencias ${INFLUX_TOKEN_WRITE} y
 * ${INFLUX_TOKEN_READ}. Los tokens reales se escriben en el panel de Render, nunca en el repositorio.
 *
 * Existe porque en Windows un script de npm no puede poner variables delante del comando (VAR=x comando).
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const raiz = join(here, '..', '..', '..')

const env = {
  ...process.env,
  INFLUX_URL: process.env.INFLUX_URL || 'https://us-east-1-1.aws.cloud2.influxdata.com',
  INFLUX_ORG: process.env.INFLUX_ORG || 'Dev Teams',
  INFLUX_BUCKET: process.env.INFLUX_BUCKET || 'Casa_IoT',
  INFLUX_INTEGRITY_BUCKET: process.env.INFLUX_INTEGRITY_BUCKET || 'Casa_IoT_integridad',
  FLOWS_FILE: 'flows.render.json',
  NO_CRED: '1',
}

// Igual que «npm run nodered:build». Un solo texto de comando (sin lista de argumentos) para que Node no avise DEP0190.
const r = spawnSync('npx tsx infra/nodered/tools/build-flows.mts', { cwd: raiz, env, stdio: 'inherit', shell: true })
if (r.error) {
  console.error('No se pudo ejecutar tsx:', r.error.message)
  process.exit(1)
}
process.exit(r.status ?? 1)
