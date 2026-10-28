# `src/config/` - el panel de ajustes de la casa

**En una frase:** un solo archivo donde estan todos los nombres, equipos, escenas y limites de la casa. Si quieres cambiar algo de la casa, casi seguro es aqui.

## `security.config.ts`

Lo que la pantalla sabe de la **seguridad**: el nombre de cada rol, el rol minimo de cada orden y el texto de cada motivo de rechazo.
**No es un control:** es una copia de la tabla de Node-RED (`infra/nodered/tools/security-policy.mts`, que es la que manda) para no ofrecer botones que van a fallar. Si cambias una, cambia la otra.

## `house.config.ts`

Tiene una ventaja importante: **lo usan los dos lados a la vez**, la pantalla y Node-RED. Asi nunca se "desacomodan". Si cambias algo que Node-RED
tambien necesita, avisale con estos dos comandos:
```bash
npm run nodered:build
node infra/redeploy-flow.mjs
```

### Que hay en cada parte del archivo

| Parte | Que define, en palabras simples |
|---|---|
| **Luces** | Las **17 luces** de la casa: como se llama cada una dentro del modelo 3D, su nombre para mostrar y a que habitacion pertenece. Tambien cuales arrancan encendidas. |
| **Humo** | El sensor de humo de la cocina: cuanto marca normalmente (12 ppm) y desde cuanto suena la alarma (400 ppm). |
| **Movimiento (PIR)** | Los **5 detectores de movimiento**, que luces enciende cada uno y cuanto tiempo dura el aviso (8 segundos). |
| **Puertas** | Las **12 puertas**: cual pieza del modelo es cada una, cual es su manija, hacia donde gira (hacia dentro de la habitacion, para no tapar el pasillo; si una abre al reves, cambia el signo de `dir`) y cuales tienen sensor (las de la calle). |
| **Medidor** | El consumo "de fondo" de la casa (80 W), cuanto gasta una luz al maximo (15 W) y el precio del kWh (950 pesos, como ejemplo). |
| **Escena 3D** | La posicion inicial de la camara, que tan brillantes se ven las luces y cuanta luz ambiente hay. |
| **Materiales por colección** | **Las colecciones de Blender** rearmadas por nombre de malla (`COLLECTIONS`: paredes, piso, ventanas, puertas, chapas, camas, mesas/sillas/sofás, mesa de TV, armarios, mesitas, baño, cocina, lavandería), los **acabados PBR** (`FINISHES`: color, rugosidad, metal, vidrio) y cuál lleva cada colección o cada malla (`COLLECTION_FINISH`, `MESH_FINISH`). También la altura del corte de paredes (`WALL_CUT_HEIGHT`), los tonos rápidos de luz (`LIGHT_PRESETS`: cálida 3000 K, fría 6000 K, alerta) y las **zonas de cámara** (`CAMERA_ZONES`). Aquí cambias el aspecto. |
| **Habitaciones** | Las **11 habitaciones** y el radio de su mancha en el mapa de calor. |
| **Clima y aire acondicionado** | Como se calienta y enfria la casa, cuanto gasta el aire, y los **6 aires acondicionados** (sala, estudio, cocina y 3 dormitorios). |
| **Alertas** | Los limites que activan las alertas: 32 C de temperatura, 85 % de humedad y 1500 W de consumo. |
| **Sensores simulados** | Que tan realista es lo que inventa Node-RED: cuanta luz entra por las ventanas, el "ruido" de las lecturas y cada cuanto alguien cocina o se ducha. |
| **Enchufes** | Los **6 enchufes**: cuanto gasta cada aparato y si tienen apagado automatico (la cafetera, a los 20 s) o ciclo (la lavadora). |
| **Escenas** | Los 5 "modos" de la casa: Llegue a casa, Cine, Estudio, Dormir y Salir de casa. |
| **Recorrido** | `WALK_THROUGH`: piezas del modelo que **no frenan** al caminar en primera persona (hoy solo la cama del Dormitorio 2, que tapaba la entrada). |

### Cuando lo toco?

| Si quieres... | Cambia... |
|---|---|
| Que la casa se vea de otro color | `FINISHES` (el color de cada acabado) o `MESH_FINISH` (el acabado de una pieza) |
| Agregar un mueble nuevo de Blender | su nombre en la colección que le toca de `COLLECTIONS` (la consola avisa de las mallas sin colección) |
| Agregar un botón de cámara | una zona en `CAMERA_ZONES` con sus habitaciones |
| Que una alerta salte antes o despues | los limites de **Alertas** |
| Agregar un aire acondicionado o un enchufe | las listas de aires o de enchufes |
| Cambiar lo que hace una escena | la lista de **Escenas** |
| Renombraste algo en Blender | el nombre correspondiente (la consola del navegador te avisa cuales no encuentra) |
