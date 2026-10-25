# Corrección del módulo de registro

- El modal de registro muestra inmediatamente la pantalla de acceso.
- La inicialización de Firebase ya no espera la lectura de `Competencias`; esa consulta queda diferida hasta que se requiera cargar el formulario autenticado.
- Se conserva la autenticación administrativa y la conexión Firebase existentes.
- No se modificaron el módulo de esgrima ni los demás módulos funcionales.

Validación realizada: integridad del ZIP y sintaxis JavaScript del módulo. No equivale a una prueba en navegador ni a una validación de conectividad/credenciales Firebase.
