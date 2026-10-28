# `infra/despliegue/` · publicar la casa en internet sin dejarla abierta

**En una frase:** estos archivos ponen un proxy con certificado delante de Node-RED, dejan InfluxDB y Grafana sin ningún
puerto abierto y generan las cabeceras de seguridad para el frontend que sirve Vercel.

> ⚠ **Estado de estos archivos:** son **plantillas escritas pero no probadas** con Docker, Caddy, nginx ni Vercel (el
> entorno donde se escribieron no tenía Docker ni acceso a esos registros). Las partes de Node-RED, firmas, sesiones e
> integridad **sí** se probaron con un Node-RED 5.0.8 real. Antes de apoyarte en esto, ejecuta las validaciones del paso 0.

## Qué hay en la carpeta

| Archivo | Para qué sirve |
|---|---|
| `docker-compose.prod.yml` | Los cuatro servicios en producción. **Solo el proxy publica puertos (80 y 443).** Red interna `backend` sin salida a internet, editor de Node-RED apagado, límites de memoria, `cap_drop: ALL`, imágenes con versión fija. |
| `Caddyfile` | Proxy inverso (Caddy 2): pide y renueva solo el certificado de Let's Encrypt (da `https://` y `wss://`), deja pasar **únicamente** `/ws/casa-iot` y `/api/*` (lo demás responde 404) y limita el tamaño del cuerpo de las peticiones. |
| `nginx.conf.template` | Alternativa a Caddy con **límite de frecuencia y de conexiones por IP** (`limit_req`, `limit_conn`), que Caddy no trae de serie. |
| `generar-vercel-json.mjs` | Genera `vercel.json` (CSP, HSTS, etc.) con el nombre de **tu** backend en `connect-src`. |

¿Sin servidor ni dominio? La opción gratuita es **Render** (sección [Render](#render-gratis-sin-servidor-propio-ni-túnel)): usa `render.yaml` (raíz) e `infra/nodered/Dockerfile.render`.

## Por qué hace falta TLS (el bloqueo por «contenido mixto»)

Tu frontend en Vercel se sirve por `https://`. Un navegador **no deja** que una página `https://` abra un WebSocket `ws://`
ni llame a una API `http://`: lo bloquea sin preguntar (contenido mixto). La solución no es desactivar nada en el navegador, es
que el backend hable `wss://` y `https://` con un certificado válido, que es justo lo que da el proxy.

## Paso a paso

**0. Validar las plantillas** (en cualquier equipo con Docker):

```bash
docker compose -f infra/despliegue/docker-compose.prod.yml config --quiet    # sintaxis del compose (sin --quiet IMPRIME los secretos sustituidos)
docker run --rm -v $PWD/infra/despliegue/Caddyfile:/etc/caddy/Caddyfile caddy:2.10-alpine caddy validate --config /etc/caddy/Caddyfile
docker pull nodered/node-red:5.0.8-24 && docker pull grafana/grafana:11.6.1   # confirma que los tags existen
```

Si algún tag no existe en tu registro, cámbialo por uno **concreto** (nunca `latest`) y anota cuál probaste.

**1. Secretos** (en el servidor, en la raíz del proyecto). Genera valores aleatorios y los guarda en `infra/.env`, que está en `.gitignore`:

```bash
npm run seguridad:secretos
```

Edita `infra/.env` y define también `DOMINIO`, `ACME_EMAIL` y `FRONTEND_ORIGIN` (el origen **exacto** de tu frontend, p. ej. `https://casa-iot.vercel.app`; las URL de vista previa de Vercel son otro origen y no estarán permitidas).

**2. Levantar InfluxDB y crear los dos tokens** (uno solo escribe, otro solo lee), desde dentro de la red interna:

```bash
docker compose -f infra/despliegue/docker-compose.prod.yml up -d influxdb
docker compose -f infra/despliegue/docker-compose.prod.yml --profile admin run --rm herramientas \
    node infra/crear-tokens-influx.mjs --influx-url http://influxdb:8086
```

**3. Levantar todo:**

```bash
docker compose -f infra/despliegue/docker-compose.prod.yml up -d --build
curl https://TU-DOMINIO/api/health          # debe responder {"status":"ok",…}
curl -i https://TU-DOMINIO/                 # debe responder 404 (no hay nada más expuesto)
```

**4. Frontend en Vercel.** Genera las cabeceras con tu dominio y súbelas con el proyecto:

```bash
npm run seguridad:vercel -- --backend casa-api.midominio.com
```

En Vercel define `VITE_NODERED_WS_URL=wss://casa-api.midominio.com/ws/casa-iot` y `VITE_API_URL=https://casa-api.midominio.com/api`.
**No pongas ninguna clave en variables `VITE_…`**: Vite las copia dentro del código que descarga el navegador y cualquiera las lee.
La clave de emparejamiento se escribe en la pantalla (botón de rol, arriba) y vive solo en `sessionStorage` de esa pestaña.

**5. Ver Grafana (panel de seguridad)** sin abrirlo a internet, por túnel SSH:

```bash
IP=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' casa-grafana)
ssh -L 3000:$IP:3000 usuario@tu-servidor        # luego abre http://localhost:3000
```

## nginx en vez de Caddy

Si necesitas el límite por IP: monta `nginx.conf.template` en `/etc/nginx/templates/default.conf.template` de la imagen
`nginx` (sustituye `${DOMINIO}`), obtén el certificado con Certbot (`certbot certonly --webroot -w /var/www/certbot -d TU-DOMINIO`) y
móntalo en `/etc/letsencrypt`. Valida con `nginx -t`. Cambia el servicio `proxy` del compose por el de nginx.

## Cloudflare Tunnel en vez de servidor propio (sin probar)

Node-RED sigue en tu equipo escuchando **solo en `127.0.0.1`** y `cloudflared` publica un subdominio con `https://` y `wss://` (el
certificado lo pone Cloudflare). No hace falta Caddy, nginx ni el compose de producción; tu equipo, Node-RED y `cloudflared` tienen que estar encendidos.

> ⚠ **No uses el túnel rápido** (`cloudflared tunnel --url http://localhost:1880`): publica **todo**, editor incluido. Usa un túnel con nombre y estas reglas.

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create casa-iot             # crea %USERPROFILE%\.cloudflared\<UUID>.json: es un SECRETO, fuera del repositorio
cloudflared tunnel route dns casa-iot casa-api.TU-DOMINIO.com
```

`%USERPROFILE%\.cloudflared\config.yml` (solo el WebSocket y las rutas GET que usa la página; lo demás, 404):

```yaml
tunnel: <UUID>
credentials-file: C:\Users\<usuario>\.cloudflared\<UUID>.json
ingress:
  - hostname: casa-api.TU-DOMINIO.com
    path: ^/ws/casa-iot$
    service: http://127.0.0.1:1880
  - hostname: casa-api.TU-DOMINIO.com
    path: ^/api/(health|history/(power|smoke|climate))$
    service: http://127.0.0.1:1880
  - service: http_status:404
```

Valida sin conexión con `cloudflared tunnel ingress validate` y `cloudflared tunnel ingress rule https://casa-api.TU-DOMINIO.com/flows`
(debe caer en `http_status:404`). En `infra/.env`: `CASA_ALLOWED_ORIGINS=https://TU-PROYECTO.vercel.app`, `CASA_WS_REQUIRE_ORIGIN=on`,
`CASA_TRUST_PROXY=on`, `CASA_INGEST=off` y **sin** `NODERED_BIND`. Mientras esté así, `npm run dev` en `localhost` no conecta (otro origen).
Arranca con `cloudflared tunnel run casa-iot` y sigue con el paso 4 (Vercel) usando ese subdominio.

**Sin verificar:** que `cloudflared` deje como último valor de `X-Forwarded-For` la IP real del cliente (de eso depende el límite por IP de
`seguridad-ws.js` con `CASA_TRUST_PROXY=on`). El límite de frecuencia por IP lo da una regla de *Rate limiting* del WAF de Cloudflare.

## Render (gratis, sin servidor propio ni túnel)

Node-RED corre en un **servicio web gratuito de Render** y escribe en tu **InfluxDB Cloud**. Render pone el certificado
(`https://` y `wss://`) y una dirección fija, `https://casa-iot-nodered.onrender.com` (si el nombre está libre). Tu equipo
puede estar apagado. No hace falta Caddy, nginx, Cloudflare ni ngrok.

| Archivo | Qué hace |
|---|---|
| `render.yaml` (raíz) | El *Blueprint*: un servicio web Docker, plan gratuito, región Virginia (junto a InfluxDB Cloud), revisión de salud en `/api/health` y las variables de entorno (las secretas **sin valor**). |
| `infra/nodered/Dockerfile.render` | Node-RED 5.0.8 + nodo de InfluxDB, con el flujo, `settings.js` y `seguridad-ws.js` **copiados dentro de la imagen** en solo lectura. |
| `infra/nodered/flows.render.json` | Tu flujo apuntando a InfluxDB Cloud (org «Dev Teams», buckets `Casa_IoT` y `Casa_IoT_integridad`). Se regenera con `npm run render:flujo`. |

**Por qué el flujo va dentro de la imagen:** el disco de un servicio gratuito se borra en cada reinicio y en cada despliegue.
Como el flujo es parte de la imagen, cada arranque empieza con exactamente lo que hay en el repositorio. Lo que **sí** se
pierde al reiniciar es el estado en memoria (luces encendidas, sesiones emparejadas): la simulación vuelve a su inicio. Lo ya
guardado en InfluxDB Cloud no se pierde.

**Cómo queda protegido:** editor de Node-RED **apagado** (no se define `NODERED_ADMIN_HASH`; `/`, `/flows` y `/admin` responden 404),
`CASA_WS_REQUIRE_ORIGIN=on` (solo tu frontend abre el WebSocket), `CASA_VERBOSE_ERRORS=off`, `CASA_INGEST=off` y ningún secreto
en el repositorio. Probado en local con los mismos archivos en solo lectura y el puerto 10000: 47 pruebas correctas y 0 con falla
(las 9 omitidas son las de `/api/ingest`, apagado a propósito).

### Paso a paso

**1. Tokens de InfluxDB Cloud** (en la web de InfluxDB Cloud: *Load Data → API Tokens → Generate API Token → Custom API Token*):
uno con **Write** en `Casa_IoT` y `Casa_IoT_integridad` (será `INFLUX_TOKEN_WRITE`) y otro con **Read** en `Casa_IoT`
(será `INFLUX_TOKEN_READ`). Cópialos directamente al paso 3; no los pegues en ningún chat ni archivo del repositorio.

**2. Sube el proyecto a GitHub** (Render construye desde tu repositorio). Antes, regenera el flujo si cambiaste algo:

```powershell
npm run render:flujo
git add render.yaml package.json infra/nodered
git commit -m "Despliegue de Node-RED en Render"
git push
```

**3. Crea el servicio:** en [dashboard.render.com](https://dashboard.render.com) → *New → Blueprint* → elige tu repositorio.
Render lee `render.yaml` y te pide los valores marcados con `sync: false`:

| Variable | Qué pones |
|---|---|
| `CASA_ALLOWED_ORIGINS` | La dirección exacta de tu frontend en Vercel, p. ej. `https://casa-iot.vercel.app` (sin barra final) |
| `INFLUX_TOKEN_WRITE` / `INFLUX_TOKEN_READ` | Los dos tokens del paso 1 |
| `CASA_USERS` | Tu línea de claves personales. Cópiala al portapapeles **sin verla** y pégala en Render: |

```powershell
((Select-String -Path infra\.env -Pattern '^CASA_USERS=').Line -replace '^CASA_USERS=', '' -replace "^'|'$", '') | Set-Clipboard
```

`CASA_PAIRING_KEY`, `CASA_ADMIN_KEY`, `CASA_DEVICE_KEY` y `NODERED_CREDENTIAL_SECRET` las **inventa Render** (`generateValue`); si
algún día necesitas la clave compartida, la ves en *Environment* del servicio. Cuando termine, comprueba:

```powershell
curl.exe https://casa-iot-nodered.onrender.com/api/health     # {"status":"ok",…}
curl.exe -i https://casa-iot-nodered.onrender.com/flows       # 404: el editor no está expuesto
```

**4. Frontend en Vercel.** En *Settings → Environment Variables* de tu proyecto en Vercel:

| Variable | Valor |
|---|---|
| `VITE_NODERED_WS_URL` | `wss://casa-iot-nodered.onrender.com/ws/casa-iot` |
| `VITE_API_URL` | `https://casa-iot-nodered.onrender.com/api` |

Y regenera las cabeceras para que la CSP deje hablar con Render (luego súbelo a GitHub y vuelve a desplegar en Vercel):

```powershell
npm run seguridad:vercel -- --backend casa-iot-nodered.onrender.com
```

Si Render te dio otro nombre (`…-abcd.onrender.com`), usa ese en los tres sitios.

**5. Cambiar el flujo más adelante:** edita `infra/nodered/src/`, ejecuta `npm run nodered:build`, `npm run render:flujo` y haz
`git push`: Render vuelve a construir la imagen sola.

**Límites del plan gratuito:** el servicio se **duerme** tras 15 minutos sin visitas y tarda cerca de un minuto en despertar (la
pantalla muestra «reconectando» mientras tanto). Dormido, la simulación no corre y el historial tiene huecos. 750 horas gratis
al mes por cuenta. **Sin verificar:** que el proxy de Render deje la IP real del cliente como último valor de `X-Forwarded-For`
(`CASA_TRUST_PROXY=on`); si no fuera así, el límite de conexiones por IP se aplicaría a todos juntos, nunca de menos.

## Lista de comprobación antes de publicar

- [ ] `infra/.env` existe, **no** está en Git y ningún valor es el de ejemplo.
- [ ] Rotaste los secretos que alguna vez estuvieron en el repositorio (el token de desarrollo de InfluxDB, la contraseña de InfluxDB y las credenciales por defecto de Grafana: `[REDACTADO]`): siguen en el **historial de Git** aunque ya no estén en los archivos.
- [ ] `docker ps` muestra puertos publicados **solo** en `casa-proxy` (80, 443).
- [ ] `https://TU-DOMINIO/` → 404 y `https://TU-DOMINIO/flows` → 404.
- [ ] `npm run seguridad:probar` contra el backend **propio** da todo en verde (ver `docs/seguridad-iot.md`).
- [ ] `vercel.json` generado con tu dominio (no `casa-api.example.com`).
- [ ] La pestaña recién abierta arranca en «Solo lectura».

## Límites (honestos)

- La cabecera `Origin` la pone el navegador; un script puede escribir la que quiera. Frena a **otras páginas web**, no a quien usa herramientas. Lo que realmente decide qué puede hacer una conexión es la clave de emparejamiento.
- Node-RED no limita el tamaño de un mensaje WebSocket (la librería `ws` acepta 100 MiB). Lo contiene el límite de memoria del contenedor y la tasa por IP del proxy (nginx).
- Caddy no limita frecuencia por IP sin un plugin; en Caddy el freno lo dan las conexiones por IP de `infra/nodered/seguridad-ws.js`.
- Cuando el proxy está delante hay que activar `CASA_TRUST_PROXY=on`; **sin proxy, no lo actives** (un cliente podría falsear su IP).
