/**
 * Genera infra/nodered/flows.json (+ flows_cred.json) a partir de:
 *   - src/config/house.config.ts   → misma configuración que usa el frontend (una sola fuente de verdad)
 *   - infra/nodered/src/*.js       → código de cada nodo function (cabeceras @name/@kind/@uses)
 *
 * Uso (desde la raíz del proyecto):   npx tsx infra/nodered/tools/build-flows.mts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as H from '../../../src/config/house.config'
import { buildSecurityPolicy } from './security-policy.mts'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '..', 'src') // código de cada nodo function
const OUT = join(here, '..')

/* ───────────────────────── ajustes de infraestructura ───────────────────────── */
const INFLUX = {
  url: process.env.INFLUX_URL ?? 'http://influxdb:8086', // dentro de docker-compose; en local: http://localhost:8086
  org: process.env.INFLUX_ORG ?? 'casa',
  bucket: process.env.INFLUX_BUCKET ?? 'casa_iot',
  // Los TOKENS no están en el repositorio. flows_cred.json solo contiene referencias ${VARIABLE} que Node-RED
  // resuelve al arrancar (INFLUX_TOKEN_WRITE: solo escritura · INFLUX_TOKEN_READ: solo lectura).
  integrityBucket: process.env.INFLUX_INTEGRITY_BUCKET ?? 'casa_iot_integridad', // huellas de integridad: bucket APARTE (créalo con npm run setup:local o el compose)
  persistEverySec: 2,
}
const WS_PATH = '/ws/casa-iot'

/* ───────────────────────── configuración compartida con el frontend ───────────────────────── */
const roomIdByLabel = Object.fromEntries(H.ROOMS.map((r) => [r.label, r.id]))
for (const l of H.LIGHTS) if (!roomIdByLabel[l.room]) throw new Error(`Luz ${l.id}: habitación «${l.room}» no existe en ROOMS`)

const cfg = {
  LIGHTS: H.LIGHTS.map((l) => ({ id: l.id, label: l.label, room: roomIdByLabel[l.room] })),
  ROOMS: H.ROOMS.map(({ id, label }) => ({ id, label })),
  SMOKE: H.SMOKE,
  PIRS: H.PIRS,
  PIR_HOLD_MS: H.PIR_HOLD_MS,
  DOORS: H.DOORS.map((d) => ({ id: d.id, label: d.label, sensor: !!d.sensor })),
  METER: H.METER,
  CLIMATE: H.CLIMATE,
  AC_POWER: H.AC_POWER,
  AIR_CONDITIONERS: H.AIR_CONDITIONERS.map(({ id, label, room }) => ({ id, label, room })),
  PLUGS: H.PLUGS.map(({ id, label, room, watts, profile, autoOffSec, initialOn }) => ({ id, label, room, watts, profile, autoOffSec, initialOn })),
  SCENES: H.SCENES,
  SENSORS: H.SENSORS,
  ALERTS: H.ALERTS,
  INITIAL_LIGHTS_ON: H.INITIAL_LIGHTS_ON,
  DEFAULT_LIGHT_COLOR: H.DEFAULT_LIGHT_COLOR,
  INFLUX: { org: INFLUX.org, bucket: INFLUX.bucket, persistEverySec: INFLUX.persistEverySec },
}

const cfgActiva = cfg
const SEC = buildSecurityPolicy(cfg) // política de seguridad (roles, límites, esquemas): sin secretos

/* ───────────────────────── plantillas de código ───────────────────────── */
const PREAMBLE = `// ── Preámbulo común (generado) ───────────────────────────────────────
const cfg = global.get('cfg');
const S = flow.get('state');
if (!cfg || !S) { node.status({ fill: 'yellow', shape: 'ring', text: 'sin inicializar' }); return null; }
const cmd = msg.payload || {};
const now = Date.now();
const out = [];      // TelemetryMessage → WebSocket + InfluxDB
const cmds = [];     // comandos internos → vuelven al enrutador
const delayed = [];  // comandos con retraso
let seq = flow.get('seq') || 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (v, d = 0) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
const nameOf = (list, id) => { const x = list.find((i) => i.id === id); return x ? x.label : id; };
function log(level, source, message, quiet) {
  if (quiet && level === 'info') return;
  const ev = { id: 'nr-' + now + '-' + (seq++), ts: now, level, source, message };
  out.push({ type: 'event', event: ev });
  const ring = S.events || (S.events = []);      // últimos 50: se envían a quien abra la página después
  ring.push(ev);
  if (ring.length > 50) ring.shift();
}
const wrap = (arr) => arr.map((p) => ({ payload: p }));
function done() {
  flow.set('seq', seq);
  flow.set('state', S);
  __RETURN__
}
// ── Fin del preámbulo ────────────────────────────────────────────────
`
const RETURNS: Record<string, string> = {
  handler: 'return [wrap(out), wrap(cmds)];',
  security: 'return [wrap(out), wrap(cmds), wrap(delayed)];',
  tick: 'return [wrap(out), [msg]];',
  expire: 'return [wrap(out), wrap(cmds), [msg]];',
  cmd1: 'return [wrap(out)];',
}
const OUTPUTS: Record<string, number> = { handler: 2, security: 3, tick: 2, expire: 3, plain: 1, cmd1: 1 }

const HELPERS: Record<string, string> = {
  world: `// ── Reloj y clima (generado) ─────────────────────────────────────────
function hourNow() { if (S.hourOverride !== null) return S.hourOverride; const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
function outdoorAt(h) { const o = cfg.CLIMATE.outdoor; return o.mean + o.amp * Math.cos(((h - o.peakHour) / 24) * 2 * Math.PI); }
function worldNow() { const h = hourNow(); return { hour: round(h, 2), outdoorTemp: round(outdoorAt(h), 1), hourOverride: S.hourOverride !== null }; }
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5; // ruido ≈ N(0,1)
function daylight(h) { const x = Math.sin(((h - 6) / 12) * Math.PI); return Math.max(0, Math.min(1, x * 1.6)); }
function climateRooms() { const r = {}; for (const room of cfg.ROOMS) { const s = S.rooms[room.id]; r[room.id] = { temperature: round(s.t, 1), humidity: Math.round(s.h), lux: Math.round(s.lux || 0) }; } return r; }
// ─────────────────────────────────────────────────────────────────────
`,
  crypto: `// ── Criptografía y seguridad del canal (generado) ───────────────────
const SEC = global.get('sec');
const RT = global.get('secRt');
const hmacHex = (key, data) => crypto.createHmac('sha256', key).update(data).digest('hex');
const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const ctEq = (aHex, bHex) => { try { const a = Buffer.from(String(aHex), 'hex'), b = Buffer.from(String(bHex), 'hex'); return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b); } catch (e) { return false; } };
const deviceKey = (dev) => RT.devKeys[dev] || (RT.devKeys[dev] = crypto.createHmac('sha256', RT.master).update('casa-iot/device/v1/' + dev).digest());
const sortedPairs = (o) => Object.keys(o || {}).sort().map((k) => [k, o[k]]);
const canon = (m, tags, f, ts) => JSON.stringify([m, sortedPairs(tags), sortedPairs(f), ts]);
// ─────────────────────────────────────────────────────────────────────
`,
  cors: `// ── Cabeceras de la API: CORS restringido al origen del frontend (generado) ─
function apiHeaders(req) {
  const h = { 'content-type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const origin = req && req.headers && req.headers.origin;
  const allowed = String(env.get('CASA_ALLOWED_ORIGINS') || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173').split(',').map((x) => x.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }   // sin origen permitido no se envía la cabecera: el navegador bloquea la respuesta
  return h;
}
// ─────────────────────────────────────────────────────────────────────
`,
  range: `// ── Rango de consulta (generado) ─────────────────────────────────────
function parseRange(q) {
  const t = Date.now();
  const to = Number(q.to) || t;
  let from = Number(q.from) || to - 15 * 60 * 1000;
  if (from >= to) from = to - 15 * 60 * 1000;
  from = Math.max(from, to - 31 * 24 * 3600 * 1000);            // máx. 31 días
  let every = Math.max(1, Math.round(Number(q.bucket) || 1));
  every = Math.max(every, Math.ceil((to - from) / 1000 / 2000)); // máx. ~2000 puntos
  return { start: new Date(from).toISOString(), stop: new Date(to).toISOString(), every };
}
// ─────────────────────────────────────────────────────────────────────
`,
}

interface Src { key: string; name: string; kind: string; uses: string[]; libs: string[]; outputs?: number; body: string; code: string }
const sources: Record<string, Src> = {}
const files = readdirSync(SRC).filter((f) => f.endsWith('.js')).sort().map((file) => ({ dir: SRC, file }))
for (const { dir, file } of files) {
  const raw = readFileSync(join(dir, file), 'utf8')
  const meta = (tag: string) => raw.match(new RegExp(`^// @${tag} (.+)$`, 'm'))?.[1]?.trim()
  const name = meta('name')
  const kind = meta('kind') ?? 'plain'
  if (!name) throw new Error(`${file}: falta // @name`)
  const uses = (meta('uses') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const outputs = meta('outputs') ? Number(meta('outputs')) : undefined
  const libs = (meta('libs') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  if (uses.includes('crypto') && !libs.includes('crypto')) libs.push('crypto')
  let body = raw.replace(/^\/\/ @(name|kind|uses|outputs|libs) .*\n/gm, '')
  body = body.replace('__CFG__', JSON.stringify(cfgActiva, null, 1)).replace('__SEC__', JSON.stringify(SEC, null, 1))
  const pre = RETURNS[kind] ? PREAMBLE.replace('__RETURN__', RETURNS[kind]) : ''
  const helpers = uses.filter((u) => u in HELPERS).map((u) => HELPERS[u]).join('\n')
  for (const u of uses) if (!(u in HELPERS) && u !== 'crypto') throw new Error(`${file}: helper desconocido ${u}`)
  const key = file.replace(/\.js$/, '').replace(/^\d+-/, '')
  sources[key] = { key, name, kind, uses, libs, outputs, body, code: pre + helpers + (helpers ? '\n' : '') + body }
}

/* ───────────────────────── ensamblado de nodos ───────────────────────── */
const TAB = 'tab_casa'
const nodes: any[] = []
const wires: Record<string, string[][]> = {}
const id = (k: string) => `casa_${k}`

const add = (n: any, outputs = 1) => {
  n.z = TAB
  nodes.push(n)
  wires[n.id] = Array.from({ length: outputs }, () => [])
  return n.id as string
}
const connect = (from: string, out: number, to: string) => wires[from][out].push(to)

const fn = (key: string, x: number, y: number) => {
  const s = sources[key]
  if (!s) throw new Error(`No existe la fuente ${key}`)
  const outputs = s.outputs ?? OUTPUTS[s.kind] ?? 1
  const fid = add({ id: id(key), type: 'function', name: s.name, func: s.code, outputs, timeout: 0, noerr: 0, initialize: '', finalize: '', libs: s.libs.map((m) => ({ var: m, module: m })), x, y }, outputs)
  return fid
}
const comment = (text: string, x: number, y: number, info = '') =>
  add({ id: id('c_' + text.slice(0, 12).replace(/\W/g, '')), type: 'comment', name: text, info, x, y }, 0)

// Config nodes
// Dos conexiones con dos tokens distintos: escribir (solo escritura) y consultar (solo lectura).
// Si alguien roba el token de lectura no puede alterar datos; el de escritura no puede leer el historial.
const influxCfg = (cid: string, name: string) => ({ id: cid, type: 'influxdb', hostname: 'influxdb', port: '8086', protocol: 'http', database: 'database', name, usetls: false, tls: '', influxdbVersion: '2.0', url: INFLUX.url, timeout: '10', rejectUnauthorized: INFLUX.url.startsWith('https://') })
nodes.push(influxCfg('cfg_influx', `InfluxDB · ${INFLUX.bucket} · escritura`))
nodes.push(influxCfg('cfg_influx_read', `InfluxDB · ${INFLUX.bucket} · lectura`))
nodes.push({ id: 'cfg_ws', type: 'websocket-listener', path: WS_PATH, wholemsg: 'false' })

nodes.push({ id: TAB, type: 'tab', label: 'Casa IoT · Gemelo digital', disabled: false, info: 'Backend IoT de la casa inteligente: Node-RED genera TODOS los datos (sensores y dispositivos), calcula las alertas, los guarda en InfluxDB y los consulta; el frontend (React) solo muestra y envía órdenes.\nGenerado con infra/nodered/tools/build-flows.mts' })

function assembleCompleto() {
/* A · Inicialización */
comment('A · Inicialización — configuración, estado y reinicio', 330, 30, 'Pulsa el botón del nodo «Reiniciar simulación» para volver al estado inicial (todos los clientes reciben un snapshot nuevo).')
const injInit = add({ id: id('inj_init'), type: 'inject', name: 'Reiniciar simulación', props: [{ p: 'payload' }], repeat: '', crontab: '', once: true, onceDelay: '0.5', topic: '', payload: 'init', payloadType: 'str', x: 160, y: 70 })
fn('inicializar', 480, 70)
connect(injInit, 0, id('inicializar'))

/* B · Entrada de comandos y enrutador */
comment('B · Comandos — WebSocket y enrutador por tipo (kind)', 340, 130, 'El frontend envía {"kind":"light.set",…}. Las escenas y automatizaciones reutilizan el mismo enrutador (link «comandos»).')
const wsIn = add({ id: id('ws_in'), type: 'websocket in', name: 'Frontend → Node-RED', server: 'cfg_ws', client: '', x: 160, y: 175 })
fn('parsear-comando', 380, 175)
fn('sesion-autorizar', 610, 175)   // puerta única: sesión, rol, esquema, rango, frecuencia y confirmación en dos pasos
fn('auditar', 610, 250)
connect(wsIn, 0, id('parsear-comando'))
connect(id('parsear-comando'), 0, id('sesion-autorizar'))
const stWs = add({ id: id('status_ws'), type: 'status', name: 'Conexiones del WebSocket', scope: [wsIn], x: 160, y: 250 })
fn('sesion-cerrar', 380, 250)
connect(stWs, 0, id('sesion-cerrar'))
const linkCmdIn = add({ id: id('link_cmd_in'), type: 'link in', name: 'comandos', links: [], x: 160, y: 230 })

const ROUTES: [string, string, string?][] = [
  ['light.set', 'luces'], ['^(smoke|heat|humidity)\\.simulate$', 'humo-simular', 'regex'], ['pir.simulate', 'pir'], ['door.set', 'puertas'],
  ['ac.set', 'aire-acondicionado'], ['plug.set', 'enchufes'], ['^security\\.', 'seguridad', 'regex'],
  ['scene.apply', 'escenas'], ['world.setHour', 'mundo'], ['snapshot.request', 'snapshot'],
]
const rules = ROUTES.map(([v, , t]) => ({ t: t === 'regex' ? 'regex' : 'eq', v, vt: 'str', case: false }))
const router = add({ id: id('router'), type: 'switch', name: 'Enrutador por kind', property: 'payload.kind', propertyType: 'msg', rules, checkall: 'false', repair: false, outputs: rules.length, x: 840, y: 330 }, rules.length)
connect(id('sesion-autorizar'), 0, router)   // solo órdenes ya autorizadas y saneadas
connect(linkCmdIn, 0, router)                // las órdenes internas (escenas, PIR, temporizadores) no pasan por la puerta de sesión

// Salida común (enlaces)
const linkTelOut = add({ id: id('link_tel_out'), type: 'link out', name: '→ telemetría', mode: 'link', links: [], x: 1410, y: 330 }, 0)
const linkCmdOut = add({ id: id('link_cmd_out'), type: 'link out', name: '→ comandos', mode: 'link', links: [], x: 1410, y: 400 }, 0)

const handlerKeys = ROUTES.map((r) => r[1])
handlerKeys.forEach((key, i) => {
  const y = 150 + i * 56
  const fid = fn(key, 1060, y)
  connect(router, i, fid)
  connect(fid, 0, linkTelOut)
  if (key !== 'snapshot') connect(fid, 1, linkCmdOut)
  if (key === 'seguridad') {
    const dl = add({ id: id('delay_intrusion'), type: 'delay', name: 'Retraso 1.2 s', pauseType: 'delay', timeout: '1.2', timeoutUnits: 'seconds', rate: '1', nbRateUnits: '1', rateUnits: 'second', randomFirst: '1', randomLast: '5', randomUnits: 'seconds', drop: false, allowrate: false, outputs: 1, x: 1230, y: y + 22 })
    connect(fid, 2, dl)
    connect(dl, 0, linkCmdOut)
  }
})
connect(id('inicializar'), 0, linkTelOut)
connect(id('inicializar'), 1, linkCmdOut)
connect(id('sesion-autorizar'), 1, linkTelOut) // respuestas a UN cliente (msg._session): sesión, confirmación pedida, rechazo
connect(id('sesion-autorizar'), 2, id('auditar'))
connect(id('auditar'), 1, linkCmdOut)          // avisos de seguridad en el registro de eventos

/* C · Reloj de la simulación (cada 1 s) */
const Y3 = 760
comment('C · Simulación — cada segundo: expiraciones → humo → clima/A/C → energía → alertas → InfluxDB', 520, Y3 - 40)
const tick = add({ id: id('inj_tick'), type: 'inject', name: 'Tick 1 s', props: [{ p: 'payload' }, { p: 'topic', vt: 'str' }], repeat: '1', crontab: '', once: true, onceDelay: '1.5', topic: 'tick', payload: '', payloadType: 'date', x: 140, y: Y3 })
fn('expiraciones', 430, Y3)
fn('humo-tick', 740, Y3)
fn('clima-tick', 1050, Y3)
fn('energia-tick', 430, Y3 + 70)
fn('alertas', 740, Y3 + 70)
fn('persistir', 1050, Y3 + 70)
connect(tick, 0, id('expiraciones'))
connect(id('expiraciones'), 0, linkTelOut); connect(id('expiraciones'), 1, linkCmdOut); connect(id('expiraciones'), 2, id('humo-tick'))
connect(id('humo-tick'), 0, linkTelOut); connect(id('humo-tick'), 1, id('clima-tick'))
connect(id('clima-tick'), 0, linkTelOut); connect(id('clima-tick'), 1, id('energia-tick'))
connect(id('energia-tick'), 0, linkTelOut); connect(id('energia-tick'), 1, id('alertas'))
connect(id('alertas'), 0, linkTelOut); connect(id('alertas'), 1, id('persistir'))

/* D · Salida: WebSocket + InfluxDB */
const Y4 = Y3 + 200
comment('D · Salida — telemetría a la interfaz (WebSocket) y a la base de datos (InfluxDB)', 520, Y4 - 40)
const linkTelIn = add({ id: id('link_tel_in'), type: 'link in', name: 'telemetría', links: [], x: 160, y: Y4 + 20 })
fn('serializar', 430, Y4)
const wsOut = add({ id: id('ws_out'), type: 'websocket out', name: 'Node-RED → Frontend', server: 'cfg_ws', client: '', x: 720, y: Y4 }, 0)
fn('eventos-influx', 430, Y4 + 60)
fn('firmar-telemetria', 680, Y4 + 60)      // cada punto sale como mensaje firmado de su dispositivo simulado
fn('validar-telemetria', 930, Y4 + 60)     // ÚNICO camino hacia InfluxDB: firma, ventana, secuencia, esquema, anomalías
const batch = add({ id: id('influx_batch'), type: 'influxdb batch', name: `Guardar en InfluxDB · ${INFLUX.bucket}`, influxdb: 'cfg_influx', precision: '', retentionPolicy: '', database: '', precisionV18FluxV20: 'ms', retentionPolicyV18Flux: '', org: INFLUX.org, bucket: INFLUX.bucket, x: 1230, y: Y4 + 30 }, 0)
const batchInt = add({ id: id('influx_batch_int'), type: 'influxdb batch', name: `Huellas de integridad · ${INFLUX.integrityBucket}`, influxdb: 'cfg_influx', precision: '', retentionPolicy: '', database: '', precisionV18FluxV20: 'ms', retentionPolicyV18Flux: '', org: INFLUX.org, bucket: INFLUX.integrityBucket, x: 1230, y: Y4 + 90 }, 0)
const dbg = add({ id: id('debug_tel'), type: 'debug', name: 'Ver telemetría (activa para depurar)', active: false, tosidebar: true, console: false, tostatus: false, complete: 'payload', targetType: 'msg', x: 720, y: Y4 + 120 }, 0)
connect(linkTelIn, 0, id('serializar')); connect(linkTelIn, 0, id('eventos-influx')); connect(linkTelIn, 0, dbg)
connect(id('serializar'), 0, wsOut)
connect(id('eventos-influx'), 0, id('firmar-telemetria'))
connect(id('persistir'), 0, id('firmar-telemetria'))
connect(id('firmar-telemetria'), 0, id('validar-telemetria'))
connect(id('validar-telemetria'), 0, batch)          // aceptados
connect(id('validar-telemetria'), 1, id('auditar'))  // rechazados y en cuarentena
connect(id('validar-telemetria'), 3, batchInt)       // huellas de los bloques
connect(id('auditar'), 0, batch)                     // puntos «audit» y «quarantine»
connect(id('persistir'), 1, linkTelOut) // contadores del pipeline hacia la interfaz

/* E · API REST para el historial */
const Y5 = Y4 + 230
comment('E · API REST — historial desde InfluxDB (Flux) para las gráficas del frontend', 520, Y5 - 40, 'GET /api/history/power · /smoke · /climate?room=… (from, to en ms; bucket en s) y GET /api/health')
const q = add({ id: id('influx_in'), type: 'influxdb in', name: 'Consultar InfluxDB (Flux)', influxdb: 'cfg_influx_read', query: '', rawOutput: false, precision: '', retentionPolicy: '', org: INFLUX.org, x: 860, y: Y5 + 50 })
fn('hist-formato', 1160, Y5 + 50)
const resp = add({ id: id('http_resp'), type: 'http response', name: 'Respuesta JSON', statusCode: '', headers: {}, x: 1420, y: Y5 + 50 }, 0)
connect(q, 0, id('hist-formato')); connect(id('hist-formato'), 0, resp); connect(id('hist-formato'), 1, linkTelOut)
;[
  ['/api/history/power', 'hist-power', 0],
  ['/api/history/smoke', 'hist-smoke', 50],
  ['/api/history/climate', 'hist-clima', 100],
].forEach(([url, key, dy]) => {
  const h = add({ id: id('http_' + key), type: 'http in', name: `GET ${url}`, url, method: 'get', upload: false, swaggerDoc: '', x: 160, y: Y5 + 30 + (dy as number) })
  fn(key as string, 480, Y5 + 30 + (dy as number))
  connect(h, 0, id(key as string))
  connect(id(key as string), 0, q)
})
connect(id('hist-clima'), 1, resp) // room inválido → 400
// Ingesta de un dispositivo externo firmado (desactivada por defecto; ver CASA_INGEST en .env.example)
const hIng = add({ id: id('http_ingest'), type: 'http in', name: 'POST /api/ingest', url: '/api/ingest', method: 'post', upload: false, swaggerDoc: '', x: 160, y: Y5 + 300 })
fn('ingesta-recibir', 480, Y5 + 300)
connect(hIng, 0, id('ingesta-recibir')); connect(id('ingesta-recibir'), 0, id('validar-telemetria')); connect(id('ingesta-recibir'), 1, resp)
connect(id('validar-telemetria'), 2, resp)
const hh = add({ id: id('http_health'), type: 'http in', name: 'GET /api/health', url: '/api/health', method: 'get', upload: false, swaggerDoc: '', x: 160, y: Y5 + 180 })
fn('salud', 480, Y5 + 180)
connect(hh, 0, id('salud')); connect(id('salud'), 0, resp)
const ctch = add({ id: id('catch'), type: 'catch', name: 'Errores de la API', scope: [q, id('hist-power'), id('hist-smoke'), id('hist-clima')], uncaught: false, x: 160, y: Y5 + 240 })
fn('error', 480, Y5 + 240)
connect(ctch, 0, id('error')); connect(id('error'), 0, resp); connect(id('error'), 1, linkTelOut)

/* F · Monitor del pipeline: Node-RED comprueba en InfluxDB lo que guardó */
const Y6 = Y5 + 400
comment('F · Monitor del pipeline — cada 5 s Node-RED LEE de InfluxDB cuánto guardó y cuándo fue lo último', 520, Y6 - 40, 'Así la interfaz puede demostrar que los datos están en la base de datos y no solo en memoria: puntos de los últimos 10 min, hora del último y latencia de la lectura.')
const injPipe = add({ id: id('inj_pipe'), type: 'inject', name: 'Cada 5 s', props: [{ p: 'payload' }], repeat: '5', crontab: '', once: true, onceDelay: '4', topic: '', payload: '', payloadType: 'date', x: 140, y: Y6 })
fn('pipeline-contar', 430, Y6)
const pin1 = add({ id: id('pipe_in1'), type: 'influxdb in', name: 'Monitor · contar (Flux)', influxdb: 'cfg_influx_read', query: '', rawOutput: false, precision: '', retentionPolicy: '', org: INFLUX.org, x: 720, y: Y6 })
fn('pipeline-ultimo', 1000, Y6)
const pin2 = add({ id: id('pipe_in2'), type: 'influxdb in', name: 'Monitor · último (Flux)', influxdb: 'cfg_influx_read', query: '', rawOutput: false, precision: '', retentionPolicy: '', org: INFLUX.org, x: 1290, y: Y6 })
fn('pipeline-resultado', 1290, Y6 + 70)
const pctch = add({ id: id('pipe_catch'), type: 'catch', name: 'Errores de InfluxDB', scope: [id('influx_batch'), id('influx_batch_int'), pin1, pin2], uncaught: false, x: 160, y: Y6 + 130 })
fn('pipeline-error', 430, Y6 + 130)
connect(injPipe, 0, id('pipeline-contar')); connect(id('pipeline-contar'), 0, pin1); connect(pin1, 0, id('pipeline-ultimo'))
connect(id('pipeline-ultimo'), 0, pin2); connect(pin2, 0, id('pipeline-resultado')); connect(id('pipeline-resultado'), 0, linkTelOut)
connect(pctch, 0, id('pipeline-error')); connect(id('pipeline-error'), 0, linkTelOut)

// Enlaces entre link in / link out
const byId = (i: string) => nodes.find((n) => n.id === i)
byId(linkCmdIn).links = [linkCmdOut]
byId(linkCmdOut).links = [linkCmdIn]
byId(linkTelIn).links = [linkTelOut]
byId(linkTelOut).links = [linkTelIn]

}

assembleCompleto()

// Cableado final
for (const n of nodes) if (wires[n.id]) n.wires = wires[n.id]

const FLOWS_FILE = process.env.FLOWS_FILE ?? 'flows.json'
writeFileSync(join(OUT, FLOWS_FILE), JSON.stringify(nodes, null, 2) + '\n')
// flows_cred.json NO contiene secretos: solo referencias ${VARIABLE} que Node-RED resuelve al arrancar con las
// variables de entorno del contenedor (.env, fuera del repositorio). Dos tokens distintos: escritura y lectura.
// Con NO_CRED=1 (flujo para tu Node-RED local) no se escribe: setup-local.mjs crea y guarda los tokens en TU Node-RED.
if (!process.env.NO_CRED) {
  writeFileSync(join(OUT, 'flows_cred.json'), JSON.stringify({ cfg_influx: { token: '${INFLUX_TOKEN_WRITE}' }, cfg_influx_read: { token: '${INFLUX_TOKEN_READ}' } }, null, 2) + '\n')
}
console.log(`${FLOWS_FILE}: ${nodes.length} nodos · ${nodes.filter((n) => n.type === 'function').length} funciones · config desde house.config.ts`)
console.log(`InfluxDB: ${INFLUX.url} · org ${INFLUX.org} · bucket ${INFLUX.bucket}`)
