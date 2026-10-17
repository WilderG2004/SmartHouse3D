// @name Snapshot del estado
// @kind handler
// @uses world
// Comando: { kind:'snapshot.request' }. Si viene de un cliente (msg._session) responde solo
// a ese cliente; si lo pide el sistema (al reiniciar), llega a todos.
const clone = (o) => JSON.parse(JSON.stringify(o));
const P = S.lastPower;
const state = {
  lights: clone(S.lights),
  smoke: { ppm: Math.round(S.smoke.ppm), alarm: S.smoke.alarm, simulating: S.smoke.leak },
  pir: Object.fromEntries(cfg.PIRS.map((p) => [p.id, { motion: !!S.pirMotion[p.id], lastTriggerAt: null }])),
  doors: Object.fromEntries(cfg.DOORS.map((d) => [d.id, { open: !!S.doors[d.id] }])),
  power: { watts: P ? P.watts : cfg.METER.baseLoadW, kwhTotal: S.kwh, breakdown: P ? P.breakdown : undefined },
  climate: climateRooms(),
  acs: clone(S.acs),
  plugs: Object.fromEntries(cfg.PLUGS.map((p) => [p.id, { id: p.id, on: S.plugs[p.id].on, watts: S.plugs[p.id].watts, kwh: S.plugs[p.id].kwh }])),
  security: Object.assign({}, S.security),
  world: worldNow(),
  events: (S.events || []).slice().reverse(),
  alerts: Object.entries(S.alerts || {}).map(([id, x]) => ({ id, level: x.level, message: x.message, since: x.since })),
  pipeline: { writes: { batches: S.pipe.batches, points: S.pipe.points, lastBatchAt: S.pipe.lastBatchAt, errors: S.pipe.errors, lastError: S.pipe.lastError, lastErrorAt: S.pipe.lastErrorAt }, store: S.pipe.store, api: S.pipe.api },     // más recientes primero (como el log de la interfaz)
};
const reply = { payload: { type: 'snapshot', state } };
if (msg._session) reply._session = msg._session;
return [[reply], []];
