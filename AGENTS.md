# Instrucciones para agentes (OpenCode u otro)

Proyecto: **gemelo digital de una casa inteligente**. **Node-RED genera TODOS los datos** (sensores y equipos), calcula las alertas,
los guarda en **InfluxDB 2.x** y los lee de vuelta; **React solo muestra y envia ordenes**. Leelo antes de tocar nada: `README.md`.

## Tarea habitual: dejar mi Node-RED local configurado

Todo lo hace un script; **no configures nodos a mano ni edites el editor**.

0. Si no existe `infra/.env`: `npm run seguridad:secretos` (crea claves aleatorias; imprime UNA vez la contrasena del editor de Node-RED: no la repitas en el chat ni en commits) y arranca Node-RED con `npm run nodered:iniciar` (usa `infra/nodered/settings.js` endurecido y esos secretos).
1. Comprueba que Node-RED (`http://localhost:1880`) esta corriendo y que InfluxDB 2.x responde. Por defecto es InfluxDB
   Cloud (`https://us-east-1-1.aws.cloud2.influxdata.com`, bucket `Casa_IoT`); para uno local: `--influx-url http://localhost:8086 --bucket casa_iot`.
   La contrasena del editor la pone el usuario en su terminal con `$env:NODERED_PASS` (los scripts la leen de ahi); **no se la pidas ni la escribas en el comando**.
2. `node infra/setup-local.mjs --dry-run --nodered-user admin` -> muestra el plan sin cambiar nada (con el `settings.js` endurecido el editor pide usuario y contrasena; sin `NODERED_ADMIN_HASH` queda apagado).
3. `node infra/setup-local.mjs --nodered-user admin` -> lo aplica (crea DOS tokens de InfluxDB de un solo permiso y el bucket aparte de huellas). El token de administrador de InfluxDB debe estar en la variable de
   entorno `INFLUX_ADMIN_TOKEN` (o pasarse con `--influx-token`).
4. Si falla, el mensaje dice que corregir (puerto, token, adminAuth: `--nodered-user/--nodered-pass`, varias
   organizaciones: `--org`). Corrige la causa y repite: el script es seguro de ejecutar varias veces.
5. Informa que quedo hecho y que mostro la seccion "5/5 Verificacion".
   Para repetir solo la verificacion sin cambiar nada: `node infra/setup-local.mjs --verify-only`.

## Documentacion

Cada carpeta tiene su propio `README.md` que explica cada archivo (empieza por `docs/README.md`). Si cambias lo que hace un archivo, actualiza el README de su carpeta.

## Reglas

- **Seguridad IoT (leer `docs/seguridad-iot.md` antes de tocar el canal):**
  - **Nunca** imprimas, registres ni guardes en el repositorio claves, tokens ni hashes: `CASA_USERS`, `CASA_PAIRING_KEY`, `CASA_ADMIN_KEY`, `CASA_DEVICE_KEY`, `INFLUX_*`, `NODERED_*`. Viven en `infra/.env` (ignorado por Git). En documentos y ejemplos usa `[REDACTADO]`. No subas `infra/.env` ni lo copies al zip.
  - **Nada de claves en variables `VITE_...`**: quedan visibles en el codigo que descarga el navegador. **Unica excepcion, deliberada:** `VITE_DEMO_OPERADOR_KEY`, que publica a proposito una clave de demostracion de rol **operador** para que cualquiera pueda probar el proyecto (ver `src/config/demo.config.ts`). El rol de administrador **no** se expone. Su valor se define en el panel de Vercel y, en local, en el `.env` (ignorado por Git), **nunca en el repositorio**: el codigo solo lee el nombre de la variable. Lo limpio es una clave **personal** creada para eso (`--usuario demo-operador:operador`); si se publica `CASA_PAIRING_KEY`, la auditoria registra a todos como `compartida-operador` y rotarla echa tambien al equipo. No la conviertas en "normal" ni la muevas al codigo.
  - **Privacidad:** una pantalla sin emparejar no recibe alarma, movimiento, puertas, eventos, alertas, luces ni consumo (medidor, enchufes, aires), y el clima le llega sin luminosidad (`privacy` en `security-policy.mts`, filtro en `97-serializar.js`) y `/api/history/*` exige `Authorization: Bearer <clave>`. Un tipo de mensaje nuevo que delate si hay alguien en casa va en `privacy.hiddenTypes`.
  - **Identidad:** las claves personales viven en `CASA_USERS` (`alias:rol:clave`); la auditoria guarda el alias. No imprimas `CASA_USERS`.
  - **La validacion vive en Node-RED**, nunca solo en la interfaz: `infra/nodered/src/06-sesion-autorizar.js` (ordenes), `87-validar-telemetria.js` (telemetria). La interfaz solo copia la tabla de permisos (`src/config/security.config.ts`) para desactivar botones; si cambias un permiso, cambialo en `infra/nodered/tools/security-policy.mts` **y** en esa copia.
  - **Todo comando nuevo** necesita una entrada en `kinds` de `security-policy.mts` (rol minimo y claves permitidas) y su validacion de id y rango en `06-sesion-autorizar.js`; un tipo que no este en la tabla se rechaza. Si es sensible (desarmar, abrir el perimetro), pide confirmacion con codigo.
  - **No agregues otro canal de control** (MQTT directo, REST sin firma, etc.) que se salte el WebSocket autorizado: se elimino el adaptador MQTT por eso.
  - **Todo punto que llega a InfluxDB** pasa por `86-firmar-telemetria.js` y `87-validar-telemetria.js`; si agregas una medicion, agregala al `schema` de la politica con sus rangos.
  - **Imagenes de Docker con version fija**, nunca `latest`. Puertos solo en `127.0.0.1` (o el proxy de `infra/despliegue/`).
  - Despues de cambiar la seguridad, ejecuta `npm run seguridad:probar` (65 pruebas de rechazo contra un Node-RED propio; lee las claves de `infra/.env`; las B solo corren con `CASA_INGEST=on` y A15 solo con `--incluir-revocar`) y deja pasar todas.
  - Node-RED se enciende **siempre** con `npm run nodered:iniciar`, nunca con `node-red` a secas (ese usa `~/.node-red`, escucha en `0.0.0.0` y deja el editor sin contrasena).
- **Nunca** imprimas, registres ni guardes en archivos los tokens de InfluxDB. No los metas en commits.
  Si alguien te pega un token en el chat, no lo uses ni lo repitas: avisale que debe revocarlo y crear otro.
- El script **no borra** los demas flujos del usuario y guarda una copia en `nodered-backups/`; no la elimines.
- No edites `infra/nodered/flows*.json` a mano: se generan. Cambia `src/config/house.config.ts` o `infra/nodered/src/*.js`
  y ejecuta `npm run nodered:build` (y para el flujo local: `FLOWS_FILE=flows.local.json NO_CRED=1 INFLUX_URL=https://us-east-1-1.aws.cloud2.influxdata.com INFLUX_BUCKET=Casa_IoT npm run nodered:build`).
- Docker es opcional (`infra/docker-compose.yml`, necesita `infra/.env`); el camino normal del usuario es Node-RED e InfluxDB locales. Para publicar: `infra/despliegue/README.md`. **En producción:** Node-RED en Render (`render.yaml`, `infra/nodered/Dockerfile.render`, flujo `infra/nodered/flows.render.json`) + interfaz en Vercel + InfluxDB Cloud. Tras cambiar el flujo: `npm run nodered:build`, `npm run render:flujo` y `git push` (Render reconstruye solo). Los secretos de Render viven solo en su panel. El compose de producción, Caddy y nginx siguen sin probar.
- Para ver los datos en la interfaz: `npm run dev` (por defecto usa Node-RED; `VITE_TELEMETRY_MODE=simulated` es solo para desarrollo sin Node-RED).
- No muevas generacion de datos, alertas ni calculos a React: viven en Node-RED (`infra/nodered/src/*.js`). La interfaz solo muestra y envia ordenes.

## Comandos utiles

| Que | Comando |
|---|---|
| Frontend | `npm install && npm run dev` |
| Comprobar tipos / compilar | `npm run build` |
| Regenerar el flujo de Node-RED | `npm run nodered:build` |
| Crear (o rotar) secretos en `infra/.env` | `npm run seguridad:secretos` · `-- --rotar CASA_PAIRING_KEY` |
| Crear los tokens de InfluxDB (uno escribe, otro lee) | `npm run seguridad:tokens` |
| Retencion de InfluxDB (30 dias datos, 90 huellas) | `npm run seguridad:retencion` (token de administrador solo en la terminal) |
| Clave personal para una persona | `npm run seguridad:secretos -- --usuario alias:rol` |
| Borrar de `infra/.env` el token de administrador de InfluxDB | `npm run seguridad:secretos -- --olvidar-admin` |
| Encender Node-RED local con settings endurecidos | `npm run nodered:iniciar` |
| Pruebas de rechazo de seguridad (solo contra Node-RED propio) | `npm run seguridad:probar` |
| Comprobar los tres modos de la alarma (sin Node-RED encendido) | `npm run seguridad:modos` |
| Verificar la integridad del historial | `npm run seguridad:integridad` |
| Generar `vercel.json` con la CSP del backend | `npm run seguridad:vercel -- --backend casa-api.midominio.com` |
| Regenerar el flujo de Render (`infra/nodered/flows.render.json`) tras cambiar el flujo | `npm run render:flujo` |
| InfluxDB simulado en memoria (pruebas sin Docker) | `npm run influx:simulado` |
| Configurar Node-RED local (primera vez, pide token) | `node infra/setup-local.mjs` |
| Cambiar el flujo ya instalado (sin token) | `node infra/redeploy-flow.mjs` |
| Salud del flujo | `curl http://localhost:1880/api/health` |
| Quitar el triangulo rojo de InfluxDB en el editor | `node infra/fix-editor-warning.mjs` |
| Medir tiempos y mensajes por segundo (Node 22+) | `node infra/medir-pruebas.mjs` |
| Ver los cuadros por segundo del 3D | abrir la pagina con `?fps` al final de la direccion |
