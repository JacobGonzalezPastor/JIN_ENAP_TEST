# Borrar pruebas locales

Se agregó el botón **Borrar pruebas locales** en la sección **Tabla General**.

## Qué elimina

Únicamente elimina la clave `enap_resultados_deportivos` de `localStorage` del navegador actual.

## Qué NO elimina

- No elimina documentos de la colección `Resultados` de Firebase.
- No modifica la colección `Competencias`.
- No modifica escuelas, disciplinas, categorías ni programación.

## Uso

1. Abra **Tabla General**.
2. Revise el contador de pruebas locales.
3. Pulse **Borrar pruebas locales**.
4. Confirme la operación.
5. La Dashboard queda sin resultados locales y se pueden volver a registrar las pruebas desde cero.
