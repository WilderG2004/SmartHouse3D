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
| `App.tsx` | **Arma la pantalla.** Decide que va donde: arriba la cabecera y el panel del pipeline, luego la casa en 3D, las tarjetas, las graficas y a la derecha el panel de control. Tambien conecta los datos y el sonido de la alarma. |
| `index.css` | **Los colores y el estilo general** (tema claro): fondo suave, tarjetas blancas, un color de marca (verde azulado) y 4 colores de aviso con significado fijo (ambar = energia o luz, azul = frio o presencia, verde = todo bien, rojo = peligro). Cada color tiene 3 tonos: normal, fuerte (para texto) y suave (para fondos). Tambien define el tipo de letra (Inter), los tamanos de texto, las tarjetas (`card`), el cristal sobre la vista 3D (`glass`) y las etiquetas flotantes (`tag3d`). Respeta la opcion del sistema "reducir movimiento". |
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
