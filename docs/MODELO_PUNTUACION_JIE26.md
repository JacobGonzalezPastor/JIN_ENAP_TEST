# Modelo de puntuación JIE26 — medallero y clasificación

## 1. Resultado técnico
Se guarda en `resultadoDeportivo`: goles, sets, marcas, tiempos, puntaje de tiro, etc. No se suma directamente al puntaje ponderado del medallero.

## 2. Puntos de clasificación deportiva
Se guardan en `puntuacionClasificacion`; `puntuacionJIE26` se mantiene como alias compatible con documentos anteriores. Se utilizan para la clasificación interna de cada disciplina.

## 3. Puntaje ponderado informativo por medallas
- Oro: 1000 puntos.
- Plata: 100 puntos.
- Bronce: 1 punto.

Fórmula: `(oros × 1000) + (platas × 100) + (bronces × 1)`. El puntaje es informativo y no determina el puesto del medallero.

## 4. Orden oficial del medallero
La tabla ordena estrictamente por: (1) mayor número de oros, (2) mayor número de platas si hay empate en oros, (3) mayor número de bronces si hay empate en oros y platas, y (4) nombre de escuela para un empate total. El puntaje ponderado nunca desplaza a una escuela con más oros.

Las tarjetas y la tabla general muestran el puntaje ponderado calculado a partir de las cantidades de medallas. Las tablas específicas de cada deporte conservan sus puntos de clasificación.
