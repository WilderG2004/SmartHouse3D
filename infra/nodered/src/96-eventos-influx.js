// @name Guardar cambios de estado y eventos
// @kind plain
// Los cambios (luz, puerta, PIR, seguridad) y el log de eventos se guardan en el momento en que ocurren.
//   light · id → on, intensity, color      door · id → open      pir · id → motion
//   security   → mode, alarm, cause        events · level, source → message, id
const S = flow.get('state');
const m = msg.payload;
if (!m || !S) return null;
const ts = new Date(m.ts || (m.event && m.event.ts) || Date.now());
let pt = null;

switch (m.type) {
  case 'event':
    pt = { measurement: 'events', tags: { level: m.event.level, source: m.event.source }, timestamp: ts,
      fields: { message: String(m.event.message), id: String(m.event.id) } };
    break;
  case 'light': {
    const l = S.lights[m.id];
    if (l) pt = { measurement: 'light', tags: { id: m.id }, timestamp: ts, fields: { on: l.on, intensity: l.intensity, color: l.color } };
    break;
  }
  case 'door':
    pt = { measurement: 'door', tags: { id: m.id }, timestamp: ts, fields: { open: m.open } };
    break;
  case 'pir':
    pt = { measurement: 'pir', tags: { id: m.id }, timestamp: ts, fields: { motion: m.motion } };
    break;
  case 'alert':
    pt = { measurement: 'alerts', tags: { id: m.id, level: m.level }, timestamp: ts, fields: { active: !!m.active, message: String(m.message || '') } };
    break;
  case 'security':
    pt = { measurement: 'security', tags: {}, timestamp: ts, fields: { mode: m.state.mode, alarm: m.state.alarm, cause: m.state.cause || '' } };
    break;
}
if (!pt) return null;
msg.payload = [pt];
return msg;
