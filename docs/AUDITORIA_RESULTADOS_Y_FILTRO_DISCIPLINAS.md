# V18 - Auditoría de resultados y filtro de disciplinas

## Fuente del filtro de disciplinas
El filtro usa primero `disciplinaCodigo` (código numérico canónico) y el catálogo `DISCIPLINAS` para mostrar el nombre. Si el código no está disponible, usa `disciplinaNombre`/`disciplina`; la descripción se deja como último respaldo. Los códigos colectivos corregidos son Fútbol=1, Baloncesto=2 y Voleibol=3.

## Cambios visuales
- Botón principal: “Auditar resultados”.
- Título del modal: “Descargar auditoría de resultados”.
- Se mantienen las descargas PDF por competencia y por jornada.
