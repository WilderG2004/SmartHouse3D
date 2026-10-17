// @name Recibir telemetría firmada (POST /api/ingest)
// @kind plain
// @outputs 2
// @uses crypto,cors
// Entrada para un dispositivo EXTERNO (hoy solo el de prueba «sensor:PRUEBA-ingesta»; mañana, por ejemplo, un ESP32).
//   POST /api/ingest   cuerpo: {"dev","body","sig"}  o  {"msgs":[{…}, …]}  (hasta ingestMaxMsgs)
//   Está DESACTIVADA por defecto: se activa con CASA_INGEST=on y una CASA_DEVICE_KEY fija. Sin eso responde 404.
// Cada mensaje pasa por el MISMO validador que la telemetría interna (firma, ventana, secuencia, esquema, anomalías).
//   Salida 1 → validador   Salida 2 → respuesta HTTP de error
const L = SEC.limits;
const fail = (code, error) => { msg.statusCode = code; msg.payload = { error }; msg.headers = apiHeaders(msg.req); return [null, msg]; };
if (!RT.ingestEnabled) return fail(404, 'ingesta deshabilitada');
const body = msg.payload;
const raw = JSON.stringify(body) || '';
if (raw.length > L.ingestMaxBytes) return fail(413, 'mensaje demasiado grande');
const list = Array.isArray(body) ? body : body && typeof body === 'object' ? (Array.isArray(body.msgs) ? body.msgs : [body]) : null;
if (!list || !list.length || list.length > L.ingestMaxMsgs) return fail(400, 'formato inválido');
msg._ingest = true;
msg.payload = list;
return [msg, null];
