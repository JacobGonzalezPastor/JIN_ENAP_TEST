# Mejora: selección de jornada en el formulario de resultados

## Qué cambia
- Se agrega un selector de jornada después de seleccionar la disciplina.
- Las jornadas se obtienen de las competencias cargadas desde Firestore (`Competencias`) o del catálogo local de respaldo.
- Al elegir una jornada, el selector de competencia muestra únicamente las competencias asociadas a esa jornada y disciplina.
- Se conserva el campo de jornada asociada como dato de solo lectura para confirmar la selección.
- Al guardar, el resultado incluye `jornadaCodigo` y `jornadaNombre`; no se cambia la conexión Firebase ni la colección `Resultados`.
- Las competencias sin jornada se agrupan bajo “Sin jornada asignada” para que puedan detectarse y probarse sin perderlas.

## Pruebas recomendadas
1. Abrir el formulario en modo prueba local.
2. Seleccionar una disciplina con competencias en varias jornadas.
3. Elegir una jornada y confirmar que solo aparezcan sus competencias.
4. Seleccionar una competencia y verificar fecha, hora, escenario y jornada asociada.
5. Guardar un resultado local y comprobar que conserva `jornadaCodigo` y `jornadaNombre`.
6. Repetir con otra jornada y confirmar que no se conserva accidentalmente la competencia anterior.
7. Probar una disciplina sin competencias o con competencias sin jornada.
8. Solo después de validar, desmarcar “Modo prueba local” para hacer una prueba controlada con Firebase.

## Alcance
Este cambio afecta el formulario de registro. No modifica resultados existentes, reglas de Firestore, cálculo de medallas ni puntos generales.
