// @name Filtrar por sesión y serializar
// @kind plain
// @uses crypto
// PRIVACIDAD antes del WebSocket. Lo que dice si la casa está vacía (modo de la alarma, movimiento, puertas, eventos, alertas,
// luces y consumo) solo llega a sesiones EMPAREJADAS con una clave (S.user, cualquier rol).
// Una conexión anónima recibe el snapshot REDUCIDO (sin SEC.privacy.hiddenState, con restricted: true), nunca los
// mensajes SEC.privacy.hiddenTypes y el clima sin SEC.privacy.hiddenClimateFields (la luminosidad delata las luces).
// Si la política no está lista, no sale nada (falla cerrado).
// msg._session (si existe) hace que el WebSocket responda solo a ese cliente; sin él, el mensaje va a todos.
const PV = SEC && SEC.privacy;
if (!PV || !RT) return null;
const P = msg.payload || {};
const hidden = PV.hiddenTypes.includes(P.type);
const full = (sid) => { const s = RT.sessions[sid]; return !!(s && s.user); };
const cleanRooms = (rooms) => {
  const out = {};
  for (const [id, r] of Object.entries(rooms || {})) {
    const c = Object.assign({}, r);
    for (const f of PV.hiddenClimateFields) delete c[f];
    out[id] = c;
  }
  return out;
};
// Versión para una pantalla anónima: null = no se le manda
const reduce = (p) => {
  if (p.type === 'snapshot') {
    const st = Object.assign({}, p.state);
    for (const k of PV.hiddenState) delete st[k];
    if (st.climate) st.climate = cleanRooms(st.climate);
    st.restricted = true;
    return { type: 'snapshot', state: st };
  }
  if (p.type === 'climate') return Object.assign({}, p, { rooms: cleanRooms(p.rooms) });
  return PV.hiddenTypes.includes(p.type) ? null : p;
};
// Solo cambian para una anónima: el snapshot, el clima y lo oculto
const differs = P.type === 'snapshot' || P.type === 'climate' || hidden;
const to = (sid, text) => ({ payload: text, _session: { type: 'websocket', id: sid } });

if (msg._session) {
  const p = full(msg._session.id) ? P : reduce(P);
  return p ? { payload: JSON.stringify(p), _session: msg._session } : null;
}
if (!differs) return { payload: JSON.stringify(P) };
const fullText = JSON.stringify(P);
const paired = Object.keys(RT.sessions).filter(full);
// Clima: la versión SIN luminosidad va a todos (también a una pantalla que aún no mandó nada y por eso no está en
// RT.sessions); justo después las emparejadas reciben la completa, que es la que les queda.
if (P.type === 'climate') return [[{ payload: JSON.stringify(reduce(P)) }, ...paired.map((sid) => to(sid, fullText))]];
// Lo oculto, solo a las emparejadas
if (hidden) return [paired.map((sid) => to(sid, fullText))];
// Snapshot del sistema (reinicio): cada sesión en su versión
const reducedText = JSON.stringify(reduce(P));
return [Object.keys(RT.sessions).map((sid) => to(sid, full(sid) ? fullText : reducedText))];
