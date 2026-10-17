// @name Alertas (umbrales)
// @kind tick
// Compara las lecturas con los umbrales de cfg.ALERTS y levanta o normaliza alertas (con histéresis para que no parpadeen).
// Cada cambio sale como mensaje `alert`: la interfaz lo muestra y se guarda en InfluxDB (measurement «alerts»).
const A = cfg.ALERTS;
const want = {};
if (S.smoke.alarm) want.humo = { level: 'critical', message: 'Humo ' + Math.round(S.smoke.ppm) + ' ppm en la cocina (umbral ' + cfg.SMOKE.alarmThresholdPpm + ')' };
if (S.security.alarm) want.intrusion = { level: 'critical', message: S.security.cause || 'Intrusión detectada' };
for (const r of cfg.ROOMS) {
  const st = S.rooms[r.id];
  const tid = 'temperatura:' + r.id;
  if (st.t > A.tempHighC || (S.alerts[tid] && st.t > A.tempHighClearC)) want[tid] = { level: 'warning', message: 'Temperatura alta en ' + r.label + ': ' + st.t.toFixed(1) + ' °C' };
  const hid = 'humedad:' + r.id;
  if (st.h > A.humidityHighPct || (S.alerts[hid] && st.h > A.humidityHighClearPct)) want[hid] = { level: 'warning', message: 'Humedad alta en ' + r.label + ': ' + Math.round(st.h) + ' %' };
}
const w = S.lastPower ? S.lastPower.watts : 0;
if (w > A.powerHighW || (S.alerts.consumo && w > A.powerHighClearW)) want.consumo = { level: 'warning', message: 'Consumo alto: ' + Math.round(w) + ' W' };

const quiet = (id) => id === 'humo' || id === 'intrusion';   // estas dos ya registran su propio evento
for (const id of Object.keys(want)) {
  if (S.alerts[id]) continue;
  S.alerts[id] = { level: want[id].level, message: want[id].message, since: now };
  out.push({ type: 'alert', ts: now, id, active: true, level: want[id].level, message: want[id].message });
  if (!quiet(id)) log('warning', 'Alerta', want[id].message);
}
for (const id of Object.keys(S.alerts)) {
  if (want[id]) continue;
  const lvl = S.alerts[id].level;
  delete S.alerts[id];
  out.push({ type: 'alert', ts: now, id, active: false, level: lvl, message: '' });
  if (!quiet(id)) log('info', 'Alerta', 'Normalizada: ' + id.replace(':', ' · '));
}
return done();
