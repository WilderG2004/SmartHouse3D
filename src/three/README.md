# `src/three/` - la casa en 3D

**En una frase:** todo lo que se dibuja dentro del visor 3D: la casa, las luces, los sensores, las puertas y los aires acondicionados, y el **recorrido en primera persona** para caminar por dentro.

Se hace con Three.js (la herramienta que dibuja 3D en el navegador). La casa es el archivo `public/Iot_Casa.glb`. Las luces y los sensores se colocan en las posiciones
que marcaste en Blender; lo que no tiene marca (como los aires o los enchufes) se coloca en el centro de su habitacion.

> El 3D **no inventa valores**: todo lo que muestra viene de lo que cuenta Node-RED.

| Archivo | Que hace, en palabras simples |
|---|---|
| `HouseScene.tsx` | **El escenario completo.** Pone la casa, el **cielo y el sol que cambian con la hora** (de dia: cielo claro y cesped verde salvia, con sombras suaves; de noche: crepusculo azul grisaceo, nunca negro) y la **camara** (puedes girar, acercar y saltar a vistas preparadas). Si haces clic en una puerta, se abre o se cierra. Si abres la pagina con `?fps` al final de la direccion, muestra un panelito con los cuadros por segundo. |
| `materials.ts` | **Pinta la casa.** El modelo trae muchas piezas sin color (se veian negras); este archivo les pone colores solidos con la paleta de `config/house.config.ts`: muros blancos, piso de roble claro, puertas de nogal y muebles en neutros calidos con toques verde azulado. Reconoce cada pieza (muro, piso, marco, puerta o mueble) por su material o por su forma, y recuerda esa decision para no pintar dos veces (en modo desarrollo la pagina se prepara dos veces y antes los muros salian como muebles de colores al azar). |
| `markers.ts` | **Lee las posiciones** que marcaste en Blender para cada luz y sensor, y te **avisa en la consola del navegador** si algun nombre del archivo de ajustes no existe en el modelo. |
| `roomPositions.ts` | **Calcula donde poner** lo que no tiene marca en el modelo (aires, enchufes, etiquetas de clima): en el centro de cada habitacion. Si agregas una marca en Blender con el mismo nombre, usa esa. |
| `doors.ts` | **Prepara las puertas** para que se abran bien: en el modelo giran desde su centro, asi que mide cada una y le pone una "bisagra virtual" en el borde. El porton del garaje sube en vez de girar. |
| `DoorAnimator.tsx` | **Mueve las puertas** suavemente hacia abierto o cerrado, segun lo que diga Node-RED. |
| `LightRig.tsx` | **Las luces.** Un foco y un bombillo por cada luz de la casa. Con la alarma de intrusion, toda la casa parpadea rojo y azul; con la de humo, las luces de la cocina parpadean en rojo. Clic en un bombillo = encender o apagar. |
| `SensorLayer.tsx` | **Las etiquetas de los sensores**: humo (con su valor, y pulsa en rojo si hay alarma), movimiento ("Sin movimiento" / "Movimiento detectado"), puertas con sensor (abierta o cerrada) y el medidor de energia. |
| `ClimateLayer.tsx` | **Temperatura, humedad y luz de cada habitacion** como etiquetas flotantes, mas el **mapa de calor** (manchas de color en el piso). |
| `AcLayer.tsx` | **Los 6 aires acondicionados**: el aparato en la pared, una rendija que cambia de color y particulas de aire frio cuando el compresor trabaja. Clic = encender o apagar. |
| `PlugLayer.tsx` | **Los 6 enchufes**: un disco que late cuando esta encendido y una etiqueta con los vatios que gasta. Clic = encender o apagar. |
| `NearHtml.tsx` | **Etiqueta flotante que se oculta de lejos.** Las etiquetas de sensores, clima, aires y enchufes la usan: al caminar por la casa solo ves las que estan cerca (a unos 4,5 m), asi la pantalla no se llena. Fuera del recorrido se ven todas, como siempre. |
| `WalkMode.tsx` | **El recorrido en primera persona.** Pone la camara a la altura de los ojos y la mueve con el teclado y el mouse; frena en paredes, muebles y puertas cerradas; detecta la habitacion y la puerta que tienes al frente. Ver la seccion de abajo. |
| `floorplan.ts` | **Saca el plano de la casa del propio modelo.** "Corta" la casa con un plano horizontal (como cortar una torta) y guarda las lineas donde toca paredes y muebles. Sirve para chocar al caminar y para dibujar el mini-mapa. No hay que tocar Blender. |
| `collider.ts` | **Los choques.** La persona es un circulo visto desde arriba; si toca una pared se empuja hacia afuera (por eso "resbalas" a lo largo de ella). Tambien calcula a que lugares se puede llegar caminando y cual es el punto mas despejado de una habitacion, para que "Ir a la cocina" te deje en un lugar libre y mirando hacia donde hay espacio, nunca pegado a un mueble. |
| `walkState.ts` | **Una pizarra compartida** con donde esta la persona, hacia donde mira y donde estan las puertas. La escena la escribe y el mini-mapa la lee (cambia muchas veces por segundo, por eso no va en la memoria de la pantalla). |

## Recorrer la casa en primera persona

Se activa con el boton **Recorrer la casa** del visor. La camara entra por la puerta de entrada y puedes caminar por dentro, **sin usar Blender**: todo se calcula con el modelo que ya existe.

| Tecla o gesto | Que hace |
|---|---|
| **W A S D** o flechas arriba/abajo | Caminar (A y D van de lado) |
| Flechas izquierda/derecha | Girar |
| **Arrastrar** con el mouse | Mirar a los lados, arriba y abajo |
| **Shift** | Correr |
| **E** | Abrir o cerrar la puerta que tienes al frente |
| **Esc** | Salir del recorrido (la camara vuelve a la vista de afuera) |

- El cursor queda libre a proposito: asi puedes **encender luces o abrir puertas desde el panel de la derecha mientras caminas**.
- Las puertas empiezan cerradas y frenan el paso; abiertas se puede pasar. El porton del garaje deja pasar cuando esta levantado.
- El mini-mapa muestra donde estas, hacia donde miras, las puertas y las luces (en ambar las encendidas). Un clic en el mini-mapa te lleva a ese lugar; los botones **Ir a** te llevan a una habitacion.
- Si agregas muebles en Blender, se vuelven obstaculos solos. Si uno estorba el paso (como la cama del Dormitorio 2, que queda pegada a la pared de la puerta), agregalo a `WALK_THROUGH` en `config/house.config.ts`.
- Limites: el modelo no tiene techo (se ve el cielo desde adentro) y solo se camina en el primer piso.

### Para que no de tirones

El 3D en si es liviano (unos 35 mil triangulos y 233 dibujos por cuadro). Lo que producia tirones era el trabajo de la pagina que compartia el mismo hilo que el 3D. Lo que se hizo:

- `HouseScene` esta "memorizada" (`memo`): cada segundo llegan datos nuevos y antes se repasaba toda la escena 3D sin ningun cambio real.
- Las graficas y el registro de eventos se actualizan cada 5 segundos mientras caminas (`hooks/useLive.ts`).
- Las horas y los numeros se formatean con formateadores creados una sola vez (`lib/format.ts`): antes cada llamada creaba uno nuevo.
- Las luces solo se recalculan cuando cambian de color o intensidad (`LightRig.tsx`).
- Al caminar, los paneles pierden el desenfoque de vidrio y la resolucion se limita a x1,5 en pantallas de alta densidad.
- Para presentar el proyecto, usa `npm run build` y luego `npm run preview` (la version compilada) en vez de `npm run dev`: es bastante mas fluida.