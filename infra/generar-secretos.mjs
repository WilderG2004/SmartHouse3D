#!/usr/bin/env node
/**
 * Genera (y rota) los SECRETOS del backend en  infra/.env  — un archivo que NO se sube a Git (ver .gitignore).
 *
 *   node infra/generar-secretos.mjs                       crea infra/.env con lo que falte (no toca lo que ya existe)
 *   node infra/generar-secretos.mjs --rotar CASA_PAIRING_KEY
 *   node infra/generar-secretos.mjs --rotar CASA_ADMIN_KEY,NODERED_ADMIN
 *   node infra/generar-secretos.mjs --limpiar-previas     borra las *_PREVIOUS cuando ya todos usan la clave nueva
 *   node infra/generar-secretos.mjs --olvidar-admin       borra INFLUX_ADMIN_TOKEN del archivo (ya creaste buckets y tokens)
 *   node infra/generar-secretos.mjs --usuario ana:operador  añade una clave PERSONAL a CASA_USERS (rol lector|operador|administrador)
 *   node infra/generar-secretos.mjs --archivo ruta/.env   otro destino
 *
 * Qué crea (todo aleatorio, sin patrones del proyecto):
 *   INFLUX_ADMIN_PASSWORD · INFLUX_ADMIN_TOKEN     administrador de InfluxDB (solo para crear buckets/tokens). El token da
 *                                                  acceso TOTAL: en cuanto existan los dos tokens de un permiso, bórralo con
 *                                                  --olvidar-admin (queda «INFLUX_ADMIN_TOKEN=» vacío y no se vuelve a crear
 *                                                  salvo con --rotar INFLUX_ADMIN_TOKEN). Los scripts lo aceptan desde la terminal.
 *   GRAFANA_ADMIN_PASSWORD                         administrador de Grafana
 *   NODERED_ADMIN_USER / NODERED_ADMIN_HASH        acceso al EDITOR de Node-RED (se guarda solo el hash bcrypt)
 *   NODERED_CREDENTIAL_SECRET                      cifra flows_cred.json en disco
 *   CASA_PAIRING_KEY · CASA_ADMIN_KEY              claves COMPARTIDAS de emparejamiento (rol Operador / Administrador)
 *   CASA_USERS (con --usuario)                     claves PERSONALES «alias:rol:clave,…»: la auditoría guarda el alias
 *   CASA_DEVICE_KEY                                clave maestra de la que salen las claves de cada dispositivo (firmas HMAC)
 *   INFLUX_TOKEN_WRITE · INFLUX_TOKEN_READ         quedan VACÍOS: los crea  npm run seguridad:tokens  cuando InfluxDB ya está arriba
 *
 * Rotación sin cortar el servicio: --rotar CASA_PAIRING_KEY guarda la clave anterior en CASA_PAIRING_KEY_PREVIOUS;
 * Node-RED acepta las DOS hasta que ejecutes --limpiar-previas (así los clientes tienen tiempo de cambiar).
 * Qué NO hace: no sube nada, no toca Git, no escribe las claves en el registro. Lo único que imprime es la contraseña del
 * editor de Node-RED (no se puede recuperar a partir del hash) y SOLO cuando se crea o se rota.
 */
import { randomBytes } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { leer, escribir } from './lib/envfile.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const archivo = resolve(opt('--archivo') || join(here, '.env'))
const rotar = new Set(String(opt('--rotar') || '').split(',').map((s) => s.trim()).filter(Boolean))

const aleatorio = (bytes = 24) => randomBytes(bytes).toString('base64url')
const { valores: actual } = leer(archivo)

const bcrypt = (() => {
  try { return createRequire(import.meta.url)('bcryptjs') } catch { return null }
})()
function hashClave(pw) {
  if (!bcrypt) {
    console.error('\n  ✘ Falta la librería bcryptjs para crear el hash de la contraseña del editor.\n    Ejecuta primero:  npm install\n')
    process.exit(1)
  }
  return bcrypt.hashSync(pw, 12)
}

const cambios = {}
const avisos = []
let passEditor = null

const base = {
  INFLUX_ORG: 'casa', INFLUX_BUCKET: 'casa_iot', INFLUX_INTEGRITY_BUCKET: 'casa_iot_integridad',
  INFLUX_ADMIN_USER: 'admin',
  NODERED_ADMIN_USER: 'admin',
  CASA_ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:4173',
  CASA_INGEST: 'off', CASA_VERBOSE_ERRORS: 'on', TZ: 'America/Bogota',
}
for (const [k, v] of Object.entries(base)) if (actual[k] === undefined) cambios[k] = v

const secretos = {
  INFLUX_ADMIN_PASSWORD: () => aleatorio(18),
  INFLUX_ADMIN_TOKEN: () => aleatorio(32),
  GRAFANA_ADMIN_PASSWORD: () => aleatorio(18),
  NODERED_CREDENTIAL_SECRET: () => aleatorio(24),
  CASA_PAIRING_KEY: () => aleatorio(24),
  CASA_ADMIN_KEY: () => aleatorio(24),
  CASA_DEVICE_KEY: () => aleatorio(32),
}
const conPrevia = new Set(['CASA_PAIRING_KEY', 'CASA_ADMIN_KEY']) // se pueden rotar sin cortar: las dos claves valen a la vez
for (const [k, gen] of Object.entries(secretos)) {
  // INFLUX_ADMIN_TOKEN vacío a propósito (--olvidar-admin): no se vuelve a crear salvo que se pida rotarlo
  if (k === 'INFLUX_ADMIN_TOKEN' && actual[k] === '' && !rotar.has(k)) continue
  const existe = actual[k] && actual[k].length >= 12
  if (!existe) cambios[k] = gen()
  else if (rotar.has(k)) {
    if (conPrevia.has(k)) cambios[k + '_PREVIOUS'] = actual[k]
    cambios[k] = gen()
    avisos.push(k + ': rotada' + (conPrevia.has(k) ? ' (la anterior sigue valiendo en ' + k + '_PREVIOUS hasta que ejecutes --limpiar-previas)' : ''))
  }
}
// Contraseña del editor de Node-RED: se guarda solo el hash
if (!actual.NODERED_ADMIN_HASH || rotar.has('NODERED_ADMIN')) {
  passEditor = aleatorio(15)
  cambios.NODERED_ADMIN_HASH = hashClave(passEditor)
}
// Los tokens de InfluxDB los crea otro script (necesita InfluxDB en marcha); aquí solo se reserva el lugar
for (const k of ['INFLUX_TOKEN_WRITE', 'INFLUX_TOKEN_READ']) if (actual[k] === undefined) cambios[k] = ''

if (argv.includes('--olvidar-admin')) {
  if (actual.INFLUX_ADMIN_TOKEN) {
    cambios.INFLUX_ADMIN_TOKEN = ''
    avisos.push('INFLUX_ADMIN_TOKEN borrado del archivo. Cuando lo necesites (setup-local, crear tokens, retención) ponlo solo en la terminal: $env:INFLUX_ADMIN_TOKEN = "…"')
  } else avisos.push('INFLUX_ADMIN_TOKEN ya no estaba en el archivo.')
}

// Claves personales: --usuario alias:rol (la clave se genera aquí y solo se guarda en el archivo; no se imprime)
const nuevoUsuario = opt('--usuario')
if (nuevoUsuario) {
  const [alias, rol] = String(nuevoUsuario).split(':')
  const falla = (texto) => { console.error(`\n  ✘ ${texto}\n`); process.exit(1) }
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(alias || '') || !['lector', 'operador', 'administrador'].includes(rol)) {
    falla('--usuario necesita alias:rol (alias de letras, números, . _ -; rol lector | operador | administrador)')
  }
  if (alias.startsWith('compartida-')) falla('Los alias «compartida-…» están reservados para las claves compartidas.')
  const lista = String(actual.CASA_USERS || '').split(',').map((s) => s.trim()).filter(Boolean)
  const resto = lista.filter((x) => x.split(':')[0] !== alias)
  if (resto.length !== lista.length && !rotar.has(alias)) falla(`El usuario «${alias}» ya existe. Para darle una clave nueva: --usuario ${alias}:${rol} --rotar ${alias}`)
  cambios.CASA_USERS = [...resto, `${alias}:${rol}:${aleatorio(24)}`].join(',')
  avisos.push(`Usuario «${alias}» (${rol}) ${resto.length !== lista.length ? 'con clave nueva' : 'creado'}: su clave está en CASA_USERS de este archivo (pásasela por un canal seguro). Reinicia Node-RED para que la acepte.`)
}

if (argv.includes('--limpiar-previas')) {
  for (const k of ['CASA_PAIRING_KEY_PREVIOUS', 'CASA_ADMIN_KEY_PREVIOUS']) if (actual[k]) cambios[k] = ''
  avisos.push('Claves anteriores (*_PREVIOUS) eliminadas: ya solo valen las nuevas.')
}

const avisoDispositivo = rotar.has('CASA_DEVICE_KEY')
  ? ['CASA_DEVICE_KEY rotada: las huellas de integridad ANTERIORES ya no se podrán verificar con la clave nueva (guarda la vieja si necesitas comprobar histórico).'] : []
const avisoCred = rotar.has('NODERED_CREDENTIAL_SECRET')
  ? ['NODERED_CREDENTIAL_SECRET rotada: borra infra/nodered/flows_cred.json cifrado del volumen de Node-RED y vuelve a desplegar (los tokens están como ${VAR}, no se pierde nada).'] : []

if (!Object.keys(cambios).length) {
  console.log(`Nada que hacer: ${archivo} ya tiene todos los secretos. (Para cambiar uno: --rotar NOMBRE)`)
  process.exit(0)
}

const cabecera = [
  '# Secretos del backend de Casa IoT. NO SUBIR A GIT (está en .gitignore). Generado por infra/generar-secretos.mjs',
  '# Los valores entre comillas simples son literales (el hash bcrypt contiene «$»).',
  '',
].join('\n')
escribir(archivo, cambios, cabecera)

const nuevos = Object.keys(cambios).filter((k) => !(k in actual) || (cambios[k] && cambios[k] !== actual[k]))
console.log(`${existsSync(archivo) ? '✔' : '✘'} ${archivo}  (permisos 600)`)
if (nuevos.length) console.log('  Creado o actualizado: ' + nuevos.join(', '))
for (const a of [...avisos, ...avisoDispositivo, ...avisoCred]) console.log('  · ' + a)
if (passEditor) {
  console.log('\n  Editor de Node-RED   usuario: ' + (actual.NODERED_ADMIN_USER || cambios.NODERED_ADMIN_USER || 'admin'))
  console.log('                       contraseña: ' + passEditor + '    ← anótala ahora: solo se guarda su hash')
}
console.log(`
  Las claves de emparejamiento (CASA_PAIRING_KEY = Operador, CASA_ADMIN_KEY = Administrador) están en ${archivo}.
  Siguiente:
    1) docker compose -f infra/docker-compose.yml up -d influxdb
    2) npm run seguridad:tokens        (crea los dos tokens de InfluxDB: uno solo escribe, otro solo lee)
    3) docker compose -f infra/docker-compose.yml up -d
`)
