# Ajuste del módulo de Tenis — 21/10/2026

## Cambios
- Se conserva el registro individual existente y se agregan campos condicionales para el segundo jugador de cada pareja en Dobles y Dobles mixtos.
- En dobles se exige registrar cuatro jugadores, dos por escuela, y no permite que ambas parejas representen la misma escuela.
- Se agrega la ronda: Cuadros / fase de cuadro, Semifinal y Final.
- El selector de ganador muestra las escuelas seleccionadas y el resultado almacena escuelaGanadora y ganadorLado; se conserva ganador con el valor de la escuela para el nuevo registro y los datos antiguos A/B se traducen al editar.
- Se conservan los campos anteriores jugadorA, jugadorB, sets y estadísticas para compatibilidad con el dashboard.
- El ranking de tenis para dobles agrupa resultados por escuela, y el reporte presenta ambos integrantes de cada pareja y la ronda.

## Validaciones realizadas
- `node --check js/resultados-form.js`
- `node --check js/app.js`

Estas comprobaciones validan sintaxis JavaScript. No sustituyen pruebas de interacción en navegador ni una prueba real de guardado/edición en Firebase.
