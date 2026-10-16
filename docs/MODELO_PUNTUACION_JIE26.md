# Modelo de puntuación JIE26 — separación de conceptos

## 1. Resultado técnico
Se guarda en `resultadoDeportivo`: goles, sets, marcas, tiempos, puntaje de tiro, etc. No se suma directamente al puntaje general de la escuela.

## 2. Puntos de clasificación deportiva
Se guardan en `puntuacionClasificacion`; `puntuacionJIE26` se mantiene como alias compatible con documentos anteriores. Se utilizan para la clasificación interna de cada disciplina: por ejemplo, puntos por victoria/empate/derrota en deportes colectivos y puntos por posición en la escala de clasificación individual configurada.

## 3. Puntos generales por medallas
Se guardan en `puntosGeneralesMedallas` y se usan para ordenar la tabla general:
- Oro: 10 puntos.
- Plata: 7 puntos.
- Bronce: 5 puntos.

Los documentos históricos que no tengan `puntosGeneralesMedallas` calculan estos puntos a partir del array `medallas`. Así, un resultado técnico de tiro de 250 no agrega 250 puntos generales. Solo se suman los puntos de las medallas oficiales registradas.

## 4. Tabla general
Las tarjetas de escuela y la Tabla General de Premiación y Puntos muestran los puntos generales por medallas. Las tablas específicas de cada deporte conservan sus puntos de clasificación.
