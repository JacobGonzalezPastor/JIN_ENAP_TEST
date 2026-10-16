# Edición de resultados y control de pendientes — versión de pruebas

- Las competencias que ya tienen un resultado guardado en la fuente activa (modo local o Firebase) se excluyen del selector de pendientes.
- El botón **Editar registrados** abre el listado de resultados de la fuente activa.
- Al editar un registro local se reemplaza por ID en `localStorage`; al editar un registro Firebase se utiliza `updateDoc` sobre el documento existente. No se crea un documento nuevo para la corrección.
- Taekwondo conserva todos los combates dentro del mismo resultado y restaura rama, peso, participantes, escuelas, puntajes por round, Gam-jeom, resultado, ganador y observaciones.
- El modo local sigue siendo el predeterminado y no escribe en Firebase. Para editar resultados Firebase, desmarque Modo prueba local antes de abrir el listado.

## Pruebas recomendadas
1. Registrar un resultado local para una competencia y verificar que desaparezca de pendientes.
2. Abrir **Editar registrados**, corregir un dato y guardar; verificar que el listado siga mostrando un único resultado para esa competencia.
3. En Taekwondo, registrar dos o más combates de pesos diferentes; editar y confirmar que todos permanecen.
4. Verificar por separado el modo Firebase con un usuario administrador activo.

Esta compilación modifica exclusivamente el paquete de pruebas. No se realizaron cambios al ZIP de producción ni se ejecutaron escrituras en Firebase durante la generación.
