# `src/services/telemetry/` - la linea en vivo

**En una frase:** decide **de donde salen los datos** que muestra la pantalla y se encarga de recibirlos y de enviar tus ordenes.

## La idea

Es como un enchufe universal. La pantalla solo conoce "el enchufe" (una lista fija de acciones: conectar, recibir, enviar). Detras puede haber dos
fuentes distintas, y se elige con un ajuste en el archivo `.env` (`VITE_TELEMETRY_MODE`). Asi la pantalla no cambia aunque cambie la fuente.

> **Regla de oro:** cuando tocas un boton, la pantalla **no cambia sola**: espera a que Node-RED confirme. Por eso lo que ves siempre es lo que de verdad paso.

## Los archivos

| Archivo | Que hace, en palabras simples |
|---|---|
| `TelemetryAdapter.ts` | **El "enchufe universal"**: define las acciones que toda fuente de datos debe saber hacer (conectar, desconectar, escuchar, enviar). |
| `index.ts` | **El que elige la fuente.** Mira el ajuste `VITE_TELEMETRY_MODE`: `simulated` -> modo practica (solo desarrollo, sin Node-RED); **cualquier otra cosa (o nada) -> Node-RED**. |
| `WebSocketAdapter.ts` | **La conexion normal, con Node-RED.** Abre una "llamada" permanente (`ws://localhost:1880/ws/casa-iot`; desplegado, `wss://`), pide una foto del estado al conectar y recibe los datos al instante. Si la llamada se corta, **vuelve a llamar sola** (esperando cada vez un poco mas, hasta 15 segundos). Maneja la **sesion**: toda conexion empieza **anonima** (vista publica: sin alarma, movimiento, puertas, eventos, alertas, luces ni consumo); con `pair(clave)` manda la clave de un usuario y, si Node-RED la acepta, la guarda **solo en `sessionStorage`** (esa pestana, ver `pairingKey.ts`) para reanudar al reconectar. Tambien entiende los mensajes `session`, `confirm` y `reject`, y avisa si el navegador bloquearia `ws://` desde una pagina `https://` (contenido mixto). |
| `pairingKey.ts` | **Donde vive la clave de esta pestana** (solo `sessionStorage`; se borra al cerrar la pestana). La usan el WebSocket, para volver a emparejar al reconectar, y el historial, para pedir los datos con `Authorization: Bearer`. Solo se guarda despues de que el servidor la acepta. |
| `SimulatedAdapter.ts` | **El modo practica**: la propia pagina inventa los datos (una "casa de mentira"). Sirve para programar la pantalla sin tener Node-RED. Cuando esta activo, la pantalla muestra un aviso amarillo. **No se usa normalmente.** |

> **Se elimino `MqttAdapter.ts`**: conectaba el navegador directo a un broker MQTT, un canal alterno sin autenticacion que se saltaba la validacion de Node-RED. Toda orden pasa ahora por el WebSocket y por `06-sesion-autorizar.js`. Ver `docs/seguridad-iot.md` (hallazgo H10).
