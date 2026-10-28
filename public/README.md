# `public/` - el modelo 3D de la casa

**En una frase:** aqui esta el archivo con la casa dibujada en 3D.

## `Iot_Casa.glb`

Es la casa, hecha en **Blender** (un programa de modelado 3D) y exportada en formato `.glb`. La pantalla la carga y la dibuja.

### Que trae dentro

- **118 piezas** (muros, pisos, muebles, marcos y puertas). 83 de ellas no traen color (se verian negras); la pantalla las pinta al cargar.
- **Puntos invisibles** (en Blender se llaman *Empty*): son marcas de posicion con un nombre. El programa los usa para saber **donde va cada cosa**:

| Marcas | Cantidad | Ejemplos de nombres |
|---|---|---|
| Luces | 17 | `Luz_Sala_Principal_1`, `Luz_Concina_1`, `Luz_Garage` |
| Sensor de humo | 1 | `Sensor_Humo_Cocina` |
| Detectores de movimiento | 5 | `Sensor_PIR_Entrada_Sala_Principal`, `Sensor_PIR_Entrada_Cocina`... |
| Sensores de puerta | 2 | `Sensor_Puerta_Entrada`, `Sensor_Puerta_Garage` |
| Medidor de energia | 1 | `Medidor_General` |

- **12 puertas**: son piezas llamadas `Cube.016` hasta `Cube.037` (el programa las nombra `Cube016`... sin el punto). Giran desde su centro, no desde la bisagra;
  por eso `src/three/doors.ts` les crea una bisagra virtual.
- **11 manijas**: piezas sueltas `Plano.001` hasta `Plano.011` (una por puerta que gira). No cuelgan de su puerta en Blender; `doors.ts` las pega a la hoja para que
  giren con ella. `Plano` (sin numero) es una manija suelta en la pared junto a la puerta de la sala principal: no pertenece a ninguna puerta y se queda quieta.

### Si cambias el modelo

1. Reemplaza el archivo y exportalo desde Blender como **glTF binario (.glb)** con la opcion *+Y Up*.
2. Abre la pantalla y mira la **consola del navegador** (tecla F12): te dice que nombres de `src/config/house.config.ts` ya no existen.
3. Corrige esos nombres en el archivo de ajustes.

### Arreglo definitivo de las puertas (opcional, en Blender)
Renombra las hojas de las puertas, haz cada manija hija de su puerta (*Ctrl+P > Object*), ponles el punto de origen en la bisagra (*Set Origin > Origin to 3D Cursor*), aplica la escala (`Ctrl+A > Scale`), separa el porton del garaje y exporta.
