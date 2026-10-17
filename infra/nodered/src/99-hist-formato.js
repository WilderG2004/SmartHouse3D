// @name Dar formato a la respuesta
// @kind plain
// @outputs 2
// @uses cors
// Convierte las filas de Flux en [{ ts, value, ... }] (contrato de src/services/history/historyApi.ts).
const rows = Array.isArray(msg.payload) ? msg.payload : [];
const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : null);
let out = [];

if (msg.fmt === 'power') {
  out = rows.map((r) => ({ ts: Date.parse(r._time), value: r2(r.watts), base: r2(r.base), lights: r2(r.lights), ac: r2(r.ac), plugs: r2(r.plugs) }));
} else if (msg.fmt === 'smoke') {
  out = rows.map((r) => ({ ts: Date.parse(r._time), value: r2(r._value) }));
} else if (msg.fmt === 'climate') {
  out = rows.map((r) => ({ ts: Date.parse(r._time), value: r2(r[msg.room]), outdoor: r2(r.exterior) }));
}
out = out.filter((p) => p.value !== null).sort((a, b) => a.ts - b.ts);

msg.payload = out;
msg.statusCode = 200;
msg.headers = apiHeaders(msg.req);
delete msg.query;

// Contadores para el panel «Pipeline IoT»: consultas del frontend atendidas leyendo InfluxDB
const S = flow.get('state');
let tel = null;
if (S) {
  const a = S.pipe.api, t = Date.now();
  a.requests += 1; a.lastRoute = msg._route || null; a.lastMs = msg._t0 ? t - msg._t0 : null; a.lastAt = t; a.lastPoints = out.length;
  tel = { payload: { type: 'pipeline', ts: t, api: Object.assign({}, a) } };
}
return [msg, tel];
