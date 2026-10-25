# Ajuste de planilla de Natación

- Se registra la serie (1 a 4) por participante y se conserva en `resultadoDeportivo.participantes[].serie`.
- Se reemplaza Licencia por Grado (`grado`). Para compatibilidad con registros anteriores, al editar se lee `grado` y, si no existe, `licencia`.
- El carril y tiempo final permanecen como datos de cada participante.
- La clasificación se calcula con los tiempos finales válidos, separada por sexo. El menor tiempo obtiene oro, el siguiente plata y el tercero bronce; los empates conservan la misma posición.
- No se toma la posición digitada manualmente para calcular medallas.
