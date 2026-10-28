# `docs/` - documentacion

**En una frase:** aqui esta la imagen del flujo de Node-RED, el indice de toda la documentacion y un diccionario con los terminos tecnicos explicados facil.

## Que archivo hay aqui?

| Archivo | Que es |
|---|---|
| `flujo-node-red.png` | Una imagen del flujo de Node-RED tal como lo veras en el editor (`http://localhost:1880`). Tiene 6 secciones (A a F) y numeradas del 1 al 5 las cajas que si necesitan configuracion. |
| `seguridad-iot.md` | **El informe de seguridad IoT**: hallazgos del proyecto original (con archivo y linea), plan por fases, diagrama del flujo de datos con los controles de cada tramo, tabla de capacidades por rol, evidencia de las pruebas de rechazo y limites honestos. |
| `evidencia/` | Resultados guardados de las pruebas: `seg_final.json` (48 pruebas de rechazo contra Node-RED) y `resultado_ui.json` (30 comprobaciones de la interfaz en un navegador). No contienen claves. |

## Donde leo que?

| Quiero saber... | Leelo en |
|---|---|
| Que es el proyecto y como encenderlo | `README.md` (carpeta principal) |
| Que hace cada archivo de la pantalla | `src/README.md` y los README de sus subcarpetas |
| Que hace cada pieza ("nodo") de Node-RED | `infra/nodered/src/README.md` |
| Como se arma el flujo de Node-RED | `infra/nodered/tools/README.md` |
| Los instaladores y Docker | `infra/README.md` |
| La seguridad en una pagina: que protege, como comprobarlo y los cuidados | `README.md` principal, seccion **"Seguridad IoT"** |
| La seguridad del canal en detalle (hallazgos, roles, firmas, TLS, secretos, limites) y como probarla | `docs/seguridad-iot.md` |
| Las herramientas de seguridad (secretos, tokens, pruebas, integridad) | `infra/README.md`, seccion "Seguridad: los comandos" |
| Que pieza de Node-RED hace cada control (sesion, confirmacion, firma, auditoria) | `infra/nodered/src/README.md` |
| Los resultados de las pruebas en tu equipo | `infra/pruebas/resultados/` (no se sube a Git); la evidencia entregada esta en `docs/evidencia/` |
| Como publicar el backend (Render, el que esta en produccion) y el frontend en Vercel | `infra/despliegue/README.md` |
| El modelo 3D de la casa | `public/README.md` |
| Como funciona el recorrido en primera persona | `src/three/README.md` (seccion "Recorrer la casa") |
| Instrucciones para un asistente de programacion | `AGENTS.md` |

## Diccionario sencillo

| Palabra | Que significa |
|---|---|
| **Interfaz** (o *frontend*) | La pagina web que ves: la casa en 3D, los botones y las graficas. |
| **Backend** | La parte que no ves y hace el trabajo pesado. Aqui es Node-RED. |
| **Node-RED** | Un programa donde se "dibujan" procesos uniendo cajitas con cables. Aqui inventa los datos de la casa. |
| **Flujo** | El dibujo completo de cajitas y cables dentro de Node-RED. |
| **Nodo** | Una cajita del flujo. Cada una hace una tarea sencilla (por ejemplo: "calcular el consumo"). |
| **InfluxDB** | Una base de datos hecha para guardar medidas con su hora exacta (como un cuaderno de registros). |
| **Bucket** ("cajon") | El espacio dentro de InfluxDB donde se guardan los datos de este proyecto. |
| **Token** (o "llave") | Una clave larga que permite entrar a InfluxDB. **No se comparte.** |
| **WebSocket** | Una "llamada abierta" entre la pantalla y Node-RED: los datos llegan al instante, sin pedirlos cada vez. |
| **API** | Un "mostrador de atencion": la pantalla pregunta algo (por ejemplo, el historial de la ultima hora) y recibe la respuesta. |
| **Sensor** | Un aparato que mide algo (temperatura, humo, movimiento...). Aqui son simulados. |
| **PIR** | Sensor de movimiento (el que enciende la luz cuando pasa alguien). |
| **A/C o aire acondicionado** | El aparato que enfria una habitacion. El **compresor** es su motor: cuando trabaja, gasta mucha energia. |
| **Alerta** | Un aviso cuando algo se pasa de un limite (humo, calor, humedad, consumo, intrusion). |
| **Snapshot** ("foto") | El estado completo de la casa en un instante. Se envia cuando abres la pantalla para que empiece al dia. |
| **Pipeline** ("tuberia") | El recorrido de los datos: se generan -> se guardan -> se leen -> se muestran. |
| **Modelo 3D (`.glb`)** | El archivo con la casa dibujada en tres dimensiones, hecho en Blender. |
| **Primera persona** | Ver la casa desde los ojos de alguien que camina por dentro (como en un videojuego), en vez de verla desde afuera y arriba. |
| **Empty** | En Blender, un punto invisible que marca una posicion. Se usa para saber donde va cada luz o sensor. |
| **Docker** | Una forma de ejecutar programas ya instalados y configurados, sin instalar nada a mano. |
| **Grafana** | Un programa para hacer tableros de graficas con los datos de InfluxDB (opcional). |
| **`.env`** | Un archivo de ajustes: dice de donde saca los datos la pantalla. En el backend (`infra/.env`) guarda ademas los **secretos** y **nunca** se sube a Git. |
| **Sesion** | Una pantalla conectada. Empieza en *solo lectura*; con la **clave de emparejamiento** pasa a *Operador* o *Administrador*. No hay cuentas de personas. |
| **Rol** | Lo que una sesion puede hacer: Lector (ver), Operador (controlar la casa) o Administrador (ademas simular y revocar sesiones). |
| **HMAC / firma** | Un codigo calculado con una clave secreta que prueba que un mensaje no se altero y viene de quien conoce la clave. |
| **Replay** (repeticion) | Reenviar un mensaje valido ya usado. Se detecta con la marca de tiempo y el numero de secuencia. |
| **TLS / `wss://`** | El cifrado de la conexion (el candado). Sin el, un navegador en `https://` no deja abrir el WebSocket. |
| **CSP** | Una lista que el navegador respeta: a que servidores puede conectarse la pagina. Si alguien colara un script, no podria mandar datos a un sitio ajeno. |
| **Cuarentena** | Donde van las lecturas imposibles (por ejemplo +35 C en un instante): se guardan aparte, no como dato confiable. |
| **Emparejar** | Escribir la clave en la pantalla para que esa sesion pase de *solo lectura* a *Operador* o *Administrador*. Tras 5 claves malas se bloquea un minuto. |
| **Confirmacion en dos pasos** | Para las acciones sensibles (desarmar, abrir una puerta del perimetro, una escena que desarma) el servidor manda un **codigo de un solo uso** que vale 15 s; la orden solo se ejecuta si la pantalla lo devuelve a tiempo. |
| **Revocar** | El Administrador expulsa a las demas sesiones de control (vuelven a solo lectura) y congela el emparejamiento 5 minutos. |
| **Auditoria** | El registro de cada rechazo y cada accion sensible (medicion `audit` en InfluxDB). No guarda claves. |
| **Huella de integridad** | Un resumen (hash) de cada bloque de datos, encadenado con el anterior y guardado en otro bucket: si alguien borra o cambia un dato, la cadena no cuadra. |
| **Token de un solo permiso** | Una llave de InfluxDB que solo puede escribir **o** solo leer, y solo en un bucket. Si la roban, el dano es menor. |
| **`Origin`** | La cabecera con la que el navegador dice desde que pagina viene la conexion. Node-RED solo acepta las de la lista `CASA_ALLOWED_ORIGINS`. |
| **CORS** | La regla que decide que paginas pueden leer las respuestas de la API. Antes era "cualquiera" (`*`); ahora solo la lista permitida. |
| **Editor (adminAuth)** | La pantalla de Node-RED donde se editan los flujos. Con la configuracion segura pide usuario y contrasena; si no, queda apagado. |
| **`127.0.0.1`** | "Este mismo equipo". Un programa que escucha ahi no es alcanzable desde otros equipos de la red; `0.0.0.0` significa "desde cualquiera". |
| **Limite de frecuencia** (*rate limit*) | Un tope de mensajes por segundo por sesion (y de conexiones por IP) para que nadie pueda inundar el servidor. |
