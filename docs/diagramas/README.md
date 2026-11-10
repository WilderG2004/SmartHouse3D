# `docs/diagramas/` - diagramas tecnicos

**En una frase:** aqui estan los diagramas del proyecto en **Mermaid** (`.mmd`, el modelo de datos) y en **PlantUML** (`.puml`, despliegue y componentes): texto plano, se versionan en Git y se renderizan con un comando.

Los de despliegue y componentes son **deliberadamente simples**: muestran el flujo, no el inventario. El detalle (que tags y fields, que hace cada nodo, que protege cada control) vive en los documentos, no en el dibujo.

## Que archivo hay aqui?

| Archivo | Que es |
|---|---|
| `influxdb-estructura.mmd` | **La estructura logica de almacenamiento en InfluxDB**: motor, organizacion, los dos buckets, las 14 mediciones con sus tags y fields, y que es comun a todo punto. Es el diagrama principal del modelo de datos. |
| `influxdb-flujo.mmd` | El recorrido del dato: Node-RED lo genera, lo firma y lo valida, lo escribe en InfluxDB, y la interfaz lo recupera por la API REST con consultas Flux. |
| `despliegue.puml` | **Diagrama de despliegue**: Vercel, navegador, Render e InfluxDB Cloud, con el protocolo de cada tramo. |
| `componentes.puml` | **Diagrama de componentes**: las cuatro piezas de la interfaz, las cuatro de Node-RED y la base de datos. |
| `png/` | Todos los diagramas ya renderizados, con fondo blanco, para pegarlos en una presentacion o en el documento. Se regeneran con los comandos de mas abajo; si cambias un `.mmd` o un `.puml`, vuelve a generarlos. |

Los dos estan explicados, con los diagramas incrustados y una tabla por medicion, en [`docs/modelo-datos-influxdb.md`](../modelo-datos-influxdb.md).

## Como los veo o los exporto?

- **Sin instalar nada:** GitHub los dibuja dentro de `docs/modelo-datos-influxdb.md`; en VS Code basta la extension de Mermaid.
- **Para una presentacion:** pegar el contenido del `.mmd` en <https://mermaid.live> y exportar PNG o SVG.
- **Desde la terminal:**

  Para los `.mmd` (Mermaid):

  ```bash
  npx -y @mermaid-js/mermaid-cli -i docs/diagramas/influxdb-estructura.mmd -o docs/diagramas/png/influxdb-estructura.png -b white -w 1414 -s 2
  ```

  Para los `.puml` (PlantUML), con el `plantuml.jar` de la extension de VS Code (`jebbs.plantuml`) y Java instalado:

  ```bash
  java -jar "$HOME/.vscode/extensions/jebbs.plantuml-2.18.1/plantuml.jar" -tpng -charset UTF-8 -o png docs/diagramas/*.puml
  ```

  Para comprobar solo la sintaxis, sin generar imagenes, cambia `-tpng` por `-checkonly`.

## Si cambio el flujo, que actualizo?

Los `.mmd` **no** se generan solos: se escriben a mano. Si agregas una medicion, un tag o un field, hay que tocarlos. El orden sensato es:

1. Cambiar el `schema` de `infra/nodered/tools/security-policy.mts` (es la regla que decide que se acepta).
2. Cambiar el nodo que escribe el punto (`95-persistir.js`, `96-eventos-influx.js` o el que corresponda).
3. Actualizar `influxdb-estructura.mmd` y la tabla de `docs/modelo-datos-influxdb.md`.

La cabecera de cada `.mmd` lleva comentados los archivos de los que salio su contenido.
