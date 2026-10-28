# `src/services/history/` - la linea del historial

**En una frase:** pide los datos "viejos" (los de hace 15 minutos, 1 hora o 24 horas) para dibujar las graficas historicas.

## `historyApi.ts`

La pantalla **nunca habla directo con InfluxDB**. Le pregunta a Node-RED y el va a InfluxDB y trae la respuesta. Por que: si la pantalla hablara directo, la llave
secreta de la base de datos quedaria visible en el navegador, y eso es un riesgo.

**El historial pide clave.** Node-RED solo lo entrega con `Authorization: Bearer <clave>`, la misma con la que se emparejo esta pestana. Una pantalla
sin emparejar no lo pide (y si alguien lo intenta con `curl`, recibe 401): el consumo de varios dias dice a que horas hay alguien en casa.

| Que trae | Para que |
|---|---|
| `fetchPowerRange` | El consumo de energia de un rango de tiempo (total y por categoria). |
| `fetchSmokeRange` | La lectura del sensor de humo. |
| `fetchClimateRange` | La temperatura de una habitacion junto con la de afuera. |
| `fetchHistorySeed` | Los ultimos 5 minutos, para que las graficas "en vivo" no empiecen vacias (sin emparejar devuelve vacio). |
| `HistoryAuthError` | El error que sale si falta la clave o ya no vale: la grafica muestra "Empareja esta pantalla…" en vez de un fallo de red. |
| `HISTORY_ENABLED` | Indica si hay historial. En modo practica no hay (no existe base de datos). |
| `RANGE_LABEL`, `RANGE_MINUTES` | Los rangos disponibles: En vivo, 15 min, 1 h y 24 h. |

Siempre trae unos 300 puntos por grafica, sin importar si pides 15 minutos o 24 horas. La direccion de Node-RED se ajusta con `VITE_API_URL` (por defecto `http://localhost:1880/api`).
