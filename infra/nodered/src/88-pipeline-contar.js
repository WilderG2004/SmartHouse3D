// @name Monitor · contar puntos en InfluxDB
// @kind plain
// Cada 5 s Node-RED LEE de InfluxDB (no de su memoria) cuántas lecturas de consumo hay en los últimos 10 min
// y cuál es la más reciente. Así se demuestra que lo que envía se está guardando de verdad.
const cfg = global.get('cfg');
if (!cfg) return null;
const B = (cfg.INFLUX || {}).bucket || 'casa_iot';
msg._t0 = Date.now();
msg.query = `from(bucket: "${B}")
  |> range(start: -10m)
  |> filter(fn: (r) => r._measurement == "power" and r._field == "watts")
  |> aggregateWindow(every: 1m, fn: count, createEmpty: false)
  |> group()
  |> sum()`;
return msg;
