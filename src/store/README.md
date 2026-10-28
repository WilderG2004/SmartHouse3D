# `src/store/` - la memoria de la pantalla

**En una frase:** aqui la pantalla guarda lo ultimo que supo de la casa, para que cualquier parte la pueda consultar.

| Archivo | Que guarda |
|---|---|
| `useHouseStore.ts` | **Los datos de la casa**, tal como los cuenta Node-RED: estado de luces, humo, movimiento, puertas, consumo, clima de cada habitacion, aires, enchufes, seguridad, la hora, las graficas en vivo, el registro de eventos, **las alertas activas** y **el estado del pipeline**. Tambien cuenta cuantos mensajes llegan (para mostrar "mensajes por segundo"). Con `restricted` sabe si es la **vista publica** (pantalla sin emparejar): entonces deja en neutro la alarma, el movimiento, las puertas, los eventos, las alertas, las luces, el consumo, los aires y los enchufes, y la interfaz dice «oculto». |
| `useSessionStore.ts` | **La sesion de esta pantalla**: el rol y el **alias del usuario** (los manda el servidor; la pantalla no se los puede dar sola), si el dialogo de emparejar esta abierto, las acciones que esperan confirmacion con su cuenta regresiva y los avisos de rechazo. En modo simulado no hay sesiones y el rol es Administrador. |
| `useUiStore.ts` | **Las preferencias de la vista**, que no vienen de Node-RED: qué capas se ven en el 3D, el brillo, el modo de las paredes (sólidas, cortadas, rayos X), si se ven los muebles, si se destacan sensores y luces, el modo **Día / Noche / Auto**, la tarjeta de sensor fijada, si la analítica está abierta, si el panel de control está plegado, qué habitación muestra la gráfica, qué rango se grafica, si el sonido está activo y las vistas de cámara (general, planta y zonas). También guarda el estado del **recorrido en primera persona**. |

## Una regla clave

`useHouseStore` **solo cambia cuando llega un mensaje de Node-RED**. Ningun boton lo modifica directo. Cuando tocas "encender luz", la orden viaja a Node-RED,
el responde "listo, la luz esta encendida", y **entonces** la memoria se actualiza.
