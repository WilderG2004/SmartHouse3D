// @name Firmar telemetría (dispositivo simulado)
// @kind plain
// @uses crypto
// INTEGRIDAD DEL DATO. Cada punto que Node-RED va a guardar sale como un MENSAJE FIRMADO de su dispositivo simulado:
//   { dev, body, sig }
//     dev  identidad del dispositivo, p. ej. «sensor:DHT22-sala» o «ac:AC_Sala_Principal»
//     body texto JSON {"v":1,"dev","m" medición,"tags","f" campos,"ts" ms,"seq" contador del dispositivo}
//     sig  HMAC-SHA256(clave del dispositivo, body)  ← la clave se deriva de CASA_DEVICE_KEY: HMAC(maestra, «casa-iot/device/v1/»+dev)
// El nodo siguiente («Validar telemetría») verifica todo ANTES de escribir en InfluxDB.
// Límite honesto: aquí el dispositivo y el validador viven en el mismo Node-RED, así que esto NO protege contra
// alguien que ya controle Node-RED. Protege el camino entre la generación y la base de datos, deja el contrato listo
// para un dispositivo real (ESP32 firmando por su cuenta, ver POST /api/ingest) y permite detectar alteraciones del histórico.
const pts = Array.isArray(msg.payload) ? msg.payload : [];
const devOf = (pt) => {
  const t = pt.tags || {};
  switch (pt.measurement) {
    case 'power': return 'meter:' + t.meter;
    case 'smoke': case 'env': return 'sensor:' + t.sensor;
    case 'ac': case 'plug': case 'light': case 'door': case 'pir': return pt.measurement + ':' + t.id;
    case 'security': return 'core:security';
    case 'alerts': return 'core:alerts';
    case 'events': return 'core:events';
    default: return 'desconocido:' + pt.measurement;
  }
};
const envs = [];
for (const pt of pts) {
  const dev = devOf(pt);
  const seq = (RT.seqOut[dev] = (RT.seqOut[dev] || 0) + 1);
  const ts = pt.timestamp instanceof Date ? pt.timestamp.getTime() : Date.now();
  const body = JSON.stringify({ v: 1, dev, m: pt.measurement, tags: pt.tags || {}, f: pt.fields, ts, seq });
  envs.push({ dev, body, sig: hmacHex(deviceKey(dev), body) });
}
return { payload: envs };
