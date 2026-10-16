# Fase 7 v14 — Nombre del administrador en resultados cargados

El reporte de resultados por competencia muestra únicamente **Resultados cargados por**.

Para resultados que ya tienen `registradoPorNombre`, se usa ese valor. Para resultados anteriores o sin ese campo, el sistema consulta `Administradores/{registradoPor}` y toma el campo `nombre` (con alternativas `nombreCompleto`, `nombres` o `displayName`).

No se muestra el correo electrónico del administrador en el reporte ni en el PDF.
