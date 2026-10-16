# Fase 7 — Esgrima por eliminación directa

## Objetivo

La planilla digital de Esgrima se implementa como un cuadro de eliminación directa de 4 participantes para la prueba configurada en `Competencias`.

## Flujo

1. Registrar los cuatro participantes y su escuela.
2. Registrar semifinal 1 (A vs B).
3. Registrar semifinal 2 (C vs D).
4. Los ganadores de semifinal pasan automáticamente a la Final.
5. Los perdedores de semifinal pasan automáticamente al Tercer Puesto.
6. Registrar Final y Tercer Puesto.
7. Cuando ambos estén completos, el sistema genera automáticamente:
   - 1.º = ganador de la Final.
   - 2.º = perdedor de la Final.
   - 3.º = ganador del Tercer Puesto.

## Puntuación y medallería

Mientras el cuadro está incompleto no se genera podio ni puntos de premiación para Esgrima. Cuando el cuadro está completo, `clasificacion`, `medallas` y `puntuacionJIE26` se derivan automáticamente.

Los valores de puntos individuales de trabajo (10/7/5) siguen siendo configurables y no se consideran el reglamento oficial JIE26 hasta que exista la tabla oficial.

## Compatibilidad

- `Competencias` no se modifica.
- Los resultados se almacenan en `Resultados` o en el modo de prueba local.
- Los resultados anteriores de otras disciplinas se conservan.
- El modelo usa `resultadoDeportivo.tipo = ESGRIMA_ELIMINACION_DIRECTA` y un objeto `cuadro` con semifinales, final y tercer puesto.
