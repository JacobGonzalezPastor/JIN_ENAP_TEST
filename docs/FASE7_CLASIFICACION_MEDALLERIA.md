# FASE 7 — Clasificación, tablas por deporte y medallería JIE26

## Objetivo

Convertir los resultados registrados en `Resultados` en clasificaciones útiles para el Dashboard, sin modificar la colección maestra `Competencias`.

## 1. Deportes colectivos

Se procesan como tabla acumulada por disciplina y categoría:

- Fútbol: Pos, Escuela, PJ, PG, PE, PP, GF, GC, DG, Pts.
- Baloncesto: Pos, Escuela, PJ, PG, PP, PF, PC, Diferencia, Pts.
- Voleibol: Pos, Escuela, PJ, PG, PP, Sets +, Sets -, Diferencia, Pts.

Un partido individual **no genera medalla de plata para el perdedor**. El partido alimenta la tabla acumulada.

La regla actualmente implementada es configurable:

- Fútbol: victoria 3, empate 1, derrota 0.
- Baloncesto: victoria 3, empate 1, derrota 0.
- Voleibol: victoria 3, derrota 0.

Esta tabla es una configuración de trabajo y no se presenta como sustituto del reglamento institucional hasta que se confirme la tabla oficial JIE26.

## 2. Deportes individuales

El Dashboard utiliza la clasificación almacenada cuando existe. Para deportes medibles también puede derivarla:

- Tiro Deportivo: total descendente y X-centros como desempate.
- Natación: tiempo final ascendente para registros FINAL.
- Orientación Militar: tiempo definitivo ascendente para registros FINAL.
- Atletismo: tiempo ascendente en pista y marca descendente en campo, excluyendo DQ/DNF/DNS/NM.

Esgrima, Taekwondo y Tenis requieren cuadro/competencia acumulada para obtener un podio final; un solo combate/partido no se convierte automáticamente en oro/plata/bronce.

## 3. Historial

Para colectivos se muestra `Partido registrado · Ganador: ...` o `Partido registrado · Tabla acumulada en proceso`.

Para individuales se muestra el podio cuando la clasificación está disponible.

## 4. Integridad

Los resultados se deduplican por `competenciaCodigo`/`competenciaId` al construir las tablas, evitando doble conteo cuando una prueba local y el mismo resultado Firebase coexisten durante la transición.

## 5. Competencias

La colección `Competencias` existente no se modifica. Solo se consulta como catálogo maestro de programación.

## 6. Firebase

El cálculo se realiza en el Dashboard a partir de `Resultados`. Esto evita mantener tablas acumuladas duplicadas que podrían quedar desactualizadas. Si posteriormente se decide persistir resúmenes, las actualizaciones relacionadas deben realizarse de forma atómica; Firestore ofrece transacciones y escrituras por lotes para operaciones atómicas. Consultar la documentación oficial antes de persistir agregados.

## 7. Acumulado general por competencia finalizada

La Tabla General acumula los puntos de cada resultado registrado que no esté en estado BORRADOR, CANCELADO, SUSPENDIDO o ANULADO. La acumulación se calcula dinámicamente desde `Resultados`, por lo que no se mantiene un documento agregado separado que pueda quedar desactualizado.

### Escala de trabajo actual

- Fútbol: victoria 3, empate 1, derrota 0.
- Baloncesto: victoria 3, empate 1, derrota 0.
- Voleibol: victoria 3, derrota 0.
- Individuales: 1.º = 10, 2.º = 7, 3.º = 5.

Estos valores son de trabajo/configurables y no se presentan como la tabla oficial institucional hasta que sea confirmada.

El Dashboard muestra además un detalle de puntos por competencia finalizada, con una fila por competencia y una columna para cada escuela. La Tabla General se ordena primero por puntos acumulados y luego por medallas.
