# `src/hooks/` - los ayudantes

**En una frase:** sencillos programas que hacen trabajos de apoyo para la pantalla ("hook" es el nombre que usa React para estos ayudantes).

| Archivo | Que hace, en palabras simples |
|---|---|
| `useLive.ts` | **Igual que leer de la memoria de la pantalla, pero que se calma al recorrer la casa.** Las graficas y el registro de eventos lo usan: mientras caminas en primera persona se actualizan cada 5 segundos en vez de cada segundo, porque redibujarlas compite con el 3D y se notaba como un tiron periodico. Fuera del recorrido se actualizan cada segundo, como siempre. |
| `useTelemetry.ts` | **El conector.** Al abrir la pagina conecta la fuente de datos con la memoria de la pantalla y precarga el historial. Reparte los mensajes (datos de la casa -> `useHouseStore`; sesion, confirmaciones y rechazos -> `useSessionStore`). Tambien trae la **lista de ordenes** que puede enviar la pantalla: encender luces, manejar el aire, enchufes, puertas, alarma, escenas, cambiar la hora y simular humo, calor, humedad o movimiento. |
| `useCan.ts` | **¿Puede esta sesion hacer esto?** Devuelve si el rol actual alcanza el minimo de una orden (para activar o desactivar botones) y si la pantalla es de solo lectura. Es solo comodidad: quien decide es Node-RED. |
| `useHistory.ts` | **El que pide el historial.** Cuando eliges 15 min, 1 h o 24 h, descarga esos datos (a traves de Node-RED) y los refresca cada 10 segundos. Avisa si esta cargando o si fallo. |
| `useAlarmSound.ts` | **La sirena.** Hace sonar una sirena de dos tonos y un aviso hablado cuando hay alarma de humo o de intrusion. Solo suena si activaste el boton **Sonido** (los navegadores no permiten sonidos hasta que el usuario hace un clic). |
