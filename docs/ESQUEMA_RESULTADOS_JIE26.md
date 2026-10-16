# Esquema de Resultados JIE26 — v1

## Principio

`Competencias` es la fuente maestra de programación. `Resultados` contiene el resultado real de una competencia ejecutada. La Dashboard crea los documentos de `Resultados` automáticamente; no se deben crear manualmente todos los campos en Firebase.

## Documento `Resultados/{id}`

Campos comunes:

- `competenciaId`
- `competenciaCodigo`
- `disciplinaCodigo`
- `disciplinaNombre`
- `categoriaCodigo`
- `modalidadCodigo`
- `tipoResultado`
- `fecha`
- `hora`
- `jornadaCodigo`
- `escenarioCodigo`
- `estado`
- `resultadoDeportivo`
- `clasificacion`
- `puntuacionJIE26`
- `medallas`
- `observaciones`
- `responsable`
- `registradoPor`
- `registradoEn`
- `actualizadoPor`
- `actualizadoEn`
- `esquemaVersion`

## Disciplinas

### Colectivos

- Fútbol: tiempos, tiempo extra, penaltis, ganador, incidencias.
- Baloncesto: periodos, prórrogas, ganador, observaciones.
- Voleibol: sets, sets ganados, ganador.

### Individuales

- Esgrima: arma, competidores, periodos, toques y sanciones.
- Taekwondo: competidores, sexo, peso, rounds, Gam-Jeom, resultado y forma de finalización.
- Tenis: modalidad, jugadores, sets y estadísticas básicas.
- Tiro Deportivo: modalidad, arma, S1-S6, total, X-centros y observaciones.
- Pentatlón: pruebas de tiro, paso de pista, natación utilitaria, lanzamiento de granada, carrera y relevos. Puntuación pendiente de reglamento JIE26 confirmado.
- Orientación Militar: dorsal, grado, chip, salida/llegada, tiempo bruto, errores, penalización, tiempo definitivo y estado.
- Atletismo: pista/campo, prueba, fase, serie, cronometraje, viento, marca/tiempo, hasta seis intentos y estado.
- Natación: prueba, estilo, fase, carril, licencia, tiempos, parciales, posición y estado.

## Reglas de cálculo

- La clasificación de Tiro Deportivo se ordena por `total` descendente y luego `xCentros` descendente.
- Las medallas se generan solamente cuando existe una posición 1, 2 o 3 válida.
- No se inventa una tabla de puntos institucional JIE26. `puntuacionJIE26` queda preparada para la tabla oficial que se confirme.
- Los partidos de Fútbol, Baloncesto y Voleibol no generan automáticamente medallas; alimentan sus tablas de posiciones.

## Compatibilidad

La fase conserva las colecciones antiguas `resultados_deportivos` y `match_results_v3` sin borrarlas ni migrarlas. La nueva Dashboard lee exclusivamente `Resultados` para el módulo nuevo.
