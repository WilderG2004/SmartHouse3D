# `src/components/` - las piezas de la pantalla (en 2D)

**En una frase:** cada archivo es un "bloque" que ves en pantalla: la cabecera, las tarjetas, las graficas, el panel de control...

## Como se ve la pantalla (de arriba hacia abajo)

**Cabecera -> panel "Pipeline IoT" -> casa en 3D -> tarjetas de datos -> selector de tiempo -> graficas y registro de eventos.**
A la derecha, siempre visible, esta el **panel de control** con fichas.

## Los archivos

| Archivo | Que ves o que hace |
|---|---|
| `Header.tsx` | **La barra de vidrio de arriba**: el título, la temperatura de afuera y la hora, el botón **Analítica** (abre las gráficas sobre el 3D), el botón **Sonido** (sirena y voz de alarma), el rol de la sesión, si el canal va cifrado y si estás conectado a Node-RED. En pantallas medianas los chips muestran solo el ícono. |
| `PipelineStatus.tsx` | **El panel "Pipeline IoT"**: 4 tarjetas que demuestran que todo es real - 1) Node-RED genera datos, 2) los guarda en InfluxDB, 3) InfluxDB confirma que los tiene, 4) Node-RED responde las consultas de historial. Cada una tiene un puntito verde (bien), amarillo (atencion) o rojo (error). |
| `Viewer.tsx` | **La casa en 3D a pantalla completa** con sus controles flotantes: la **barra de cámara** (vista general, planta, Sala / TV, Habitaciones, Cocina, Baños, Lavandería y **Recorrer la casa**) y el panel **Capas / Ambiente** (paredes sólidas, cortadas o en rayos X, muebles, destacar sensores y luces, etiquetas y capas; modo **Día / Noche / Auto**, hora simulada y brillo; arranca abierto solo en pantallas de 1280 px o más, para no tapar la casa). Con una alarma, el borde de la escena late en coral. |
| `WalkHud.tsx` | **Lo que se ve encima del 3D al recorrer la casa**: en que habitacion estas (con su temperatura, humedad y luces encendidas), la mira del centro, el aviso "E - Abrir puerta" cuando tienes una puerta al frente (tambien se toca o se hace clic para abrirla), la **palanca para caminar** en pantallas tactiles, los botones **Ir a** y el **mini-mapa** (tu posicion, hacia donde miras, puertas y luces; un clic te lleva a ese lugar). Solo muestra: el movimiento esta en `three/WalkMode.tsx`. |
| `KpiCards.tsx` | **Los 4 indicadores** bajo la barra de arriba (vidrio compacto): potencia actual, energía gastada y su costo, clima interior (promedio) y estado de seguridad (en la vista pública dice *Oculta*). El detalle completo sale al pasar el mouse. En el celular el ícono es más chico y entre 1024 y 1279 px se oculta, para que el valor (p. ej. *Desarmada*) quepa sin cortarse. |
| `RangeTabs.tsx` | **Los botones de tiempo** de las graficas: En vivo - 15 min - 1 h - 24 h. En modo practica se desactivan (no hay historial). |
| `Charts.tsx` | **Las 4 graficas**: consumo de energia por categoria, un circulo que muestra "en que se va la energia?", temperatura de una habitacion frente a la de afuera, y humo con su linea de peligro. |
| `EventLog.tsx` | **El registro de lo que pasa en la casa**, con su hora y su nivel (informativo, aviso o critico). Tiene un boton para limpiarlo. En la vista publica no se muestra. |
| `GrafanaPanel.tsx` | **Un tablero de Grafana incrustado.** Solo aparece si pusiste `VITE_GRAFANA_URL` en el `.env`. |
| `ControlPanel.tsx` | **El panel de control de la derecha** (ver mas abajo). Si la sesion es de solo lectura muestra el aviso y desactiva todos los controles; las simulaciones solo se activan para el Administrador. |
| `Session.tsx` | **Lo que muestra el estado de la sesion**: el candado *Canal cifrado / Sin cifrar* (en tu equipo con `npm run dev` sale *Sin cifrar* porque usa `ws://localhost`, que no sale del PC; publicado con `wss://` sale *Canal cifrado*) y el boton con el rol (*Solo lectura*, *Operador*, *Administrador*) de la cabecera, el aviso de solo lectura y la etiqueta *Solo Administrador*. Tambien `HiddenNote`, el aviso que ocupa el lugar de lo que la **vista publica** no recibe (alarma, movimiento, puertas, eventos, alertas), y el alias del usuario junto al rol. |
| `SessionOverlays.tsx` | **Las ventanas de la sesion**: emparejar con la clave, **confirmar una accion sensible** con su codigo de un solo uso y cuenta regresiva (15 s), y los avisos de rechazo del servidor. |
| `ui.tsx` | **Piezas sencillas que se repiten**: el interruptor (área táctil de 48×32 px), el titulo de seccion, el boton de texto pequeno ("Abrir todas") y el selector de varias opciones. |

## Las fichas del panel de control

| Ficha | Que puedes hacer |
|---|---|
| **Inicio** | Ver las **alertas** activas, aplicar **escenas** (Cine, Dormir...), armar o desarmar la **alarma**, y **simular** eventos (fuga de humo, presencia, calor en la cocina, humedad en el bano). |
| **Luces** | Encender y apagar las 17 luces, cambiar su intensidad y su color. Hay botones "Todas" y "Ninguna". |
| **Clima** | Ver temperatura, humedad y luz de cada habitacion. En las que tienen aire acondicionado: encenderlo, elegir modo, temperatura y velocidad. |
| **Enchufes** | Encender y apagar los 6 enchufes y ver cuanto gasta cada uno. |
| **Accesos** | Abrir y cerrar las 12 puertas y ver la lista de sensores. |

Todos los botones **envian una orden a Node-RED**; la pantalla se actualiza cuando el confirma.
