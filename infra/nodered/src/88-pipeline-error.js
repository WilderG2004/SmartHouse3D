// @name Monitor · error de InfluxDB
// @kind plain
// Si InfluxDB rechaza una escritura o una lectura, la interfaz lo muestra en rojo en el panel «Pipeline IoT».
const S = flow.get('state');
if (!S) return null;
const src = msg.error && msg.error.source ? msg.error.source.id : '';
// El texto del error llega a TODOS los clientes (también a los de solo lectura): en un servidor público puede revelar la red
// interna (direcciones y puertos). Con CASA_VERBOSE_ERRORS=off se muestra un mensaje genérico; el detalle queda en el registro de Node-RED.
const verbose = String(env.get('CASA_VERBOSE_ERRORS') || 'on').toLowerCase() !== 'off';
const text = verbose ? String((msg.error && msg.error.message) || 'Error').slice(0, 160) : 'Error de InfluxDB (el detalle está en el registro de Node-RED)';
const now = Date.now();
if (src.indexOf('casa_influx_batch') === 0) {   // lote principal, huellas de integridad
  S.pipe.errors += 1; S.pipe.lastError = text; S.pipe.lastErrorAt = now;
  return { payload: { type: 'pipeline', ts: now, writes: { batches: S.pipe.batches, points: S.pipe.points, lastBatchAt: S.pipe.lastBatchAt, errors: S.pipe.errors, lastError: text, lastErrorAt: now } } };
}
S.pipe.store = Object.assign({}, S.pipe.store, { ok: false, error: text, checkedAt: now });
return { payload: { type: 'pipeline', ts: now, store: S.pipe.store } };
