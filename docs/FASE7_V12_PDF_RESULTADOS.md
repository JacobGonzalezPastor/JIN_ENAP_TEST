# Fase 7 v12 — PDF de resultados por competencia

- La descarga por competencia ahora genera PDF en formato A4 horizontal.
- El reporte incluye competencia, disciplina, categoría, jornada, escenario, estado, resultados, responsable y Resultados cargados por.
- El correo electrónico del administrador no se muestra en el reporte.
- Los nuevos documentos de `Resultados` guardan `registradoPorNombre`.
- El nombre se obtiene del documento `Administradores/{uid}` usando, en orden: `nombre`, `nombreCompleto`, `nombres`, `displayName`.
- Si el documento no tiene nombre, se utiliza `Administrador` como respaldo.
- Se mantiene `registradoPor` como UID para auditoría técnica, pero no se expone en el PDF.

El PDF se genera en el navegador mediante jsPDF y jsPDF-AutoTable.
