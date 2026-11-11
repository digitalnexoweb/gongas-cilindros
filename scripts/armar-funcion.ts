/**
 * Arma supabase/functions/avisos-por-mail/index.js: la fuente de la función del
 * servidor junto con lo que importa de src/dominio, en un solo archivo.
 *
 * Hace falta porque el código de la app importa sin extensión ("./arriendo"),
 * que Deno no acepta, y porque así la función usa exactamente la misma lógica
 * de plata que la app, sin copiarla a mano.
 *
 * Uso: npm run funcion:armar
 */

import { build } from 'rolldown';

await build({
  input: 'supabase/functions/avisos-por-mail/fuente.ts',
  platform: 'neutral',
  output: {
    file: 'supabase/functions/avisos-por-mail/index.js',
    format: 'esm',
    banner: '// Generado por `npm run funcion:armar` desde fuente.ts. No editar a mano.',
  },
});

console.log('Listo: supabase/functions/avisos-por-mail/index.js');
