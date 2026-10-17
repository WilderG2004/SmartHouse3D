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
  a.errors += 1; a.lastAt = t;
  tel = { payload: { type: 'pipeline', ts: t, api: Object.assign({}, a) } };
}
return [msg, tel];
