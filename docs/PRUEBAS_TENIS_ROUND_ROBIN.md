# Pruebas de Tenis – Round Robin (versión de trabajo)

## Alcance
Esta versión de pruebas incorpora una clasificación acumulada para Tenis en sencillos, dobles y dobles mixtos. Cada registro corresponde a un partido. No se otorgan medallas por partido individual; el podio y los puntos generales solo se calculan cuando se marca **“Cerrar modalidad y calcular podio”** en el registro del último partido de esa categoría/modalidad.

## Criterios provisionales de clasificación
- Mayor número de partidos ganados.
- Para empate entre dos participantes, resultado del enfrentamiento directo.
- Para empate de tres o más participantes: porcentaje de partidos ganados, porcentaje de sets ganados y porcentaje de games ganados.
- Si el empate persiste, el dashboard no puede inferir un sorteo o decisión arbitral: verificar y resolver manualmente antes de dar por oficiales las posiciones.
- Medallería de prueba: oro 10 puntos generales, plata 7 y bronce 5.

## Importante
La ITF publica las Reglas del Tenis y reglamentos de competición, pero no establece por sí sola el formato específico de los Juegos Interescuelas ENAP. Se toma como referencia técnica el reglamento de desempates Round Robin de la Federación Colombiana de Tenis para torneos por equipos, publicado para Interligas 2021; no debe presentarse como reglamento oficial JIE26.

Referencias consultadas:
- ITF / World Tennis, Rules and Regulations: https://www.itftennis.com/en/about-us/governance/rules-and-regulations/
- Federación Colombiana de Tenis, Reglamento Torneo Nacional Interligas por Equipos 2021, sección 9 “Desempates en el Round Robin”: https://www.fedecoltenis.com/userfiles/boletines/REGLAMENTO%20TORNEO%20NACIONAL%20INTERLIGAS%20POR%20EQUIPOS%202021%20WORD%20TEXTO%20COMIT%C3%89%20EJECUTIVO%20%283%29.pdf

## Casos de prueba sugeridos
1. Registrar tres participantes/equipos de la misma categoría y modalidad con victorias diferentes. Confirmar orden por partidos ganados.
2. Registrar empate de dos con enfrentamiento directo. Confirmar que gane la posición el ganador del partido entre ambos.
3. Registrar empate de tres: comprobar desempate por porcentaje de sets y luego porcentaje de games.
4. Dejar sin marcar el cierre de modalidad. Confirmar que no aparezca podio ni se sumen puntos generales por tenis.
5. Marcar el cierre en el último partido. Confirmar podio y 10/7/5 puntos generales.
6. Confirmar que sencillos, dobles y dobles mixtos no se mezclen entre sí y revisar que la categoría de la competencia esté bien definida.
7. Si persiste empate después de los criterios, no publicar el podio como definitivo hasta resolverlo manualmente.

## Limitación conocida de esta versión
La agrupación se hace por categoría y modalidad. Antes de la prueba real, confirmar que `categoriaCodigo`/`categoriaNombre` identifica de manera única cada cuadro (por ejemplo, masculino/femenino y cuadro A/B). Si no lo hace, se debe ampliar la clave de agrupación para incluir esos datos de programación.
