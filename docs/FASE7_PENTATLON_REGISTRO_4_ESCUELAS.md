# Fase 7 — Pentatlón: registro de las 4 escuelas por competencia

Se ajustó la planilla de Pentatlón para que una competencia pueda registrar en un solo resultado a las cuatro escuelas participantes: ENAP, EMAVI, ESMIC y ECSAN.

## Comportamiento

- La colección `Competencias` sigue siendo la fuente maestra y no se modifica.
- Al seleccionar una competencia de Pentatlón, la planilla presenta cuatro filas.
- Cada fila corresponde a una escuela participante.
- Para pruebas individuales se registra el participante; para relevos se registra el equipo/relevo.
- Se guardan los cuatro registros dentro de `resultadoDeportivo.participantes` en un único documento de `Resultados`.
- Cada fila permite resultado, puntos, posición y observaciones.
- No se aplica una fórmula de puntuación JIE26 no confirmada.
- Se conserva el modo de prueba local.

## Modelo resumido

```js
resultadoDeportivo: {
  tipo: 'PENTATLON',
  tipoPrueba: 'TIRO|PISTA|NATACION|GRANADA|CROSS|RELEVOS',
  pruebaFase: '...',
  modalidadRegistro: 'CUATRO_ESCUELAS',
  escuelasParticipantes: ['ENAP','EMAVI','ESMIC','ECSAN'],
  participantes: [
    { nombre, escuelaCodigo, sexo, resultado, puntosPrueba, posicion, observaciones }
  ]
}
```

Esto evita crear cuatro resultados separados para una misma competencia y permite que el dashboard clasifique posteriormente a las cuatro escuelas a partir del mismo resultado.
