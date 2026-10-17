// @name Monitor · resultado
// @kind plain
// Publica a la interfaz lo que InfluxDB confirmó: puntos guardados, hora del último y lo que tardó la lectura.
const S = flow.get('state');
if (!S) return null;
const rows = Array.isArray(msg.payload) ? msg.payload : [];
const last = rows.length ? Date.parse(rows[0]._time) : NaN;
const now = Date.now();
S.pipe.store = { ok: true, points10m: msg._points || 0, lastPointAt: Number.isFinite(last) ? last : null, readMs: now - msg._t0, checkedAt: now };
node.status({ fill: 'green', shape: 'dot', text: S.pipe.store.points10m + ' puntos · ' + S.pipe.store.readMs + ' ms' });
return { payload: { type: 'pipeline', ts: now, store: S.pipe.store } };
