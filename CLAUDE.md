# Prototipo GONGAS — control de cilindros

El spec completo está en @SPEC.md. Leelo antes de escribir código.

## Reglas permanentes
- Es un prototipo para demo, no el sistema final. La sección 2 del spec dice qué queda afuera: respetala.
- Stack: Vite + React + TypeScript + Tailwind. Datos en localStorage detrás de `src/dominio/storage.ts`.
- Toda la lógica de plata vive en `src/dominio/arriendo.ts`, sin imports de React, y con tests.
- Fechas: texto `YYYY-MM-DD` y `Date.UTC`. Nunca `new Date(texto).getDate()`, que en Montevideo devuelve el día anterior.
- Mobile first, Android. Todo en español rioplatense, pesos uruguayos.
- Antes de cada etapa del orden de trabajo: plan mode, me lo mostrás, recién ahí implementás.