// @name Serializar a JSON
// @kind plain
// El WebSocket envía texto. msg._session (si existe) hace que solo responda a ese cliente.
msg.payload = JSON.stringify(msg.payload);
return msg;
