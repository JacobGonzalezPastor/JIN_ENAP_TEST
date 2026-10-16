# Fase 7 — Pentatlón: planilla digital dinámica

## Ajuste realizado

La planilla digital de Pentatlón ahora se determina a partir de la **competencia seleccionada en `Competencias`**. No se modifican los documentos ni registros de la colección `Competencias`.

La detección utiliza el código y, principalmente, la descripción/nombre de la competencia para identificar:

- `TIRO` — competencias cuya descripción contiene "Tiro".
- `PISTA` — "Paso de pista" o "Pista".
- `NATACION` — "Natación" / "Natacion".
- `GRANADA` — "Granada" / "Granadas".
- `CROSS` — "Cross Country" / "Campo a través".
- `RELEVOS` — "Relevos".
- `GENERAL` — cualquier competencia de Pentatlón que no coincida con las anteriores.

## Comportamiento

Cada prueba muestra solamente los campos que corresponden a la competencia seleccionada. Se conserva el modelo `Resultados` y se registran `tipoPrueba`, `resultado`, `puntosPrueba`, `posicion`, escuela, sexo y observaciones según corresponda.

Para Relevos se utiliza equipo/relevo, escuela, sexo, resultado/tiempo, puntos, posición y observaciones.

## Puntuación

No se calcula automáticamente una tabla de puntos de Pentatlón. Los puntos y la posición quedan como datos registrados/validados por el responsable hasta que exista una tabla oficial JIE26 confirmada.

## Motivo

La normativa CISM consultada describe el Pentatlón Militar como cinco disciplinas y señala además una competencia adicional de relevos en determinados campeonatos. Esto sirve como referencia de estructura, pero no sustituye las reglas específicas que adopte JIE26.
