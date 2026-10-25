# Unificación de cambios sobre JIN-ENAP-Dashboard Pruebas-backup3

Base: `JIN-ENAP-Dashboard Pruebas-backup3` (versión más sólida). Solo se incorporaron los cambios específicos de cuatro deportes; el resto de módulos quedó byte a byte igual a la base.

## Cambios incorporados

### Baloncesto (origen: ...Baloncesto-Final)
- Formulario: se registra únicamente el **marcador final** de cada equipo (sin periodos ni prórrogas). El ganador se deduce del marcador; un empate no define ganador.
- Puntos de clasificación: victoria = 2, derrota = 1, sin empate (`TABLA_COLECTIVOS`).
- `teamScore` usa el marcador final y mantiene respaldo para registros antiguos guardados por periodos.
- **Corrección respecto al ZIP original:** allí la asignación de puntos al perdedor se había aplicado por error al bloque de **Fútbol** (los empates de Fútbol dejaban de sumar 1 punto) y el bloque de Baloncesto no la recibía. Aquí se aplica en Baloncesto y Fútbol queda idéntico a la base.

### Fútbol (origen: ...Futbol-Dos-Columnas-Descarga)
- Planilla en dos columnas (Local / Visitante) con marcador por tiempos, tiempo extra y penaltis.
- Nuevos campos de tarjetas amarillas y rojas por equipo (`tarjetas.amarillas|rojas.local|visitante`), con edición de registros.
- Estilos `.football-*` añadidos al final de `css/app.css`.

### Tiro Deportivo (origen: ...Tiro-Deportivo-Modalidad-Dinamica-CORREGIDO)
- Múltiples planillas de hasta 12 participantes, cada una con modalidad, arma, distancia y posición.
- Columnas de precisión y de tiro rápido según la modalidad; total calculado automáticamente.
- Se guarda `planillas[]` y además `participantes[]` plano para que la clasificación existente siga funcionando. Edición compatible con registros antiguos (una sola planilla).

### Taekwondo Poomsae Side-by-Side (origen: ...Taekwondo-Poomsae-SideBySide-PRUEBAS-CORREGIDO)
- Si la competencia es Poomsae, el formulario muestra planillas Side-by-Side (Poomsae ejecutado, competidores A/B, escuelas y puntaje total; ganador por puntaje o manual). Se pueden agregar/eliminar planillas, guardar y editar.
- Si la competencia es de combate, el formulario es exactamente el de la base (varios combates, categorías de peso y cierre de medallería).
- Validación: en Poomsae no se exige registrar combates (en el ZIP original esa validación habría bloqueado el guardado).

### Natación (solicitado después de la primera unificación)
- Cada participante tiene **Serie** (1 a 4); la columna Licencia pasó a **Grado** (al editar registros antiguos se lee `grado` o, si no existe, `licencia`).
- El **podio se calcula con el mejor tiempo**, por separado para Masculino y Femenino y entre todas las series. Los empates comparten posición. La posición se llena sola y ya no se digita.
- **Estado**: solo `FINAL` y `DESCALIFICADO`. Los descalificados no entran al podio. Los registros antiguos con DQ/DNF/DNS se muestran como DESCALIFICADO al editarlos.
- Para estado FINAL el tiempo es obligatorio (formato `MM:SS.mmm`).
- Las medallas se guardan al registrar (clasificación y medallas por sexo) y `app.js` mantiene un respaldo con la misma regla para registros sin clasificación guardada.

### Atletismo: formato de marca y podio (solicitado después)
- Cada participante tiene un selector **Formato**: `SS:MMM` (ej. 10:250), `MM:SS:MMM` (ej. 1:05:200) o `MTS` (metros, ej. 7.85). También se aceptan `.` o `,` como último separador. Las milésimas deben ser 3 dígitos y los segundos no pueden pasar de 59. Al cambiar el formato se limpia la marca y cambia el ejemplo.
- **Podio automático:** en los formatos de tiempo gana el menor tiempo (se comparan entre sí SS:MMM y MM:SS:MMM); en MTS gana la mayor distancia. Los empates comparten posición. Los estados DQ, DNF, DNS y NM no clasifican.
- Se guarda `formatoMarca` y `posicion` por participante, y la clasificación y las medallas quedan registradas al guardar (antes Atletismo no guardaba medallas).
- No se pueden mezclar tiempos y metros en una misma planilla, y las marcas deben cumplir el formato elegido.
- La edición de un resultado de Atletismo ahora recupera todos los campos. Los registros antiguos sin formato se interpretan según la marca y la modalidad (CAMPO → metros); el panel conserva el cálculo original para ellos.
- El podio es **único por resultado** (no se separa por sexo), como ya funcionaba antes.

## Diferencias encontradas y NO incorporadas
Ninguna: todos los cambios detectados en los ZIP recibidos fueron revisados e incorporados o corregidos.

## Pendiente conocido
La medallería y las tarjetas del panel para Poomsae no se calculan: el ZIP de Taekwondo solo modificó el formulario. Hoy un resultado Poomsae se guarda y se edita, pero el panel mostrará el aviso de combates.
