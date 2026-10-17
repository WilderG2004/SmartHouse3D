# `infra/nodered/` - el flujo de Node-RED (el "cerebro" de la casa)

**En una frase:** aqui esta todo lo que hace Node-RED: inventar los datos de la casa, calcular las alertas, guardar todo en InfluxDB y leerlo de vuelta. Hay una imagen del flujo en `docs/flujo-node-red.png`.

## Que es un "flujo"?

Es un dibujo de cajitas (llamadas **nodos**) unidas por cables. Cada cajita hace una tarea sencilla y pasa el resultado a la siguiente, como una linea de ensamblaje.

## Los archivos

| Archivo / carpeta | Que es | Lo editas? |
|---|---|---|
| `src/` | **El programa de cada cajita** (36 archivos). Ver `src/README.md`. | **Si**, aqui cambias como piensa la casa |
| `tools/build-flows.mts` | **La maquina que arma el flujo** juntando esas piezas con los ajustes de la casa y la politica de seguridad. Ver `tools/README.md`. | Solo para agregar cajitas nuevas |
| `tools/security-policy.mts` | **La politica de seguridad**: que rol puede enviar cada tipo de mensaje, que acciones piden confirmacion, los limites y el esquema de cada medicion. Nada secreto. | Si cambias permisos o rangos |
| `flows.local.json` | **El flujo listo para tu Node-RED** (apunta a tu InfluxDB Cloud, sin llave). Lo instalan `setup-local.mjs` y `redeploy-flow.mjs`. | No (se genera solo) |
| `flows.json` | **El mismo flujo, para Docker.** | No (se genera solo) |
| `flows_cred.json` | Solo **referencias** `${INFLUX_TOKEN_WRITE}` y `${INFLUX_TOKEN_READ}`: los tokens reales viven en `infra/.env`. | No (se genera solo) |
| `settings.js` | Ajustes **endurecidos** de Node-RED: editor con usuario y contrasena (apagado si no hay hash), `credentialSecret` desde el entorno, solo escucha en `127.0.0.1`, control del WebSocket. Ningun secreto va aqui. | Casi nunca |
| `seguridad-ws.js` | **El control del apreton de manos del WebSocket**: `Origin` permitido, conexiones simultaneas e intentos por minuto por IP. | Casi nunca |
| `package.json` | Marca esta carpeta como CommonJS (Node-RED carga `settings.js` con `require`). | No |
| `Dockerfile` | La "receta" para armar Node-RED con el nodo de InfluxDB ya instalado. | Casi nunca |

## Las 6 secciones del flujo

| Seccion | Que pasa ahi |
|---|---|
| **A - Inicio** | Se prepara todo al arrancar. Tiene un boton **Reiniciar simulacion** para volver al inicio. |
| **B - Ordenes** | Llegan las ordenes de la pantalla ("enciende la luz"). Una **puerta unica** comprueba el rol de la sesion y valida cada campo (y pide un codigo de confirmacion en las acciones sensibles); solo lo autorizado llega al "repartidor", que se lo pasa a la cajita correcta (luces, puertas, aire...). |
| **C - Simulacion** | **Cada segundo** la casa "vive": se calcula el humo, el clima, la luz, el consumo y las alertas. |
| **D - Salida** | Lo que se calculo se manda a la pantalla y se guarda en InfluxDB. |
| **E - Historial** | Responde cuando la pantalla pide datos viejos: va a InfluxDB y trae la respuesta. |
| **F - Vigilante** | Cada 5 segundos **lee de InfluxDB** cuanto se ha guardado, para comprobar que todo se esta anotando de verdad. |

## Direcciones

| Que | Donde |
|---|---|
| El editor de Node-RED (donde ves el flujo; **pide usuario y contrasena**) | `http://localhost:1880` |
| Los datos en vivo hacia la pantalla | `ws://localhost:1880/ws/casa-iot` |
| El historial | `http://localhost:1880/api/history/power`, `.../smoke`, `.../climate` |
| Comprobar que esta vivo | `http://localhost:1880/api/health` |
| Recibir telemetria firmada de un dispositivo externo (apagado por defecto: `CASA_INGEST=on`) | `POST http://localhost:1880/api/ingest` |

## Arrancar Node-RED con la seguridad puesta

Un `node-red` a secas **no** usa estos ajustes ni lee `infra/.env`. Para que valgan la contrasena del editor, el control del WebSocket y las claves de sesion:

```bash
npm run seguridad:secretos     # una vez: crea infra/.env con claves aleatorias (NO se sube a Git)
npm run nodered:iniciar        # arranca Node-RED con infra/nodered/settings.js y esos secretos
```

Si no definiste claves, **nadie podra emparejar la pantalla** (todas quedan en solo lectura) y, sin `NODERED_ADMIN_HASH`, el editor queda apagado: se falla del lado seguro.

## Para cambiar algo
```
1. Edita el archivo de src/ que quieras
2. npm run nodered:build              (arma el flujo de nuevo)
3. node infra/redeploy-flow.mjs --nodered-user admin   (lo instala en tu Node-RED; la contrasena por $env:NODERED_PASS)
4. Recarga el editor con F5
```
