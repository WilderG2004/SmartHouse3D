// @name Autorizar sesión y validar comando
// @kind plain
// @outputs 3
// @uses crypto
// PUERTA ÚNICA de las órdenes que llegan por el WebSocket. Todo lo que no pase por aquí no llega al enrutador.
//   Salida 1 → enrutador (orden ya autorizada y saneada: solo las claves esperadas, con valores en rango)
//   Salida 2 → respuesta SOLO a ese cliente (msg._session): sesión, confirmación pedida o rechazo
//   Salida 3 → registros de auditoría (medición «audit» de InfluxDB)
//
// IDENTIDAD DE SESIÓN, NO DE PERSONA (no hay cuentas ni contraseñas de usuario):
//   lector         → cualquier conexión nueva. Solo ve datos. Es lo que ve el público de Vercel.
//   operador       → sesión emparejada con CASA_PAIRING_KEY: luces, aires, enchufes, puertas, escenas, armar la alarma.
//   administrador  → sesión emparejada con CASA_ADMIN_KEY: además, simulaciones, hora simulada y revocar sesiones.
// Acciones sensibles (desarmar la alarma, abrir una puerta del perímetro, escenas que desarman) piden CONFIRMACIÓN en
// dos pasos: el servidor responde con un código de un solo uso (15 s, ligado a esta sesión) y solo ejecuta cuando
// vuelve ese código en un mensaje «confirm».
//
// La validación ocurre AQUÍ, en el servidor. Ocultar botones en la interfaz es solo comodidad, no un control.
// Límites honestos: la IP del cliente no llega a Node-RED, por eso los límites son por sesión y globales (el límite
// por IP lo da el proxy y settings.js → webSocketNodeVerifyClient); una sesión nueva se obtiene reconectando.
if (!SEC || !RT) return [null, [{ payload: { type: 'reject', kind: '?', reason: 'not_ready' }, _session: msg._session }], null];

const now = Date.now();
const L = SEC.limits;
const NAME = SEC.roles;
const key = (msg._session && msg._session.id) || 'sin-sesion';
const short = (v) => sha256Hex(String(v)).slice(0, 8);   // nunca se guarda el id de sesión completo
const toOut = [], replies = [], audits = [];
const reply = (payload) => { if (msg._session) replies.push({ payload, _session: msg._session }); };
const fin = () => [toOut.length ? toOut : null, replies.length ? replies : null, audits.length ? audits : null];

// ── mantenimiento barato (cada minuto) ──
if (now - RT.lastPrune > 60000) {
  RT.lastPrune = now;
  for (const k of Object.keys(RT.sessions)) if (now - RT.sessions[k].last > 3600000) delete RT.sessions[k];
  for (const c of Object.keys(RT.pending)) if (RT.pending[c].exp < now) delete RT.pending[c];
  RT.helloFails = RT.helloFails.filter((t) => now - t < L.helloGlobalWindowMs);
}

let S = RT.sessions[key];
if (!S) S = RT.sessions[key] = { rank: 0, since: now, last: now, fails: 0, lockedUntil: 0, tokens: L.readBucket.cap, ts: now };
S.last = now;

const rec = (result, reason, kind, id, extra) =>
  audits.push({ payload: Object.assign({ result, reason, kind: String(kind || '?').slice(0, 40), id: id ? String(id).slice(0, 60) : '', role: NAME[S.rank], sid: short(key) }, extra || {}) });
const reject = (reason, kind, id, extra) => {
  RT.stats.rejected++;
  rec('rejected', reason, kind, id, extra);
  if (reason !== 'rate_limit') reply({ type: 'reject', kind: String(kind || '?').slice(0, 40), reason, need: extra && extra.need });   // a quien inunda no se le contesta cada mensaje
  return fin();
};

// ── 1. frecuencia por sesión (cubeta de fichas) ──
const B = S.rank > 0 ? L.controlBucket : L.readBucket;
S.tokens = Math.min(B.cap, S.tokens + ((now - S.ts) / 1000) * B.refillPerSec);
S.ts = now;
if (S.tokens < 1) return reject('rate_limit', msg.payload && msg.payload.kind);
S.tokens -= 1;

// ── 2. forma del mensaje (ya revisada en «Parsear comando») ──
if (msg.parseError) return reject(msg.parseError, '?');
const cmd = msg.payload || {};
const kind = cmd.kind;
const spec = Object.prototype.hasOwnProperty.call(SEC.kinds, kind) ? SEC.kinds[kind] : null;
if (!spec) return reject('unknown_kind', kind);
// solo las claves esperadas: así nadie puede colar campos internos (auto, quiet, reason…) ni __proto__
for (const k of Object.keys(cmd)) if (!spec.keys.includes(k)) return reject('schema', kind, cmd.id);

// ── 3. capacidades por rol ──
if (spec.role > S.rank) return reject('forbidden', kind, cmd.id, { need: NAME[spec.role] });

// ── 4. mensajes de sesión ──
if (kind === 'session.hello') {
  if (RT.frozenUntil > now) return reject('frozen', kind);
  RT.helloFails = RT.helloFails.filter((t) => now - t < L.helloGlobalWindowMs);
  if (S.lockedUntil > now || RT.helloFails.length >= L.helloGlobalMax) return reject('locked', kind);
  const k = cmd.key;
  const h = typeof k === 'string' && k.length >= 8 && k.length <= 128 ? sha256Hex(k) : null;
  const matches = (list) => list.map((x) => (h ? ctEq(x, h) : false)).includes(true);   // sin cortocircuito: no filtra por tiempo
  const rank = matches(RT.keys.administrador) ? 2 : matches(RT.keys.operador) ? 1 : 0;
  if (!rank) {
    S.fails++; RT.helloFails.push(now);
    if (S.fails >= L.helloFailMax) { S.lockedUntil = now + L.helloLockMs; S.fails = 0; }
    return reject('bad_key', kind);
  }
  S.rank = rank; S.fails = 0; S.since = now;
  RT.stats.accepted++;
  rec('accepted', 'paired', kind);
  reply({ type: 'session', role: NAME[rank] });
  return fin();
}
if (kind === 'session.logout') {
  S.rank = 0;
  for (const c of Object.keys(RT.pending)) if (RT.pending[c].sid === key) delete RT.pending[c];
  RT.stats.accepted++;
  rec('accepted', 'logout', kind);
  reply({ type: 'session', role: NAME[0] });
  return fin();
}
if (kind === 'admin.revoke') {
  let n = 0;
  for (const k of Object.keys(RT.sessions)) {
    if (k !== key && RT.sessions[k].rank > 0) {
      RT.sessions[k].rank = 0; n++;
      replies.push({ payload: { type: 'session', role: NAME[0], revoked: true }, _session: { type: 'websocket', id: k } });
    }
  }
  for (const c of Object.keys(RT.pending)) if (RT.pending[c].sid !== key) delete RT.pending[c];
  RT.frozenUntil = now + L.freezeMs;
  RT.stats.accepted++;
  rec('accepted', 'revoked', kind, '', { count: n });
  reply({ type: 'session', role: NAME[S.rank], note: 'revocadas ' + n });
  toOut.push({ payload: { kind: 'security.notice', level: 'warning', message: 'Sesiones de control revocadas (' + n + ') · emparejamiento congelado ' + Math.round(L.freezeMs / 60000) + ' min' } });
  return fin();
}
if (kind === 'confirm') {
  const code = typeof cmd.code === 'string' && /^[0-9a-f]{8}$/.test(cmd.code) ? cmd.code : null;
  const p = code ? RT.pending[code] : null;
  if (!p) return reject('bad_confirm', kind);                       // inexistente, ya usado (repetición) o mal escrito
  if (p.sid !== key) return reject('bad_confirm', kind, p.cmd.id);  // el código es de otra sesión
  delete RT.pending[code];                                          // un solo uso, también si caducó
  if (p.exp < now) return reject('expired', kind, p.cmd.id);
  if (S.rank < p.need) return reject('forbidden', kind, p.cmd.id, { need: NAME[p.need] });
  RT.stats.accepted++;
  rec('accepted', 'confirmed', p.cmd.kind, p.cmd.id, { confirmed: true });
  toOut.push({ payload: p.cmd, _session: msg._session });
  return fin();
}

// ── 5. órdenes de dispositivos: esquema estricto y rangos ──
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const isNum = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const known = (list, v) => typeof v === 'string' && list.includes(v);
const cfg = global.get('cfg') || {};   // nombres legibles de puertas y escenas para el texto del cuadro de confirmación
const label = (list, id) => { const x = (list || []).find((i) => i.id === id); return x ? x.label : id; };
let clean = null, sensitive = null;

switch (kind) {
  case 'snapshot.request':
    clean = { kind };
    break;
  case 'light.set': {
    if (!known(SEC.ids.light, cmd.id)) return reject('unknown_id', kind, cmd.id);
    if (!isObj(cmd.patch)) return reject('schema', kind, cmd.id);
    const ks = Object.keys(cmd.patch);
    if (!ks.length || ks.some((k) => !['on', 'intensity', 'color'].includes(k))) return reject('schema', kind, cmd.id);
    const patch = {};
    if (has(cmd.patch, 'on')) { if (typeof cmd.patch.on !== 'boolean') return reject('schema', kind, cmd.id); patch.on = cmd.patch.on; }
    if (has(cmd.patch, 'intensity')) { if (!isNum(cmd.patch.intensity, SEC.ranges.intensity[0], SEC.ranges.intensity[1])) return reject('range', kind, cmd.id); patch.intensity = cmd.patch.intensity; }
    if (has(cmd.patch, 'color')) { if (typeof cmd.patch.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(cmd.patch.color)) return reject('range', kind, cmd.id); patch.color = cmd.patch.color; }
    clean = { kind, id: cmd.id, patch };
    break;
  }
  case 'ac.set': {
    if (!known(SEC.ids.ac, cmd.id)) return reject('unknown_id', kind, cmd.id);
    if (!isObj(cmd.patch)) return reject('schema', kind, cmd.id);
    const ks = Object.keys(cmd.patch);
    if (!ks.length || ks.some((k) => !['on', 'mode', 'setpoint', 'fan'].includes(k))) return reject('schema', kind, cmd.id);
    const patch = {};
    if (has(cmd.patch, 'on')) { if (typeof cmd.patch.on !== 'boolean') return reject('schema', kind, cmd.id); patch.on = cmd.patch.on; }
    if (has(cmd.patch, 'mode')) { if (cmd.patch.mode !== 'cool' && cmd.patch.mode !== 'fan') return reject('range', kind, cmd.id); patch.mode = cmd.patch.mode; }
    if (has(cmd.patch, 'fan')) { if (!['low', 'mid', 'high'].includes(cmd.patch.fan)) return reject('range', kind, cmd.id); patch.fan = cmd.patch.fan; }
    if (has(cmd.patch, 'setpoint')) { if (!isNum(cmd.patch.setpoint, SEC.ranges.setpoint[0], SEC.ranges.setpoint[1])) return reject('range', kind, cmd.id); patch.setpoint = cmd.patch.setpoint; }
    clean = { kind, id: cmd.id, patch };
    break;
  }
  case 'plug.set':
    if (!known(SEC.ids.plug, cmd.id)) return reject('unknown_id', kind, cmd.id);
    if (typeof cmd.on !== 'boolean') return reject('schema', kind, cmd.id);
    clean = { kind, id: cmd.id, on: cmd.on };
    break;
  case 'door.set':
    if (!known(SEC.ids.door, cmd.id)) return reject('unknown_id', kind, cmd.id);
    if (typeof cmd.open !== 'boolean') return reject('schema', kind, cmd.id);
    clean = { kind, id: cmd.id, open: cmd.open };
    if (cmd.open && SEC.ids.doorExterior.includes(cmd.id)) sensitive = 'Abrir «' + label(cfg.DOORS, cmd.id) + '» (puerta del perímetro)';
    break;
  case 'scene.apply':
    if (!known(SEC.ids.scene, cmd.id)) return reject('unknown_id', kind, cmd.id);
    clean = { kind, id: cmd.id };
    if (SEC.ids.sceneDisarms.includes(cmd.id)) sensitive = 'Aplicar la escena «' + label(cfg.SCENES, cmd.id) + '» (desarma la alarma)';
    break;
  case 'security.set':
    if (!['disarmed', 'home', 'away'].includes(cmd.mode)) return reject('range', kind);
    clean = { kind, mode: cmd.mode };
    if (cmd.mode === 'disarmed') sensitive = 'Desarmar la alarma';
    break;
  case 'security.simulateIntrusion':
    clean = { kind };
    break;
  case 'smoke.simulate':
  case 'heat.simulate':
  case 'humidity.simulate':
    if (typeof cmd.active !== 'boolean') return reject('schema', kind);
    clean = { kind, active: cmd.active };
    break;
  case 'pir.simulate':
    if (!known(SEC.ids.pir, cmd.id)) return reject('unknown_id', kind, cmd.id);
    clean = { kind, id: cmd.id };
    break;
  case 'world.setHour':
    if (cmd.hour !== null && !isNum(cmd.hour, SEC.ranges.hour[0], SEC.ranges.hour[1])) return reject('range', kind);
    clean = { kind, hour: cmd.hour };
    break;
  default:
    return reject('unknown_kind', kind);
}

// ── 6. acciones sensibles: confirmación en dos pasos ──
if (sensitive) {
  const mine = Object.keys(RT.pending).filter((c) => RT.pending[c].sid === key);
  while (mine.length >= L.maxPendingPerSession) delete RT.pending[mine.shift()];
  const code = crypto.randomBytes(4).toString('hex');
  RT.pending[code] = { sid: key, cmd: clean, need: spec.role, exp: now + L.confirmTtlMs, summary: sensitive };
  rec('pending', 'confirm_required', kind, clean.id);
  reply({ type: 'confirm', code, kind, summary: sensitive, ttlMs: L.confirmTtlMs });
  return fin();
}

RT.stats.accepted++;
rec('accepted', 'ok', kind, clean.id);
toOut.push({ payload: clean, _session: msg._session });
return fin();
