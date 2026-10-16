# Ajuste de tarjetas de escuelas — JIE26

Se actualizó la franja superior de tarjetas de escuelas del dashboard.

## Orden visual
1. ESMIC
2. ENAP
3. EMAVI
4. ECSAN

## Colores de borde/acento
- ENAP: azul que tenía EMAVI (`#2563eb`).
- EMAVI: azul que tenía ENAP (`#1e3a8a`).
- ESMIC: rojo que tenía ECSAN (`#dc2626`).
- ECSAN: verde que tenía ESMIC (`#16a34a`).

Los identificadores `card-*-medals` y `card-*-points` se conservaron, por lo que la lógica de actualización de medallero y puntaje continúa asociada a cada escuela independientemente del orden visual.
