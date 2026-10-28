# Versión FIJA de Node-RED (nunca :latest: un tag que se mueve cambia el comportamiento sin avisar).
# 5.0.8 sobre Node 24 (Node-RED 5 solo publica imágenes con Node 24: no existe «-22»). El flujo se probó con Node-RED 5 y Node 24. Comprueba que el tag existe en tu registro:
#     docker pull nodered/node-red:5.0.8-24
# Para producción, fija además el resumen (digest):  FROM nodered/node-red:5.0.8-24@sha256:<resumen>
ARG NODERED_TAG=5.0.8-24
FROM nodered/node-red:${NODERED_TAG}

# Nodo de InfluxDB 2.x (versión exacta con la que se probó el flujo)
RUN npm install --no-audit --no-fund --omit=dev node-red-contrib-influxdb@0.7.0
