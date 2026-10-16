# Fase 7 — Corrección de Esgrima

## Cambios
- Esgrima ahora registra la fase del encuentro: combate, eliminatoria, cuartos, semifinal, final o tercer puesto.
- Se pueden registrar posiciones finales A/B cuando correspondan.
- Si la fase es FINAL y existe ganador, el sistema deriva 1.º para el ganador y 2.º para el otro competidor.
- Un combate de eliminatoria/semifinal sin posición final no genera medalla ni puntos de premiación automáticamente.
- El Dashboard muestra el resultado del combate aunque todavía no exista podio: competidores, escuelas, toques acumulados, ganador y fase.
- El historial muestra el ganador del combate de Esgrima en lugar de "Resultado registrado · Podio pendiente" cuando la estructura A/B está disponible.
- Los datos de Esgrima continúan dentro del documento de `Resultados` como objetos anidados, estructura soportada por Firestore.

## Prueba recomendada
1. Mantener `Modo prueba local` activado.
2. Registrar un combate de Esgrima con A y B, escuelas y ganador.
3. Seleccionar `Combate` o `Semifinal`.
4. Verificar que Podios por Disciplina muestra ambos competidores, toques, ganador y fase, pero no asigna medalla.
5. Registrar una nueva competencia de Esgrima con fase `FINAL`, ganador y/o posiciones finales A/B.
6. Verificar que el ganador queda 1.º, el otro 2.º y que aparecen Oro/Plata y los puntos de trabajo configurados.
7. Revisar Tabla General y Puntos acumulados por competencia.
8. No borrar ni modificar `Competencias`.

## Nota
Los puntos de premiación individual `10/7/5` siguen siendo una escala de trabajo configurable. Deben sustituirse por la tabla oficial JIE26 cuando esta sea confirmada.
