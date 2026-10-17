// @name Consulta Flux · humo
// @kind plain
// @uses range
// GET /api/history/smoke?from=<ms>&to=<ms>&bucket=<seg>
const r = parseRange(msg.req.query);
msg._t0 = Date.now();
msg._route = '/history/smoke';
const B = (global.get('cfg').INFLUX || {}).bucket || 'casa_iot';
msg.fmt = 'smoke';
msg.query = `from(bucket: "${B}")
  |> range(start: ${r.start}, stop: ${r.stop})
  |> filter(fn: (r) => r._measurement == "smoke" and r._field == "ppm")
  |> aggregateWindow(every: ${r.every}s, fn: max, createEmpty: false)`;
return msg;
