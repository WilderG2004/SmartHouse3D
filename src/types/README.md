# `src/types/` - el "idioma comun"

**En una frase:** aqui se define como se escriben los mensajes que se cruzan Node-RED y la pantalla, para que ambos se entiendan.

## `iot.ts`

Piensa en un formulario con campos fijos: si Node-RED manda "luz encendida", tiene que decirlo con los campos exactos que la pantalla espera.
Este archivo es ese formulario. Si algun dia Node-RED manda un mensaje nuevo, aqui se anota como es.

| Grupo | Que describe |
|---|---|
| **Estado de aparatos** | Como esta una luz, un aire acondicionado, un enchufe, una puerta, un detector de movimiento o la alarma. |
| **Mediciones** | La lectura de humo; la temperatura, humedad y luz de cada habitacion; el consumo (total y desglosado); la hora y la temperatura de afuera. |
| **Avisos** | Los eventos del registro y las alertas activas. |
| **Pipeline** | Lo que Node-RED cuenta sobre sus propios datos guardados (cuantos, cuando, errores). |
| **Foto completa (`HouseSnapshot`)** | El estado entero de la casa, que se envia cuando abres la pantalla. |
| **Mensajes que llegan (`TelemetryMessage`)** | Los 14 tipos de mensaje **de Node-RED hacia la pantalla**: la foto, luz, humo, movimiento, puerta, consumo, clima, aire, enchufe, seguridad, pipeline, alerta, evento y estado de la conexion. |
| **Ordenes que salen (`DeviceCommand`)** | Los 12 tipos de orden **de la pantalla hacia Node-RED**: manejar luces, aires, enchufes, puertas y la alarma; aplicar una escena; cambiar la hora; y simular humo, calor, humedad o movimiento. |
| **Sesion (`SessionMessage`, `SessionRole`)** | Los 3 mensajes de la sesion que manda Node-RED: `session` (el rol), `confirm` (codigo de un solo uso para una accion sensible) y `reject` (por que se rechazo una orden). |
| **Puntos de grafica** | Como se guarda cada punto de las graficas (hora y valor). |
