// @name Monitor · último dato guardado
// @kind plain
const cfg = global.get('cfg');
if (!cfg) return null;
const B = (cfg.INFLUX || {}).bucket || 'casa_iot';
const rows = Array.isArray(msg.payload) ? msg.payload : [];
msg._points = rows.length ? Number(rows[0]._value) || 0 : 0;
msg.query = `from(bucket: "${B}")
  |> range(start: -10m)
  |> filter(fn: (r) => r._measurement == "power" and r._field == "watts")
  |> group()
  |> max(column: "_time")`;
return msg;
