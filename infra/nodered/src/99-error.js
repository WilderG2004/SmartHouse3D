// @name Error → HTTP 502
// @kind plain
// @outputs 2
// @uses cors
// Si InfluxDB no responde, la API contesta con un error claro en lugar de quedarse colgada.
// El detalle técnico (dirección interna, puerto…) solo se devuelve si CASA_VERBOSE_ERRORS=on (desarrollo local):
// en un servidor público ese texto revelaría la red interna.
const reason = (msg.error && msg.error.message) || 'InfluxDB no disponible';
const verbose = String(env.get('CASA_VERBOSE_ERRORS') || 'on').toLowerCase() !== 'off';
msg.statusCode = 502;
msg.payload = verbose ? { error: 'No se pudo consultar InfluxDB', detail: String(reason).slice(0, 200) } : { error: 'No se pudo consultar InfluxDB' };
msg.headers = apiHeaders(msg.req);
const S = flow.get('state');
let tel = null;
if (S) {
  const a = S.pipe.api, t = Date.now();
  // El texto llega a la interfaz: con CASA_VERBOSE_ERRORS=off se queda en un mensaje genérico (igual que en «Monitor · error de InfluxDB»),
  // para no revelar la red interna en un servidor público. Sin lastErrorAt la tarjeta «API → interfaz» no podría ponerse en rojo.
  a.errors += 1; a.lastAt = t; a.lastErrorAt = t;
  a.lastError = verbose ? String(reason).slice(0, 160) : 'Error de InfluxDB (el detalle está en el registro de Node-RED)';
  tel = { payload: { type: 'pipeline', ts: t, api: Object.assign({}, a) } };
}
return [msg, tel];
