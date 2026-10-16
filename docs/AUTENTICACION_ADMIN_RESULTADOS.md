# Autenticación de administrador para Resultados JIE26

## Qué cambió
El formulario de registro de resultados ya no inicia sesión anónima para escribir en Firebase.
Antes de abrir la planilla, el sistema solicita correo y contraseña mediante Firebase Authentication.

Después del inicio de sesión se valida el documento:

`Administradores/{uid}`

Debe existir y tener:

`activo: true`

## Configuración en Firebase
1. Firebase Console → Authentication → Sign-in method.
2. Habilitar Email/Password.
3. Crear el usuario administrador en Authentication.
4. Copiar el UID del usuario.
5. En Firestore, crear `Administradores/{UID}` con al menos:

```json
{
  "activo": true
}
```

Opcionalmente pueden agregarse campos como `nombre`, `correo`, `rol` o `dependencia`.

## Flujo
1. El usuario pulsa "Registrar resultado".
2. Aparece "Acceso de administrador".
3. Ingresa correo y contraseña.
4. Firebase Authentication valida las credenciales.
5. Firestore valida que `Administradores/{uid}.activo == true`.
6. Solo entonces aparece la planilla digital.
7. Al guardar en Firebase, el resultado conserva `registradoPor` y `actualizadoPor` con el UID autenticado.

El modo prueba local también queda detrás del acceso administrativo para evitar que cualquiera entre al módulo de registro.
