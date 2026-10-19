# Corrección de medallas de Atletismo en tabla general y tarjetas

- La tabla general y las tarjetas consumen el mismo cálculo de medallas.
- Si Atletismo tiene modalidad cerrada y el podio se puede calcular desde `resultadoDeportivo.participantes` o `clasificacion`, se derivan oro, plata y bronce por posición.
- Si el resultado ya trae `medallas` explícitas, se respetan para evitar contar dos veces.
- El orden del medallero sigue siendo oro, plata y bronce; el puntaje ponderado no altera el orden.
- Validar en navegador con resultados reales de Firebase: un resultado guardado con `modalidadFinalizada=true`, tres participantes de escuelas distintas y tiempos/marcas válidos.
