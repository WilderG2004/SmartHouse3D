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

## Como ponerlo a funcionar

### Lo que necesitas antes
- **Node.js** instalado (version 18 o mas).
- **Node-RED** encendido (se abre en `http://localhost:1880`). Si no lo tienes encendido, escribe `node-red` en una terminal.
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

```bash
node infra/setup-local.mjs --dry-run --nodered-user admin --nodered-pass <contrasena-del-editor>   # solo te muestra lo que va a hacer
node infra/setup-local.mjs --nodered-user admin --nodered-pass <contrasena-del-editor>             # lo hace de verdad
```
Te pedira una **llave de administrador** de InfluxDB (la creas en la pagina de InfluxDB, en la seccion *API Tokens*). Es temporal: **borrala al terminar**,
porque el script ya crea llaves propias, mas limitadas y seguras, para Node-RED.

### Paso 2 - Si ya lo instalaste y solo quieres actualizar
No pide llave. Cambia el flujo por el de esta version y guarda una copia de seguridad de lo que tenias.
```bash
node infra/redeploy-flow.mjs --dry-run --nodered-user admin --nodered-pass <contrasena-del-editor>
node infra/redeploy-flow.mjs --nodered-user admin --nodered-pass <contrasena-del-editor>
```

### Paso 3 - Encender la pantalla
```bash
npm run dev        # enciende la pantalla
```
Abre **http://localhost:5173** en el navegador. Arranca en **Solo lectura** (ves todo, los controles estan desactivados). Para controlar la casa, pulsa el boton **Solo lectura** de la cabecera y escribe la
clave de `CASA_PAIRING_KEY` (Operador) o `CASA_ADMIN_KEY` (Administrador, ademas puede simular eventos y cambiar la hora). La clave solo se recuerda en esa pestana.

| Rol | Que puede hacer |
|---|---|
| **Solo lectura** | Ver todo. Las ordenes se rechazan. |
| **Operador** | Luces, aires, enchufes, puertas, escenas y alarma (desarmar o abrir una puerta de la calle pide confirmar con un codigo). |
| **Administrador** | Todo lo anterior, mas simulaciones, hora simulada y *revocar las otras sesiones*. |

### Opcional - Todo con Docker
Si prefieres no instalar nada a mano, mira [`infra/README.md`](infra/README.md): levanta InfluxDB, Node-RED y Grafana con los puertos abiertos solo en tu equipo. Para publicar en internet (frontend en Vercel, backend con certificado), sigue [`infra/despliegue/README.md`](infra/despliegue/README.md).

### Direcciones utiles

| Direccion | Que es |
|---|---|
| `http://localhost:5173` | La casa en 3D (la interfaz) |
| `http://localhost:1880` | El editor de Node-RED (donde se ve el flujo; pide usuario y contrasena) |
| `http://localhost:1880/api/health` | Comprobar que Node-RED esta vivo |

## Si algo no funciona

| Que ves | Que significa y como arreglarlo |
|---|---|
| Un aviso amarillo que dice **"Simulacion local"** | La pantalla esta en modo practica (inventa ella los datos). Abre el archivo `.env` y pon `VITE_TELEMETRY_MODE=websocket`; reinicia con `npm run dev`. |
| La cabecera dice **"Solo lectura"** y los controles estan grises | Es lo normal: la pantalla aun no esta emparejada. Pulsa **Solo lectura** y escribe la clave de `infra/.env`. |
| Al emparejar dice **"La clave no es correcta"**, **"Demasiados intentos"** o **"congelo el emparejamiento"** | Revisa la clave (`CASA_PAIRING_KEY` / `CASA_ADMIN_KEY`). Tras 5 fallos se bloquea un minuto; si un Administrador uso *Revocar*, el emparejamiento espera 5 minutos. |
| Sale **"Sin cifrar"** en la cabecera | La conexion es `ws://`: aceptable solo en tu equipo. Desplegado, usa `wss://` (ver `infra/despliegue/README.md`). |
| La cabecera dice **"Reconectando"** o no hay datos | Node-RED esta apagado o no tiene el flujo. Enciendelo (`node-red`) y ejecuta `node infra/redeploy-flow.mjs`. |
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

La casa en 3D (colores claros: muros blancos, piso de roble claro, puertas de nogal, cesped verde salvia) con luces, puertas que se abren, aires acondicionados, enchufes y un mapa
de calor - un panel de control con fichas (Inicio, Luces, Clima, Enchufes, Accesos) - escenas (Llegue a casa, Cine, Estudio, Dormir, Salir) - alarma de
seguridad - tarjetas de consumo y costo - graficas en vivo o historicas - dia y noche - sonido de alarma - **recorrido en primera persona** (ver abajo).

## Recorrer la casa por dentro (primera persona)

En el visor 3D, el boton **Recorrer la casa** mete la camara a la casa, a la altura de los ojos, como en un videojuego. No hace falta Blender: usa el mismo modelo.

| Tecla o gesto | Que hace |
|---|---|
| **W A S D** o flechas | Caminar y girar |
| **Arrastrar** con el mouse | Mirar alrededor |
| **Shift** | Correr |
| **E** | Abrir o cerrar la puerta que miras |
| **Esc** | Salir |

Mientras caminas, el **panel de la derecha sigue funcionando**: puedes encender luces, abrir puertas o prender el aire y verlo al instante. Arriba a la izquierda ves en que
habitacion estas y su temperatura; abajo a la derecha, un mini-mapa (un clic te lleva a ese lugar). Los detalles tecnicos estan en [`src/three/README.md`](src/three/README.md).

Limites: el modelo no tiene techo (se ve el cielo desde adentro), las puertas arrancan cerradas, y esta pensado para computador (teclado y mouse).

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
| `package.json` | La "lista de ingredientes" del proyecto y sus comandos: `npm run dev` (enciende la pantalla), `npm run build` (la prepara para publicar), `npm run nodered:build` (arma el flujo), `npm run setup:local` y `npm run flow:redeploy` (los dos instaladores). |
| `index.html` | La pagina vacia donde arranca la interfaz: titulo y el espacio donde se dibuja todo. (La letra Inter viene incluida en el proyecto, no se descarga de Google.) |
| `vite.config.ts` | Ajustes de Vite, la herramienta que enciende la pantalla (usa el puerto 5173). |
| `tsconfig.json` | Reglas del lenguaje TypeScript para detectar errores al programar. |
| `.env.example` | Plantilla de ajustes de la pantalla: de donde salen los datos y las direcciones de Node-RED. Se copia como `.env`. **No lleva claves**. |
| `.gitignore` | Lo que **nunca** se sube a Git: `node_modules`, `.env` y `infra/.env` (secretos), copias de seguridad de Node-RED. |
| `vercel.json` | Cabeceras de seguridad (CSP, HSTS...) para publicar en Vercel. Se regenera con `npm run seguridad:vercel -- --backend tu-dominio`. |
| `.env` | Tus ajustes reales (no viene en el zip para no borrar los tuyos). |
| `AGENTS.md` | Instrucciones para un asistente de programacion (OpenCode, etc.). |

## Cuidados de seguridad

- **Nunca subas secretos a Git.** Viven en `infra/.env` (ignorado por `.gitignore`). `.env.example` solo trae nombres, sin valores. Los crea `npm run seguridad:secretos`.
- **Si algun secreto estuvo en un repositorio, rotalo**: aunque lo borres de los archivos, sigue en el historial de Git. El proyecto original traia un token de desarrollo y contrasenas por defecto (de InfluxDB y de Grafana; aqui `[REDACTADO]`): cambialos.
- **No pongas claves en variables `VITE_...`**: Vite las copia dentro del codigo que se descarga el navegador y cualquiera las lee. La clave de emparejamiento se escribe en la pantalla.
- **No abras puertos a internet** sin el proxy con certificado (`infra/despliegue/`): InfluxDB, Node-RED y Grafana nunca deben quedar publicados directamente.
- Para comprobar que todo se comporta, ejecuta `npm run seguridad:probar` (solo contra tu propio Node-RED). El informe completo, con hallazgos, evidencia y **limites honestos** (que esta probado y que es solo plantilla), esta en [`docs/seguridad-iot.md`](docs/seguridad-iot.md).

## Sobre las puertas del modelo 3D

En el modelo de Blender, las puertas giran desde su centro y no desde la bisagra. El programa lo corrige solo (mide cada puerta y le pone una bisagra
virtual), asi que no tienes que tocar Blender. Los detalles estan en [`public/README.md`](public/README.md).
