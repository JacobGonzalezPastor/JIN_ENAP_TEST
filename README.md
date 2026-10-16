# JIN ENAP 2026 — Pruebas

Versión de pruebas para validar el Dashboard Oficial de Juegos Interescuelas ENAP 2026 antes de producción.

## Modo prueba local
- Permite guardar resultados en `localStorage` bajo `enap_resultados_deportivos`.
- Incluye el botón **Borrar pruebas locales**.
- El mismo formulario permite desactivar el modo local para escribir en Firebase.

## Exportación
- Incluye **Descargar Resultados** por competencia y por jornada.
- Genera reportes PDF con resultados y **Resultados cargados por**.
- Los PDF incluyen el logo de Juegos Interescuelas arriba a la izquierda, logo ENAP arriba a la derecha y la marca de agua institucional del dashboard.

## Producción
Para el despliegue definitivo utilice el ZIP de **Producción**, que no contiene las funciones de pruebas locales.


## v15 - Correccion de guardado
- Validacion de sesion y administrador activo justo antes de guardar.
- `registradoPorNombre` se obtiene de `Administradores/{uid}.nombre`.
- Limpieza de valores `undefined` antes de enviar el documento a Firestore.
- Mensajes de error diferenciados para permisos, conectividad y datos no serializables.
- El dashboard puede leer `Resultados` y `Competencias` con reglas publicas sin depender de autenticacion anonima.


CORRECCIÓN v16: los resultados guardados en localStorage (modo prueba) ahora se integran inmediatamente al dashboard, tabla general, historial, programación y descarga de resultados. El botón Borrar pruebas locales actualiza la interfaz al eliminar los datos locales.


Ajuste visual v18: barra superior más amplia y espaciada; se retiró el indicador de conexión Firebase de la interfaz y el texto descriptivo de la Tabla General.

## Prueba de estados de competencias colectivas
Esta compilación agrega un selector de fase para Fútbol, Baloncesto y Voleibol. Los resultados de clasificación, semifinal y tercer puesto quedan identificados como **Competencia en definición**; la fase `FINAL` se muestra como finalizada. Consultar `docs/PRUEBAS_ESTADO_COMPETENCIAS_COLECTIVAS.md` para la matriz de pruebas.


### Corrección visual del modal de resultados
Se agregó una regla CSS crítica para que `#admin-modal.hidden` permanezca oculto desde el primer render, incluso antes de que cargue Tailwind o `resultados-form.js`. Esto evita que aparezca por unos segundos el formulario heredado de las primeras fases.


Ajuste visual: título de la topbar actualizado a “XXX JUEGOS INTERESCUELAS 2026”.

Ajuste visual: en la tarjeta de EMAVI, el rótulo institucional cambia a “FUERZA AEROESPACIAL COLOMBIANA”.

Ajuste de tabla general: EMAVI ahora se identifica como “Fuerza Aeroespacial Colombiana”.


Modelo de puntuación actualizado: la tabla general acumula puntos por medallas (oro 10, plata 7, bronce 5), mientras los puntos de clasificación deportiva permanecen separados.


## Edición de resultados (pruebas)
Consulte `docs/EDICION_RESULTADOS_SIN_DUPLICADOS.md`. La edición usa el ID del registro existente para evitar duplicados; el modo local permanece predeterminado.


## Ajuste de Natación (tiempo único)
La planilla registra únicamente el campo **Tiempo final** por participante; se quitaron entrada y parciales. La edición rehidrata prueba, estilo, fase y participantes. Ver `docs/AJUSTE-NATACION-TIEMPO-UNICO.md`. Este paquete es solo de pruebas.
