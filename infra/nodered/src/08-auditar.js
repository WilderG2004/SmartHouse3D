// @name Auditoría (InfluxDB + registro de eventos)
// @kind plain
// @outputs 2
// @uses crypto
// Recibe registros {result, reason, kind, id, role, user, sid, …} de «Autorizar sesión» y de «Validar telemetría».
//   Salida 1 → puntos de InfluxDB:  audit (tags result, reason, kind, role → id, user, session, confirmed, count)
//                                  user = alias del usuario que emparejó la sesión (CASA_USERS o «compartida-…»); vacío si era anónima
//                                  quarantine (tags dev, measurement, reason → summary): lecturas descartadas por anomalía
//   Salida 2 → órdenes internas «security.notice»: un aviso en el registro de eventos por motivo, como máximo cada noticeEveryMs
// Sin secretos: la sesión se guarda como un resumen de 8 caracteres y nunca se guardan claves, firmas ni mensajes completos.
// Una inundación no puede llenar InfluxDB: hay un tope de puntos por segundo; lo que sobra se cuenta y se resume en un solo punto.
const r = msg.payload || {};
const now = Date.now();
const L = SEC.limits;
const A = RT.audit;

// cubeta de fichas para InfluxDB
A.tokens = Math.min(L.auditBucket.cap, A.tokens + ((now - A.ts) / 1000) * L.auditBucket.refillPerSec);
A.ts = now;
const points = [];
if (A.tokens >= 1) {
  A.tokens -= 1;
  const tags = { result: String(r.result || '?'), reason: String(r.reason || '?'), kind: String(r.kind || '?'), role: String(r.role || '?') };
  const fields = { id: String(r.id || ''), session: String(r.sid || ''), count: typeof r.count === 'number' ? r.count : 1 };
  if (r.user) fields.user = String(r.user).slice(0, 32);
  if (r.confirmed) fields.confirmed = true;
  points.push({ measurement: 'audit', tags, fields, timestamp: new Date(now) });
  if (r.quarantine) {
    const q = r.quarantine;
    points.push({ measurement: 'quarantine', tags: { dev: String(q.dev || '?').slice(0, 60), measurement: String(q.m || '?').slice(0, 30), reason: tags.reason }, fields: { summary: String(q.summary || '').slice(0, 300) }, timestamp: new Date(now) });
  }
} else {
  A.dropped++;
}
if (A.dropped > 0 && now - A.lastDropAt > 1000 && A.tokens >= 1) {
  A.tokens -= 1;
  points.push({ measurement: 'audit', tags: { result: 'rejected', reason: 'flood', kind: 'audit.drop', role: '-' }, fields: { id: '', session: '', count: A.dropped }, timestamp: new Date(now) });
  A.dropped = 0; A.lastDropAt = now;
}

// aviso legible en el registro de eventos (solo rechazos; uno por motivo cada noticeEveryMs)
const WHY = {
  bad_key: 'clave de emparejamiento incorrecta', locked: 'emparejamiento bloqueado por intentos fallidos', frozen: 'emparejamiento congelado por un administrador',
  forbidden: 'orden sin permiso para el rol de la sesión', unknown_kind: 'tipo de orden desconocido', unknown_id: 'dispositivo inexistente', schema: 'mensaje con forma inválida',
  range: 'valor fuera de rango', too_large: 'mensaje demasiado grande', no_json: 'mensaje que no es JSON', rate_limit: 'demasiados mensajes por segundo',
  bad_confirm: 'código de confirmación inválido o repetido', expired: 'código de confirmación caducado',
  bad_signature: 'firma HMAC inválida', replay: 'mensaje repetido (número de secuencia ya usado)', stale: 'mensaje fuera de la ventana de tiempo', unknown_device: 'dispositivo no registrado',
  anomaly: 'lectura físicamente imposible (en cuarentena)', envelope: 'sobre de telemetría mal formado', disabled: 'ingesta deshabilitada',
};
const cmds = [];
if (r.result === 'rejected' && r.reason !== 'flood') {
  const a = RT.notice[r.reason] || (RT.notice[r.reason] = { last: 0, n: 0 });
  if (now - a.last >= L.noticeEveryMs) {
    const more = a.n > 0 ? ' (+' + a.n + ' más)' : '';
    const quien = r.dev ? ' · ' + r.dev : r.kind && r.kind !== '?' ? ' · ' + r.kind : '';
    cmds.push({ payload: { kind: 'security.notice', level: r.reason === 'bad_signature' || r.reason === 'replay' || r.reason === 'anomaly' ? 'critical' : 'warning', message: 'Rechazado: ' + (WHY[r.reason] || r.reason) + quien + more } });
    a.last = now; a.n = 0;
  } else {
    a.n++;
  }
}
return [points.length ? { payload: points } : null, cmds.length ? cmds : null];
