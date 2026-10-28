# `infra/` - todo lo que no es la pantalla

**En una frase:** los instaladores que dejan listo tu Node-RED, el flujo de Node-RED (el "cerebro"), las herramientas de **seguridad** (secretos, tokens, pruebas, verificacion de integridad) y una opcion para instalar todo con Docker.

> La explicacion completa de la seguridad (hallazgos, medidas, evidencia y limites) esta en [`docs/seguridad-iot.md`](../docs/seguridad-iot.md).

| Archivo / carpeta | Que es, en palabras simples | Cuando lo usas |
|---|---|---|
| `setup-local.mjs` | **El instalador.** Prepara tu Node-RED y tu InfluxDB de principio a fin. | La primera vez. |
| `redeploy-flow.mjs` | **El actualizador.** Cambia el flujo de Node-RED por el de esta version, sin pedir llaves. | Cada vez que actualizas el proyecto. |
| `fix-editor-warning.mjs` | **El quitamanchas.** Quita el triangulo rojo de los nodos de InfluxDB. | Si ves el triangulo aunque los datos lleguen. |
| `medir-pruebas.mjs` | **El medidor.** Mide contra tu Node-RED los tiempos y mensajes por segundo que usa el documento en "Pruebas y Resultados". | Cuando quieras repetir o actualizar las mediciones. |
| `generar-secretos.mjs` | **El generador de claves.** Crea `infra/.env` con claves aleatorias (que **no se sube a Git**) y las rota sin cortar el servicio. `--usuario ana:operador` crea una **clave personal** (la auditoria guarda el alias); `--olvidar-admin` borra el token de administrador de InfluxDB del archivo cuando ya no hace falta. | Antes de todo lo demas; para rotar; para dar acceso a una persona. |
| `crear-tokens-influx.mjs` | **El creador de tokens de InfluxDB**: uno que **solo escribe** (Node-RED) y otro que **solo lee** (consultas, Grafana, verificador). Ajusta tambien la retencion de los buckets que ya existian. Acepta el token de administrador desde la terminal (`$env:INFLUX_ADMIN_TOKEN`). | Con InfluxDB ya arriba. |
| `aplicar-retencion.mjs` | **La retencion.** Pone a los buckets que ya existen cuanto tiempo guardan los datos: **30 dias** los datos y la auditoria, **90** las huellas (`--dias`, `--dias-huellas`). Toma la URL, la organizacion y los buckets del flujo instalado en tu Node-RED. `--dry-run` muestra el plan. | Una vez, con el token de administrador en la terminal (`npm run seguridad:retencion`). |
| `iniciar-nodered.mjs` | **El arranque seguro de tu Node-RED local**: usa `settings.js` endurecido y los secretos de `infra/.env`, **menos** los de instalacion (token de administrador y contrasena de InfluxDB, contrasena de Grafana): Node-RED nunca los recibe. Si los tokens de InfluxDB ya estan guardados (cifrados) dentro de Node-RED, lo dice y no pide tenerlos en `.env`. Si el puerto ya esta ocupado (otro Node-RED abierto) avisa con el comando para cerrarlo. Ejecuta `red.js` con node, sin shell, para que al cerrarlo no quede un Node-RED huerfano. | Cada vez que enciendes Node-RED en tu equipo (**nunca** `node-red` a secas: escucharia en `0.0.0.0` sin contrasena). |
| `pruebas-seguridad.mjs` | **Las pruebas de rechazo**: manda mensajes malos a TU Node-RED y comprueba que los rechaza (65 pruebas: ordenes, privacidad de la vista publica (tambien luces, consumo y luminosidad), claves personales, historial con clave, CORS, telemetria firmada; las B necesitan CASA_INGEST=on). Lee las claves de `infra/.env` sin mostrarlas. `--replay-guardar` / `--replay-probar` comprueban el anti-repeticion despues de reiniciar Node-RED. | Para demostrar y repetir la evidencia. |
| `verificar-integridad.mjs` | **El verificador de huellas**: recalcula y detecta si alguien borro o altero datos del historial. | Cuando quieras comprobar el historial. |
| `pruebas/influx-simulado.mjs` | **Un InfluxDB de mentira (en memoria)** para probar la logica de seguridad sin Docker (tambien el cambio de retencion). No evalua Flux. | Solo para pruebas. |
| `lib/envfile.mjs` | Lector y escritor de archivos `.env` que conserva comentarios. | No se toca. |
| `docker-compose.yml` | **La instalacion "todo en uno"** con Docker (InfluxDB + Node-RED + Grafana), con puertos solo en `127.0.0.1` y sin secretos escritos. | Si no quieres instalar nada a mano. |
| `despliegue/` | **Publicar en internet**: Render (gratis, el que esta en produccion: `render.yaml` en la raiz), proxy con TLS (Caddy o nginx), compose de produccion y generador de `vercel.json`. Ver `despliegue/README.md`. | Al publicar. |
| `.env.example` | Plantilla **sin valores** de las variables del backend. Se copia como `infra/.env` (o lo crea `generar-secretos.mjs`). | Referencia. |
| `nodered/` | **El flujo de Node-RED** y la maquina que lo arma. Ver `nodered/README.md`. | Para cambiar como piensa la casa. |
| `grafana/` | **Los tableros de Grafana**, ya preparados. Ver `grafana/README.md`. | Solo con Docker. |

Los tres instaladores `.mjs` necesitan **Node.js 18 o mas**, no necesitan instalar nada extra y **nunca muestran tus llaves en pantalla**. El medidor `medir-pruebas.mjs` necesita **Node.js 22 o mas** (trae WebSocket incluido) y no usa llaves.

## `setup-local.mjs` - el instalador (primera vez)

> **Con la seguridad puesta:** el editor de Node-RED pide usuario y contrasena. Primero `npm run seguridad:secretos` (te muestra **una vez** la contrasena del editor)
> y `npm run nodered:iniciar` para encender Node-RED; luego pasa `--nodered-user` y `--nodered-pass` a los instaladores (o `NODERED_USER` / `NODERED_PASS`).
> El script ahora crea **dos** tokens de un solo permiso y un cajon aparte para las huellas de integridad.

Con Node-RED e InfluxDB encendidos, este script hace, en orden:

1. **Revisa** que InfluxDB y Node-RED respondan (sin cambiar nada).
2. **Crea el "cajon"** (bucket) donde se guardaran los datos, si no existe, y una **llave propia** que solo sirve para ese cajon.
3. **Instala el nodo de InfluxDB** en Node-RED, si falta.
4. **Instala el flujo** con todo ya configurado. **No borra tus otros flujos**: antes guarda una copia en la carpeta `nodered-backups/`.
5. **Espera hasta 60 segundos** a que lleguen datos y, si no llegan, te explica que fallo.

```bash
node infra/setup-local.mjs --dry-run     # solo te muestra el plan
node infra/setup-local.mjs               # lo hace de verdad (te pide la llave de administrador)
```

| Opcion | Que significa |
|---|---|
| `--influx-token` | La llave de administrador de InfluxDB (si no la pones, te la pide por pantalla). Borrala de InfluxDB cuando termine. |
| `--influx-url` | La direccion de tu InfluxDB. Por defecto, la de InfluxDB Cloud (`https://us-east-1-1.aws.cloud2.influxdata.com`). Para uno local: `http://localhost:8086`. |
| `--org` | El nombre de tu organizacion en InfluxDB (si solo tienes una, la detecta sola). |
| `--bucket` | El nombre del cajon. Por defecto `Casa_IoT` (importan las mayusculas). |
| `--retention-days` | Cuantos dias se guardan los datos (por defecto 30; `0` = para siempre). Solo si hay que crear el cajon. |
| `--nodered` | La direccion de Node-RED (por defecto `http://localhost:1880`). |
| `--nodered-user` y `--nodered-pass` | Usuario y contrasena del **editor** de Node-RED (con el `settings.js` endurecido son obligatorios; el usuario por defecto es `admin`). |
| `--integrity-bucket` | El cajon de las huellas de integridad (por defecto `<bucket>_integridad`). |
| `--flows` | Para usar otro archivo de flujo. |
| `--no-create-token` | Usa la llave de administrador en Node-RED en vez de crear una propia (menos seguro). |
| `--dry-run` | Muestra el plan sin cambiar nada. |
| `--verify-only` | Solo repite la comprobacion final. |
| `--verify-timeout` | Cuantos segundos espera esa comprobacion (por defecto 60). |

## `redeploy-flow.mjs` - el actualizador

Reutiliza la conexion y la llave que Node-RED **ya tiene guardadas**, asi que **no pide ninguna llave**. Cambia **solo** la ficha "Casa IoT - Gemelo digital" (tus otros flujos
quedan intactos), guarda una copia de seguridad y comprueba que el historial responde leyendo InfluxDB. Si todavia no instalaste nada, te dice que uses `setup-local.mjs`.

Opciones: `--dry-run` (solo muestra), `--flows`, `--nodered`, `--nodered-user`, `--nodered-pass` (mejor por la variable `NODERED_PASS`, asi no queda en el historial)
e `--integrity-bucket` (el cajon de las huellas; por defecto el que ya tenga tu instalacion o `<bucket>_integridad`, que debe existir).

```powershell
$env:NODERED_PASS = [Net.NetworkCredential]::new('', (Read-Host 'Contrasena del editor' -AsSecureString)).Password; node infra/redeploy-flow.mjs --nodered-user admin; Remove-Item Env:NODERED_PASS
```

**Ojo:** se aplica al Node-RED que este escuchando en el puerto 1880. Si ese es un `node-red` a secas (no el de `npm run nodered:iniciar`), el flujo
acaba en otra instalacion (`~/.node-red`) y no en la segura (`infra/nodered-local/`).

## `fix-editor-warning.mjs` - el quitamanchas

El editor de Node-RED muestra un **triangulo rojo** en el servidor de InfluxDB cuando un campo llamado "database" esta vacio. Ese campo solo importa en InfluxDB version 1; en la 2 no se usa.
El script lo rellena para que desaparezca la advertencia. No usa llaves y guarda una copia antes. Despues, **recarga el editor con F5**. Opcion: `--nodered`.

## `medir-pruebas.mjs` - el medidor

Con Node-RED encendido, se conecta como lo haria la pantalla y mide:

- cuanto tarda en llegar el **estado completo** al conectar;
- cuanto tarda la **confirmacion de una orden** (enciende y apaga una luz; la deja como estaba);
- cuantos **mensajes por segundo** llegan de cada tipo (clima, humo, consumo, enchufes y pipeline);
- cuanto tarda la **API** (`/api/health` y `/api/history/power`).

```bash
node infra/medir-pruebas.mjs                                   # usa http://localhost:1880, 40 ordenes y 20 segundos
node infra/medir-pruebas.mjs --nodered http://localhost:1880 --ordenes 40 --segundos 20
```

Imprime un resumen en JSON (minimo, mediana, percentil 95 y maximo, en milisegundos). Solo **lee** y manda ordenes de luces. Ojo: si se ejecuta en el mismo computador que Node-RED, los tiempos no incluyen la red real; y la consulta del historial solo es representativa con InfluxDB real.
Los **cuadros por segundo** del visor 3D no los mide este script: se miden en el navegador abriendo la pagina con `?fps` (ver el `README.md` principal).

## Seguridad: los comandos

```bash
npm run seguridad:secretos      # crea infra/.env con claves aleatorias (NO pegues su salida en ningun chat: trae la contrasena del editor)
npm run seguridad:secretos -- --rotar CASA_PAIRING_KEY,CASA_ADMIN_KEY,NODERED_ADMIN   # rota; la clave vieja sigue valiendo como *_PREVIOUS
npm run seguridad:secretos -- --limpiar-previas                                      # borra las *_PREVIOUS cuando ya nadie las usa
#   (rotar CASA_DEVICE_KEY deja sin verificar las huellas de integridad anteriores)
npm run seguridad:tokens        # crea los dos tokens de InfluxDB (solo escribe / solo lee)
npm run nodered:iniciar         # arranca tu Node-RED local con settings endurecidos y esos secretos
npm run seguridad:probar        # 65 pruebas de rechazo contra TU Node-RED (-- --incluir-revocar para admin.revoke)
npm run seguridad:integridad    # recalcula las huellas del historial y avisa si algo cambio
npm run seguridad:vercel -- --backend casa-api.midominio.com   # genera vercel.json con la CSP de tu backend
npm run influx:simulado         # InfluxDB de mentira para probar sin Docker (no evalua Flux)
npm run seguridad:retencion     # 30 dias para los datos y 90 para las huellas (pide el token de administrador)
```

Todos **evitan imprimir claves** (salvo `seguridad:secretos`, que muestra **una vez** la contrasena del editor). `seguridad:probar` simula ataques:
usalo **solo** contra tu propio servidor. Toma las claves de la terminal o, si no estan, de `infra/.env` (sin mostrarlas).
Las pruebas B (telemetria firmada) solo corren con `CASA_INGEST=on`; vuelve a `off` al terminar y reinicia Node-RED.

### Claves personales (una por persona)

Cada persona que vaya a usar la pantalla deberia tener **su propia clave**: la auditoria anota su alias y se le puede quitar el acceso sin
cambiar la de los demas. Todo se hace en **tu propia ventana de PowerShell**, en la carpeta del proyecto, y ninguna clave aparece en pantalla:

```powershell
npm run seguridad:secretos -- --usuario ana:operador       # crea la clave de «ana» (lector | operador | administrador) en CASA_USERS de infra/.env
npm run seguridad:secretos -- --usuario ana:operador --rotar ana   # le da una clave nueva (la anterior deja de valer)

# copiar al portapapeles SOLO la clave de «ana», para pasarsela por un canal privado
$fila = (Select-String -Path infra\.env -Pattern '^CASA_USERS=').Line -replace '^CASA_USERS=', '' -replace "^'|'$", ''
(($fila -split ',') | Where-Object { $_ -like 'ana:*' }) -replace '^[^:]+:[^:]+:', '' | Set-Clipboard
Remove-Variable fila

# copiar la linea COMPLETA de CASA_USERS (todas las personas), para pegarla en Render ▸ Environment
((Select-String -Path infra\.env -Pattern '^CASA_USERS=').Line -replace '^CASA_USERS=', '' -replace "^'|'$", '') | Set-Clipboard

Set-Clipboard -Value ' '                                   # al terminar, limpia el portapapeles
```

El alias admite letras, numeros, `.`, `_` y `-` (hasta 32) y no puede empezar por `compartida-` (reservado para las claves compartidas). Node-RED
lee `CASA_USERS` **al arrancar**: reinicialo (en tu equipo, `npm run nodered:iniciar`; en Render, guardar la variable vuelve a desplegar).
No pegues `CASA_USERS` ni una clave en un chat ni en un documento; si pasa, rotala.

**Comprobar que tu Node-RED es el seguro** (PowerShell): `Get-NetTCPConnection -LocalPort 1880 -State Listen` debe mostrar `127.0.0.1`,
`curl.exe -s http://127.0.0.1:1880/auth/login` debe traer `"type":"credentials"` y `http://127.0.0.1:1880/flows` sin iniciar sesion debe dar **401**.

## `docker-compose.yml` - todo en uno (opcional)

Docker es una forma de ejecutar programas ya instalados y configurados, sin instalar nada a mano. Este archivo enciende tres:

| Servicio | Para que | Direccion | Acceso |
|---|---|---|---|
| **InfluxDB** | La base de datos (guarda 30 dias) | `127.0.0.1:8086` | usuario y contrasena de `infra/.env` |
| **Node-RED** | El cerebro (con el flujo ya cargado, en hora de Bogota) | `127.0.0.1:1880` | el editor pide usuario y contrasena (`NODERED_ADMIN_*`) |
| **Grafana** | Tableros de graficas (opcional) | `127.0.0.1:3000` | `admin` y la contrasena de `infra/.env`; sin acceso anonimo |

```bash
npm run seguridad:secretos
docker compose -f infra/docker-compose.yml up -d influxdb
npm run seguridad:tokens
docker compose -f infra/docker-compose.yml up -d --build
```
Ningun secreto esta escrito en el archivo: si falta uno, Docker se detiene con un mensaje. Los puertos solo se abren en tu equipo; para internet usa `despliegue/`.
**No se probo con Docker** en el entorno donde se escribio: revisalo con `docker compose -f infra/docker-compose.yml config --quiet`
(sin `--quiet`, Docker **imprime todos los secretos** de `infra/.env` ya sustituidos).
