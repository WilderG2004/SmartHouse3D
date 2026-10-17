# `src/store/` - la memoria de la pantalla

**En una frase:** aqui la pantalla guarda lo ultimo que supo de la casa, para que cualquier parte la pueda consultar.

| Archivo | Que guarda |
|---|---|
| `useHouseStore.ts` | **Los datos de la casa**, tal como los cuenta Node-RED: estado de luces, humo, movimiento, puertas, consumo, clima de cada habitacion, aires, enchufes, seguridad, la hora, las graficas en vivo, el registro de eventos, **las alertas activas** y **el estado del pipeline**. Tambien cuenta cuantos mensajes llegan (para mostrar "mensajes por segundo"). |
| `useSessionStore.ts` | **La sesion de esta pantalla**: el rol (lo manda el servidor; la pantalla no se lo puede dar sola), si el dialogo de emparejar esta abierto, las acciones que esperan confirmacion con su cuenta regresiva y los avisos de rechazo. En modo simulado no hay sesiones y el rol es Administrador. |
| `useUiStore.ts` | **Las preferencias de la vista**, que no vienen de Node-RED: que capas se ven en el 3D (sensores, bombillos, temperatura...), el brillo, que habitacion muestra la grafica, que rango de tiempo se grafica, si el sonido esta activo y las vistas de camara. Tambien guarda el estado del **recorrido en primera persona**: si esta activo, en que habitacion estas, que puerta tienes al frente y las peticiones de "llevame a...". |

## Una regla clave

`useHouseStore` **solo cambia cuando llega un mensaje de Node-RED**. Ningun boton lo modifica directo. Cuando tocas "encender luz", la orden viaja a Node-RED,
el responde "listo, la luz esta encendida", y **entonces** la memoria se actualiza.
