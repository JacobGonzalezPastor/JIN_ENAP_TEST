# Cambios: total de medallas y podio de Tenis

## Tabla general y tarjetas
- La columna que antes mostraba Puntaje Total ahora muestra Total de medallas.
- Cada tarjeta de escuela también muestra Total de medallas.
- El total es oro + plata + bronce.
- El orden de las escuelas sigue siendo oro, luego plata, luego bronce. El puntaje ponderado oro=1000, plata=100, bronce=1 no modifica la posición.

## Tenis
- El podio continúa bloqueado hasta cerrar la categoría/modalidad, para no asignar medallas con el round-robin incompleto.
- La detección de cierre reconoce la marca tanto en el documento como dentro de resultadoDeportivo.
- El cierre aplica a la categoría/modalidad correspondiente; no debe esperar a que finalicen otras categorías de Tenis.
- Si aún no hay podio, la interfaz explica que deben registrarse los partidos de esa categoría/modalidad y marcar «Cerrar modalidad y calcular podio» en el último partido.

## Validación
- Revisar visualmente en navegador con datos de Firebase y probar un grupo de Tenis con varios partidos, cerrando la modalidad en el último registro.
