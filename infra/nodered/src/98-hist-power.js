// @name Consulta Flux · potencia
// @kind plain
// @uses crypto,cors,auth,range
// @outputs 2
// GET /api/history/power?from=<ms>&to=<ms>&bucket=<seg>   (Authorization: Bearer <clave de usuario>)
if (denyApi(msg)) return [null, msg];   // sin clave válida: 401 (o 429 si hay demasiados intentos)
const r = parseRange(msg.req.query);
msg._t0 = Date.now();
msg._route = '/history/power';
const B = (global.get('cfg').INFLUX || {}).bucket || 'casa_iot';
msg.fmt = 'power';
msg.query = `from(bucket: "${B}")
  |> range(start: ${r.start}, stop: ${r.stop})
  |> filter(fn: (r) => r._measurement == "power")
  |> filter(fn: (r) => r._field == "watts" or r._field == "base" or r._field == "lights" or r._field == "ac" or r._field == "plugs")
  |> aggregateWindow(every: ${r.every}s, fn: mean, createEmpty: false)
  |> group()
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")`;
return [msg, null];
