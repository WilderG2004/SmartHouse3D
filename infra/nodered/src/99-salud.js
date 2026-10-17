// @name Estado del servicio
// @kind plain
// @uses cors
// GET /api/health  →  para comprobar rápido que Node-RED y la simulación están vivos.
msg.payload = { status: 'ok', simulation: !!flow.get('state'), time: Date.now() };
msg.statusCode = 200;
msg.headers = apiHeaders(msg.req);
return msg;
