// @name Validar telemetría (firma, ventana, secuencia, esquema, anomalías)
// @kind plain
// @outputs 4
// @uses crypto,cors
// ÚNICO camino hacia InfluxDB para la telemetría. Cada mensaje {dev, body, sig} pasa estas comprobaciones, en este orden:
//   envelope        el sobre tiene la forma esperada
//   unknown_device  el dispositivo existe en la configuración de la casa (y, si viene de /api/ingest, acepta ingesta)
//   bad_signature   HMAC-SHA256 correcto con la clave de ESE dispositivo (comparación en tiempo constante)
//   stale           la marca de tiempo está dentro de la ventana (telemetry.windowMs)
//   replay          el número de secuencia es MAYOR que el último aceptado de ese dispositivo. Para los dispositivos
//                   externos (/api/ingest) el último número se guarda EN DISCO (contexto «persistente», ver settings.js)
//                   y, tras un reinicio, además se rechaza lo firmado ANTES de que arrancara Node-RED: así reiniciar no
//                   abre una ventana para reenviar mensajes capturados. Un dispositivo real debe usar un seq que no
//                   vuelva a empezar al reiniciarse él (p. ej. milisegundos de su reloj).
//   schema / range  medición, etiquetas y campos permitidos, con tipo y rango válidos; todo lo demás se descarta
//   anomaly         salto físicamente imposible respecto de la lectura anterior → CUARENTENA (no entra como dato confiable)
// Además agrupa los puntos aceptados en bloques de tiempo y, al cerrar cada bloque, escribe su HUELLA:
//   hash = HMAC(clave de integridad, prev : bloque : cantidad : SHA256(hashes de los puntos ordenados))
// Cada huella incluye la anterior (cadena): borrar o alterar puntos o bloques después se puede detectar con infra/verificar-integridad.mjs.
// Límites: la huella dice QUE un bloque cambió, no CUÁL punto; la cadena vuelve a empezar (GENESIS) cuando se reinicia Node-RED;
// y quien tenga la clave CASA_DEVICE_KEY podría fabricar huellas válidas (firmante y validador son el mismo Node-RED).
//   Salida 1 → puntos aceptados → InfluxDB   Salida 2 → auditoría   Salida 3 → respuesta HTTP (solo ingesta)   Salida 4 → huellas → InfluxDB
const T = SEC.telemetry;
const now = Date.now();
const envs = Array.isArray(msg.payload) ? msg.payload : [];
const reg = RT.reg || (RT.reg = Object.fromEntries(T.devices.map((d) => [d.dev, d])));
const good = [], audits = [], results = [];
const ingest = !!msg._ingest;
// Últimos números de secuencia de los dispositivos externos, en disco (sobreviven a un reinicio). Solo se lee si hace falta.
const seen = ingest ? (global.get('antiReplay', 'persistente') || {}) : null;
let seenDirty = false;
const SAFE = /^[^\u0000-\u001f]{1,80}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const ruleCheck = (rule, v) => {
  switch (rule.t) {
    case 'num': return typeof v !== 'number' || !Number.isFinite(v) ? 'schema' : v < rule.min || v > rule.max ? 'range' : null;
    case 'bool': return typeof v === 'boolean' ? null : 'schema';
    case 'str': return typeof v !== 'string' ? 'schema' : v.length > rule.max ? 'range' : null;
    case 'enum': return typeof v !== 'string' ? 'schema' : rule.v.includes(v) ? null : 'range';
    case 'hex': return typeof v === 'string' && HEX.test(v) ? null : 'range';
  }
  return 'schema';
};

envs.forEach((e, i) => {
  let dev = e && typeof e.dev === 'string' ? e.dev.slice(0, 60) : '?';
  const fail = (reason, extra) => {
    RT.stats.telemetryRejected++;
    audits.push({ payload: Object.assign({ result: 'rejected', reason, kind: 'telemetry', id: dev, role: 'dispositivo', sid: '', dev }, extra || {}) });
    results.push({ i, ok: false, reason });
  };
  if (!e || typeof e.dev !== 'string' || typeof e.body !== 'string' || typeof e.sig !== 'string' || e.body.length > 4096 || !/^[0-9a-f]{64}$/.test(e.sig)) return fail('envelope');
  const d = reg[e.dev];
  if (!d || (ingest && !d.ingest)) return fail('unknown_device');
  if (!ctEq(hmacHex(deviceKey(e.dev), e.body), e.sig)) return fail('bad_signature');   // desde aquí el mensaje es AUTÉNTICO

  let b;
  try { b = JSON.parse(e.body); } catch (x) { return fail('envelope'); }
  if (!b || b.v !== 1 || b.dev !== e.dev || typeof b.m !== 'string' || !b.tags || typeof b.tags !== 'object' || Array.isArray(b.tags) || !b.f || typeof b.f !== 'object' || Array.isArray(b.f) || !Number.isInteger(b.ts) || !Number.isInteger(b.seq) || b.seq < 0) return fail('envelope');
  if (Math.abs(now - b.ts) > T.windowMs) return fail('stale');
  if (ingest && b.ts < RT.startedAt) return fail('stale');   // firmado antes de este arranque: pudo aceptarse antes del reinicio
  const last = Math.max(RT.lastSeq[e.dev] || 0, (ingest && seen[e.dev]) || 0);
  if (b.seq <= last) return fail('replay');
  RT.lastSeq[e.dev] = b.seq;
  if (ingest) { seen[e.dev] = b.seq; seenDirty = true; }

  const sch = T.schema[b.m];
  if (!sch || b.m !== d.m) return fail('schema');
  const tk = Object.keys(b.tags);
  if (d.tags) {                                   // dispositivo con etiquetas fijas: deben coincidir exactamente
    const dk = Object.keys(d.tags);
    if (tk.length !== dk.length || dk.some((k) => b.tags[k] !== d.tags[k])) return fail('schema');
  } else {                                        // eventos y alertas del propio sistema: mismas claves, texto seguro
    if (tk.length !== sch.tags.length || sch.tags.some((k) => typeof b.tags[k] !== 'string' || !SAFE.test(b.tags[k]))) return fail('schema');
    if (b.tags.level !== undefined && !['info', 'warning', 'critical'].includes(b.tags.level)) return fail('range');
  }
  const fk = Object.keys(b.f);
  if (!fk.length || fk.some((k) => !Object.prototype.hasOwnProperty.call(sch.fields, k))) return fail('schema');
  for (const k of fk) { const why = ruleCheck(sch.fields[k], b.f[k]); if (why) return fail(why); }

  // anomalías: saltos que la física no permite entre dos lecturas cercanas del mismo sensor
  for (const k of fk) {
    const lim = T.maxJump[k];
    if (!lim) continue;
    const prev = RT.lastVal[e.dev + '|' + k];
    if (prev && Math.abs(b.ts - prev.ts) <= T.jumpMaxGapMs && Math.abs(b.f[k] - prev.v) > lim) {
      return fail('anomaly', { quarantine: { dev: e.dev, m: b.m, summary: k + ': ' + prev.v + ' → ' + b.f[k] + ' en ' + Math.abs(b.ts - prev.ts) + ' ms (límite ' + lim + ')' } });
    }
  }
  for (const k of fk) if (T.maxJump[k]) RT.lastVal[e.dev + '|' + k] = { v: b.f[k], ts: b.ts };

  // aceptado
  const tags = ingest ? Object.assign({}, b.tags, { via: 'ingest' }) : b.tags;
  good.push({ measurement: b.m, tags, fields: b.f, timestamp: new Date(b.ts) });
  RT.stats.telemetryAccepted++;
  results.push({ i, ok: true });
  // Huella del punto, indexada por serie+instante: InfluxDB deja UN solo punto por serie y marca de tiempo (el último gana),
  // así que aquí también se conserva uno solo, para que el recuento coincida con lo que realmente queda guardado.
  const blk = Math.floor(b.ts / T.blockMs);
  (RT.blocks[blk] || (RT.blocks[blk] = { hashes: {} })).hashes[b.m + '|' + JSON.stringify(sortedPairs(tags)) + '|' + b.ts] = sha256Hex(canon(b.m, tags, b.f, b.ts));
});

if (seenDirty) global.set('antiReplay', seen, 'persistente');   // se escribe a disco en ≤ 1 s (flushInterval)

// cerrar bloques vencidos y escribir su huella (en orden, para encadenarlas)
const digests = [];
for (const k of Object.keys(RT.blocks).map(Number).sort((a, b) => a - b)) {
  if ((k + 1) * T.blockMs + T.graceMs > now) continue;
  // El bloque en el que arrancó Node-RED solo se vio a medias: no se firma (el verificador lo lista como «sin huella»)
  if (k * T.blockMs < RT.startedAt) { delete RT.blocks[k]; continue; }
  const hs = Object.values(RT.blocks[k].hashes).sort();
  const intKey = RT.intKey || (RT.intKey = crypto.createHmac('sha256', RT.master).update('casa-iot/integrity/v1').digest());
  const hash = hmacHex(intKey, [RT.prevHash, k, hs.length, sha256Hex(hs.join(''))].join(':'));
  digests.push({ measurement: 'integrity', tags: { chain: 'main' }, fields: { block_start: k * T.blockMs, block_ms: T.blockMs, count: hs.length, hash, prev: RT.prevHash, genesis: !!RT.genesis }, timestamp: new Date(k * T.blockMs) });
  RT.prevHash = hash; RT.genesis = false;
  delete RT.blocks[k];
}

let resp = null;
if (ingest) {
  const okN = results.filter((r) => r.ok).length;
  msg.statusCode = okN === results.length ? 202 : okN === 0 ? 422 : 207;
  msg.headers = apiHeaders(msg.req);
  msg.payload = { accepted: okN, rejected: results.filter((r) => !r.ok).map((r) => ({ i: r.i, reason: r.reason })) };
  resp = msg;
}
return [good.length ? { payload: good } : null, audits.length ? audits : null, resp, digests.length ? { payload: digests } : null];
