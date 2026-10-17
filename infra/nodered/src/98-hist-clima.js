// @name Consulta Flux · temperatura
// @kind plain
// @uses range,cors
// @outputs 2
// GET /api/history/climate?room=<id>&from=<ms>&to=<ms>&bucket=<seg>   → habitación + exterior
const r = parseRange(msg.req.query);
msg._t0 = Date.now();
msg._route = '/history/climate';
const room = String(msg.req.query.room || '');
if (!/^[a-z0-9_]+$/.test(room)) { msg.statusCode = 400; msg.payload = { error: 'room inválido' }; msg.headers = apiHeaders(msg.req); return [null, msg]; }
const B = (global.get('cfg').INFLUX || {}).bucket || 'casa_iot';
msg.fmt = 'climate';
msg.room = room;
msg.query = `from(bucket: "${B}")
  |> range(start: ${r.start}, stop: ${r.stop})
  |> filter(fn: (r) => r._measurement == "env" and r._field == "temperature")
  |> filter(fn: (r) => r.room == "${room}" or r.room == "exterior")
  |> aggregateWindow(every: ${r.every}s, fn: mean, createEmpty: false)
  |> keep(columns: ["_time", "_value", "room"])
  |> group()
  |> pivot(rowKey: ["_time"], columnKey: ["room"], valueColumn: "_value")`;
return [msg, null];
