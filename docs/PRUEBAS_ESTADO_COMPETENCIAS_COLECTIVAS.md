# Pruebas V18 — Estado de competencias colectivas

## Objetivo
Distinguir entre el resultado de un partido y la definición final de la competencia. Esta primera implementación aplica a Fútbol, Baloncesto y Voleibol, sin cambiar la tabla de puntos acumulados ni la lógica especial de Esgrima.

## Cambios
- En el formulario de resultados aparece el selector **Fase de la competencia** únicamente para Fútbol, Baloncesto y Voleibol.
- Fases disponibles: `CLASIFICACION`, `SEMIFINAL`, `TERCER_PUESTO` y `FINAL`.
- La fase se guarda en el documento de resultado como `faseCompetencia`.
- Si se registra un resultado colectivo con una fase distinta de `FINAL`, la programación muestra **Competencia en definición** y explica que la medallería sigue pendiente.
- Si se registra con fase `FINAL`, la programación muestra **Finalizada** y una nota de fase definitoria.
- Los partidos siguen alimentando la tabla acumulada; esta mejora no genera medallas por partido.

## Matriz de pruebas manuales
1. Abrir la versión de pruebas y entrar a **Registrar resultados**.
2. Seleccionar Fútbol y una competencia programada. Confirmar que aparece el selector de fase.
3. Elegir `SEMIFINAL`, registrar un marcador de prueba y guardar en **Modo prueba local**.
4. Abrir Programación. Confirmar que el encuentro muestre **Competencia en definición** y el aviso de medallería pendiente.
5. Revisar la tabla de Fútbol: el partido debe reflejarse en la tabla acumulada según la lógica existente.
6. Repetir para Baloncesto y Voleibol.
7. Registrar una prueba de Fútbol con fase `FINAL`. Confirmar que se muestre **Finalizada** y el aviso de fase definitoria.
8. Cambiar a una disciplina individual (por ejemplo Natación). Confirmar que el selector de fase colectiva se oculte y que el formulario siga funcionando.
9. Borrar resultados locales y confirmar que desaparecen las pruebas del dashboard.

## Datos recomendados para probar
Usar el modo local. No emplear resultados oficiales reales en estas pruebas.
- Fútbol: ENAP 2–1 EMAVI, fase SEMIFINAL.
- Baloncesto: ENAP 70–62 ESMIC, fase CLASIFICACION.
- Voleibol: ENAP gana 3–1 a ECSAN, fase SEMIFINAL.
- Fútbol: ENAP 2–1 ESMIC, fase FINAL.

## Alcance y advertencia
Esta versión prueba el **estado informativo**. Los partidos colectivos no reciben medallas automáticamente; la asignación definitiva de oro/plata/bronce requiere definir cómo se relacionan la final y el partido por el tercer puesto con la categoría o torneo. No desplegar esta versión de pruebas como producción sin validar los casos manuales.


## Corrección de filtro de disciplina (V18 prueba corregida)
Se ajustó la selección de competencias para que, en caso de discrepancia entre el nombre/código de disciplina y la descripción, se use como respaldo el prefijo de la descripción para Fútbol, Baloncesto y Voleibol. Esto evita que las competencias colectivas aparezcan bajo otra disciplina si los metadatos están cruzados en Firestore. La corrección de interfaz no modifica automáticamente los documentos existentes de Firestore.


## Medalla de bronce en deportes colectivos
- En Fútbol, Baloncesto y Voleibol, al registrar la fase `TERCER_PUESTO`, el ganador del encuentro recibe una clasificación de posición 3 y se genera la medalla `BRONCE`.
- Al registrar la fase `FINAL`, el ganador recibe `ORO` y el otro equipo `PLATA`.
- Los encuentros de clasificación y semifinales no generan medallas.
- La medalla de bronce se puede definir antes de la final, pero el estado general de la competencia permanece en definición hasta que se registre la fase FINAL.
- Prueba recomendada: registrar un encuentro de tercer puesto y comprobar que solo el ganador suma una medalla de bronce.


## Corrección del filtro en Programación
La programación ahora determina Fútbol, Baloncesto y Voleibol usando primero el inicio de la descripción/nombre de la competencia cuando está disponible. Así, una competencia con descripción `Baloncesto ESMIC vs EMAVI` no se mostrará bajo el filtro Fútbol aunque sus metadatos de disciplina estén cruzados. Esta regla también se refleja en el nombre de disciplina mostrado en la tarjeta. No corrige los documentos de Firestore; solo evita el cruce en la interfaz.
