# Casa IoT - Gemelo digital

## Que es esto?

Es una **casa inteligente que vive en tu pantalla**. Ves la casa en 3D y puedes encender luces, prender el aire acondicionado, abrir puertas y
activar la alarma. Tambien ves, en vivo, la temperatura, la humedad, la luz, el humo, el movimiento y el consumo de energia.

Los sensores **no son reales**: son simulados, pero se comportan con sentido. Si cocinas, la cocina se calienta. Si prendes las luces, sube la luz medida.
Si prendes tres aires acondicionados, sube el consumo y salta una alerta.

> **"Gemelo digital"** = una copia virtual de algo real (aqui, de una casa) que se comporta como la original.

## Como funciona (la idea en un minuto)

Hay tres piezas. Piensa en una casa con un cerebro y un cuaderno:

| Pieza | Que es | Es como... |
|---|---|---|
| **La interfaz** | La pagina web con la casa en 3D | La pantalla y el control remoto |
| **Node-RED** | Un programa que **inventa y calcula todos los datos** | El cerebro de la casa |
| **InfluxDB** | Una base de datos para guardar cosas con su hora exacta | El cuaderno donde se anota todo |

```
   Tu (botones) --> INTERFAZ --ordenes--> NODE-RED  --anota-->  INFLUXDB
                       ^                     |  ^                  |
                       +--datos en vivo------+  +--lee de vuelta---+
                          (cada segundo)           (para las graficas e informes)
```

1. Cada segundo, **Node-RED inventa los datos** (temperatura, humo, consumo...).
2. Los manda a la pantalla y **los anota en InfluxDB**.
3. Si pides la grafica de "la ultima hora", la pantalla le pide a Node-RED y el **lee del cuaderno** (InfluxDB).
4. Cuando tocas un boton, la pantalla le manda la **orden** a Node-RED; el la ejecuta y avisa el resultado.

**Lo importante:** la pantalla **no inventa nada**. Solo muestra lo que Node-RED le cuenta y manda tus ordenes.

**Y es segura por defecto:** toda pantalla nueva arranca en **solo lectura**. Para dar ordenes (encender una luz, desarmar la alarma) hay que **emparejarla con una clave**; Node-RED valida
cada orden (rol, forma, rangos), pide un **codigo de confirmacion** en las acciones sensibles y **anota cada rechazo**. Los datos que se guardan en InfluxDB van firmados. Todo esta explicado en
[`docs/seguridad-iot.md`](docs/seguridad-iot.md).

## Publicado en internet

La casa funciona en internet sin depender de que tu computador este encendido:

```
 Navegador --https--> Vercel (la interfaz: archivos estaticos + cabeceras CSP)
     |
     +--wss:// y https://--> Render (Node-RED en Docker, editor apagado) --> InfluxDB Cloud (historial, auditoria, huellas)
```

| Pieza | Donde corre | Que necesita saber |
|---|---|---|
| **Interfaz** | Vercel | Solo las direcciones del backend (`VITE_NODERED_WS_URL`, `VITE_API_URL`). **Ninguna clave.** |
| **Node-RED** | Render, plan gratuito (`render.yaml` + `infra/nodered/Dockerfile.render`) | El flujo va **dentro de la imagen**, en solo lectura. Las claves y los tokens se escriben solo en el panel de Render. |
| **Base de datos** | InfluxDB Cloud | Dos tokens de un solo permiso: uno escribe, otro lee. |

**Comprobado desde fuera (2026-10-28):** `/api/health` responde; el editor y su API (`/`, `/flows`, `/settings`, `/admin`) dan **404**; el
historial sin clave da **401**; la API no responde CORS a otros origenes; el WebSocket rechaza (403) un origen que no es el de la interfaz.

**Limites del plan gratuito:** Render duerme el servicio tras 15 minutos sin visitas (tarda cerca de un minuto en despertar) y al reiniciar la
simulacion vuelve a su estado inicial. Lo guardado en InfluxDB no se pierde. Paso a paso, cambios del flujo y limites: [`infra/despliegue/README.md`](infra/despliegue/README.md).

## Como ponerlo a funcionar

### Lo que necesitas antes
- **Node.js** instalado (version 20.19 o mas; el proyecto se prueba con la 24).
- **Node-RED** instalado (`npm install -g node-red`). Se enciende **siempre** con `npm run nodered:iniciar` (paso 0), **nunca** con `node-red` a secas:
  ese usa otra configuracion, escucha en toda la red (`0.0.0.0`) y deja el editor **sin contrasena**.
- Una cuenta de **InfluxDB** (puede ser la gratuita en la nube).

### Paso 0 - Crear los secretos y encender Node-RED con la seguridad puesta (solo la primera vez)
```bash
npm install
npm run seguridad:secretos     # crea infra/.env con claves aleatorias (NO se sube a Git) y te muestra UNA vez la contrasena del editor de Node-RED
npm run nodered:iniciar        # enciende Node-RED con la configuracion segura y esos secretos
```
Anota la contrasena del editor que te muestra el primer comando (no se puede recuperar). Las claves para **emparejar la pantalla** quedan en `infra/.env`
(`CASA_PAIRING_KEY` = Operador, `CASA_ADMIN_KEY` = Administrador). Un `node-red` a secas **no** usa esta configuracion.

### Paso 1 - Preparar Node-RED (solo la primera vez)
Un script hace todo: crea el "cajon" donde se guardan los datos, **dos llaves propias de un solo permiso** (una escribe, otra lee), un cajon aparte para las huellas de integridad y deja el flujo instalado.

```powershell
# la contrasena del editor se escribe oculta y no queda en el historial de la terminal
$env:NODERED_PASS = [Net.NetworkCredential]::new('', (Read-Host 'Contrasena del editor' -AsSecureString)).Password
node infra/setup-local.mjs --dry-run --nodered-user admin    # solo te muestra lo que va a hacer
node infra/setup-local.mjs --nodered-user admin              # lo hace de verdad
Remove-Item Env:NODERED_PASS
```
(Tambien acepta `--nodered-pass <contrasena>`, pero asi la contrasena queda guardada en el historial de la terminal.)
Te pedira una **llave de administrador** de InfluxDB (la creas en la pagina de InfluxDB, en la seccion *API Tokens*). Es temporal: **borrala al terminar**,
porque el script ya crea llaves propias, mas limitadas y seguras, para Node-RED.

### Paso 2 - Si ya lo instalaste y solo quieres actualizar
No pide llave. Cambia el flujo por el de esta version y guarda una copia de seguridad de lo que tenias.
```powershell
$env:NODERED_PASS = [Net.NetworkCredential]::new('', (Read-Host 'Contrasena del editor' -AsSecureString)).Password
node infra/redeploy-flow.mjs --dry-run --nodered-user admin
node infra/redeploy-flow.mjs --nodered-user admin
Remove-Item Env:NODERED_PASS
```

### Paso 3 - Encender la pantalla
```bash
npm run dev        # enciende la pantalla
```
Abre **http://localhost:5173** en el navegador. Arranca en **Solo lectura** con la **vista publica**: ves la casa, la temperatura, la humedad y el humo,
pero no la alarma, el movimiento, las puertas, las luces ni el consumo (dirian si hay alguien en casa), y los controles estan desactivados.
Para ver todo y controlar, pulsa el boton **Solo lectura** de la cabecera y pega **tu clave personal** o una compartida:

- **Clave personal** (lo recomendado): quien administra la crea con `npm run seguridad:secretos -- --usuario alias:rol` (rol `lector`, `operador` o
  `administrador`), queda en `CASA_USERS` de `infra/.env` y la auditoria anota ese alias. Node-RED la acepta despues de reiniciarlo.
- **Claves compartidas** (respaldo): `CASA_PAIRING_KEY` (Operador) o `CASA_ADMIN_KEY` (Administrador).

La clave solo se recuerda en esa pestana. Para copiarla sin que se vea en pantalla, mira `infra/README.md` (seccion de claves personales).

| Rol | Que puede hacer |
|---|---|
| **Solo lectura** (sin clave) | La vista publica. Las ordenes se rechazan. |
| **Lector** (clave personal) | Ver todo. Las ordenes se rechazan. |
| **Operador** | Luces, aires, enchufes, puertas, escenas y alarma. **Desarmar**, **abrir una puerta del perimetro** (entrada o garaje) y **una escena que desarma** (*Llegue a casa*) piden confirmar con un codigo. |
| **Administrador** | Todo lo anterior, mas simulaciones, hora simulada y *revocar las otras sesiones*. |

### Opcional - Todo con Docker
Si prefieres no instalar nada a mano, mira [`infra/README.md`](infra/README.md): levanta InfluxDB, Node-RED y Grafana con los puertos abiertos solo en tu equipo. Para publicar en internet (frontend en Vercel, backend con certificado; la opción gratuita es Render), sigue [`infra/despliegue/README.md`](infra/despliegue/README.md).

### Direcciones utiles

| Direccion | Que es |
|---|---|
| `http://localhost:5173` | La casa en 3D (la interfaz) |
| `http://localhost:1880` | El editor de Node-RED (donde se ve el flujo; pide usuario y contrasena) |
| `http://localhost:1880/api/health` | Comprobar que Node-RED esta vivo |
| `https://casa-iot-nodered.onrender.com/api/health` | Comprobar que el Node-RED publicado esta vivo (la primera vez del dia puede tardar un minuto: se estaba despertando) |

## Si algo no funciona

| Que ves | Que significa y como arreglarlo |
|---|---|
| Un aviso amarillo que dice **"Simulacion local"** | La pantalla esta en modo practica (inventa ella los datos). Abre el archivo `.env` y pon `VITE_TELEMETRY_MODE=websocket`; reinicia con `npm run dev`. |
| La cabecera dice **"Solo lectura"** y los controles estan grises | Es lo normal: la pantalla aun no esta emparejada. Pulsa **Solo lectura** y escribe la clave de `infra/.env`. |
| Al emparejar dice **"La clave no es correcta"**, **"Demasiados intentos"** o **"congelo el emparejamiento"** | Revisa la clave (tu clave personal de `CASA_USERS`, o `CASA_PAIRING_KEY` / `CASA_ADMIN_KEY`). Una clave personal nueva solo vale despues de reiniciar Node-RED (en Render, despues de guardar la variable en *Environment*). Tras 5 fallos se bloquea un minuto; si un Administrador uso *Revocar*, el emparejamiento espera 5 minutos. |
| Sale **"Sin cifrar"** en la cabecera | Es normal en tu equipo: `npm run dev` usa `ws://localhost`, que no sale del PC. Publicado, la pagina usa `wss://` y sale **"Canal cifrado"** (ver `infra/despliegue/README.md`). |
| La cabecera dice **"Reconectando"** o no hay datos | Node-RED esta apagado o no tiene el flujo. Enciendelo con `npm run nodered:iniciar` y ejecuta `node infra/redeploy-flow.mjs --nodered-user admin`. |
| En la pagina publicada sale **"Reconectando"** al abrirla | El servicio de Render estaba dormido (plan gratuito). Espera cerca de un minuto: se conecta solo. |
| Al encender Node-RED sale **`Error: port in use`** | Ya hay otro Node-RED en el puerto 1880 (otra terminal abierta). Cierralo con **Ctrl+C** en esa terminal. Para ver cual es: `Get-NetTCPConnection -LocalPort 1880 -State Listen`. |
| El editor **no pide contrasena** | Estas usando un `node-red` a secas, sin la configuracion segura. Cierralo y enciende con `npm run nodered:iniciar` (ver "Comprobar que tu Node-RED es el seguro"). |
| Pulsas una puerta de la calle o *Llegue a casa* y **no aparece "Confirmar accion"** | El Node-RED tiene un flujo viejo. Ejecuta `npm run nodered:build` y `node infra/redeploy-flow.mjs --nodered-user admin`; mira la terminal de Node-RED por si hay un `ReferenceError`. |
| Un aviso de **rechazo** al pulsar un boton | Node-RED rechazo la orden y dice el motivo (rol insuficiente, valor fuera de rango, codigo caducado...). Queda anotado en la medicion `audit`. |
| **Triangulo rojo** en los nodos de InfluxDB dentro de Node-RED | Es un aviso visual. Ejecuta `node infra/fix-editor-warning.mjs` y recarga el editor con F5. |
| En el panel **Pipeline IoT**, la tarjeta "Guarda en InfluxDB" sale en rojo | InfluxDB no esta aceptando los datos (llave vencida, direccion equivocada...). La tarjeta muestra el mensaje de error. |
| Las graficas de 15 min / 1 h / 24 h salen vacias | Espera unos minutos: solo hay historial desde que empezaron a guardarse datos. |

## Que simula Node-RED (y por que tiene sentido)

- **Temperatura:** sigue a la del exterior (mas fresca de noche, mas calida de tarde); la casa es unos 3 C mas fresca que afuera. Las luces y los aparatos la calientan; el aire acondicionado la enfria; **cocinar** calienta rapido la cocina.
- **Humedad:** baja cuando hace calor o cuando el aire acondicionado trabaja; **una ducha** la sube en el bano.
- **Luminosidad (luz):** luz del sol que entra por las ventanas (segun la hora) **mas** la de los bombillos encendidos.
- **Humo:** casi nada normalmente; cocinar suelta un poquito; una fuga simulada lo sube mucho.
- **Consumo de energia:** lo que gasta la casa "de fondo" (nevera, router...) + luces + aire acondicionado + enchufes. Los kWh se van sumando.
- **Eventos al azar:** a veces alguien "cocina" o "se ducha". Nada se enciende solo: las luces, el aire y los enchufes solo cambian si tu lo pides.

## Alertas (las calcula Node-RED)

| Alerta | Se activa cuando... | Se apaga cuando... |
|---|---|---|
| Humo | pasa de 400 ppm | baja de 300 ppm |
| Temperatura alta (en una habitacion) | pasa de 32 C | baja de 31 C |
| Humedad alta (en una habitacion) | pasa de 85 % | baja de 80 % |
| Consumo alto | pasa de 1500 W | baja de 1350 W |
| Intrusion | con la casa armada se abre una puerta exterior o se detecta movimiento | desarmas la casa |

La diferencia entre "se activa" y "se apaga" evita que la alerta parpadee cuando el valor anda justo en el limite.
Las alertas aparecen en el panel **Alertas**, se guardan en InfluxDB y las graves hacen sonar una sirena y una voz (boton **Sonido**).

## Que se guarda en InfluxDB

InfluxDB guarda los datos en "cajones" llamados *measurements*:

| Cajon | Que guarda |
|---|---|
| `env` | Temperatura, humedad y luz de cada habitacion y del exterior |
| `power` | Consumo total y desglosado (base, luces, aire, enchufes) y los kWh |
| `smoke` | Lectura del sensor de humo |
| `ac` - `plug` | Estado y consumo de cada aire acondicionado y de cada enchufe |
| `light` - `door` - `pir` | Cuando se enciende una luz, se abre una puerta o se detecta movimiento |
| `security` | Estado de la alarma de seguridad |
| `alerts` | Cada alerta que se activo o se apago |
| `events` | El registro de lo que paso en la casa, con su hora |

## El panel "Pipeline IoT" (la prueba de que todo es real)

Esta arriba en la pantalla y tiene 4 tarjetas con indicadores reales:

1. **Node-RED genera datos:** cuantos mensajes por segundo llegan.
2. **Guarda en InfluxDB:** cuantos datos ha enviado a guardar (y si hubo errores).
3. **Verificado en InfluxDB:** Node-RED **lee de la base de datos** cuantos datos hay realmente guardados y cuando fue el ultimo.
4. **API -> interfaz:** cuantas veces la pantalla pidio historial y Node-RED lo leyo de InfluxDB.

Si todas estan en verde, los datos nacen en Node-RED, quedan en InfluxDB y llegan a tu pantalla.

## La interfaz

La casa en 3D ocupa toda la pantalla, con materiales realistas por tipo de superficie (muros, piso de madera, vidrio, puertas, muebles), las
**17 luces** con su lampara y modo **Dia / Noche / Auto**, los **9 sensores** con anillo de radar y tarjeta de vidrio, puertas que se abren con un clic,
aires acondicionados, enchufes y un mapa de calor. El panel **Capas** muestra los muros solidos, cortados o en rayos X, oculta los muebles y
destaca sensores y luces; la barra de camara lleva a cada zona (sala, habitaciones, cocina, banos, lavanderia).

Encima flota un HUD oscuro de vidrio con colores con significado: **esmeralda** = todo bien, **ambar** = energia y puertas, **cian** = sensores y
presencia, **coral** = alerta. Trae el panel de control con fichas (Inicio, Luces, Clima, Enchufes, Accesos), escenas (Llegue a casa, Cine,
Estudio, Dormir, Salir), la alarma, el consumo y su costo, la hoja de **Analitica** (graficas en vivo o historicas, registro y pipeline), el
sonido de alarma y el **recorrido en primera persona** (ver abajo).

## Recorrer la casa por dentro (primera persona)

En el visor 3D, el boton **Recorrer la casa** mete la camara a la casa, a la altura de los ojos, como en un videojuego. No hace falta Blender: usa el mismo modelo.

| Tecla o gesto | Que hace |
|---|---|
| **W A S D** o flechas | Caminar y girar |
| **Arrastrar** con el mouse | Mirar alrededor |
| **Shift** | Correr |
| **E** | Abrir o cerrar la puerta que miras |
| **Esc** | Salir |

**En el celular o la tablet** (sin teclado) aparece una **palanca**: abajo en el centro con el telefono en vertical (comoda para el pulgar con cualquier mano) y abajo a la izquierda en horizontal, como en los juegos. Arrastra la perilla hacia donde quieres ir (si la
empujas poco, caminas despacio). Para **mirar**, arrastra un dedo sobre la casa. Cuando tengas una puerta al frente, **toca su aviso** para
abrirla o cerrarla (el boton **Abrir** aparece justo encima de la palanca). Para salir, el boton naranja de la barra de camara.

Mientras caminas, el **panel de la derecha sigue funcionando**: puedes encender luces, abrir puertas o prender el aire y verlo al instante. Arriba a la izquierda ves en que
habitacion estas y su temperatura; abajo a la derecha, un mini-mapa (un clic te lleva a ese lugar). Los detalles tecnicos estan en [`src/three/README.md`](src/three/README.md).

Limites: el modelo no tiene techo (se ve el cielo desde adentro) y las puertas arrancan cerradas. En pantallas chicas (y en un celular en horizontal) no se muestra el mini-mapa, y en las angostas tampoco los botones **Ir a**: taparian la casa.

**Si ves tirones:** el 3D lo dibuja **tu computador** (su tarjeta grafica y su procesador), no el servidor donde este publicada la pagina. Para presentar, usa la version compilada:
`npm run build` y despues `npm run preview` (abre http://localhost:4173). `npm run dev` es la version de desarrollo y es bastante mas lenta. Cierra otras pestanas pesadas y,
en un portatil, enchufalo al cargador y usa el navegador con la aceleracion por hardware activada.

**Para medir la fluidez:** abre la pagina con `?fps` al final de la direccion (por ejemplo `http://localhost:4173/?fps`). Aparece un pequeno panel con los **cuadros por segundo (FPS)** del visor 3D. Anota el valor mientras caminas por la casa: es la medicion que el documento deja pendiente en el requerimiento RNF-06 (minimo 30 cuadros por segundo). Sin `?fps` el panel no se muestra.

## Documentacion: que hace cada archivo

Cada carpeta tiene su propio `README.md`, escrito en palabras sencillas, que explica **cada archivo**. Si es tu primera vez, empieza por
[`docs/README.md`](docs/README.md): trae un **diccionario** con los terminos tecnicos.

| Carpeta | README | Que explica |
|---|---|---|
| `src/` | [`src/README.md`](src/README.md) | La pantalla (interfaz) y sus subcarpetas |
| `infra/` | [`infra/README.md`](infra/README.md) | Los instaladores, las herramientas de seguridad y Docker |
| `infra/despliegue/` | [`infra/despliegue/README.md`](infra/despliegue/README.md) | Publicar en internet con TLS y Vercel |
| `infra/nodered/` | [`infra/nodered/README.md`](infra/nodered/README.md) | El flujo de Node-RED; cada una de sus piezas esta en [`src/README.md`](infra/nodered/src/README.md) y la maquina que lo arma en [`tools/README.md`](infra/nodered/tools/README.md) |
| `infra/grafana/` | [`infra/grafana/README.md`](infra/grafana/README.md) | Los tableros de Grafana (opcional) |
| `public/` | [`public/README.md`](public/README.md) | El modelo 3D de la casa |
| `docs/` | [`docs/README.md`](docs/README.md) | Diccionario e indice; el informe [`docs/seguridad-iot.md`](docs/seguridad-iot.md) |

### Archivos sueltos de la carpeta principal

| Archivo | Que es |
|---|---|
| `package.json` | La "lista de ingredientes" del proyecto y sus comandos: `npm run dev` (enciende la pantalla), `npm run build` (la prepara para publicar), `npm run nodered:build` (arma el flujo), `npm run setup:local` y `npm run flow:redeploy` (los dos instaladores), `npm run nodered:iniciar` (Node-RED con la configuracion segura) y los de seguridad: `seguridad:secretos`, `seguridad:tokens`, `seguridad:probar`, `seguridad:integridad` y `seguridad:vercel`. Y `render:flujo` (prepara el flujo para Render). |
| `index.html` | La pagina vacia donde arranca la interfaz: titulo y el espacio donde se dibuja todo. (La letra Inter viene incluida en el proyecto, no se descarga de Google.) |
| `vite.config.ts` | Ajustes de Vite, la herramienta que enciende la pantalla (usa el puerto 5173). |
| `tsconfig.json` | Reglas del lenguaje TypeScript para detectar errores al programar. |
| `.env.example` | Plantilla de ajustes de la pantalla: de donde salen los datos y las direcciones de Node-RED. Se copia como `.env`. **No lleva claves**. |
| `.gitignore` | Lo que **nunca** se sube a Git: `node_modules`, `.env` y `infra/.env` (secretos), la carpeta de datos de tu Node-RED (`infra/nodered-local/`, con las llaves cifradas), copias de seguridad (`nodered-backups/`, `_respaldo/`) y los resultados de tus pruebas (`infra/pruebas/resultados/`). |
| `render.yaml` | Publica Node-RED gratis en **Render** (editor apagado, sin secretos en el archivo). Paso a paso en `infra/despliegue/README.md`. |
| `vercel.json` | Cabeceras de seguridad (CSP, HSTS...) para publicar en Vercel. Se regenera con `npm run seguridad:vercel -- --backend tu-dominio` (hoy apunta al Node-RED de Render). |
| `.env` | Tus ajustes reales (no viene en el zip para no borrar los tuyos). |
| `AGENTS.md` | Instrucciones para un asistente de programacion (OpenCode, etc.). |

## Seguridad IoT

El proyecto original dejaba que **cualquiera** que llegara al WebSocket mandara ordenes, tenia el token de InfluxDB escrito en el repositorio y
el editor de Node-RED sin contrasena. Esta version lo cierra. Se protege contra dos riesgos: **R1**, que alguien que no deberia mande una orden
(abrir una puerta, desarmar la alarma), y **R2**, que se expongan credenciales o servicios. El informe completo, con cada hallazgo (archivo y
linea), el plan, la evidencia y los **limites honestos**, esta en [`docs/seguridad-iot.md`](docs/seguridad-iot.md).

**Regla de oro:** toda la validacion vive en **Node-RED**. La pantalla solo oculta botones por comodidad; aunque alguien la modifique, el servidor
vuelve a revisar cada orden.

### Que protege y como

| Que | Como funciona | Donde vive |
|---|---|---|
| **Quien puede mandar ordenes** | Toda pantalla nueva es de **solo lectura**. Para controlar hay que **emparejarla** con una clave: la **personal** de cada persona (`CASA_USERS`, formato `alias:rol:clave`; la auditoria guarda el alias) o una compartida de respaldo (`CASA_PAIRING_KEY` = Operador, `CASA_ADMIN_KEY` = Administrador). | `06-sesion-autorizar.js` |
| **Que ve una pantalla sin clave** | La **vista publica**: temperatura, humedad, humo y hora. Nada que diga si hay alguien en casa (alarma, movimiento, puertas, eventos, alertas, luces, consumo), y el clima llega **sin luminosidad** (delataria las luces). Lo filtra Node-RED, sesion por sesion. | `97-serializar.js` · `tools/security-policy.mts` |
| **Que puede hacer cada rol** | Cada tipo de orden tiene un rol minimo (tabla de la seccion "Encender la pantalla"). Una orden de un rol insuficiente se rechaza con `forbidden`. | `tools/security-policy.mts` (manda) y su copia en `src/config/security.config.ts` (solo para desactivar botones) |
| **Adivinar la clave** | **5 intentos fallidos** bloquean esa sesion **1 minuto**; mas de 30 fallos por minuto entre todas las sesiones bloquean el emparejamiento. La clave se compara en tiempo constante y solo se guarda su huella (SHA-256). | `06-sesion-autorizar.js` |
| **Acciones sensibles** | **Desarmar la alarma**, **abrir una puerta del perimetro** y **una escena que desarma** no se ejecutan al pulsar: el servidor responde con un **codigo de un solo uso** valido **15 s** y solo para esa sesion; la pantalla muestra **"Confirmar accion"**. Un codigo ajeno, repetido o caducado se rechaza. | `06-sesion-autorizar.js` · `SessionOverlays.tsx` |
| **Ordenes mal formadas** | Esquema estricto: solo las claves esperadas (nada de `__proto__` ni campos internos), ids que existen y valores en rango (intensidad 0-100, consigna del aire, hora...). Mensajes de mas de **2 KB** se descartan. | `05-parsear-comando.js` · `06-sesion-autorizar.js` |
| **Inundacion** | Limite de mensajes por sesion (cubeta de fichas): una sesion de lectura casi no puede enviar; una de control aguanta un deslizador, no un ataque. | `06-sesion-autorizar.js` |
| **Expulsar a todos** | El Administrador puede **revocar** las demas sesiones: vuelven a solo lectura y el emparejamiento se congela **5 minutos**. | `06-sesion-autorizar.js` |
| **Quien puede conectarse** | El WebSocket solo acepta paginas de los origenes permitidos (`CASA_ALLOWED_ORIGINS`) y limita conexiones simultaneas e intentos por minuto **por IP**. La API (`/api/...`) solo responde CORS a esos mismos origenes (antes era `*`). | `seguridad-ws.js` · `settings.js` |
| **El editor de Node-RED** | Pide usuario y contrasena (solo se guarda el hash bcrypt); sin hash, el editor queda **apagado**. En tu equipo Node-RED escucha solo en **`127.0.0.1`**; en Render el editor esta **apagado** (no se define el hash) y solo responden `/ws/casa-iot` y `/api/...`. | `settings.js` · `iniciar-nodered.mjs` · `render.yaml` |
| **Los datos que se guardan** | Cada lectura va **firmada (HMAC-SHA256)** con marca de tiempo y numero de secuencia. Antes de entrar a InfluxDB se revisa la firma, que no sea vieja (30 s) ni repetida, el esquema y los rangos; lo imposible (+35 °C en un instante) va a **cuarentena**. | `86-firmar-telemetria.js` · `87-validar-telemetria.js` |
| **Que nadie altere el historial** | Cada bloque de datos deja una **huella encadenada** en un bucket aparte (`<bucket>_integridad`). `npm run seguridad:integridad` la recalcula y avisa si se borro o cambio algo. | `verificar-integridad.mjs` |
| **Las llaves de InfluxDB** | **Dos tokens de un solo permiso**: uno solo escribe (Node-RED), otro solo lee (consultas). En tu equipo quedan **cifrados** dentro de Node-RED (`credentialSecret`); en Render son variables de entorno del panel. Nunca en el repositorio. | `setup-local.mjs` · `crear-tokens-influx.mjs` |
| **El historial** | `/api/history/...` exige `Authorization: Bearer <clave>` (401 sin ella). La consulta a InfluxDB la arma Node-RED con un rango ya validado: el navegador nunca habla con InfluxDB. | `98-hist-*.js` |
| **Registro de lo que pasa** | Cada rechazo y cada accion sensible se anota en la medicion **`audit`** de InfluxDB (motivo, rol, tipo de orden), **sin** claves ni el id completo de la sesion. | `08-auditar.js` |
| **El navegador** | `vercel.json` trae una politica **CSP** (la pagina solo puede hablar con tu backend), HSTS y otras cabeceras. El chip **Canal cifrado / Sin cifrar** de la cabecera dice si la conexion va por `wss://`. | `vercel.json` · `Session.tsx` |
| **Canales alternos** | Se **elimino** el adaptador MQTT directo desde el navegador, que se saltaba todo. El unico camino de control es el WebSocket autorizado. | — |
| **Entrada de dispositivos externos** | `POST /api/ingest` acepta telemetria firmada (un ESP32 real, por ejemplo). Esta **apagada** por defecto (`CASA_INGEST=off`) y responde 404. | `09-ingesta-recibir.js` |

### Comprobar que tu Node-RED es el seguro

Con Node-RED encendido (`npm run nodered:iniciar`), en PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 1880 -State Listen | Select-Object LocalAddress   # debe decir 127.0.0.1 (no 0.0.0.0)
curl.exe -s http://127.0.0.1:1880/auth/login                                     # debe traer "type":"credentials" (no {})
curl.exe -s -o NUL -w "%{http_code}\n" http://127.0.0.1:1880/flows                # debe dar 401
```

Y las **65 pruebas de rechazo** (simulan ataques: usalas **solo** contra tu propio Node-RED; durante ~1 minuto no podras emparejar porque
prueba 5 claves malas, y dejan puntos de prueba con `room=prueba`):

```powershell
node --env-file=infra/.env infra/pruebas-seguridad.mjs --json infra/pruebas/resultados/local.json
```

Con la ingesta apagada salen las A y C correctas y las B **omitidas** (no es un fallo). Para correrlas todas, pon `CASA_INGEST=on` en `infra/.env`,
reinicia Node-RED, ejecuta las pruebas y **vuelve a `off`**. `--incluir-revocar` agrega A15, que congela el emparejamiento 5 minutos.
Ultimos resultados (2026-10-27): **65 correctas, 0 fallas, 0 omitidas** contra un Node-RED de prueba con `CASA_INGEST=on` y `--incluir-revocar`,
y **47 correctas, 0 fallas, 9 omitidas** con la configuracion de Render (los mismos archivos de la imagen en solo lectura y el editor apagado; las
9 omitidas son las de ingesta, que en Render esta apagada a proposito).

### Cuidados

- **Nunca subas secretos a Git.** Viven en `infra/.env` (ignorado por `.gitignore`). `.env.example` solo trae nombres, sin valores. Los crea `npm run seguridad:secretos`.
- **No pegues la salida de `npm run seguridad:secretos`** en un chat ni en un documento: trae la contrasena del editor. Si se filtra, vuelve a rotarla (`-- --rotar NODERED_ADMIN`) y reinicia Node-RED.
- **Si algun secreto estuvo en un repositorio o en un chat, rotalo** (y revoca el token en InfluxDB ▸ *API Tokens*): aunque lo borres, sigue en el historial. El proyecto original traia un token de desarrollo y contrasenas por defecto (de InfluxDB y de Grafana; aqui `[REDACTADO]`): cambialos.
- **No guardes el proyecto en una carpeta que se sincroniza** (OneDrive, Dropbox...): `infra/.env` y la llave que descifra los tokens se subirian a la nube.
- **No pongas claves en variables `VITE_...`**: Vite las copia dentro del codigo que se descarga el navegador y cualquiera las lee. La clave de emparejamiento se escribe en la pantalla y solo vive en esa pestana.
- **En Render**, los valores secretos se escriben solo en *Environment* del servicio; `render.yaml` solo trae los nombres. Lo mismo en Vercel: alli solo van direcciones, nunca claves.
- **No abras puertos a internet** sin el proxy con certificado, el tunel o Render (`infra/despliegue/`): InfluxDB, Node-RED y Grafana nunca deben quedar publicados directamente, y el editor nunca debe salir a internet.
- **Despues de cambiar algo de seguridad**, vuelve a pasar las pruebas de rechazo y deja todas en verde.

## Sobre las puertas del modelo 3D

En el modelo de Blender, las puertas giran desde su centro y no desde la bisagra, y las manijas son piezas sueltas. El programa lo corrige solo (mide cada
puerta, le pone una bisagra virtual en el borde contrario a la manija y pega la manija a la hoja), asi que no tienes que tocar Blender. Cada puerta abre
hacia dentro de la habitacion a la que da paso, para no tapar los pasillos. Los detalles estan en [`public/README.md`](public/README.md).
