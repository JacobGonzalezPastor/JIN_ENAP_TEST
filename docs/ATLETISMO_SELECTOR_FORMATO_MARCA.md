# Atletismo: selector de formato de marca

- Nuevo selector "Formato de marca" en la planilla de Atletismo: SS:MMM, MM:SS:MMM o MTS.
- Se guarda en `resultadoDeportivo.formatoMarca`.
- SS:MMM y MM:SS:MMM: gana el menor tiempo. MTS: gana la mayor distancia. Marcas inválidas para el formato no entran al podio.
- Registros antiguos sin `formatoMarca`: CAMPO se trata como metros; PISTA conserva el cálculo anterior.
- Al cambiar Modalidad se sugiere el formato (CAMPO → MTS, PISTA → SS:MMM), editable.
