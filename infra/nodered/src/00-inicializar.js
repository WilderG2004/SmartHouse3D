// @name Configuración y estado inicial
// @kind plain
// @outputs 2
// @libs crypto
// Se ejecuta al desplegar y al pulsar el botón del nodo «Reiniciar simulación».
// La configuración se genera desde src/config/house.config.ts (ver tools/build-flows.mts).
const cfg = __CFG__;
global.set('cfg', cfg);

// ── Seguridad del canal (ver docs/seguridad-iot.md) ────────────────────────────────────────────
// La POLÍTICA (qué rol puede qué, límites, esquemas) viene generada y no contiene secretos.
// Las CLAVES salen de variables de entorno y NUNCA se guardan en el repositorio:
//   CASA_USERS        claves POR PERSONA: «alias:rol:clave,alias:rol:clave» (rol = lector | operador | administrador).
//                     La auditoría guarda el alias de quien hizo cada cosa. Un «lector» con clave ve todo pero no manda.
//   CASA_PAIRING_KEY  clave COMPARTIDA del rol Operador      (alias de auditoría «compartida-operador»)
//   CASA_ADMIN_KEY    clave COMPARTIDA del rol Administrador (alias «compartida-admin»)
//   CASA_DEVICE_KEY   clave maestra de la que se derivan las claves de cada dispositivo simulado (firmas HMAC)
//   *_PREVIOUS        la clave compartida anterior, solo durante una rotación (se aceptan las dos a la vez)
// Si falta alguna, se crea una TEMPORAL solo para esta ejecución (modo desarrollo) y se muestra en el registro de Node-RED.
// «Reiniciar simulación» NO cambia claves ni desconecta sesiones: el runtime de seguridad se crea una sola vez.
const sec = __SEC__;
global.set('sec', sec);
if (!global.get('secRt')) {
  const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
  const MIN = 12;
  const temporales = [];
  const leer = (name, label) => {
    const v = String(env.get(name) || '').trim();
    if (v.length >= MIN) return { value: v, temporal: false };
    if (v) node.warn('[Seguridad IoT] ' + name + ' es demasiado corta (mínimo ' + MIN + ' caracteres): se ignora.');
    const t = crypto.randomBytes(18).toString('base64url');
    temporales.push(label + ': ' + t);
    return { value: t, temporal: true };
  };
  const previa = (name) => { const v = String(env.get(name) || '').trim(); return v.length >= MIN ? v : null; };
  const op = leer('CASA_PAIRING_KEY', 'clave de OPERADOR (emparejamiento)');
  const ad = leer('CASA_ADMIN_KEY', 'clave de ADMINISTRADOR');
  const dk = leer('CASA_DEVICE_KEY', 'clave de dispositivos');
  const rt = {
    startedAt: Date.now(),
    deviceKeyPersistent: !dk.temporal,
    ingestEnabled: String(env.get('CASA_INGEST') || '').toLowerCase() === 'on' && !dk.temporal,
    sessions: {}, frozenUntil: 0, helloFails: [], lastPrune: Date.now(),
    seqOut: {}, lastSeq: {}, lastVal: {}, blocks: {}, prevHash: 'GENESIS', genesis: true,
    audit: { tokens: 40, ts: Date.now(), dropped: 0, lastDropAt: 0 }, notice: {},
    stats: { accepted: 0, rejected: 0, telemetryAccepted: 0, telemetryRejected: 0 },
  };
  // Los SECRETOS van como propiedades NO enumerables: no salen en JSON.stringify ni en la API de contexto del editor
  // de Node-RED (GET /context/global/secRt), que de otro modo devolvería la clave maestra a quien llegue al editor.
  // (El editor debe estar protegido con adminAuth igualmente: ver settings.js.)
  const oculto = (k, v) => Object.defineProperty(rt, k, { value: v, enumerable: false, writable: true, configurable: true });
  // Usuarios que pueden emparejar: { alias, rank, hash }. Solo se guardan resúmenes SHA-256: la clave en texto no queda en memoria.
  const RANGO = { lector: 0, operador: 1, administrador: 2 };
  const users = [];
  const agregar = (alias, rank, clave) => {
    const hash = sha(clave);
    if (users.some((u) => u.hash === hash)) { node.warn('[Seguridad IoT] La clave de «' + alias + '» repite la de otro usuario: se ignora (cada persona necesita la suya).'); return; }
    users.push({ alias, rank, hash });
  };
  agregar('compartida-operador', 1, op.value);
  agregar('compartida-admin', 2, ad.value);
  const opPrev = previa('CASA_PAIRING_KEY_PREVIOUS'), adPrev = previa('CASA_ADMIN_KEY_PREVIOUS');
  if (opPrev) agregar('compartida-operador', 1, opPrev);
  if (adPrev) agregar('compartida-admin', 2, adPrev);
  String(env.get('CASA_USERS') || '').split(',').map((x) => x.trim()).filter(Boolean).forEach((item, n) => {
    const i = item.indexOf(':'), j = i > 0 ? item.indexOf(':', i + 1) : -1;
    const alias = i > 0 ? item.slice(0, i) : '', rol = j > 0 ? item.slice(i + 1, j) : '', clave = j > 0 ? item.slice(j + 1) : '';
    // El aviso nunca incluye la clave: solo el número de la entrada
    if (!/^[A-Za-z0-9._-]{1,32}$/.test(alias) || !Object.prototype.hasOwnProperty.call(RANGO, rol) || clave.length < MIN) {
      node.warn('[Seguridad IoT] CASA_USERS: la entrada n.º ' + (n + 1) + ' se ignora (formato alias:rol:clave · rol lector|operador|administrador · clave de ' + MIN + '+ caracteres).');
      return;
    }
    if (users.some((u) => u.alias === alias)) { node.warn('[Seguridad IoT] CASA_USERS: el alias «' + alias + '» está repetido: se ignora la entrada n.º ' + (n + 1) + '.'); return; }
    agregar(alias, RANGO[rol], clave);
  });
  oculto('users', users);
  oculto('master', Buffer.from(dk.value, 'utf8'));
  oculto('devKeys', {});
  oculto('intKey', null);
  oculto('pending', {}); // códigos de confirmación vigentes
  global.set('secRt', rt);
  if (temporales.length) {
    node.warn('[Seguridad IoT] MODO DESARROLLO: faltan variables de entorno, se crearon claves temporales (valen solo hasta que reinicies Node-RED):\n  ' + temporales.join('\n  ') + '\n  Para que sean fijas: define CASA_PAIRING_KEY, CASA_ADMIN_KEY y CASA_DEVICE_KEY (ver .env.example).');
  }
  if (String(env.get('CASA_INGEST') || '').toLowerCase() === 'on' && dk.temporal) {
    node.warn('[Seguridad IoT] CASA_INGEST=on se ignora: la ingesta externa necesita una CASA_DEVICE_KEY fija.');
  }
} else {
  // Reinicio de la simulación: los valores nuevos pueden saltar (p. ej. kWh vuelve a 0); se olvida la línea base de anomalías.
  global.get('secRt').lastVal = {};
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const d = new Date();
const hour = d.getHours() + d.getMinutes() / 60;
const o = cfg.CLIMATE.outdoor;
const outdoor = o.mean + o.amp * Math.cos(((hour - o.peakHour) / 24) * 2 * Math.PI);

const S = {
  lights: {}, pirMotion: {}, pirUntil: {}, pirAuto: {}, doors: {},
  smoke: { ppm: cfg.SMOKE.normalPpm, leak: false, alarm: false },
  kwh: 0, rooms: {}, acs: {}, acReached: {}, plugs: {},
  security: { mode: 'disarmed', alarm: false, cause: null },
  hourOverride: null, last: { ac: {}, plug: {} }, lastPower: null, events: [],
  ev: { heat: 0, hum: 0 },            // hasta cuándo dura cada evento doméstico (ms): cocinar, ducha
  lvl: { heat: 0, hum: 0 },           // nivel suave 0..1 de cada evento
  alerts: {},                         // alertas activas: id → { level, message, since }
  // Transparencia del pipeline: lo que Node-RED ha guardado, verificado y servido de verdad
  pipe: { batches: 0, points: 0, lastBatchAt: null, errors: 0, lastError: null, lastErrorAt: null, store: null,
          api: { requests: 0, errors: 0, lastRoute: null, lastMs: null, lastAt: null, lastPoints: null } },
};

for (const l of cfg.LIGHTS) {
  const pct = cfg.INITIAL_LIGHTS_ON[l.id];
  S.lights[l.id] = { id: l.id, on: pct !== undefined, intensity: pct !== undefined ? pct : 100, color: cfg.DEFAULT_LIGHT_COLOR };
}
for (const p of cfg.PIRS) { S.pirMotion[p.id] = false; S.pirUntil[p.id] = null; S.pirAuto[p.id] = []; }
for (const dr of cfg.DOORS) S.doors[dr.id] = false;
for (const r of cfg.ROOMS) S.rooms[r.id] = { t: outdoor - cfg.CLIMATE.insulation, h: 60, lux: 0 };
for (const a of cfg.AIR_CONDITIONERS) S.acs[a.id] = { id: a.id, on: false, mode: 'cool', setpoint: 24, fan: 'mid', running: false, watts: 0 };
for (const p of cfg.PLUGS) {
  const on = !!p.initialOn;
  S.plugs[p.id] = { id: p.id, on, watts: on ? p.watts : 0, kwh: 0, offAt: on && p.autoOffSec ? Date.now() + p.autoOffSec * 1000 : null };
}

flow.set('state', S);
flow.set('seq', 1);
node.status({ fill: 'green', shape: 'dot', text: 'simulación lista · ' + d.toLocaleTimeString('es-CO') });

const evt = { id: 'nr-init-' + Date.now(), ts: Date.now(), level: 'info', source: 'Sistema', message: 'Simulación iniciada en Node-RED' };
S.events.push(evt);
const ev = { type: 'event', event: evt };
// salida 1 → telemetría · salida 2 → comando para que TODOS los clientes reciban un snapshot nuevo
return [[{ payload: ev }], [{ payload: { kind: 'snapshot.request' } }]];
