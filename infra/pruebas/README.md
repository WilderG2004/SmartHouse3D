# `infra/pruebas/` - pruebas y utilidades de prueba

**En una frase:** lo que sirve para comprobar que el sistema se comporta como dice la documentacion, sin tener que montarlo todo.

## Que archivo hay aqui?

| Archivo | Que es |
|---|---|
| `modos-alarma.mjs` | **Comprueba los tres modos de la alarma** (desarmada, en casa, fuera). Ejecuta los nodos reales `20-puertas.js`, `30-pir.js` y `60-seguridad.js` con el contexto de Node-RED simulado, asi que **no hace falta tener Node-RED encendido**. Son 16 comprobaciones: que la puerta de la calle solo suena con la casa armada, que una puerta interior despierta su detector sin hacer sonar nada, y que el movimiento de verdad si dispara estando "fuera". Se ejecuta con `npm run seguridad:modos`. |
| `influx-simulado.mjs` | Un InfluxDB de mentira, en memoria, para probar el flujo sin Docker ni cuenta en la nube. Se ejecuta con `npm run influx:simulado`. |
| `resultados/` | Los resultados de las pruebas de rechazo en tu equipo. No se sube a Git; la evidencia entregada esta en `docs/evidencia/`. |

## Y las pruebas de rechazo?

Las 65 pruebas de ataque (`npm run seguridad:probar`) **no** viven aqui: necesitan un Node-RED encendido y las claves de `infra/.env`. Ver `infra/README.md`, seccion "Seguridad: los comandos".
