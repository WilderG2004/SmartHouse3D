// @name Parsear comando del WebSocket
// @kind plain
// El frontend envía JSON como texto. Aquí solo se comprueba TAMAÑO y FORMA; el permiso y los valores
// los decide el nodo siguiente («Autorizar sesión y validar comando»). Todo mensaje que llega por
// el WebSocket es NO CONFIABLE hasta pasar por ese nodo.
//   - más de maxMsgBytes  → msg.parseError = 'too_large'
//   - no es JSON          → msg.parseError = 'no_json'
//   - no es objeto con kind → msg.parseError = 'schema'
// Límite honesto: el nodo «websocket» de Node-RED ya leyó el mensaje entero antes de llegar aquí; esta
// comprobación no evita que un cliente envíe un mensaje enorme (eso se limita en el proxy y con memoria del contenedor).
const sec = global.get('sec');
const MAX = (sec && sec.limits.maxMsgBytes) || 2048;
let p = msg.payload;
const bytes = Buffer.isBuffer(p) ? p.length : typeof p === 'string' ? Buffer.byteLength(p, 'utf8') : 0;
if (bytes > MAX) { msg.parseError = 'too_large'; msg.payload = {}; return msg; }
if (Buffer.isBuffer(p)) p = p.toString('utf8');
if (typeof p === 'string') {
  try { p = JSON.parse(p); } catch (e) { msg.parseError = 'no_json'; msg.payload = {}; return msg; }
}
if (!p || typeof p !== 'object' || Array.isArray(p) || typeof p.kind !== 'string') { msg.parseError = 'schema'; msg.payload = {}; return msg; }
msg.payload = p;           // msg._session se conserva: sirve para responder solo a ese cliente
return msg;
