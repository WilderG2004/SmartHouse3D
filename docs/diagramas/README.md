# `docs/diagramas/` - diagramas tecnicos

**En una frase:** aqui estan los diagramas del proyecto escritos en **Mermaid** (texto plano, se versionan en Git y se dibujan solos en GitHub y VS Code).

## Que archivo hay aqui?

| Archivo | Que es |
|---|---|
| `influxdb-estructura.mmd` | **La estructura logica de almacenamiento en InfluxDB**: motor, organizacion, los dos buckets, las 14 mediciones con sus tags y fields, y que es comun a todo punto. Es el diagrama principal del modelo de datos. |
| `influxdb-flujo.mmd` | El recorrido del dato: Node-RED lo genera, lo firma y lo valida, lo escribe en InfluxDB, y la interfaz lo recupera por la API REST con consultas Flux. |

Los dos estan explicados, con los diagramas incrustados y una tabla por medicion, en [`docs/modelo-datos-influxdb.md`](../modelo-datos-influxdb.md).

## Como los veo o los exporto?

- **Sin instalar nada:** GitHub los dibuja dentro de `docs/modelo-datos-influxdb.md`; en VS Code basta la extension de Mermaid.
- **Para una presentacion:** pegar el contenido del `.mmd` en <https://mermaid.live> y exportar PNG o SVG.
- **Desde la terminal:**

  ```bash
  npx -y @mermaid-js/mermaid-cli -i docs/diagramas/influxdb-estructura.mmd -o docs/diagramas/influxdb-estructura.png -b white -s 2
  ```

## Si cambio el flujo, que actualizo?

Los `.mmd` **no** se generan solos: se escriben a mano. Si agregas una medicion, un tag o un field, hay que tocarlos. El orden sensato es:

1. Cambiar el `schema` de `infra/nodered/tools/security-policy.mts` (es la regla que decide que se acepta).
2. Cambiar el nodo que escribe el punto (`95-persistir.js`, `96-eventos-influx.js` o el que corresponda).
3. Actualizar `influxdb-estructura.mmd` y la tabla de `docs/modelo-datos-influxdb.md`.

La cabecera de cada `.mmd` lleva comentados los archivos de los que salio su contenido.
