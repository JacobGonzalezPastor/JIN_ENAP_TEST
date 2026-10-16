# Estados del registro de Fútbol

- Partido finalizado (`FINAL`): terminó el encuentro; no significa por sí solo que la competencia haya definido medallería.
- Competencia finalizada (`COMPETENCIA_FINALIZADA`): registro de la definición oficial de la competencia.
- Descalificación del equipo local (`DQ_LOCAL`).
- Descalificación del equipo visitante (`DQ_VISITANTE`).
- Competencia suspendida (`SUSPENDIDO`).

La fase de competencia se selecciona por separado: Clasificación, Semifinal, Tercer puesto o Final que define medallería. Estado del encuentro y fase son conceptos distintos. Se conserva compatibilidad de lectura para el valor antiguo `DQ`.
