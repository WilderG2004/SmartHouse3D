# `src/lib/` - herramientas sencillas

**En una frase:** funciones cortas que se usan en muchos lugares, como una caja de herramientas.

| Archivo | Que hace, en palabras simples |
|---|---|
| `format.ts` | **Escribe bonito** los numeros y las horas: "1.234" en vez de "1234", "14:30:05" en vez de un numero largo de milisegundos. Usa el formato de Colombia. Los "formateadores" se crean una sola vez y se reutilizan (crearlos en cada llamada era lento y causaba tirones). |
| `climate.ts` | **Cosas de temperatura y luz del dia**: da el color segun la temperatura (azul si hace frio, rojo si hace calor; hay una version clara para puntos y otra oscura para texto), la etiqueta de confort (Fresco, Confort, Calido, Caluroso), cuanta luz de dia hay a cada hora y escribe la hora. |
| `icons.tsx` | **Relaciona cada enchufe con su dibujito**: TV, computador, cafetera, lavadora, ventilador y cargador. |
