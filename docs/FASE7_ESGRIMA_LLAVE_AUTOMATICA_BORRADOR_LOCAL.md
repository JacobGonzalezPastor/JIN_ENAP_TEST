# Esgrima — llave automática y borrador local

## Individual
- La planilla admite 16 tiradores y usa el orden de sembrado indicado en `Planilla esgrima.xlsx`: 1–16, 9–8, 5–12, 13–4, 3–14, 11–6, 7–10 y 15–2.
- El registrador selecciona el ganador de cada combate; ese tirador avanza automáticamente a la ronda siguiente.
- La llave conserva los datos en LocalStorage bajo una clave asociada a la competencia seleccionada.
- Los octavos, cuartos, semifinales y final deben estar completos antes de enviar el resultado definitivo.
- El tercer puesto queda opcional y muestra automáticamente a los perdedores de semifinal.

## Equipos
- Se mantiene la llave de cuatro equipos por eliminación directa y la meta de 45 toques.
- El borrador de equipos conserva sus campos en LocalStorage y el registro final se realiza al confirmar la competencia completa.

## Guardado
LocalStorage es solo un borrador del navegador. El resultado oficial se envía a Firebase al usar el guardado principal de la competencia. Al completar el guardado exitosamente, se elimina el borrador local correspondiente. No se ha validado el flujo real contra Firebase ni en un navegador con sesión administrativa.
