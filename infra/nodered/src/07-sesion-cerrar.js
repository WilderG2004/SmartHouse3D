// @name Olvidar sesión desconectada
// @kind plain
// @outputs 0
// @uses crypto
// El nodo «Frontend → Node-RED» avisa (nodo status) cuando un cliente se desconecta. Se borra su sesión y las
// confirmaciones que tenía pendientes: un cliente que vuelve a conectar empieza otra vez como LECTOR.
const st = msg.status || {};
const sid = (msg._session && msg._session.id) || (st._session && st._session.id);
if (RT && sid && st.event === 'disconnect') {
  delete RT.sessions[sid];
  for (const c of Object.keys(RT.pending)) if (RT.pending[c].sid === sid) delete RT.pending[c];
}
return null;
