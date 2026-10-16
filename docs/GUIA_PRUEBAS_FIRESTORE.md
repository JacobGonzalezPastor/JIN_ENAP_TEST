# Guía de pruebas de Firestore — JIN ENAP 2026

## Archivos incluidos

- `index.html`: dashboard principal existente.
- `js/app.js`: lógica de la dashboard.
- `js/resultados-form.js`: formulario de resultados.
- `js/firebase-config.js`: configuración del proyecto Firebase.
- `firestore.rules`: reglas propuestas para publicar en Firebase.
- `pruebas-firestore.html`: página de diagnóstico de lectura/escritura.

## Preparación

1. Verifique que `js/firebase-config.js` apunte al proyecto Firebase correcto.
2. Publique `firestore.rules` desde Firebase Console.
3. Cree manualmente en Firestore el documento:

   `Administradores/{UID_DEL_USUARIO}`

   Con los campos:

   ```json
   {
     "activo": true,
     "rol": "admin"
   }
   ```

4. Abra la dashboard mediante un servidor local. No se recomienda abrirla directamente con `file://`.

## Pruebas esperadas

- Lectura de `Competencias`: permitida.
- Lectura de `match_results_v3`: permitida.
- Escritura de prueba sin administrador: denegada.
- Escritura con un UID que tenga `Administradores/{UID}` con `activo: true`: permitida en las rutas autorizadas.

> La dashboard mantiene el modo local. Si se activa el guardado local, no se escriben datos en Firestore.
