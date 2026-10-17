# `infra/nodered/tools/` - la maquina que arma el flujo

**En una frase:** un programa que junta las 36 piezas de `src/` con los ajustes de la casa y la politica de seguridad, y produce el flujo que se instala en Node-RED.

## `security-policy.mts`

Genera **una sola vez** la politica de seguridad que usan los nodos: roles (`lector`, `operador`, `administrador`), el rol minimo y las claves permitidas de cada tipo de mensaje, las acciones que piden confirmacion, los limites
(tamano, frecuencia, intentos de clave) y el esquema y rango de cada medicion. Los ids salen de `house.config.ts`. **No contiene secretos** (las claves viven en `infra/.env`).

## `build-flows.mts`

Hace un trabajo parecido a armar un mueble con instrucciones: toma **las piezas** (el programa de cada cajita en `infra/nodered/src/`) y **las medidas** (los ajustes de
`src/config/house.config.ts`) y las une. Gracias a eso, la pantalla y Node-RED usan **siempre los mismos nombres y limites**.

```bash
npm run nodered:build
```

### Que archivos produce

| Archivo | Para que sirve |
|---|---|
| `flows.json` | El flujo para **Docker**. |
| `flows_cred.json` | Solo **referencias** `${INFLUX_TOKEN_WRITE}` / `${INFLUX_TOKEN_READ}`; los tokens reales llegan por variables de entorno (nunca se escriben aqui). |
| `flows.local.json` | El flujo para **tu** Node-RED (se genera con las variables de abajo). |

### Ajustes opcionales (variables de entorno)

| Variable | Que cambia | Valor normal |
|---|---|---|
| `INFLUX_URL` | La direccion de InfluxDB que se escribe en el flujo | `http://influxdb:8086` |
| `INFLUX_ORG` | El nombre de la organizacion | `casa` |
| `INFLUX_BUCKET` | El nombre del cajon de datos | `casa_iot` |
| `INFLUX_INTEGRITY_BUCKET` | El cajon **aparte** de las huellas de integridad | `casa_iot_integridad` |
| `CASA_INTEGRITY_BLOCK_MS` | Cada cuanto se cierra un bloque de huellas (ms; minimo 30000) | `300000` (5 min) |
| `FLOWS_FILE` | El nombre del archivo que se crea | `flows.json` |
| `NO_CRED` | Si vale `1`, no crea `flows_cred.json` | (vacio) |

Ejemplo (asi se genero el flujo para tu InfluxDB Cloud):
```bash
INFLUX_URL=https://us-east-1-1.aws.cloud2.influxdata.com INFLUX_BUCKET=Casa_IoT FLOWS_FILE=flows.local.json NO_CRED=1 npx tsx infra/nodered/tools/build-flows.mts
```

## Para quien programa: agregar una cajita nueva

1. Crea un archivo `infra/nodered/src/NN-nombre.js` (con su cabecera `// @name ...`).
2. En `build-flows.mts`, dentro de la funcion `assembleCompleto()`, ponla con `fn('nombre', x, y)` y unela con `connect(...)`.
   Si es una orden nueva de la pantalla, agrega su nombre a la lista `ROUTES`.
3. `npm run nodered:build` y luego `node infra/redeploy-flow.mjs`.
4. Si la cajita envia un tipo de mensaje nuevo, anotalo en `src/types/iot.ts` y manejalo en `src/store/useHouseStore.ts`.
