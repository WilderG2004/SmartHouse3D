# `src/services/history/` - la linea del historial

**En una frase:** pide los datos "viejos" (los de hace 15 minutos, 1 hora o 24 horas) para dibujar las graficas historicas.

## `historyApi.ts`

La pantalla **nunca habla directo con InfluxDB**. Le pregunta a Node-RED y el va a InfluxDB y trae la respuesta. Por que: si la pantalla hablara directo, la llave
secreta de la base de datos quedaria visible en el navegador, y eso es un riesgo.

| Que trae | Para que |
|---|---|
| `fetchPowerRange` | El consumo de energia de un rango de tiempo (total y por categoria). |
| `fetchSmokeRange` | La lectura del sensor de humo. |
| `fetchClimateRange` | La temperatura de una habitacion junto con la de afuera. |
| `fetchHistorySeed` | Los ultimos 5 minutos, para que las graficas "en vivo" no empiecen vacias. |
| `HISTORY_ENABLED` | Indica si hay historial. En modo practica no hay (no existe base de datos). |
| `RANGE_LABEL`, `RANGE_MINUTES` | Los rangos disponibles: En vivo, 15 min, 1 h y 24 h. |

Siempre trae unos 300 puntos por grafica, sin importar si pides 15 minutos o 24 horas. La direccion de Node-RED se ajusta con `VITE_API_URL` (por defecto `http://localhost:1880/api`).
