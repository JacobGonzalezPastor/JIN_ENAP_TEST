# Corrección del modal de registro de resultados

## Síntoma
Al pulsar para registrar resultados, se mostraba el fondo oscurecido/desenfocado pero no el formulario.

## Causa corregida
El HTML deja `#admin-modal` vacío para impedir que aparezca el formulario antiguo. La función `shell()` intentaba encontrar un panel `.bg-slate-800` ya existente y retornaba sin crear uno si no lo encontraba. El modal quedaba visible, pero vacío.

## Solución
`shell()` ahora crea el contenedor del formulario dinámicamente cuando no existe y después monta el contenido. Se conserva el formulario digital y el código de Taekwondo de pruebas.

## Validación pendiente
- Abrir el formulario en navegador.
- Confirmar inicio de sesión de administrador.
- Probar selección de jornada y competencia.
- Registrar varios combates de Taekwondo con diferentes pesos.
- Confirmar guardado en entorno de pruebas.
