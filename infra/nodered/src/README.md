# `infra/nodered/src/` - las 36 piezas del cerebro de la casa

**En una frase:** cada archivo de esta carpeta es **una cajita** (un "nodo") del flujo de Node-RED, con **una tarea sencilla**. Juntas hacen que la casa "viva".

## Como leer esta carpeta

- Cada archivo es un mini programa. Su nombre empieza con un numero (`10-luces.js`, `92-clima-tick.js`) que solo sirve para ordenarlos.
- **No se editan dentro de Node-RED**: se editan aqui y se vuelven a instalar (ver abajo).
- En Node-RED las cajitas se agrupan en **secciones de la A a la F**; aqui estan en el mismo orden.
- Algunas se activan **cuando llega una orden** (por ejemplo "enciende la luz") y otras **cada segundo** (la casa "vive" sola).

## Que es lo que viaja entre las cajitas?

| Tipo | Que es | Ejemplo |
|---|---|---|
| **Ordenes** | Lo que pide la pantalla (o una escena, o un detector de movimiento). | "Enciende la luz de la cocina". |
| **Datos** | Lo que Node-RED cuenta a la pantalla. | "La temperatura de la sala es 24,3 C". |

## A - Inicio

| Archivo | La cajita | Que hace, en palabras simples |
|---|---|---|
| `00-inicializar.js` | Configuracion y estado inicial | **Prepara la casa.** Al arrancar (o al pulsar *Reiniciar simulacion*) anota los ajustes de la casa y deja todo en su estado inicial: luces, aires, enchufes, temperaturas... Avisa a la pantalla que empezo de nuevo. |

## B - Ordenes que llegan de la pantalla

Primero una cajita lee la orden, la **puerta unica de seguridad** la autoriza y la limpia, y un **repartidor** (el "Enrutador por kind") la manda a la cajita correcta, segun de que se trate.
Las cajitas `86` y `87` (firma y validacion de telemetria) y `08`/`09` (auditoria e ingesta) viven entre la simulacion y la salida: ver `docs/seguridad-iot.md`.

| Archivo | La cajita | Que hace, en palabras simples |
|---|---|---|
| `05-parsear-comando.js` | Parsear comando del WebSocket | **Lee el mensaje** que llega de la pantalla y comprueba que tenga sentido. Si es basura, lo descarta. |
| `06-sesion-autorizar.js` | Autorizar sesion y validar comando | **La puerta unica de las ordenes.** Cada conexion es un *lector* hasta que se empareja con la clave (*operador* o *administrador*). Comprueba el rol minimo de cada tipo de mensaje, que solo vengan las claves permitidas, que el dispositivo exista y que los valores esten en rango; limita el tamano y la frecuencia; pide un **codigo de un solo uso** para las acciones sensibles (desarmar, abrir una puerta del perimetro, escenas que desarman); y responde solo a ese cliente. Nada pasa a las demas cajitas sin su permiso. Como es de tipo `plain`, lee los nombres de puertas y escenas con `global.get('cfg')` para el texto del cuadro de confirmacion. |
| `07-sesion-cerrar.js` | Olvidar sesion desconectada | **Borra la sesion** (y sus confirmaciones pendientes) cuando el cliente se desconecta: al volver, empieza otra vez como *lector*. |
| `08-auditar.js` | Auditoria (InfluxDB + registro de eventos) | **Anota cada rechazo y cada accion sensible** en la medicion `audit` (sin claves ni mensajes completos) y avisa en el registro de eventos, con tope por segundo para que una inundacion no llene la base de datos. |
| `09-ingesta-recibir.js` | Recibir telemetria firmada (`POST /api/ingest`) | **Entrada para un dispositivo externo** (hoy el de prueba; manana, un ESP32). Apagada por defecto. Todo lo que llega pasa por el mismo validador que la telemetria interna. |
| `10-luces.js` | Luces | **Enciende o apaga una luz**, o le cambia la intensidad o el color. Revisa que los valores sean validos. |
| `20-puertas.js` | Puertas | **Abre o cierra una puerta.** Si es una puerta de la calle y se abre, avisa a la alarma por si la casa esta armada. |
| `30-pir.js` | Detector de movimiento (PIR) | **Simula que alguien pasa.** Enciende las luces de esa zona durante 8 segundos y, si la casa esta armada "fuera", dispara la alarma. |
| `40-aire-acondicionado.js` | Aire acondicionado (comandos) | **Maneja un aire**: lo enciende o apaga, y cambia el modo, la temperatura que quieres (de 16 a 30 C) y la velocidad. |
| `50-enchufes.js` | Enchufes inteligentes | **Enciende o apaga un enchufe.** Si tiene apagado automatico (la cafetera, 20 segundos), lo programa. |
| `60-seguridad.js` | Seguridad (alarma de intrusion) | **La alarma.** Tiene tres modos: desarmada, en casa y fuera. **No deja armar** si hay una puerta de la calle abierta. Tambien puede simular una intrusion (abre la puerta de entrada y, 1,2 segundos despues, detecta movimiento). |
| `70-escenas.js` | Escenas | **Los "modos"** (Cine, Dormir...). No cambia nada por si misma: **manda varias ordenes normales** (apagar luces, bajar el aire, etc.) y cada aparato las aplica con sus propias reglas. |
| `80-mundo.js` | Reloj simulado | **Cambia la hora del dia de la simulacion.** Con la hora cambian la luz del sol y la temperatura de afuera. Con "Auto" vuelve a la hora real. |
| `85-snapshot.js` | Snapshot del estado | **Saca una "foto" de toda la casa** (luces, humo, consumo, clima, alertas...) y se la envia a quien la pidio. Es lo primero que recibe la pantalla al abrirse. |
| `90-humo-simular.js` | Eventos de sensor (humo, calor, humedad) | **Simula situaciones** para probar las alertas: una fuga de humo, calor en la cocina o humedad en el bano. No enciende ni apaga aparatos. |

## C - La casa "vive" (se ejecuta cada segundo, en este orden)

| Archivo | La cajita | Que hace, en palabras simples |
|---|---|---|
| `35-expiraciones.js` | Expiraciones (PIR y temporizadores) | **Apaga lo que ya cumplio su tiempo**: da por terminado el movimiento (y apaga las luces que encendio solo) y apaga los enchufes con temporizador. |
| `91-humo-tick.js` | Sensor de humo (cada 1 s) | **El sensor de humo.** Normalmente marca unos 12 ppm; cocinar suma un poco; una fuga lo sube a ~480. La alarma se activa sobre 400 y se apaga bajo 300. |
| `92-clima-tick.js` | Clima y termostato A/C (cada 1 s) | **Calcula el clima de cada habitacion.** La temperatura sigue a la de afuera (la casa es 3 C mas fresca); las luces y aparatos la calientan; el aire la enfria (su compresor se enciende y apaga para mantener la temperatura que pediste). La humedad baja con el frio y **una ducha la sube**. **Cocinar** calienta rapido la cocina. Y calcula la **luz** de cada habitacion: sol por las ventanas + bombillos encendidos. |
| `93-energia-tick.js` | Potencia y energia (cada 1 s) | **El medidor de energia.** Suma lo que gasta la casa "de fondo" + luces + aires + enchufes (la lavadora, por ejemplo, gasta por ciclos) y va acumulando los kWh. |
| `94-alertas.js` | Alertas (umbrales) | **El vigilante de limites.** Compara cada valor con su limite (humo, temperatura, humedad, consumo, intrusion) y levanta una alerta cuando se pasa. La apaga un poco **despues** de que baja, para que no parpadee. |
| `86-firmar-telemetria.js` | Firmar telemetria (dispositivo simulado) | **Firma cada lectura** con la clave de su dispositivo (HMAC-SHA256), con marca de tiempo y numero de secuencia, antes de guardarla. |
| `87-validar-telemetria.js` | Validar telemetria (firma, ventana, secuencia, esquema, anomalias) | **El unico camino hacia InfluxDB.** Rechaza firmas malas, mensajes viejos o repetidos y valores fuera de esquema o de rango; las lecturas fisicamente imposibles van a **cuarentena**. Al cerrar cada bloque de tiempo escribe una **huella** encadenada en un bucket aparte. |
| `95-persistir.js` | Preparar lecturas para InfluxDB | **Prepara el "paquete" para el cuaderno.** Cada 2 segundos junta todas las medidas en un solo lote para guardarlas, y cuenta cuantos paquetes lleva enviados. |

## D - Salida

| Archivo | La cajita | Que hace, en palabras simples |
|---|---|---|
| `96-eventos-influx.js` | Guardar cambios de estado y eventos | **Anota lo que pasa en el momento**: cada luz que se enciende, puerta que se abre, movimiento detectado, cambio de alarma, alerta y evento del registro. |
| `97-serializar.js` | Serializar a JSON | **Convierte el mensaje a texto** para poder enviarlo por la "llamada" con la pantalla. Si era para un solo cliente, solo se lo manda a el. |

## E - Historial (cuando la pantalla pide datos viejos)

| Archivo | La cajita | Que hace, en palabras simples |
|---|---|---|
| `98-hist-power.js` | Consulta Flux - potencia | **Pregunta a InfluxDB** por el consumo de energia de un rango de tiempo. |
| `98-hist-smoke.js` | Consulta Flux - humo | **Pregunta a InfluxDB** por el humo. |
| `98-hist-clima.js` | Consulta Flux - temperatura | **Pregunta a InfluxDB** por la temperatura de una habitacion y la de afuera. Comprueba que el nombre de la habitacion sea seguro (solo letras, numeros y guion bajo). |
| `99-hist-formato.js` | Dar formato a la respuesta | **Ordena la respuesta** de InfluxDB para que la pantalla la entienda, y cuenta cuantas consultas ha atendido. |
| `99-error.js` | Error -> HTTP 502 | **Si InfluxDB no responde**, contesta con un aviso claro en lugar de quedarse colgado. |
| `99-salud.js` | Estado del servicio | **Responde "estoy vivo"** en `/api/health`. Sirve para comprobar rapido que Node-RED funciona. |

## F - El vigilante del pipeline (cada 5 segundos)

Estas cuatro cajitas existen para **demostrar que los datos se guardan de verdad**: Node-RED va a InfluxDB y comprueba que hay anotado.

| Archivo | La cajita | Que hace, en palabras simples |
|---|---|---|
| `88-pipeline-contar.js` | Monitor - contar puntos en InfluxDB | **Pregunta a InfluxDB:** "cuantas lecturas de consumo tienes de los ultimos 10 minutos?". |
| `88-pipeline-ultimo.js` | Monitor - ultimo dato guardado | **Guarda esa respuesta y pregunta:** "cuando fue la ultima?". |
| `88-pipeline-resultado.js` | Monitor - resultado | **Le cuenta a la pantalla** lo que InfluxDB respondio: cuantos datos hay, cuando fue el ultimo y cuanto tardo la lectura. |
| `88-pipeline-error.js` | Monitor - error de InfluxDB | **Avisa si algo falla** al guardar o al leer, para que la pantalla muestre el problema en rojo. |

## Para cambiar la logica de una cajita

1. Edita el archivo de esta carpeta.
2. `npm run nodered:build` (arma el flujo con tu cambio).
3. `node infra/redeploy-flow.mjs` (lo instala en tu Node-RED).
4. Recarga el editor de Node-RED con F5.

## Para quien programa (detalles tecnicos)

- Cada archivo empieza con **cabeceras** que lee el generador: `// @name` (el nombre de la cajita), `// @kind` (su tipo), `// @uses` (ayudas que necesita) y `// @outputs` (cuantas salidas tiene).
- **Tipos (`@kind`):** `handler` (recibe una orden; salidas: datos para la pantalla y ordenes internas), `security` (como `handler`, pero con una tercera salida para ordenes con retraso),
  `tick` (se ejecuta cada segundo; deja pasar al siguiente), `expire` (cada segundo; termina cosas que vencieron) y `plain` (codigo libre, sin ayudas).
- **Ojo con `plain`:** no trae el preambulo, asi que **no** existen `cfg`, `S`, `cmd`, `now`, `log()`… Si los necesitas, definelos tu (por ejemplo `const cfg = global.get('cfg') || {}`). Con `@uses crypto` solo recibe `SEC`, `RT`, `hmacHex`, `sha256Hex`, `ctEq`, `deviceKey`, `sortedPairs`, `canon` y `crypto`. Usar uno sin definir da `ReferenceError … is not defined` solo cuando esa rama se ejecuta (asi se perdian las confirmaciones de puertas y escenas).
- **Variables disponibles** en los tipos `handler`, `security`, `tick` y `expire`: `cfg` (los ajustes de la casa), `S` (el estado de la simulacion), `cmd` (la orden recibida), `now` (la hora), `out` (datos a enviar), `cmds` (ordenes internas), y funciones como `log()` (anota un evento) y `done()` (guarda y termina).
- **Ayudas opcionales:** `world` (hora, temperatura exterior, luz del dia) y `range` (leer el rango de tiempo de una consulta de historial: maximo 31 dias y unos 2000 puntos).
- **El estado `S`** tiene: luces, movimiento, puertas, humo, kWh, habitaciones (temperatura, humedad, luz), aires, enchufes, seguridad, hora forzada, ultimo consumo, eventos, eventos domesticos, alertas y contadores del pipeline.
- **Mensajes que Node-RED envia a la pantalla:** `snapshot`, `light`, `door`, `pir`, `ac`, `plug`, `security`, `smoke`, `climate`, `power`, `alert`, `event` y `pipeline`. Su forma exacta esta en `src/types/iot.ts`.
