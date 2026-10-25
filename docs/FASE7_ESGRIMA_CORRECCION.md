# Fase 7 — Esgrima: cuadro de 16 tiradores y criterio FIE

## Alcance del ajuste
- Se conserva esta versión general de pruebas como base; el cambio se limita al formulario de Esgrima, su serialización y la derivación de podio.
- El formulario permite registrar 16 tiradores y combates de octavos (8), cuartos (4), semifinales (2), final y combate opcional por el tercer puesto.
- Cada combate registra tiradores A/B, toques por periodo, sanciones y ganador.
- El registro de combate por tercer puesto es opcional. Si se registra un ganador válido, queda en tercer puesto. Si no se registra y existen los perdedores de ambas semifinales, ambos reciben posición 3 (bronce), de acuerdo con el criterio FIE comentado para el proyecto.
- Se conserva la estructura anidada de resultados dentro del documento Resultados de Firestore.

## Prueba recomendada
1. Activar modo prueba local.
2. Registrar nombres y escuelas para los 16 tiradores.
3. Completar resultados de octavos, cuartos, semifinales y final.
4. Verificar oro y plata a partir de la final.
5. Sin registrar tercer puesto, comprobar que ambos perdedores de semifinal quedan en tercer lugar.
6. Registrar el tercer puesto y comprobar que solo el ganador de ese combate ocupa la posición 3.
7. Verificar que otros módulos y la conexión Firebase se mantienen intactos.

## Limitación
Los tiradores de cada combate se seleccionan manualmente desde la lista de 16. Esta versión registra todas las rondas, pero no avanza automáticamente los ganadores de una ronda a la siguiente.
