#!/usr/bin/env node
/**
 * Arranca TU Node-RED local con la configuración ENDURECIDA del proyecto (infra/nodered/settings.js) y los secretos de infra/.env.
 *
 *   npm run nodered:iniciar                       (equivale a:  node infra/iniciar-nodered.mjs)
 *   node infra/iniciar-nodered.mjs --userdir ~/mi-carpeta --puerto 1880 --archivo infra/.env
 *
 * Por qué existe: un  node-red  a secas usa ~/.node-red/settings.js (sin contraseña en el editor, sin control del WebSocket,
 * sin claves de sesión) y no lee infra/.env. Con este arranque:
 *   - el editor pide usuario y contraseña (NODERED_ADMIN_USER / NODERED_ADMIN_HASH); sin hash queda APAGADO
 *   - el WebSocket valida el Origin y limita conexiones por IP (seguridad-ws.js)
 *   - las claves CASA_PAIRING_KEY / CASA_ADMIN_KEY / CASA_DEVICE_KEY y los tokens de InfluxDB llegan al flujo
 *   - Node-RED solo escucha en 127.0.0.1 (tu equipo)
 *
 * Qué hace: lee infra/.env (si existe) y lo pone en el entorno SIN pisar lo que ya esté definido (salvo los secretos de
 * instalación: INFLUX_ADMIN_*, GRAFANA_ADMIN_PASSWORD y NODERED_PASS, que se quitan), y lanza Node-RED con
 *   -s infra/nodered/settings.js  -u <userdir>   (por defecto infra/nodered-local/, ignorada por Git)
 * No imprime ningún valor del .env. Lo primero que verás si faltan secretos es un aviso que dice qué ejecutar.
 *
 * Variables: NODERED_BIN (ruta del ejecutable node-red si no está en el PATH) · PORT
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { leer } from './lib/envfile.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }

const archivo = resolve(opt('--archivo', join(here, '.env')))
const userdir = resolve(opt('--userdir', join(here, 'nodered-local')))
const settings = join(here, 'nodered', 'settings.js')

const { valores } = leer(archivo)
if (!existsSync(archivo)) {
  console.warn(`\n  ⚠ No existe ${archivo}. Crea los secretos primero:  npm run seguridad:secretos\n    (sin ellos nadie podrá emparejar la pantalla y el editor de Node-RED queda apagado)\n`)
}
const env = { ...process.env }
for (const [k, v] of Object.entries(valores)) if (env[k] === undefined || env[k] === '') env[k] = v
if (opt('--puerto')) env.PORT = String(opt('--puerto'))
// Mínimo privilegio: Node-RED solo usa los dos tokens de un permiso (INFLUX_TOKEN_WRITE / _READ). El token de administrador
// de InfluxDB y las contraseñas de InfluxDB y Grafana NO entran a su entorno (un nodo de función podría leerlas con env.get),
// tampoco si las pusiste en esta terminal para setup-local.mjs.
const SOLO_INSTALACION = ['INFLUX_ADMIN_TOKEN', 'INFLUX_ADMIN_PASSWORD', 'INFLUX_ADMIN_USER', 'GRAFANA_ADMIN_PASSWORD', 'NODERED_PASS']
for (const k of SOLO_INSTALACION) delete env[k]

const faltan = ['CASA_PAIRING_KEY', 'CASA_ADMIN_KEY', 'CASA_DEVICE_KEY', 'NODERED_CREDENTIAL_SECRET'].filter((k) => !env[k])
if (existsSync(archivo) && faltan.length) console.warn(`  ⚠ Faltan en el entorno: ${faltan.join(', ')} (ejecuta npm run seguridad:secretos).`)
// Los tokens pueden vivir cifrados dentro de Node-RED (flows_cred.json, los puso setup-local.mjs) en vez de en .env.
// Solo se mira que existan el archivo de credenciales y un nodo de InfluxDB: nunca se leen ni se descifran los valores.
const tokensEnNodeRED = (() => {
  try {
    const cred = join(userdir, 'flows_cred.json')
    const flows = JSON.parse(readFileSync(join(userdir, 'flows.json'), 'utf8'))
    return existsSync(cred) && statSync(cred).size > 2 && Array.isArray(flows) && flows.some((n) => n && n.type === 'influxdb')
  } catch { return false }
})()
if (!env.INFLUX_TOKEN_WRITE || !env.INFLUX_TOKEN_READ) {
  if (tokensEnNodeRED) console.log('  ✔ Tokens de InfluxDB guardados (cifrados) dentro de Node-RED; no hace falta tenerlos en .env.')
  else console.warn('  ℹ Aún no hay tokens de InfluxDB: Node-RED arranca pero no podrá guardar datos. Con InfluxDB arriba:  npm run seguridad:tokens')
}

// Puerto ocupado: casi siempre es un Node-RED anterior que quedó abierto. Se avisa antes de arrancar, con el comando para cerrarlo.
const puerto = Number(env.PORT || 1880)
const host = env.NODERED_BIND || '127.0.0.1'
const ocupado = await new Promise((ok) => {
  const s = createServer().once('error', (e) => ok(e.code === 'EADDRINUSE')).once('listening', () => s.close(() => ok(false)))
  s.listen(puerto, host)
})
if (ocupado) {
  console.error(`\n  ✘ El puerto ${puerto} ya está ocupado: seguramente hay otro Node-RED abierto (uno anterior que no se cerró).`)
  console.error(`    Míralo con   curl http://localhost:${puerto}/api/health   y, si sobra, ciérralo:`)
  console.error(process.platform === 'win32'
    ? `      Get-NetTCPConnection -LocalPort ${puerto} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }`
    : `      kill $(lsof -t -iTCP:${puerto} -sTCP:LISTEN)`)
  console.error(`    O usa otro puerto:  npm run nodered:iniciar -- --puerto 1881\n`)
  process.exit(1)
}

mkdirSync(userdir, { recursive: true })
// En Windows node-red es un .cmd y solo arranca con shell: los argumentos se concatenan sin escapar (aviso DEP0190) y al cerrar
// este proceso el node.exe nieto puede quedar vivo ocupando el puerto. Si se encuentra red.js, se ejecuta con este mismo node.
const redJs = process.env.NODERED_BIN ? null : String(process.env.PATH || '').split(delimiter)
  .map((d) => d && join(d, 'node_modules', 'node-red', 'red.js')).find((f) => f && existsSync(f))
const bin = process.env.NODERED_BIN || (process.platform === 'win32' ? 'node-red.cmd' : 'node-red')
const args = ['-s', settings, '-u', userdir]
console.log(`  Node-RED con settings endurecidos · carpeta de datos: ${userdir}`)
const hijo = redJs
  ? spawn(process.execPath, [redJs, ...args], { env, stdio: 'inherit' })
  : process.platform === 'win32'
    ? spawn([bin, ...args].map((a) => `"${a}"`).join(' '), { env, stdio: 'inherit', shell: true })
    : spawn(bin, args, { env, stdio: 'inherit' })
hijo.on('error', (e) => {
  console.error(`\n  ✘ No pude ejecutar «${bin}»: ${e.code === 'ENOENT' ? 'no está instalado o no está en el PATH (npm install -g node-red)' : e.message}`)
  process.exit(1)
})
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => hijo.kill(sig))
hijo.on('exit', (code) => process.exit(code ?? 0))
