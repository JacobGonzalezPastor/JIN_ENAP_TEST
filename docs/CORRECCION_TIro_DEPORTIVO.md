# Corrección — Tiro Deportivo

## Problema detectado

La tabla tenía una columna visual adicional con el número de fila (`1, 2, 3...`) que no estaba contemplada en el encabezado. Esto desplazaba todos los campos una columna:

- el selector de **Escuela** aparecía debajo de **Sexo**;
- el selector de **Sexo** aparecía debajo de **S1**;
- las series quedaban desplazadas respecto a S1–S6.

## Corrección

Se eliminó la celda de numeración visual y se alinearon exactamente las columnas:

**Dorsal | Nombre | Escuela | Sexo | S1 | S2 | S3 | S4 | S5 | S6 | Total | X | Obs.**

Además:

- Escuela utiliza el selector de ENAP, EMAVI, ESMIC y ECSAN.
- Sexo utiliza Masculino/Femenino.
- S1–S6 son campos numéricos.
- Total continúa calculándose automáticamente.
- X-centros permanece como campo numérico.
- La modalidad y el arma tienen opción `Seleccione`.
