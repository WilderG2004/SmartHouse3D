# `infra/grafana/` - tableros de Grafana (opcional)

**En una frase:** un tablero con graficas del historial de la casa, ya armado, para usar con Docker. **No es necesario** para que funcione el proyecto.

Grafana es un programa especializado en hacer graficas con datos de una base de datos. Aqui viene ya conectado a InfluxDB.

| Archivo | Que hace, en palabras simples |
|---|---|
| `provisioning/datasources/influxdb.yml` | **Conecta Grafana con InfluxDB**: le dice donde esta la base de datos, cual es el cajon (`casa_iot`) y con que llave entrar (el token de **solo lectura** que viene de `infra/.env`, no escrito aqui). |
| `provisioning/dashboards/dashboards.yml` | **Le dice a Grafana donde estan los tableros** para que los cargue solos (los revisa cada 30 segundos). |
| `dashboards/casa-iot-seguridad.json` | **El tablero "Casa IoT - Seguridad"** (es el que se abre por defecto en produccion): ordenes aceptadas, rechazos por motivo, intentos de repeticion (*replay*), firmas invalidas, lecturas en cuarentena, cambios de la alarma y las huellas de integridad. Ver `docs/seguridad-iot.md`. |
| `dashboards/casa-iot.json` | **El tablero "Casa IoT - Historial"**: se abre solo, se refresca cada 10 segundos y muestra los ultimos 30 minutos. |

## Que graficas trae el tablero

| Grafica | Que muestra |
|---|---|
| Potencia actual - Energia acumulada - Costo estimado | Lo que gasta la casa ahora, lo que ha gastado en total y cuanto costaria (a 950 pesos el kWh, como ejemplo). |
| Humo en cocina - Sensor de humo | La lectura del humo, con la linea de peligro (400 ppm). |
| Consumo por categoria | El consumo separado en base, luces, aires y enchufes. |
| Temperatura y Humedad por habitacion | Una linea por cada habitacion. |
| Aire acondicionado - potencia por equipo | Cuanto gasta cada aire. |
| Ultimos eventos del sistema | Una tabla con lo que ha pasado en la casa. |

## Como lo veo dentro de la pantalla del proyecto?
Quita el `#` de la linea `VITE_GRAFANA_URL` en tu archivo `.env` (hay un ejemplo en `.env.example`) y aparecera el tablero dentro de la pagina.

> Estos tableros no los he probado con un Grafana real (solo se valido su JSON). Grafana ya **no admite acceso anonimo**: para incrustarlo hay que activar `GRAFANA_ALLOW_EMBEDDING` y, desde otro sitio (Vercel), el navegador puede bloquear la cookie; por eso para seguridad se usa Grafana directamente (por tunel SSH si esta desplegado).
> Si una grafica no carga, puedes crearla desde la pagina de Grafana con los mismos datos.
