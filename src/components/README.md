# `src/components/` - las piezas de la pantalla (en 2D)

**En una frase:** cada archivo es un "bloque" que ves en pantalla: la cabecera, las tarjetas, las graficas, el panel de control...

## Como se ve la pantalla (de arriba hacia abajo)

**Cabecera -> panel "Pipeline IoT" -> casa en 3D -> tarjetas de datos -> selector de tiempo -> graficas y registro de eventos.**
A la derecha, siempre visible, esta el **panel de control** con fichas.

## Los archivos

| Archivo | Que ves o que hace |
|---|---|
| `Header.tsx` | **La barra de arriba**: el titulo, la temperatura de afuera y la hora, el boton **Sonido** (sirena y voz de alarma) el rol de la sesion, si el canal va cifrado y un indicador de si estas conectado a Node-RED. Si estas en modo practica, el indicador se pone amarillo. |
| `PipelineStatus.tsx` | **El panel "Pipeline IoT"**: 4 tarjetas que demuestran que todo es real - 1) Node-RED genera datos, 2) los guarda en InfluxDB, 3) InfluxDB confirma que los tiene, 4) Node-RED responde las consultas de historial. Cada una tiene un puntito verde (bien), amarillo (atencion) o rojo (error). |
| `Viewer.tsx` | **El marco de la casa en 3D**, con su barra de herramientas: vista general o desde arriba, **capas** que puedes mostrar u ocultar (sensores, bombillos, temperatura, aires, enchufes, mapa de calor), el control de la **hora del dia** y el de **brillo**. Tambien tiene el boton **Recorrer la casa**, que cambia la camara a primera persona (ver `three/README.md`). |
| `WalkHud.tsx` | **Lo que se ve encima del 3D al recorrer la casa**: en que habitacion estas (con su temperatura, humedad y luces encendidas), la mira del centro, el aviso "E - Abrir puerta" cuando tienes una puerta al frente, los botones **Ir a** y el **mini-mapa** (tu posicion, hacia donde miras, puertas y luces; un clic te lleva a ese lugar). Solo muestra: el movimiento esta en `three/WalkMode.tsx`. |
| `KpiCards.tsx` | **Las 4 tarjetas de resumen**: potencia actual, energia gastada y su costo, clima interior (promedio) y estado de seguridad. |
| `RangeTabs.tsx` | **Los botones de tiempo** de las graficas: En vivo - 15 min - 1 h - 24 h. En modo practica se desactivan (no hay historial). |
| `Charts.tsx` | **Las 4 graficas**: consumo de energia por categoria, un circulo que muestra "en que se va la energia?", temperatura de una habitacion frente a la de afuera, y humo con su linea de peligro. |
| `EventLog.tsx` | **El registro de lo que pasa en la casa**, con su hora y su nivel (informativo, aviso o critico). Tiene un boton para limpiarlo. |
| `GrafanaPanel.tsx` | **Un tablero de Grafana incrustado.** Solo aparece si pusiste `VITE_GRAFANA_URL` en el `.env`. |
| `ControlPanel.tsx` | **El panel de control de la derecha** (ver mas abajo). Si la sesion es de solo lectura muestra el aviso y desactiva todos los controles; las simulaciones solo se activan para el Administrador. |
| `Session.tsx` | **Lo que muestra el estado de la sesion**: el candado *Canal cifrado / Sin cifrar* (en tu equipo con `npm run dev` sale *Sin cifrar* porque usa `ws://localhost`, que no sale del PC; publicado con `wss://` sale *Canal cifrado*) y el boton con el rol (*Solo lectura*, *Operador*, *Administrador*) de la cabecera, el aviso de solo lectura y la etiqueta *Solo Administrador*. |
| `SessionOverlays.tsx` | **Las ventanas de la sesion**: emparejar con la clave, **confirmar una accion sensible** con su codigo de un solo uso y cuenta regresiva (15 s), y los avisos de rechazo del servidor. |
| `ui.tsx` | **Piezas sencillas que se repiten**: el interruptor, el titulo de seccion, el boton de texto pequeno ("Abrir todas") y el selector de varias opciones. |

## Las fichas del panel de control

| Ficha | Que puedes hacer |
|---|---|
| **Inicio** | Ver las **alertas** activas, aplicar **escenas** (Cine, Dormir...), armar o desarmar la **alarma**, y **simular** eventos (fuga de humo, presencia, calor en la cocina, humedad en el bano). |
| **Luces** | Encender y apagar las 17 luces, cambiar su intensidad y su color. Hay botones "Todas" y "Ninguna". |
| **Clima** | Ver temperatura, humedad y luz de cada habitacion. En las que tienen aire acondicionado: encenderlo, elegir modo, temperatura y velocidad. |
| **Enchufes** | Encender y apagar los 6 enchufes y ver cuanto gasta cada uno. |
| **Accesos** | Abrir y cerrar las 12 puertas y ver la lista de sensores. |

Todos los botones **envian una orden a Node-RED**; la pantalla se actualiza cuando el confirma.
