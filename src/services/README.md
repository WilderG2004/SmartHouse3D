# `src/services/` - las lineas de comunicacion

**En una frase:** el codigo que habla con el mundo de afuera (Node-RED). Hay dos "lineas":

| Carpeta | Para que |
|---|---|
| `telemetry/` | **La linea en vivo**: recibe los datos al instante y envia tus ordenes (con la sesion y el emparejamiento). Ver `telemetry/README.md`. |
| `history/` | **La linea de historial**: pide los datos viejos para las graficas de 15 minutos, 1 hora y 24 horas. Ver `history/README.md`. |
