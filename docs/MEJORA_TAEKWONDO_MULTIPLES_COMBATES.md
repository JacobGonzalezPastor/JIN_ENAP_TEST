# V18 pruebas — Taekwondo con múltiples combates

## Cambios
- El formulario de Taekwondo permite agregar varios combates dentro del registro de una competencia/jornada.
- Cada combate registra rama, categoría de peso, competidores, escuelas, puntos por round, Gam-jeom, resultado oficial, ganador, forma de finalización y observaciones.
- Los datos se guardan en `resultadoDeportivo.combates[]`, conservando la estructura histórica de un documento de resultado por competencia.
- Se valida que cada combate tenga competidores, escuelas, peso y ganador seleccionados.
- La lista de pesos es una referencia de categorías senior de combate World Taekwondo: masculino hasta 54, -58, -63, -68, -74, -80, -87 y +87 kg; femenino hasta 46, -49, -53, -57, -62, -67, -73 y +73 kg. Las etiquetas descriptivas especifican los límites.

## Precaución reglamentaria
World Taekwondo permite competiciones individuales por categoría de peso y reconoce sistemas de eliminación directa y round robin. Las categorías incluidas son referencia senior, no una confirmación de las categorías oficiales de JIE26. Confirmar edad, pesaje y categorías con coordinación deportiva antes de uso oficial. Se deja una opción “Otra categoría” para pruebas especiales; debe validarse si se utiliza.

## Pruebas
1. Seleccionar Taekwondo y una competencia programada.
2. Añadir dos o tres combates, con distintos pesos y ramas.
3. Cambiar rama y comprobar que las opciones de peso se actualicen.
4. Eliminar un combate intermedio y comprobar que los restantes se mantengan correctamente identificados.
5. Intentar guardar con datos incompletos; debe impedirlo.
6. Guardar en modo prueba local y verificar `resultadoDeportivo.combates`.
7. Confirmar que otros deportes y la conexión Firebase sigan funcionando.
