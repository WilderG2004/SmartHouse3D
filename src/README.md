# `src/` - la pantalla que ves en el navegador

**En una frase:** aqui esta todo el codigo de la interfaz (la casa en 3D, los botones, las graficas). Esta hecha con una herramienta llamada React.

## La idea mas importante

La pantalla **no inventa datos**. Hace solo dos cosas:

1. **Muestra** lo que Node-RED le cuenta (temperatura, luces, consumo...).
2. **Pide** cosas cuando tu tocas un boton ("enciende esta luz"). Node-RED la ejecuta y avisa; recien entonces la pantalla cambia.

**Y quien manda es el servidor:** toda pantalla nueva arranca en *solo lectura*; para dar ordenes hay que **emparejarla con una clave** (boton del rol, arriba). La pantalla solo
refleja el rol que le da Node-RED: ocultar o desactivar botones es comodidad, no un control (Node-RED rechaza igual lo que no corresponde). Ver `docs/seguridad-iot.md`.

```
 Node-RED --datos--> services/telemetry --> store (la memoria de la pantalla) --> components/ y three/ (lo que ves)
     ^                                                                                   |
     +------------ hooks/useTelemetry (las ordenes) <---- tus clics ---------------------+
```

## Los archivos sueltos de esta carpeta

| Archivo | Que hace, en palabras simples |
|---|---|
| `main.tsx` | **El arranque.** Es lo primero que se ejecuta: pone la aplicacion dentro de la pagina `index.html`. |
| `App.tsx` | **Arma la pantalla (HUD).** En escritorio la casa en 3D ocupa toda la pantalla y encima flotan, como vidrio: la barra con los 4 indicadores (arriba), el panel de control (derecha, plegable; más angosto entre 1024 y 1279 px) y la hoja de **Analítica** (gráficas, registro, pipeline y Grafana; se abre desde la barra y se cierra con Esc). En el celular todo va en columna. Mide la barra de arriba para que los controles del visor empiecen debajo. También conecta los datos y el sonido de la alarma. |
| `index.css` | **Los colores y el estilo general** (tema oscuro de HUD): fondo atmosférico, paneles de vidrio esmerilado (pizarra al 70 %, desenfoque, borde blanco al 10 %) y colores con significado fijo: **esmeralda** = seguro / en línea, **ámbar** = luces y consumo, **cian** = clima y sensores, **coral** = alertas e intrusión. Cada color tiene 3 tonos: normal, fuerte (texto) y suave (fondos). Define el tipo de letra (Inter), las tarjetas (`card`), el vidrio (`glass`), las etiquetas 3D (`tag3d`), la tarjeta de sensor (`sensor-card`), la viñeta de alarma y las variables `--hud-top` / `--hud-right`. Respeta la opción del sistema «reducir movimiento». |
| `vite-env.d.ts` | Una "lista de ajustes permitidos": le dice al programa que variables del archivo `.env` existen (modo de datos, direcciones...). No se toca. |

## Las carpetas

| Carpeta | Que hay dentro |
|---|---|
| `config/` | **El panel de ajustes de la casa**: nombres, equipos, escenas y limites de alerta. |
| `types/` | **El "idioma comun"**: como se escriben los mensajes entre Node-RED y la pantalla. |
| `services/` | **Las lineas de comunicacion** con Node-RED (datos en vivo e historial). |
| `store/` | **La memoria de la pantalla**: guarda lo ultimo que conto Node-RED, la preferencia de vista y la sesion (rol, confirmaciones, avisos). |
| `hooks/` | **Ayudantes**: uno conecta los datos y las ordenes, otro dice si la sesion puede hacer algo, otro pide historial, otro hace sonar la alarma. |
| `lib/` | **Herramientas sencillas**: dar formato a numeros y horas, colores de temperatura. |
| `components/` | **Las piezas de la pantalla** en 2D (cabecera, tarjetas, graficas, panel de control). |
| `three/` | **La casa en 3D** y todo lo que se dibuja en ella (luces, sensores, puertas, aires) y el **recorrido en primera persona**. |
