# Validación local y Firebase: timestamps y Orientación Militar

## Cambios
- `sanitizeForFirestore()` se aplica solo a los datos ordinarios. Los `serverTimestamp()` se agregan después, para evitar convertir el marcador de Firestore en `{ _methodName: "serverTimestamp" }`.
- Al editar un documento existente, se actualiza `actualizadoEn` y no se incluye `creadoEn` en el `updateDoc`, preservando la fecha de creación existente.
- En clasificaciones individuales, se conserva `participanteId` o `id`; para Orientación Militar se usa `idChip` y, si no existe, `DORSAL-{n}` como respaldo.
- `modalidadFinalizada` permanece `false` para disciplinas distintas de Tenis, salvo que en el futuro exista un control explícito para cerrar la modalidad completa. Finalizar una competencia no significa finalizar toda la modalidad.

## Prueba local
1. Extraer el ZIP en una carpeta nueva y abrir `index.html` con Live Server.
2. Activar el modo de prueba local.
3. Registrar Orientación Militar con dos participantes, tiempos definitivos distintos, por ejemplo `01:00` y `02:00`.
4. Confirmar que clasificación, puntuación y medallas respetan los puestos y que cada participante tiene un identificador no nulo (`idChip` o `DORSAL-n`).
5. Enviar el objeto de localStorage para revisión.

## Prueba Firebase
1. Usar una competencia claramente identificada como prueba y una cuenta administradora autorizada.
2. Guardar una sola vez. No borrar la colección `Resultados`.
3. Abrir el documento creado en Firestore. `creadoEn` y `actualizadoEn` deben mostrarse como valores timestamp/fecha, no como mapas con `_methodName`.
4. Editar el mismo documento y confirmar que `creadoEn` no cambia y `actualizadoEn` sí se actualiza.
5. Verificar `resultadoDeportivo`, `clasificacion`, `puntuacionClasificacion`, `puntuacionJIE26`, `medallas` y `puntosGeneralesMedallas`.

## Limitación de validación
La revisión estática del código no sustituye una prueba real en el navegador contra el proyecto Firebase. No se ha ejecutado una escritura real desde este entorno.
