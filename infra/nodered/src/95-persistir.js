// @name Preparar lecturas para InfluxDB
// @kind plain
// @outputs 2
// Cada cfg.INFLUX.persistEverySec segundos arma UN lote con todas las mediciones periódicas.
// Esquema (measurement · tags → fields):
//   power  · meter        → watts, kwh, base, lights, ac, plugs
//   smoke  · sensor       → ppm, alarm, simulating
//   env    · room, sensor → temperature, humidity, lux   (sensor = "DHT22-<habitación>"; room "exterior" = temperatura exterior)
//   ac     · id, room     → on, mode, setpoint, running, watts
//   plug   · id, room     → on, watts, kwh
const cfg = global.get('cfg');
const S = flow.get('state');
if (!cfg || !S) return null;

const every = (cfg.INFLUX && cfg.INFLUX.persistEverySec) || 2;
const n = (context.get('n') || 0) + 1;
context.set('n', n);
if (n % every !== 0) return null;

const round = (v, d) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
const ts = new Date();
const pts = [];

const P = S.lastPower;
if (P) {
  pts.push({ measurement: 'power', tags: { meter: 'Medidor_General' }, timestamp: ts,
    fields: { watts: P.watts, kwh: round(P.kwhTotal, 6), base: P.breakdown.base, lights: P.breakdown.lights, ac: P.breakdown.ac, plugs: P.breakdown.plugs } });
}
pts.push({ measurement: 'smoke', tags: { sensor: cfg.SMOKE.id }, timestamp: ts,
  fields: { ppm: Math.round(S.smoke.ppm), alarm: S.smoke.alarm, simulating: S.smoke.leak } });

for (const r of cfg.ROOMS) {
  const st = S.rooms[r.id];
  pts.push({ measurement: 'env', tags: { room: r.id, sensor: 'DHT22-' + r.id }, timestamp: ts,
    fields: { temperature: round(st.t, 2), humidity: round(st.h, 1), lux: Math.round(st.lux || 0) } });
}
const o = cfg.CLIMATE.outdoor;
const hour = S.hourOverride !== null ? S.hourOverride : new Date().getHours() + new Date().getMinutes() / 60;
pts.push({ measurement: 'env', tags: { room: 'exterior', sensor: 'exterior' }, timestamp: ts,
  fields: { temperature: round(o.mean + o.amp * Math.cos(((hour - o.peakHour) / 24) * 2 * Math.PI), 2) } });

for (const a of cfg.AIR_CONDITIONERS) {
  const s = S.acs[a.id];
  pts.push({ measurement: 'ac', tags: { id: a.id, room: a.room }, timestamp: ts,
    fields: { on: s.on, mode: s.mode, setpoint: s.setpoint, running: s.running, watts: s.watts } });
}
for (const p of cfg.PLUGS) {
  const s = S.plugs[p.id];
  pts.push({ measurement: 'plug', tags: { id: p.id, room: p.room }, timestamp: ts,
    fields: { on: s.on, watts: s.watts, kwh: round(s.kwh, 6) } });
}

msg.payload = pts;
// Contadores para el panel «Pipeline IoT» de la interfaz (lo que Node-RED envía a InfluxDB)
const pp = S.pipe;
pp.batches += 1; pp.points += pts.length; pp.lastBatchAt = Date.now();
const tel = { payload: { type: 'pipeline', ts: pp.lastBatchAt, writes: { batches: pp.batches, points: pp.points, lastBatchAt: pp.lastBatchAt, errors: pp.errors, lastError: pp.lastError, lastErrorAt: pp.lastErrorAt } } };
node.status({ fill: 'blue', shape: 'dot', text: pts.length + ' puntos · ' + ts.toLocaleTimeString('es-CO') });
return [msg, tel];
