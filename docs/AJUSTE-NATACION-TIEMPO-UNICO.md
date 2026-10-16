# Ajuste de planilla de Natación — tiempo único

## Cambio
- Se retiraron de la tabla las columnas Entrada, Parcial 1, Parcial 2 y Parcial 3.
- Cada participante registra únicamente su `Tiempo final`, además de carril, licencia, nombre, escuela, sexo, posición y estado.
- El guardado de `resultadoDeportivo` conserva el tiempo final y los datos de clasificación.
- La función de edición recupera los datos existentes de Natación, incluidos prueba, estilo, fase y participantes, para corregirlos sin volver a digitarlos.

## Prueba recomendada
1. En el entorno de pruebas, abrir una competencia de Natación.
2. Verificar que solo aparezca el campo de tiempo final.
3. Registrar dos participantes con tiempos diferentes y guardar.
4. Abrir el resultado en Editar registrados.
5. Confirmar que se recuperan todos los participantes y sus tiempos; cambiar uno y guardar.
6. Confirmar que el resultado existente se actualizó y no se creó un duplicado.

Este paquete es exclusivamente de pruebas. No desplegar en producción hasta completar la validación funcional.
