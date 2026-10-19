# Diagnóstico de guardado de resultados — JIE26

## Hallazgos y ajustes

1. El formulario iniciaba con `Modo prueba local` marcado. En ese estado, el resultado se escribe en `localStorage` y no en Firebase, por lo que no se comparte entre equipos ni aparece en la colección `Resultados`. Ahora inicia desmarcado para que el flujo normal sea Firebase; el modo local se activa manualmente cuando se quiera probar sin nube.
2. En Esgrima, el actualizador del cuadro agregaba listeners a los participantes dentro de la propia función de actualización. Cada cambio acumulaba listeners nuevos. Los listeners se registran ahora una sola vez.
3. Se agregaron validaciones explícitas al cuadro de Esgrima: cuatro participantes completos y únicos, semifinales, final y tercer puesto con participantes y ganador válidos.
4. Se conserva la escritura a `Resultados` con validación de sesión administrativa y el modelo compartido de las 11 disciplinas.

## Pruebas pendientes en el entorno real

- Ingresar con un usuario Firebase Authentication que tenga `Administradores/{UID}.activo = true`.
- Confirmar que `Modo prueba local` esté desmarcado para guardar en Firestore.
- Registrar una competencia de Esgrima y comprobar la creación del documento en `Resultados`.
- Repetir al menos un caso de cada disciplina y confirmar que el resultado aparece en el historial y auditoría.
- Si Firebase rechaza la escritura, revisar el mensaje mostrado en el formulario y la consola del navegador; la prueba de sintaxis por sí sola no confirma permisos o conectividad reales.
