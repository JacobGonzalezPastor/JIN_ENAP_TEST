# Estado de registro para todas las competencias

El selector común se muestra para todas las disciplinas y cambia sus opciones según el tipo de competencia.

## Colectivas (Fútbol, Baloncesto, Voleibol)
- `PARTIDO_FINALIZADO` — Partido finalizado.
- `COMPETENCIA_FINALIZADA` — Competencia finalizada.
- `DQ_LOCAL` — Descalificación del equipo local.
- `DQ_VISITANTE` — Descalificación del equipo visitante.
- `SUSPENDIDO` — Competencia suspendida.

## Individuales
- `COMPETENCIA_FINALIZADA` — Competencia finalizada.
- `DQ_PARTICIPANTE` — Descalificación del participante.
- `SUSPENDIDO` — Competencia suspendida.

El estado se guarda en `estadoCompetencia` y `estadoCompetenciaNombre`, independiente del estado técnico del registro (`estado`, por ejemplo REGISTRADO/BORRADOR) y de la fase (`faseCompetencia`). En deportes colectivos, el estado del encuentro no asigna medallas por sí solo: se usa junto con la fase y las reglas de podio.


## Descalificación individual
Al seleccionar `DQ_PARTICIPANTE`, el formulario solicita obligatoriamente el nombre completo del participante y su escuela (ENAP, EMAVI, ESMIC o ECSAN). Los datos se guardan en `participanteDescalificado` dentro del documento de resultado. No se permite guardar la descalificación si falta alguno de esos datos.
